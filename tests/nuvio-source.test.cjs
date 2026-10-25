const test=require('node:test'),assert=require('node:assert/strict'),snapshot=require('../tools/nuvio-source.cjs');
const row=(profileId,id,extra={})=>({profileId,contentId:id,contentType:'movie',title:'Own title',poster:'https://image.tmdb.org/t/p/w500/a.jpg',...extra});
function store(values){const reads=[];return {reads,getItem(k){reads.push(k);return JSON.stringify(values[k])},setItem(){throw Error('Unexpected account write')}};}
test('only reads the three approved local keys; active profile cannot leak other profiles or credentials',()=>{
 const s=store({activeProfileId:'2',savedLibraryItems:[row('1','private'),row('2','own',{access_token:'never export'})],watchProgressItems:[],access_token:'secret'}),data=snapshot(s,'2026-10-25T12:00:00Z');
 assert.deepEqual(s.reads,['activeProfileId','savedLibraryItems','watchProgressItems']);assert.equal(data.items.length,1);assert.equal(data.items[0].id,'own');assert.equal(JSON.stringify(data).includes('secret'),false);assert.equal(JSON.stringify(data).includes('access_token'),false);
});
test('own progress joins only own library artwork and excludes completion or invalid progress',()=>{
 const s=store({activeProfileId:'2',savedLibraryItems:[row('1','private'),row('2','own')],watchProgressItems:[row('2','own',{poster:null,positionMs:5,durationMs:10}),row('2','done',{positionMs:10,durationMs:10}),row('1','other',{positionMs:5,durationMs:10}),row('2','invalid',{positionMs:'bad',durationMs:10})]});
 const data=snapshot(s,'now'),p=data.items.filter(x=>x.section==='continue');assert.equal(p.length,1);assert.equal(p[0].image,'https://image.tmdb.org/t/p/w500/a.jpg');
});
test('malformed or unavailable storage fails to empty snapshot without writing accounts',()=>{
 for(const s of [{getItem(){throw Error('unavailable')}},{getItem(){return '{bad'}},store({activeProfileId:{bad:true},savedLibraryItems:{},watchProgressItems:null})])assert.equal(snapshot(s,'now').items.length,0);
});
