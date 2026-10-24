const assert=require('node:assert/strict');
const test=require('node:test');
const remap=require('../webos/controls/mapping.js');
const target='space.nuvio.webos';
const fixture=()=>({returnValue:true,settings:{mapping_info:[{_id:'keep',other:{app_id:'keep.exact',launch_param:{keep:true}}},{_id:'button',disneyplus:{app_id:'com.disney.disneyplus-prod',launch_param:{contentTarget:'old'},isActive:true,keep:'untouched'}}]}});
test('Disney target changes without mutating source or any other mapping',()=>{
 const data=fixture(),before=JSON.stringify(data),out=remap(data,target).settings.mapping_info;
 assert.equal(JSON.stringify(data),before);assert.deepEqual(out[0],data.settings.mapping_info[0]);
 assert.equal(out[1]._id,'button');assert.deepEqual(out[1].disneyplus,{app_id:target,launch_param:null,isActive:true,keep:'untouched'});
});
test('native defaults reset after reboot are repaired; own notification is idempotent',()=>{
 const out=remap(fixture(),target);assert.equal(remap({settings:out.settings},target),null);
 const reset=fixture();assert.equal(remap(JSON.stringify(reset),target).settings.mapping_info[1].disneyplus.app_id,target);
});
test('malformed, missing, duplicate or unrelated identities cannot rewrite controls',()=>{
 for(const data of [null,'bad',{returnValue:false}, {settings:{mapping_info:{}}}, {settings:{mapping_info:[{netflix:{app_id:'unrelated'}}]}}])assert.equal(remap(data,target),null);
 const duplicate=fixture();duplicate.settings.mapping_info.push(duplicate.settings.mapping_info[1]);assert.equal(remap(duplicate,target),null);
 for(const id of ['',null,'app;command','../app','app\ncommand'])assert.equal(remap(fixture(),id),null);
});
test('CLI ignores malformed notifications and signals subscription failure without emitting a write',()=>{
 const {spawnSync}=require('node:child_process');
 for(const input of ['null','bad','{}']) {const r=spawnSync(process.execPath,['webos/controls/mapping.js',target],{input,encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stdout,'');}
 const failed=spawnSync(process.execPath,['webos/controls/mapping.js',target],{input:'{"returnValue":false}',encoding:'utf8'});assert.equal(failed.status,3);assert.equal(failed.stdout,'');
 const ok=spawnSync(process.execPath,['webos/controls/mapping.js',target],{input:JSON.stringify(fixture()),encoding:'utf8'});assert.equal(ok.status,0);assert.equal(JSON.parse(ok.stdout).settings.mapping_info[1].disneyplus.app_id,target);
});
