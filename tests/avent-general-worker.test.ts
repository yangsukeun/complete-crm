import {beforeAll,test,expect} from 'vitest';
import {build} from 'esbuild';
import {Worker} from 'node:worker_threads';
import * as XLSX from 'xlsx';
import {GENERAL_HEADERS} from '../src/lib/avent/general-review';
let compiled='';
beforeAll(async()=>{const result=await build({entryPoints:['app/logistics/orders/general/review-worker.ts'],bundle:true,platform:'browser',format:'iife',write:false});compiled=result.outputFiles[0].text;});
function input(){const r=Array(30).fill('');Object.assign(r,{0:'SYN-A',1:'SYN-SUB',2:'SYN-SAB',3:'SYN-SHOP',4:'SYNTHETIC_PRIVATE_CANARY',5:'2026-11-05',6:'신규주문',7:'SYN-ITEM',8:'SYNTHETIC_PRIVATE_CANARY',10:1,12:'SYN-AVK',13:'SYNTHETIC_PRIVATE_CANARY',14:1,23:'SYNTHETIC_PRIVATE_CANARY'});const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([[...GENERAL_HEADERS],r]),'synthetic');return XLSX.write(b,{type:'array',bookType:'xlsx'}) as ArrayBuffer;}
async function run(source:ArrayBuffer){
 const script=`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.addEventListener=()=>{};globalThis.postMessage=(value,options)=>parentPort.postMessage(value,options?.transfer??[]);for(const name of ['fetch','XMLHttpRequest','WebSocket','importScripts'])globalThis[name]=()=>{parentPort.postMessage({networkAttempt:true});throw Error('NETWORK');};${compiled}\nparentPort.on('message',data=>self.onmessage({data}));`;
 const worker=new Worker(script,{eval:true,stdout:true,stderr:true});let logs='';worker.stdout.on('data',x=>logs+=x);worker.stderr.on('data',x=>logs+=x);
 try{return await new Promise<{data:Record<string,unknown>;logs:string}>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('TIMEOUT')),5000);worker.on('error',e=>{clearTimeout(timer);reject(e);});worker.on('message',data=>{clearTimeout(timer);resolve({data,logs});});worker.postMessage({source},[source]);});}finally{await worker.terminate();}
}
test('actual worker keeps synthetic private marker only in local workbook, never report/log/network',async()=>{
 const {data,logs}=await run(input());expect(data.ok).toBe(true);expect(data.networkAttempt).toBeUndefined();expect(JSON.stringify(data.report)).not.toContain('SYNTHETIC_PRIVATE_CANARY');expect(logs).toBe('');
 const b=XLSX.read(data.output,{type:'array'});expect(JSON.stringify(b.Sheets['원본행추적_변경없음'])).toContain('SYNTHETIC_PRIVATE_CANARY');
});
test('malformed private marker cannot escape through worker errors, including a later clean retry',async()=>{
 const {data,logs}=await run(new TextEncoder().encode('SYNTHETIC_PRIVATE_CANARY bad file').buffer);expect(data.ok).toBe(false);expect(JSON.stringify(data)).not.toContain('SYNTHETIC_PRIVATE_CANARY');expect(logs).toBe('');
 expect((await run(input())).data.ok).toBe(true);
});
