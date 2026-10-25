// LG_TV_HOST=<LAN IP> node tools/nuvio-snapshot.mjs --output /private/path/feed.json
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import snapshot from './nuvio-source.cjs';
const host=process.env.LG_TV_HOST, output=process.argv[process.argv.indexOf('--output')+1];
assert.ok(host && /^\d{1,3}(\.\d{1,3}){3}$/.test(host),'Set LG_TV_HOST to the TV IP');
assert.ok(process.argv.includes('--output') && output && path.isAbsolute(output),'Provide --output with an absolute private path');
const pages=await(await fetch(`http://${host}:9998/json/list`,{signal:AbortSignal.timeout(5000)})).json();
const page=pages.find(p=>p.description==='space.nuvio.webos');assert.ok(page,'Open Nuvio on the TV first');
const socket=new WebSocket(page.webSocketDebuggerUrl);
try {
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket timeout')),5000);socket.onopen=()=>{clearTimeout(timer);resolve()};socket.onerror=()=>{clearTimeout(timer);reject(Error('WebSocket unavailable'))}});
 const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Snapshot timeout')),10000);
  socket.onmessage=e=>{const data=JSON.parse(e.data);if(data.id!==1)return;clearTimeout(timer);data.error?reject(Error('Snapshot unavailable')):resolve(data.result)};
  socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`(${snapshot.toString()})(localStorage,${JSON.stringify(new Date().toISOString())})`,returnByValue:true}}));
 });
 assert.equal(result.exceptionDetails,undefined,'Nuvio local data unavailable');
 const data=result.result.value;assert.equal(data.appId,'space.nuvio.webos');assert.ok(Array.isArray(data.items));
 const tmp=output+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,output);fs.chmodSync(output,0o600);
 console.log(JSON.stringify({readOnly:true,items:data.items.length,credentialsRead:false,automaticRefresh:false}));
} finally {socket.close()}
