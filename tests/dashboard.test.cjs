const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function dashboard() {const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('web/dashboard.js','utf8'),c);return c.HomeDashboard;}
const plain=x=>JSON.parse(JSON.stringify(x));
test('four dashboard tabs keep video/media above news and infos separate',()=>{
 const d=dashboard();assert.deepEqual(plain(d.tabs),['youtube','news','media','info']);
 assert.deepEqual(plain(d.rows(0)),[['youtube','media'],['news']]);
 assert.deepEqual(plain(d.items(1)),['news']);assert.deepEqual(plain(d.items(2)),['media','news']);assert.deepEqual(plain(d.items(3)),[]);
});
test('remote focus follows rows, clamps horizontal edges and exits to visible chrome',()=>{
 const d=dashboard();
 assert.deepEqual(plain(d.next(0,0,1,0)),{zone:'dashboard',index:1});
 assert.deepEqual(plain(d.next(0,1,1,0)),{zone:'dashboard',index:1});
 assert.deepEqual(plain(d.next(0,0,-1,0)),{zone:'dashboard',index:0});
 assert.deepEqual(plain(d.next(0,1,0,1)),{zone:'dashboard',index:2});
 assert.deepEqual(plain(d.next(0,2,0,-1)),{zone:'dashboard',index:0});
 assert.equal(d.next(0,2,0,1).zone,'widgets');assert.equal(d.next(0,0,0,-1).zone,'top');
 assert.equal(d.next(1,0,0,1).zone,'widgets');assert.equal(d.next(3,99,0,-1).zone,'top');
});
test('source launch identities are exact and cannot substitute a different player',()=>{
 const d=dashboard(),config={youtubeApp:'custom.adfree',catalogApp:'space.nuvio.webos',items:[{id:'custom.adfree'},{id:'space.nuvio.webos'},{id:'amazon'}]};
 assert.equal(d.app(config,'youtube').id,'custom.adfree');assert.equal(d.app(config,'media').id,'space.nuvio.webos');
 assert.equal(d.app(config,'prime'),null);assert.equal(d.app({...config,youtubeApp:'missing'},'youtube'),null);assert.equal(d.app(null,'media'),null);
});
