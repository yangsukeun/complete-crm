'use strict';
const {Worker}=require('node:worker_threads');
const MAX_FILE=128*1024,MAX_RESPONSE=256*1024;
let active=false; // Per process only; not a distributed or account-wide lock.
function validate(input){
 if(input.profile!=='payment'||input.stage!=='pre_order')throw Error('UNSUPPORTED_PROFILE');
 for(const key of ['source','expected']){
  const b=input[key];if(!Buffer.isBuffer(b)||b.length<512||b.length>MAX_FILE)throw Error('INPUT_LIMIT');
  // Pilot accepts BIFF/OLE XLS only. ZIP/XLSX (including compressed bombs) never enters the parser.
  if(b.subarray(0,8).toString('hex')!=='d0cf11e0a1b11ae1')throw Error('UNSUPPORTED_FILE_CONTAINER');
  if(b.readUInt16LE(28)!==0xfffe||![9,12].includes(b.readUInt16LE(30)))throw Error('INVALID_OLE_HEADER');
  const sectors=Math.floor(b.length/(2**b.readUInt16LE(30)));
  for(const offset of [40,44,64,72])if(b.readUInt32LE(offset)>sectors)throw Error('INVALID_OLE_SECTOR_COUNT');
 }
}
function execute(input,{timeoutMs=2000,signal}={}){
 validate(input);if(signal?.aborted)return Promise.reject(Error('ABORTED'));
 if(active)return Promise.reject(Error('BUSY'));
 return new Promise((resolve,reject)=>{
  // A short-lived isolate, not an external service/process or persistent worker.
  const worker=new Worker(require.resolve('./bounded_preview_worker.cjs'),{workerData:input,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  active=true;
  let done=false;
  const finish=async(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);try{await worker.terminate();}catch{}active=false;if(error)reject(error);else resolve(value);};
  const abort=()=>void finish(Error('ABORTED'));
  const timer=setTimeout(()=>void finish(Error('TIME_LIMIT')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  worker.once('message',message=>{if(message.error)return void finish(Error('PROCESSING_REJECTED'));if(Buffer.byteLength(JSON.stringify(message))>MAX_RESPONSE)return void finish(Error('RESPONSE_LIMIT'));void finish(null,message);});
  worker.once('error',()=>void finish(Error('PROCESSING_REJECTED')));
  worker.once('exit',()=>{if(!done)void finish(Error('PROCESSING_REJECTED'));});
 });
}
module.exports={execute,validate,MAX_FILE,MAX_RESPONSE};
