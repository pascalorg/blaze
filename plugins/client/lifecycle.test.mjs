import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient, createLifecycle, compareVersions, toolPaths, validateRelease } from "./blaze-client.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const source = readFileSync(new URL("./blaze-client.mjs",import.meta.url));
const put = (path,value) => {mkdirSync(resolve(path,".."),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(value)+"\n",{mode:0o600});};
const get = path => JSON.parse(readFileSync(path,"utf8"));
function bundle(version) {
  const files = {"SKILL.md":Buffer.from(`---\nname: blaze\ndescription: A synthetic lifecycle fixture.\nmetadata:\n  version: "${version}"\n---\n`),"blaze-client.mjs":Buffer.concat([source,Buffer.from(`\n// release ${version}\n`)])};
  return {files,manifest:{object:"skill_release",status:"published",version,created_at:"2026-09-07T00:00:00.000Z",updated_at:"2026-09-07T00:00:00.000Z",client_contract:1,minimum_client_contract:0,source_commit:"a".repeat(40),
    artifacts:Object.entries(files).map(([name,bytes])=>({name,size:bytes.length,sha256:hash(bytes)}))}};
}
async function fixture(t) {
  const home=mkdtempSync(join(tmpdir(),"blaze-lifecycle-")),tool="codex",paths=toolPaths(tool,home);
  const state=join(home,".config/blaze/bundles",hash(resolve(paths.root)).slice(0,32));
  const control={release:bundle("0.4.0"),offline:false,corrupt:false,lost:false,reject:0},requests=[],identities=new Map();
  const server=createServer(async(req,res)=>{
    let raw="";for await(const chunk of req) raw+=chunk;
    requests.push({path:req.url,authorization:req.headers.authorization,body:raw?JSON.parse(raw):null});
    if(control.offline){res.writeHead(503);res.end("PRIVATE_FAILURE_DETAIL");return;}
    if(req.url==="/api/skill-release"){res.setHeader("content-type","application/json");res.end(JSON.stringify(control.release.manifest));return;}
    if(req.url.startsWith("/releases/")) {
      const name=req.url.split("/").at(-1),artifact=control.release.manifest.artifacts.find(a=>a.name===name);
      if(req.url!==`/releases/${control.release.manifest.version}/${artifact?.sha256}/${name}`){res.writeHead(404);res.end();return;}
      res.end(control.corrupt ? "invalid bytes" : control.release.files[name]);return;
    }
    if(req.url==="/api/install") {
      if(control.reject){res.writeHead(control.reject,{"retry-after":"600"});res.end("PRIVATE_FAILURE_DETAIL");return;}
      const token=req.headers.authorization?.slice(7);
      if(!identities.has(token))identities.set(token,randomUUID());
      if(control.lost){control.lost=false;req.socket.destroy();return;}
      res.end(JSON.stringify({bootstrap_contract:2,install_id:identities.get(token),token}));return;
    }
    if(req.url==="/api/stats") {
      if(!identities.has(req.headers.authorization?.slice(7))){res.writeHead(401);res.end("PRIVATE_FAILURE_DETAIL");return;}
      res.end('{"cards":0}');return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(home,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const options={home,tool,origin,helperPath:join(paths.root,"blaze-client.mjs")};
  return {home,paths,state,control,requests,identities,options,lifecycle:createLifecycle(options)};
}

test("stable versions compare numerically and manifests contain only bounded fixed artifacts",()=>{
  assert.equal(compareVersions("0.10.0","0.9.9"),1);
  for(const value of ["v1.0.0","01.0.0","1.0.0-beta","1.0.0+build","1.0.0/../../","9999999.0.0"])assert.throws(()=>compareVersions(value,"1.0.0"));
  const original=bundle("0.4.0").manifest;
  assert.equal(validateRelease(original,"https://example.invalid"),original);
  for(const alter of [m=>m.artifacts[0].name="../../token",m=>m.artifacts[0].url="https://evil.invalid",m=>m.artifacts[0].size=1e9,m=>m.minimum_client_contract=2,m=>m.status="draft"]) {
    const value=structuredClone(original);alter(value);assert.throws(()=>validateRelease(value,"https://example.invalid"));
  }
});

test("direct installation keeps credentials outside its portable folder and reuses identity",async t=>{
  const {paths,state,lifecycle,requests}=await fixture(t);
  const result=await lifecycle.install();assert.equal(result.activation,"installed");assert.equal(result.credential,"registered");
  assert.deepEqual(readdirSync(paths.root).sort(),["SKILL.md","blaze-client.mjs"]);
  assert.equal(statSync(paths.token).mode&0o777,0o600);
  const before=readFileSync(paths.token,"utf8");
  assert.equal((await lifecycle.install()).credential,"reused");assert.equal(readFileSync(paths.token,"utf8"),before);
  assert.equal(requests.filter(r=>r.path==="/api/install").length,1);
  assert.ok(requests.filter(r=>r.path.startsWith("/releases/")||r.path==="/api/skill-release").every(r=>r.authorization===undefined&&r.body===null));
  assert.equal(get(join(state,"installation.json")).mode,"direct");
  assert.equal(lifecycle.status().update,"current");
});

test("lost registration response reuses the saved pending secret and never mints a second identity",async t=>{
  const {lifecycle,control,paths,identities}=await fixture(t);control.lost=true;
  await assert.rejects(lifecycle.setup());
  const pending=get(join(paths.state,"registration.json"));assert.equal(identities.size,1);
  assert.equal((await lifecycle.setup()).credential,"registered");
  assert.equal(get(paths.token).token,pending.token);assert.equal(identities.size,1);assert.equal(existsSync(join(paths.state,"registration.json")),false);
  control.reject=401;
  // A rejected existing identity must be repaired, never registered again.
  identities.clear();await assert.rejects(lifecycle.setup(),/HTTP 401/);assert.equal(identities.size,0);
});

test("update, pin, rollback and uninstall preserve receipts and one credential",async t=>{
  const {lifecycle,paths,control}=await fixture(t);await lifecycle.install();
  const secret=readFileSync(paths.token,"utf8"),id=randomUUID(),receipt={decision_id:id,outcome:{payload:{client_event_id:randomUUID(),task_total_ms:42}}};
  put(join(paths.state,"receipts",`${id}.json`),receipt);
  await lifecycle.pin("0.4.0");control.release=bundle("0.5.0");
  assert.equal((await lifecycle.checkUpdate()).update,"pinned");await assert.rejects(lifecycle.update(),/pinned/);
  await lifecycle.pin(null);assert.equal((await lifecycle.update()).version,"0.5.0");
  assert.equal(lifecycle.status().disk_version,"0.5.0");assert.equal(lifecycle.status().running_version,"0.4.0");
  assert.equal((await lifecycle.rollback()).version,"0.4.0");assert.equal(lifecycle.status().pin,"0.4.0");
  assert.deepEqual(get(join(paths.state,"receipts",`${id}.json`)),receipt);assert.equal(readFileSync(paths.token,"utf8"),secret);
  assert.equal((await lifecycle.uninstall()).installation,"removed");assert.equal(existsSync(paths.root),false);
  assert.deepEqual(get(join(paths.state,"receipts",`${id}.json`)),receipt);assert.equal(readFileSync(paths.token,"utf8"),secret);
});

test("corrupt downloads and local modifications cannot replace a working bundle",async t=>{
  const {lifecycle,control,paths}=await fixture(t);await lifecycle.install();const before=readFileSync(join(paths.root,"SKILL.md"),"utf8");
  control.release=bundle("0.5.0");control.corrupt=true;await assert.rejects(lifecycle.update(),/integrity/);
  assert.equal(readFileSync(join(paths.root,"SKILL.md"),"utf8"),before);control.corrupt=false;
  writeFileSync(join(paths.root,"SKILL.md"),before+"local edit\n");await assert.rejects(lifecycle.update(),/locally modified/);
  writeFileSync(join(paths.root,"SKILL.md"),before);writeFileSync(join(paths.root,"notes.txt"),"user file");await assert.rejects(lifecycle.update(),/unrecorded files/);
  assert.equal(readFileSync(join(paths.root,"notes.txt"),"utf8"),"user file");
});

test("a version cannot silently change its release bytes",async t=>{
  const {lifecycle,control}=await fixture(t);await lifecycle.install();
  control.release.files["SKILL.md"]=Buffer.concat([control.release.files["SKILL.md"],Buffer.from("changed\n")]);
  const artifact=control.release.manifest.artifacts[0];artifact.sha256=hash(control.release.files["SKILL.md"]);artifact.size=control.release.files["SKILL.md"].length;
  await assert.rejects(lifecycle.update(),/published version/);
});

test("manager-owned updates are read-only and offline checks cannot claim freshness",async t=>{
  const {options,requests,control,lifecycle,paths}=await fixture(t);
  const managed=createLifecycle({...options,helperPath:join(options.home,"marketplace/blaze-client.mjs")});
  assert.equal((await managed.update()).installation,"managed_or_unrecorded");assert.equal(requests.length,0);
  await lifecycle.install();assert.equal((await managed.update()).installation,"managed_or_unrecorded");
  control.offline=true;assert.equal((await lifecycle.checkUpdate()).update,"unknown");const count=requests.length;
  assert.equal((await lifecycle.checkUpdate()).check,"backoff");assert.equal(requests.length,count);
  assert.equal(lifecycle.status().latest_version,null);assert.ok(existsSync(paths.token));
});

test("an interrupted swap restores the checked prior bundle and preserves the credential",async t=>{
  const {lifecycle,control,state,paths}=await fixture(t);await lifecycle.install();const prior=get(join(state,"installation.json")),id=randomUUID();
  const next=bundle("0.5.0"),stage=join(state,"staging",id),backup=join(state,"backups",id);
  mkdirSync(stage,{recursive:true,mode:0o700});mkdirSync(resolve(backup,".."),{recursive:true,mode:0o700});
  for(const [name,body]of Object.entries(next.files))writeFileSync(join(stage,name),body,{mode:0o600});
  put(join(state,"transaction.json"),{version:1,id,release:next.manifest,prior});renameSync(paths.root,backup);
  control.offline=true;await assert.rejects(lifecycle.update(),/HTTP 503/);
  assert.equal(hash(readFileSync(join(paths.root,"SKILL.md"))),prior.release.artifacts[0].sha256);
  assert.equal(existsSync(join(state,"transaction.json")),false);assert.ok(existsSync(paths.token));
});

test("an interrupted completed swap records the new release before continuing",async t=>{
  const {lifecycle,control,state,paths}=await fixture(t);await lifecycle.install();const prior=get(join(state,"installation.json")),id=randomUUID();
  const next=bundle("0.5.0"),backup=join(state,"backups",id);mkdirSync(resolve(backup,".."),{recursive:true,mode:0o700});
  put(join(state,"transaction.json"),{version:1,id,release:next.manifest,prior});renameSync(paths.root,backup);mkdirSync(paths.root,{mode:0o700});
  for(const [name,body]of Object.entries(next.files))writeFileSync(join(paths.root,name),body,{mode:0o600});
  control.offline=true;await assert.rejects(lifecycle.update(),/HTTP 503/);
  assert.equal(get(join(state,"installation.json")).release.version,"0.5.0");assert.equal(get(join(state,"installation.json")).previous.id,id);
});

test("invalid metadata, redirected state ancestors and broken symlinks fail before network or replacement",async t=>{
  const {lifecycle,state,paths,options,requests}=await fixture(t);await lifecycle.install();const before=requests.length;
  writeFileSync(join(state,"installation.json"),"not json",{mode:0o600});await assert.rejects(lifecycle.update(),/invalid JSON/);assert.equal(requests.length,before);
  const redirected=join(options.home,"other-home");mkdirSync(redirected);symlinkSync(join(options.home,"absent"),join(redirected,".config"));
  assert.throws(()=>createLifecycle({...options,home:redirected}),/owned real directories/);
  rmSync(paths.token);symlinkSync(join(options.home,"missing-secret"),paths.token);
  assert.throws(()=>createLifecycle({...options,origin:undefined}),/symbolic links/);assert.equal(requests.length,before);
});

test("one bundle lock spans tools that share a discovery directory",async t=>{
  const {lifecycle,state,options,requests}=await fixture(t);await lifecycle.install();
  put(join(state,"update.lock"),{pid:process.pid,nonce:randomUUID()});const count=requests.length;
  await assert.rejects(createLifecycle({...options,tool:"cursor"}).update(),/Another Blaze operation/);assert.equal(requests.length,count);
});

test("intentional requests cache fixed version hints; retired contracts outrank pins",async t=>{
  const {lifecycle,paths,options}=await fixture(t);await lifecycle.install();await lifecycle.pin("0.4.0");
  let count=0;const client=createClient({origin:options.origin,token:get(paths.token).token,stateDir:join(paths.state,"receipts"),freshnessPath:join(paths.state,"freshness.json"),tool:"codex",
    fetchImpl:async()=>{count++;return new Response("PRIVATE_FAILURE_DETAIL",{status:426,headers:{"Blaze-Skill-Version":"0.5.0","Blaze-Min-Client-Contract":"2"}});}});
  await client.hook({prompt:"PRIVATE_PROMPT"});assert.equal(count,0);
  await assert.rejects(client.stats(),/contract has retired/);assert.equal(lifecycle.status().update,"required");
  const stored=readFileSync(join(paths.state,"freshness.json"),"utf8");assert.equal(stored.includes("PRIVATE"),false);
});
