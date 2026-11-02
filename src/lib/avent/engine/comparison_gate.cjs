'use strict';
// Exact, same-schema identity domains only. Never infer cross-channel code aliases.
const IDENTITY_SCHEMAS = [
 ['주문번호','품목별주문번호'],
 ['주문번호','품목주문번호'], ['(사방넷) 주문코드'], ['사방넷주문번호'], ['주문번호']
];
const str=v=>v==null?'':String(v);
function positions(t,cols){return cols.map(c=>{const hits=t.headers.flatMap((h,i)=>h===c?[i]:[]);return hits.length===1?hits[0]:-1;});}
function bag(rows){const m=new Map();for(const r of rows){const k=JSON.stringify(r.map(str));m.set(k,(m.get(k)||0)+1);}return m;}
function delta(a,b){let missing=0,extra=0;for(const [k,n]of a)missing+=Math.max(0,n-(b.get(k)||0));for(const[k,n]of b)extra+=Math.max(0,n-(a.get(k)||0));return {missing,extra};}
function inspectBatch(source,expected){
 for(const columns of IDENTITY_SCHEMAS){
  const a=positions(source,columns),b=positions(expected,columns);if(a.includes(-1)||b.includes(-1))continue;
  const ar=source.rows.map(r=>a.map(i=>r[i])),br=expected.rows.map(r=>b.map(i=>r[i]));
  if(!ar.length||!br.length||[...ar,...br].some(r=>r.some(v=>!str(v).trim())))return {status:'blocked',reason:'EMPTY_ORDER_ID',columns};
  const ab=bag(ar),bb=bag(br),d=delta(ab,bb);
  return {status:d.missing||d.extra?'blocked':'verified',reason:d.missing||d.extra?'BATCH_IDENTITY_MISMATCH':null,columns,
   sourceRows:ar.length,expectedRows:br.length,missingOccurrences:d.missing,extraOccurrences:d.extra};
 }
 return {status:'unverified',reason:'NO_SHARED_VERIFIED_IDENTITY_SCHEMA',columns:[]};
}
function compareContent(actual,expected){
 if(JSON.stringify(actual.headers)!==JSON.stringify(expected.headers))return {match:false,headerMismatch:true};
 const columns=IDENTITY_SCHEMAS.find(c=>!positions(actual,c).includes(-1));
 const indices=columns?positions(actual,columns):[];
 function grouped(t){const m=new Map();for(const row of t.rows){const key=JSON.stringify(indices.map(i=>str(row[i])));if(!m.has(key))m.set(key,[]);m.get(key).push(row);}return m;}
 const a=grouped(actual),b=grouped(expected);let missingRows=0,extraRows=0;
 for(const k of new Set([...a.keys(),...b.keys()])){const d=delta(bag(a.get(k)||[]),bag(b.get(k)||[]));missingRows+=d.missing;extraRows+=d.extra;}
 const match=missingRows===0&&extraRows===0;
 const sequenceEqual=JSON.stringify(actual.rows.map(r=>r.map(str)))===JSON.stringify(expected.rows.map(r=>r.map(str)));
 return {match,headerMismatch:false,missingRows,extraRows,orderOnlyDifference:match&&!sequenceEqual,
  comparisonMode:columns?'identity_group_multiset':'full_row_multiset',keyColumns:columns||[],duplicatesPreserved:true};
}
function workflow(stage){
 if(!['pre_order','post_invoice'].includes(stage))throw Error('INVALID_WORKFLOW_STAGE');
 return {stage,inventory:stage==='pre_order'?'deferred_post_invoice':'not_verified',gifts:stage==='pre_order'?'deferred_post_invoice':'not_verified',
  cancellation:'source_status_only_no_inference',quantity:'preserve_no_inference',dispatchEnabled:false};
}
module.exports={inspectBatch,compareContent,workflow};
