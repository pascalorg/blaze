import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient, fallbackSummary, readContributionFile } from "./blaze-client.mjs";

async function fixture(t, options = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), "blaze-public-client-"));
  const requests = [];
  const decisions = new Map();
  const contributions = new Map();
  let outcomeAttempts = 0;
  let contributionAttempts = 0;
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ path: req.url, method: req.method, body, authorization: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/auth/agent/claim/start") {
      res.end(JSON.stringify({claimUrl:"https://example.invalid/claim",claimCode:"ABCD-EFGH",expiresAt:"2099-01-01T00:00:00Z",token:"must-not-be-printed"}));
      return;
    }
    if (req.url === "/api/contributions") {
      let existing = contributions.get(body.client_event_id);
      if (existing && JSON.stringify(existing.input) !== JSON.stringify(body)) { res.statusCode=409; res.end('{}'); return; }
      if (!existing) {
        existing = {id:randomUUID(),input:body,state:"queued",visibility:body.visibility ?? "private"};
        contributions.set(body.client_event_id,existing);
      }
      // Simulate an accepted request whose response was lost. The retry must not create another candidate.
      if (options.failFirstContribution && contributionAttempts++ === 0) { res.statusCode=503; res.end('{}'); return; }
      res.end(JSON.stringify({contribution_id:existing.id,state:existing.state,visibility:existing.visibility}));
      return;
    }
    if (req.url.startsWith("/api/contributions/")) {
      const existing = [...contributions.values()].find((c) => req.url.endsWith(`/${c.id}`));
      if (!existing) { res.statusCode=404; res.end('{}'); return; }
      if (req.method === "DELETE") { existing.state="revoked"; res.end('{"deleted":true}'); return; }
      res.end(JSON.stringify({id:existing.id,state:existing.state,visibility:existing.visibility,card:existing.input.card,evaluation:null}));
      return;
    }
    if (req.url.startsWith("/api/cards/")) {
      res.write('{"id":');
      setTimeout(() => res.end('"card-a"}'), 35);
      return;
    }
    if (req.url === "/api/outcomes") {
      if (options.failFirstOutcome && outcomeAttempts++ === 0) { res.statusCode = 503; res.end('{}'); return; }
      res.end(JSON.stringify({ summary_line: fallbackSummary(options.offered ?? true, body.retrieval_ms) }));
      return;
    }
    if (body.hook_event_name === "Stop") { res.end('{}'); return; }
    let decision = decisions.get(body.client_event_id);
    if (!decision) {
      decision = { decision_id: randomUUID(), offered: options.offered ?? true,
        offers: options.offered === false ? [] : Array.from({length: options.offerCount ?? 1}, (_, i) => ({ offer_id: randomUUID(), card_id: `card-${String.fromCharCode(97 + i)}`, revision_id: randomUUID(), baseline: null })) };
      decisions.set(body.client_event_id, decision);
    }
    const data = options.flat ? { ...decision, additionalContext: "flat OpenCode context", blaze: decision }
      : { hookSpecificOutput: { additionalContext: "nested hook context" }, blaze: decision };
    // The clock must include delayed body transfer, not merely response headers.
    res.write(' ');
    setTimeout(() => res.end(JSON.stringify(data)), 35);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(stateDir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = createClient({ origin, tool: "codex", token: "synthetic-test-token", stateDir });
  return { client, stateDir, requests, origin };
}

test("full reply timing, private receipts, explicit fingerprint and stable lookup identity", async (t) => {
  const { client, requests, stateDir } = await fixture(t);
  const body = { hook_event_name: "UserPromptSubmit", prompt: "secret prompt stays out of receipts", client_event_id: "one-user-message", context_fingerprint: "a".repeat(64) };
  const response = await client.hook(body);
  assert.ok(response.blaze.retrieval_ms >= 30);
  assert.match(response.hookSpecificOutput.additionalContext, /Before the final answer/);
  assert.equal(requests[0].authorization, "Bearer synthetic-test-token");
  assert.equal(requests[0].body.context_fingerprint, "a".repeat(64));
  const path = join(stateDir, `${response.blaze.decision_id}.json`);
  const first = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(readFileSync(path, "utf8").includes(body.prompt), false);
  assert.equal(statSync(path).mode & 0o077, 0);
  const repeated = await client.hook(body);
  assert.equal(repeated.blaze.decision_id, response.blaze.decision_id);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).started_wall_ms, first.started_wall_ms);
  const previousMs = repeated.blaze.retrieval_ms;
  await client.card(response.blaze.decision_id, "card-a");
  assert.ok(requests.at(-1).path.includes(`?offer_id=${response.blaze.offers[0].offer_id}`));
  assert.ok(JSON.parse(readFileSync(path, "utf8")).retrieval_ms >= previousMs + 30);
  await assert.rejects(client.card(response.blaze.decision_id, "not-offered"), /not offered/);
});

test("no-offer decisions retain feedback context and zero credited savings", async (t) => {
  const { client, requests } = await fixture(t, { offered: false, flat: true });
  const response = await client.hook({ prompt: "new task", context_fingerprint: "query-only-is-not-a-fingerprint" });
  assert.match(response.additionalContext, /flat OpenCode context/);
  assert.match(response.additionalContext, /0s credited \(no memory reused\)/);
  assert.equal(requests[0].body.context_fingerprint, undefined);
  await assert.rejects(client.outcome(response.blaze.decision_id, { result: "solved_as_is", verification_status: "passed" }), /no card was adopted/);
  await client.outcome(response.blaze.decision_id, { result: "solved_without_memory", verification_status: "passed" });
  assert.equal(requests.at(-1).body.result, "solved_without_memory");
  assert.equal(requests.at(-1).body.offer_id, undefined);
});

test("uppercase explicit hashes normalize for both lookup and hook protocols", async (t) => {
  const { client, requests, stateDir } = await fixture(t);
  const hash = "ABCDEF12".repeat(8);
  for (const method of ["lookup", "hook"]) {
    const response = await client[method]({ query: "task", prompt: "task", context_fingerprint: hash });
    assert.equal(requests.at(-1).body.context_fingerprint, hash.toLowerCase());
    const saved = JSON.parse(readFileSync(join(stateDir, `${response.blaze.decision_id}.json`), "utf8"));
    assert.equal(saved.context_fingerprint, hash.toLowerCase());
  }
});

test("ambiguous adoption is rejected before preparing an outcome and can be corrected", async (t) => {
  const { client, requests, stateDir } = await fixture(t, { offerCount: 2 });
  const response = await client.lookup({ query: "task" });
  const id = response.blaze.decision_id;
  const report = { result: "solved_with_changes", verification_status: "passed" };
  await assert.rejects(client.outcome(id, report), /Select the adopted offer ID/);
  assert.equal(requests.filter((r) => r.path === "/api/outcomes").length, 0);
  assert.equal(JSON.parse(readFileSync(join(stateDir, `${id}.json`), "utf8")).outcome, undefined);
  const offer_id = response.blaze.offers[1].offer_id;
  await client.outcome(id, { ...report, offer_id });
  assert.equal(requests.at(-1).body.offer_id, offer_id);
});

test("failed outcome requests retry the exact durable event and measured payload", async (t) => {
  const { client, requests } = await fixture(t, { failFirstOutcome: true });
  const response = await client.lookup({ query: "task" });
  const id = response.blaze.decision_id;
  const report = { result: "solved_with_changes", verification_status: "passed", offer_id: response.blaze.offers[0].offer_id };
  await assert.rejects(client.outcome(id, report), /HTTP 503/);
  const first = requests.at(-1).body;
  const result = await client.outcome(id, report);
  assert.deepEqual(requests.at(-1).body, first);
  assert.ok(first.task_total_ms >= first.retrieval_ms);
  assert.match(result.summary_line, /^Blaze · original solve unknown/);
  await assert.rejects(client.outcome(id, { ...report, result: "failed" }), /already prepared/);
  await assert.rejects(client.outcome(id, { ...report, client_event_id: "different-event" }), /original event ID/);
});

test("Stop never fabricates an outcome or writes a new receipt", async (t) => {
  const { client, requests, stateDir } = await fixture(t);
  assert.deepEqual(await client.hook({ hook_event_name: "Stop", session_id: "test-session" }), {});
  assert.equal(requests.some((r) => r.path === "/api/outcomes"), false);
  assert.deepEqual(readdirSync(stateDir), []);
});

test("claim is explicit and returns only the short-lived link, code, and expiry", async (t) => {
  const { client, requests, stateDir } = await fixture(t);
  await client.hook({ hook_event_name: "Stop" });
  assert.equal(requests.some((r) => r.path.includes("claim")),false);
  const challenge = await client.claim();
  assert.deepEqual(challenge,{claimUrl:"https://example.invalid/claim",claimCode:"ABCD-EFGH",expiresAt:"2099-01-01T00:00:00Z"});
  assert.equal(requests.at(-1).method,"POST");
  assert.equal(requests.at(-1).authorization,"Bearer synthetic-test-token");
  assert.deepEqual(requests.at(-1).body,{});
  assert.deepEqual(readdirSync(stateDir),[]);
});

const minimizedContribution = () => ({client_event_id:randomUUID(),minimized:true,card:{
  id:"isolated-cache-entry",title:"Isolate exact cache entries",trigger:"Identical queries cross installation cache boundaries",
  problem_statement:"An exact cache key omitted the authenticated installation.",
  procedure:[{step:"Include the authenticated installation in the cache key."}],
  verification:{method:"Verify two installations cannot share private query entries."},
}});

test("contribution files preserve exact payload identity across retries and support status/deletion", async (t) => {
  const { client, requests, stateDir } = await fixture(t,{failFirstContribution:true});
  const path = join(stateDir,"minimized-card.json");
  const input = minimizedContribution();
  const bytes = JSON.stringify(input,null,2)+"\n";
  writeFileSync(path,bytes);
  await assert.rejects(client.contribute(readContributionFile(path)),/HTTP 503/);
  const accepted = await client.contribute(readContributionFile(path));
  assert.equal(accepted.visibility,"private");
  const sends = requests.filter((r) => r.path === "/api/contributions");
  assert.deepEqual(sends[0].body,input);
  assert.deepEqual(sends[1].body,input);
  assert.equal(readFileSync(path,"utf8"),bytes);
  assert.deepEqual(readdirSync(stateDir),["minimized-card.json"]);
  const status = await client.contribution(accepted.contribution_id);
  assert.equal(status.state,"queued");
  assert.equal(status.card,undefined); // Status does not echo the candidate payload.
  assert.equal(requests.at(-1).method,"GET");
  assert.deepEqual(await client.deleteContribution(accepted.contribution_id),{deleted:true});
  assert.equal(requests.at(-1).method,"DELETE");
  assert.equal(requests.at(-1).body,null);
  assert.equal((await client.contribution(accepted.contribution_id)).state,"revoked");
});

test("public sharing and stable contribution identity are explicit before any upload", async (t) => {
  const { client, requests, stateDir } = await fixture(t);
  const input=minimizedContribution();
  await assert.rejects(client.contribute({...input,client_event_id:undefined}),/stable client_event_id UUID/);
  await assert.rejects(client.contribute({...input,minimized:false}),/minimized/);
  await assert.rejects(client.contribute({...input,visibility:"public"}),/explicit authorization/);
  assert.equal(requests.length,0);
  await client.contribute({...input,visibility:"public",public_sharing_authorized:true});
  assert.equal(requests.at(-1).body.public_sharing_authorized,true);
  await assert.rejects(client.contribution("../../token"),/UUID/);
  await assert.rejects(client.deleteContribution("../../token"),/UUID/);
  const broken=join(stateDir,"broken.json");
  writeFileSync(broken,'{"private-secret":"SYNTHETIC_SECRET"');
  assert.throws(() => readContributionFile(broken),/^Error: Contribution file must contain valid JSON$/);
});

test("receipt traversal, foreign offers and invalid result values are rejected locally", async (t) => {
  const { client } = await fixture(t);
  assert.throws(() => client.summary("../../token"), /UUID/);
  const response = await client.lookup({ query: "task" });
  const id = response.blaze.decision_id;
  await assert.rejects(client.outcome(id, { result: "invented", verification_status: "passed" }), /explicit result/);
  await assert.rejects(client.outcome(id, { result: "failed", verification_status: "failed", offer_id: randomUUID() }), /does not belong/);
});

test("older servers receive an honest fallback rather than a fabricated decision", async () => {
  const client = createClient({ origin: "https://example.invalid", tool: "codex", stateDir: "/unused",
    fetchImpl: async () => Response.json({ offered: false }) });
  const response = await client.hook({ prompt: "new task" });
  assert.match(response.additionalContext, /original solve unknown/);
  assert.match(response.additionalContext, /0s credited/);
});

test("installed CLI preserves a receipt across processes and OpenCode consumes flat context", async (t) => {
  const { origin, stateDir, requests } = await fixture(t, { offered: false, flat: true });
  const home = join(stateDir, "home");
  const source = fileURLToPath(new URL("blaze-client.mjs", import.meta.url));
  for (const [directory, tokenPath] of [
    [".agents/skills/blaze", ".codex/blaze-token"],
    [".config/opencode/skills/blaze", ".config/opencode/blaze-token"],
  ]) {
    mkdirSync(join(home, directory), { recursive: true });
    mkdirSync(join(home, tokenPath, ".."), { recursive: true });
    copyFileSync(source, join(home, directory, "blaze-client.mjs"));
    writeFileSync(join(home, directory, "client-config.json"), JSON.stringify({ origin }));
    writeFileSync(join(home, tokenPath), "synthetic-test-token");
  }
  const run = promisify(execFile);
  const helper = join(home, ".agents/skills/blaze/blaze-client.mjs");
  const script = `import {createClientForTool} from ${JSON.stringify(new URL(`file://${helper}`).href)}; console.log(JSON.stringify(await createClientForTool('codex').hook({prompt:'synthetic CLI task'})));`;
  const result = await run(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, HOME: home } });
  const decision = JSON.parse(result.stdout).blaze.decision_id;
  const outcome = await run(process.execPath, [helper, "outcome", "--tool", "codex", "--decision", decision,
    "--result", "solved_without_memory", "--verification", "passed"], { env: { ...process.env, HOME: home } });
  assert.match(outcome.stdout, /0s credited/);
  assert.ok(requests.at(-1).body.task_total_ms >= requests.at(-1).body.retrieval_ms);

  const plugins = join(home, ".config/opencode/plugins");
  mkdirSync(plugins, { recursive: true });
  writeFileSync(join(home, ".config/opencode/package.json"), '{"type":"module"}');
  copyFileSync(fileURLToPath(new URL("../opencode/blaze.js", import.meta.url)), join(plugins, "blaze.js"));
  const pluginScript = `import {blaze} from ${JSON.stringify(new URL(`file://${join(plugins, "blaze.js")}`).href)}; const plugin=await blaze({directory:'/synthetic'}); const output={parts:[{type:'text',text:'new task'}],message:{id:'message-1',sessionID:'session-1'}}; await plugin['chat.message']({},output); console.log(JSON.stringify(output.parts));`;
  const plugin = await run(process.execPath, ["--input-type=module", "-e", pluginScript], { env: { ...process.env, HOME: home } });
  const parts = JSON.parse(plugin.stdout);
  assert.equal(parts.length, 2);
  assert.match(parts[1].text, /flat OpenCode context/);
  assert.match(parts[1].text, /0s credited/);
  assert.equal(requests.at(-1).body.client_event_id, "opencode:message-1");

  const cli = (command, ...args) => run(process.execPath,[helper,command,"--tool","codex",...args],{env:{...process.env,HOME:home}});
  const claim = await cli("claim");
  assert.equal(JSON.parse(claim.stdout).claimCode,"ABCD-EFGH");
  assert.equal(claim.stdout.includes("must-not-be-printed"),false);
  const candidateFile=join(stateDir,"cli-minimized-card.json");
  const candidate=minimizedContribution();
  writeFileSync(candidateFile,JSON.stringify(candidate));
  const submitted=JSON.parse((await cli("contribute","--file",candidateFile)).stdout);
  assert.equal(submitted.visibility,"private");
  assert.deepEqual(requests.at(-1).body,candidate);
  const retried=JSON.parse((await cli("contribute","--file",candidateFile)).stdout);
  assert.equal(retried.contribution_id,submitted.contribution_id);
  const status=JSON.parse((await cli("contribution","--id",submitted.contribution_id)).stdout);
  assert.equal(status.state,"queued");
  assert.equal(status.card,undefined);
  assert.deepEqual(JSON.parse((await cli("delete-contribution","--id",submitted.contribution_id)).stdout),{deleted:true});
});
