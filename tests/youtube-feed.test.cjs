const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const now=Date.parse('2026-10-25T20:00:00Z'),app='com.cobalt.youtube.adfree';
function api(){const c={Date:{now:()=>now,parse:Date.parse}};vm.createContext(c);vm.runInContext(fs.readFileSync('web/youtube-feed.js','utf8'),c);return c.YouTubeFeed;}
const row=(id,extra={})=>({id,title:'Subscribed video',channel:'Creator',publishedText:'há 1 hora',duration:'12:34',rank:0,image:'data:image/png;base64,aGVsbG8=',...extra});
const config=items=>({youtubeApp:app,items:[{id:app}],youtubeFeed:{source:'youtube_subscriptions',appId:app,available:true,accountConfirmed:true,observedAt:'2026-10-25T19:59:00Z',items}});
test('only own confirmed subscriptions, exact app and safe identities can produce video targets',()=>{
 const a=api(),c=config([row('VIDEO000001')]),before=JSON.stringify(c);assert.equal(a.items(c).length,1);assert.equal(JSON.stringify(c),before);assert.deepEqual(JSON.parse(JSON.stringify(a.target(c,0,'VIDEO000001'))),{id:app,params:{contentTarget:'v=VIDEO000001'}});
 for(const index of [-1,1,'0',null])assert.equal(a.target(c,index),null);
 for(const bad of [null,{}, {...c,youtubeApp:'youtube.official'}, {...c,items:[]},{...c,youtubeFeed:{...c.youtubeFeed,accountConfirmed:false}}, {...c,youtubeFeed:{...c.youtubeFeed,source:'recommendations'}}])assert.equal(a.items(bad).length,0);
});
test('Cobalt target uses its TV route and binds the launch to the selected identity',()=>{
 const a=api(),c=config([row('VIDEO000001'),row('VIDEO000002',{rank:1})]);
 assert.equal(a.target(c,0,'VIDEO000001').params.contentTarget,'v=VIDEO000001');
 for(const identity of ['VIDEO000002','https://www.youtube.com/watch?v=VIDEO000001',null,{}])assert.equal(a.target(c,0,identity),null);
 c.youtubeFeed.items[0].rank=2;
 assert.equal(a.target(c,0,'VIDEO000001'),null,'Reordering cannot launch the replacement at the old index');
 assert.equal(a.target(c,1,'VIDEO000001').params.contentTarget,'v=VIDEO000001');
 c.youtubeFeed.accountConfirmed=false;assert.equal(a.target(c,1,'VIDEO000001'),null);
});
test('other configured YouTube apps retain their URL launch contract',()=>{
 const a=api(),c=config([row('VIDEO000001')]);c.youtubeApp='youtube.leanback.v4';c.youtubeFeed.appId=c.youtubeApp;c.items=[{id:c.youtubeApp}];
 assert.deepEqual(JSON.parse(JSON.stringify(a.target(c,0,'VIDEO000001'))),{id:'youtube.leanback.v4',params:{contentTarget:'https://www.youtube.com/watch?v=VIDEO000001'}});
});
test('watched, Shorts, upcoming and duplicate IDs are excluded; feed order and current lives remain',()=>{
 const a=api(),c=config([row('VIDEO000001',{rank:3}),row('VIDEO000002',{rank:1,live:true}),row('VIDEO000003',{watched:true}),row('VIDEO000004',{short:true}),row('VIDEO000005',{upcoming:true}),row('VIDEO000002')]);const items=a.items(c);assert.deepEqual(Array.from(items,x=>x.id),['VIDEO000002','VIDEO000001']);assert.equal(items[0].live,true);
 assert.equal(a.items(config(Array.from({length:50},(_,i)=>row('V'+String(i).padStart(10,'0'))))).length,24);
});
test('stale or malformed feeds fail closed; old live badges and external thumbnail tracking are not presented as live',()=>{
 const a=api(),c=config([row('VIDEO000001',{live:true,image:'https://tracking.invalid/photo'})]);c.youtubeFeed.observedAt='2026-10-25T19:00:00Z';const items=a.items(c);assert.equal(items[0].live,false);assert.equal(items[0].liveCaptured,true);assert.equal(items[0].image,'');c.youtubeFeed.observedAt='2020-01-01';assert.equal(a.items(c).length,0);
 assert.equal(a.items(config([row('not a video'),null,{}])).length,0);
});
