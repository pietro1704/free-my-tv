const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const now=Date.parse('2026-10-25T18:00:00Z');
function api(){const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('web/news-feed.js','utf8'),c);return c.NewsFeed;}
const row=(id,extra={})=>({id,title:'Headline '+id,summary:'Evidence-based summary',source:'news.example',sourceUrl:'https://news.example/article/'+id,status:'completed',ready:true,publishedAt:'2026-10-25T14:00:00Z',analyzedAt:'2026-10-25T17:00:00Z',image:'data:image/png;base64,aGVsbG8=',...extra});
const config=items=>({newsFeed:{source:'frank_investigator',observedAt:'2026-10-25T17:30:00Z',items}});
test('only completed, ready, matching-source Frank reports display, with separate publication and analysis dates',()=>{
 const a=api(),c=config([row('one'),row('two',{publishedAt:null})]),before=JSON.stringify(c),items=a.items(c,now);assert.equal(items.length,2);assert.equal(items[1].publishedAt,null);assert.notEqual(items[0].publishedAt,items[0].analyzedAt);assert.equal(JSON.stringify(c),before);assert.equal(a.items(config(Array.from({length:20},(_,i)=>row('id'+i))),now).length,6);
});
test('wrong report identities, pending evidence, stale/future dates and duplicate reports cannot look current',()=>{
 const a=api();for(const c of [null,{}, {newsFeed:{source:'other',items:[row('a')]}},config([row('a',{ready:false}),row('b',{status:'processing'}),row('c',{source:'other.example'}),row('d',{analyzedAt:'2020-01-01'}),row('e',{analyzedAt:'2027-01-01'}),row('old',{publishedAt:'2020-01-01'}),row('future',{publishedAt:'2027-01-01'})])])assert.equal(a.items(c,now).length,0);
 assert.equal(a.items(config([row('a'),row('a')]),now).length,1);
});
test('news images are local raster data, never publisher tracking URLs or SVG scripts',()=>{
 const a=api();for(const image of ['https://tracking.example/image.jpg','data:image/svg+xml;base64,aGVsbG8=','javascript:bad()'])assert.equal(a.items(config([row('a',{image})]),now)[0].image,'');
 assert.ok(a.items(config([row('a')]),now)[0].image.startsWith('data:image/png;base64,'));
});
test('reader preserves Frank qualifications as bounded text, not arbitrary fields or verdict claims',()=>{
 const item=api().items(config([row('a',{report:{conclusion:'Conclusion',strengths:['Point',null,{}],weaknesses:['Needs evidence'],quality:'Mixed evidence',verdicts:{supported:2,needs_more_evidence:1,not_checkable:3,pending:-1,secret:99},reused:true,degraded:true,token:'never export'}})]),now)[0];
 assert.equal(item.sourceUrl,'https://news.example/article/a');assert.equal(item.report.conclusion,'Conclusion');assert.deepEqual(Array.from(item.report.strengths),['Point']);assert.equal(item.report.verdicts.needs_more_evidence,1);assert.equal(item.report.verdicts.not_checkable,3);assert.equal(item.report.verdicts.pending,undefined);assert.equal(item.report.verdicts.secret,undefined);assert.equal(item.report.token,undefined);assert.equal(item.report.degraded,true);
 const invalid=api().items(config([row('a',{report:'bad'})]),now)[0];assert.equal(invalid.report,null);
});
test('reader revalidates report identity and readiness without scanning artwork on every key',()=>{
 const a=api(),value=row('a');Object.defineProperty(value,'image',{get(){throw Error('Artwork must not be read for scrolling')}});const c=config([value]),stamp=Date.parse(value.analyzedAt);
 assert.equal(a.current(c,'a',stamp,now),true);assert.equal(a.current(c,'other',stamp,now),false);assert.equal(a.current(c,'a',stamp+1,now),false);value.ready=false;assert.equal(a.current(c,'a',stamp,now),false);value.ready=true;assert.equal(a.current(c,'a',stamp,Date.parse('2026-11-01')),false);
});
