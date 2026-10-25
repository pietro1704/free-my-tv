process.env.TZ='America/Sao_Paulo';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function api(){const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('web/calendar-feed.js','utf8'),c);return c.CalendarFeed;}
const now=Date.parse('2026-10-25T18:00:00Z');
const event=(id,extra={})=>({id,title:'Own event',start:'2026-10-25T19:00:00Z',end:'2026-10-25T20:00:00Z',kind:'primary',allDay:false,time:'16:00',...extra});
const config=events=>({calendarKinds:['primary','holiday','moon','f1'],calendarFeed:{source:'macos_eventkit',available:true,timeZone:'America/Sao_Paulo',generatedAt:'2026-10-25T17:00:00Z',today:'2026-10-25',tomorrow:'2026-10-26',events}});
test('today and tomorrow show only titles/times from approved calendars, including F1 and moon',()=>{
 const c=config([event('one'),event('f1',{kind:'f1',title:'Race',start:'2026-10-26T19:00:00Z',end:'2026-10-26T20:00:00Z'}),event('other',{kind:'birthdays'}),event('moon',{kind:'moon',allDay:true,start:'2026-10-25T03:00:00Z',end:'2026-10-26T03:00:00Z'})]);const before=JSON.stringify(c),out=api().view(c,now);
 assert.equal(out.available,true);assert.equal(out.rows.length,3);assert.ok(out.rows.some(r=>r.label==='Amanhã · 16:00'&&r.value==='Race'));assert.ok(out.rows.some(r=>r.label==='Hoje · Dia todo'));assert.equal(JSON.stringify(c),before);
});
test('overnight events overlap both days, exclusive ends do not spill and events outside window never show',()=>{
 const out=api().view(config([event('night',{start:'2026-10-26T02:00:00Z',end:'2026-10-26T04:00:00Z',time:'23:00'}),event('outside',{start:'2026-10-27T03:00:00Z',end:'2026-10-27T04:00:00Z'}),event('end',{start:'2026-10-24T23:00:00Z',end:'2026-10-25T03:00:00Z'})]),now);assert.equal(out.rows.length,2);assert.equal(out.rows[1].label,'Amanhã · Em andamento');
});
test('missing, denied, wrong source/timezone, malformed and stale snapshots cannot look connected',()=>{
 const a=api(),good=config([]);assert.equal(a.view(good,now).available,true);assert.equal(a.view(good,now).rows.length,2);
 for(const c of [null,{}, {...good,calendarKinds:{}}, {...good,calendarFeed:{...good.calendarFeed,generatedAt:'2026-10-26T17:00:00Z'}}, {...good,calendarFeed:{...good.calendarFeed,available:false}}, {...good,calendarFeed:{...good.calendarFeed,source:'unrelated'}},{...good,calendarFeed:{...good.calendarFeed,timeZone:'UTC'}},{...good,calendarFeed:{...good.calendarFeed,events:{}}}])assert.equal(a.view(c,now).available,false);
 assert.equal(a.view(good,now+86400000).available,false);
});
