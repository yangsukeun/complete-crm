'use strict';
const {workerData,parentPort}=require('node:worker_threads');
try{
 const {preview}=require('./buffer_preview.cjs');
 const result=preview({...workerData,source:Buffer.from(workerData.source),expected:Buffer.from(workerData.expected)});
 const {output,...report}=result;
 // Review artifact only; never an approval or dispatch instruction.
 parentPort.postMessage({...report,outputBase64:output?output.toString('base64'):null});
}catch{parentPort.postMessage({error:'PROCESSING_REJECTED'});}
