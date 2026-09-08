import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
for(const tool of ['codex','claude']){
 const installer=resolve(here,tool==='codex'?'../codex/install-hooks.py':'../claude-code/install-local-hooks.py');
 function fixture(){
  const root=mkdtempSync(join(tmpdir(),'blaze-hook-test-')),home=join(root,"home with spaces ' and $literal");
  const settings=join(home,tool==='codex'?'.codex/hooks.json':'.claude/settings.json');
  mkdirSync(dirname(settings),{recursive:true});
  const helper=join(home,'.claude/skills/blaze/blaze-client.mjs');mkdirSync(dirname(helper),{recursive:true});writeFileSync(helper,'// local fixture\n');
  const invoke=()=>spawnSync('python3',[installer],{env:{...process.env,HOME:home},encoding:'utf8',timeout:5000});
  return {root,home,settings,helper,invoke,cleanup:()=>rmSync(root,{recursive:true,force:true})};
 }
 test(`${tool} hook merge preserves unrelated settings, quotes paths and is idempotent`,()=>{
  const f=fixture();
  try{
   const exact=tool==='codex'?join(f.home,'.codex/blaze-hook.sh'):`node "${f.helper}" hook --tool claude`;
   const unrelated={type:'command',command:exact+' --unrelated-argument',timeout:77};
   const owned={type:'command',command:exact,statusMessage:'Blaze visible banner'};
   const initial={theme:'keep',env:{KEEP:'synthetic-private-canary'},hooks:{Other:[{hooks:[{type:'command',command:'echo keep'}]}],
    Stop:[{matcher:'keep',hooks:[{type:'command',command:exact},unrelated]}],UserPromptSubmit:[{hooks:[owned]}]}};
   writeFileSync(f.settings,JSON.stringify(initial));
   const result=f.invoke();assert.equal(result.status,0,result.stderr);
   const after=JSON.parse(readFileSync(f.settings,'utf8'));
   assert.equal(after.theme,initial.theme);assert.deepEqual(after.env,initial.env);assert.deepEqual(after.hooks.Other,initial.hooks.Other);
   assert.deepEqual(after.hooks.Stop,[{matcher:'keep',hooks:[unrelated]}]);
   const entries=after.hooks.UserPromptSubmit.flatMap(g=>g.hooks);assert.equal(entries.length,1);
   assert.equal('statusMessage' in entries[0],false);
   const parsed=spawnSync('python3',['-c','import json,shlex,sys; print(json.dumps(shlex.split(sys.argv[1])))',entries[0].command],{encoding:'utf8'});
   assert.equal(parsed.status,0);assert.deepEqual(JSON.parse(parsed.stdout),tool==='codex'?[join(f.home,'.codex/blaze-hook.sh')]:['node',f.helper,'hook','--tool','claude']);
   assert.equal(statSync(f.settings).mode&0o777,0o600);const bytes=readFileSync(f.settings);
   assert.equal(f.invoke().status,0);assert.deepEqual(readFileSync(f.settings),bytes);assert.ok(!result.stdout.includes('synthetic-private-canary'));
  }finally{f.cleanup()}
 });
 for(const boundary of ['file symlink','directory symlink','oversized file','fifo'])test(`${tool} refuses ${boundary} without changing its target`,()=>{
  const f=fixture();
  try{
   const outside=join(f.root,'outside');mkdirSync(outside);const target=join(outside,'target');writeFileSync(target,'synthetic-private-canary');
   if(boundary==='file symlink')symlinkSync(target,f.settings);
   if(boundary==='directory symlink'){
    // Replace only the settings parent, after moving the required Claude helper.
    rmSync(dirname(f.settings),{recursive:true});symlinkSync(outside,dirname(f.settings));
    if(tool==='claude'){mkdirSync(dirname(f.helper),{recursive:true});writeFileSync(f.helper,'// fixture\n')}
   }
   if(boundary==='oversized file')writeFileSync(f.settings,' '.repeat(262145));
   if(boundary==='fifo')assert.equal(spawnSync('mkfifo',[f.settings]).status,0);
   const result=f.invoke();assert.notEqual(result.status,0);assert.ok(!result.error,'bounded rejection must not time out');
   assert.equal(readFileSync(target,'utf8'),'synthetic-private-canary');assert.ok(!result.stdout.includes('synthetic-private-canary'));assert.ok(!result.stderr.includes('synthetic-private-canary'));
  }finally{f.cleanup()}
 });
 test(`${tool} refuses malformed settings without overwriting them`,()=>{
  const f=fixture();try{
   const bytes=Buffer.from('{invalid synthetic-private-canary');writeFileSync(f.settings,bytes);
   const result=f.invoke();assert.notEqual(result.status,0);assert.deepEqual(readFileSync(f.settings),bytes);
   assert.ok(!result.stdout.includes('synthetic-private-canary'));assert.ok(!result.stderr.includes('synthetic-private-canary'));
  }finally{f.cleanup()}
 });
}
