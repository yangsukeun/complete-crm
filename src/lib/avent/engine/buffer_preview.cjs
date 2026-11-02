'use strict';
// Local feasibility adapter. Not registered in CRM runtime. No fs/fork/network calls.
const A=require('./actual_adapter.cjs'),G=require('./comparison_gate.cjs'),{scopeGate}=require('./scope_gate.cjs');
const XLSX=require(process.env.AVENT_XLSX_MODULE||'xlsx'),{createHash}=require('node:crypto');
const digest=b=>createHash('sha256').update(b).digest('hex');
function preview({source,expected,profile,stage='pre_order'}) {
 if(!Buffer.isBuffer(source)||!Buffer.isBuffer(expected)||source.length>1024*1024||expected.length>1024*1024)throw Error('INPUT_LIMIT');
 if(!['payment','sabang','shortage','tracking'].includes(profile))throw Error('UNSUPPORTED_PROFILE');
 const workflow=G.workflow(stage),inputHash=digest(source),expectedHash=digest(expected);
 const input=A.readBuffer(source),reference=A.readBuffer(expected),batch=G.inspectBatch(input,reference);
 if(batch.status==='blocked')return {inputHash,expectedHash,batch,workflow,downloadAllowed:false};
 const result=A[profile](input),comparison=G.compareContent(result.table,reference),scope=scopeGate(input);
 const downloadAllowed=batch.status==='verified'&&comparison.match&&scope.employeeRows===0;
 let output=null;
 if(downloadAllowed){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([result.table.headers,...result.table.rows]),'result');output=XLSX.write(book,{type:'buffer',bookType:'xlsx'});if(output.length>1024*1024)throw Error('OUTPUT_LIMIT');}
 return {inputHash,expectedHash,batch,comparison,scope,workflow,rows:result.table.rows.length,downloadAllowed,output,outputHash:output?digest(output):null,
  persistence:'none',approval:'not_approved',dispatchEnabled:false};
}
module.exports={preview};
