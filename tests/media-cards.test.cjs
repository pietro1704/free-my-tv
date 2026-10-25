const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(){const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('web/media-cards.js','utf8'),c);return c.MediaCards;}
const row=(id,extra={})=>({id,title:'Title '+id,kind:'movie',image:'https://image.tmdb.org/t/p/w500/'+id+'.jpg',section:'library',updatedAt:1,...extra});
const config=items=>({catalogApp:'space.nuvio.webos',items:[{id:'space.nuvio.webos'}],mediaFeed:{appId:'space.nuvio.webos',observedAt:'2026-10-25T12:00:00Z',items}});
test('own Nuvio snapshot keeps continue watching first, latest identity and bounded public artwork',()=>{
 const a=api(),c=config([row('a'),row('b',{section:'continue',positionMs:100,durationMs:200}),row('a',{title:'New title',updatedAt:2})]),before=JSON.stringify(c),out=a.items(c);
 assert.deepEqual(Array.from(out,x=>x.id),['b','a']);assert.equal(out[1].title,'New title');assert.equal(out[0].progress,50);assert.equal(JSON.stringify(c),before);
 assert.ok(a.observed(c));assert.equal(a.items(config(Array.from({length:60},(_,i)=>row('x'+i)))).length,24);
});
test('unconnected, malformed or wrong app identities cannot display someone else’s catalog',()=>{
 const a=api();for(const c of [null,{}, {...config([row('a')]),catalogApp:'other'}, {...config([row('a')]),items:[]}, {...config([]),mediaFeed:{appId:'other',items:[row('a')]}}, {...config([]),mediaFeed:{appId:'space.nuvio.webos',items:{}}}])assert.equal(a.items(c).length,0);
 assert.equal(a.items(config([null,{},row('a',{kind:'other'}),row('b',{title:''}),row('c',{section:'advert'})])).length,0);
});
test('finished progress is hidden; missing or credential-bearing artwork keeps a readable title',()=>{
 const a=api(),out=a.items(config([row('done',{section:'continue',positionMs:100,durationMs:100}),row('unsafe',{image:'https://image.tmdb.org@tracker.invalid/a.jpg'}),row('query',{image:'https://image.tmdb.org/t/p/w500/a.jpg?api_key=secret'}),row('html',{title:'<img src=x onerror=bad()>',image:'javascript:bad()'})]));
 assert.equal(out.length,3);assert.ok(out.every(x=>x.image===''));assert.equal(out[2].title,'<img src=x onerror=bad()>');
 assert.equal(a.image('https://artworks.thetvdb.com/banners/a.jpg'),'https://artworks.thetvdb.com/banners/a.jpg');
});
test('cached artwork, finite progress and valid series episode details survive without inventing metadata',()=>{
 const a=api(),cached='data:image/png;base64,aGVsbG8=',out=a.items(config([row('series',{kind:'series',section:'continue',positionMs:50,durationMs:200,season:1,episode:2,episodeTitle:'Episode title',image:cached,background:cached}),row('unknown',{section:'continue',positionMs:50,durationMs:Infinity}),row('library',{kind:'series',season:1,episode:2})]));
 assert.equal(out[0].image,cached);assert.equal(out[0].background,cached);assert.equal(out[0].progress,25);assert.equal(out[0].season,1);assert.equal(out[0].episode,2);assert.equal(out[0].episodeTitle,'Episode title');
 assert.equal(out.find(x=>x.id==='unknown').progress,null);assert.equal(out.find(x=>x.id==='library').season,undefined);
 for(const value of ['data:text/html;base64,aGVsbG8=','data:image/svg+xml;base64,aGVsbG8=','data:image/png;base64,'+'a'.repeat(600001)])assert.equal(a.image(value),'');
 const bad=a.items(config([row('bad',{kind:'series',section:'continue',positionMs:10,durationMs:100,season:1.2,episode:2})]))[0];assert.equal(bad.season,undefined);
});
