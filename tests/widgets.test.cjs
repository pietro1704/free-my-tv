const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function load() {
  const c = {window: {}};vm.createContext(c);
  for (const file of ['diagnostics.js','homelab.js','updates.js','widgets.js']) vm.runInContext(fs.readFileSync('web/'+file,'utf8'),c);
  return c;
}
const repo = {paging:{maxPage:1},packages:[{id:'player',manifest:{id:'player',version:'1.2.9'}}]};
const installed = JSON.stringify([{id:'player',title:'Nuvio',version:'1.2.5'}, {id:'other',title:'Other',version:'0.0.1'}]);
const plain = value => JSON.parse(JSON.stringify(value));
test('update versions preserve exact app identity, handle prereleases and never downgrade',()=>{
  const u=load().BrewUpdates;
  assert.deepEqual(plain(u.compare(installed,repo)),{available:true,checked:1,updates:[{id:'player',title:'Nuvio',installed:'1.2.5',latest:'1.2.9'}]});
  for (const pair of [['1.2.9','1.2.9'],['1.2.8','1.2.9'],['1.2.9-beta','1.2.9'],['1.2.9-beta.2','1.2.9-beta.11']]) assert.equal(u.newer(...pair),false);
  assert.equal(u.newer('1.2.9','1.2.9-beta'),true);
  assert.equal(u.newer('1.2.9-beta.11','1.2.9-beta.2'),true);
  assert.equal(u.newer('latest','1.2.9'),null);
  assert.equal(u.compare(installed,{...repo,packages:[{id:'player',manifest:{id:'other',version:'9.0.0'}}]}).checked,0);
  assert.equal(u.compare(installed,{...repo,packages:[{id:'player',manifest:{id:'player',version:'latest'}}]}).available,false);
});
test('unreachable, malformed and incomplete repositories cannot claim apps are up to date',()=>{
  const u=load().BrewUpdates;
  for (const [apps,repository] of [[null,repo],['bad',repo],[installed,null],[installed,{}],[installed,{...repo,paging:{maxPage:2}}]]) assert.equal(u.compare(apps,repository).available,false);
  assert.equal(u.compare(JSON.stringify([{id:'player',version:'1.2.9'}]),repo).updates.length,0);
});
test('update reads cache six hours, cancel both transports and ignore cancelled identity results',()=>{
  const u=load().BrewUpdates;let at=1,appCalls=[],repoCalls=[],cancelled=0;const results=[];
  const read=u.reader(done=>{appCalls.push(done);return ()=>cancelled++},done=>{repoCalls.push(done);return ()=>cancelled++},()=>at);
  const cancel=read(value=>results.push(JSON.parse(value)));
  cancel();appCalls[0](installed);repoCalls[0](repo);
  assert.equal(cancelled,2);assert.equal(results.length,0);
  read(value=>results.push(JSON.parse(value)));appCalls[1](installed);repoCalls[1](repo);
  assert.equal(results[0].updates.length,1);
  read(value=>results.push(JSON.parse(value)));assert.equal(appCalls.length,2);assert.equal(results.length,2);
  at+=21600001;read(value=>results.push(JSON.parse(value)));assert.equal(appCalls.length,3);
  appCalls[2](null);repoCalls[2](null);assert.equal(results[2].available,false);
  at+=300001;read(()=>{});assert.equal(appCalls.length,4);
});
test('widget visibility is idempotent and pauses queued reads and stale callbacks across sessions',()=>{
  const c=load(), tasks=new Map(),lab=[],brew=[],states=[];let id=0,cancelled=0;
  const timers={setTimeout(fn,delay){tasks.set(++id,{fn,delay});return id},clearTimeout(id){tasks.delete(id)}};
  const control=c.HomeWidgets.controller(done=>{lab.push(done);return ()=>cancelled++},done=>{brew.push(done);return ()=>cancelled++},timers,state=>states.push(plain(state)));
  control.sync(true);control.sync(true);assert.equal(lab.length,1);assert.equal(brew.length,1);
  control.sync(false);assert.equal(tasks.size,0);assert.equal(cancelled,2);
  const before=states.length;lab[0]('');brew[0]('{"available":true,"updates":[]}');assert.equal(states.length,before);
  control.sync(true);lab[0]('');assert.equal(states.length,before+1);
  lab[1]('');brew[1]('null');assert.equal(states.at(-1).lab.available,false);assert.equal(states.at(-1).brew.available,false);
  assert.ok([...tasks.values()].some(x=>x.delay===1500));assert.ok([...tasks.values()].some(x=>x.delay===300000));
  control.sync(false);assert.equal(tasks.size,0);
});
