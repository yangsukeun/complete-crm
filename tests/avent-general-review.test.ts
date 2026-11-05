import {describe,test,expect} from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {GENERAL_HEADERS,MAX_FILE_BYTES,reviewGeneral,type Cell,type Table} from '../src/lib/avent/general-review';
import {parseGeneralFile,prepareGeneral,checkContainer,verifyExpansion} from '../src/lib/avent/general-file';

export function fixture(overrides:Record<number,Cell>={}):Cell[]{
 const r:Cell[]=Array(30).fill('');Object.assign(r,{0:'12345678901234567890123456',1:'SUB-A',2:'SAB-A',3:'SHOP-A',4:'11번가',5:'2026-11-05 10:00:00',6:'신규주문',7:'ITEM-A',8:'합성상품',9:'',10:1,11:'MAP-A',12:'AVK-A',13:'합성매핑',14:1,15:100,16:100,17:0,23:'SYNTHETIC_PRIVATE_CANARY',...overrides});return r;
}
function table(rows:Cell[][]):Table{return {headers:[...GENERAL_HEADERS],rows,sourceRows:rows.map((_,i)=>i+2)};}
function file(rows:Cell[][],type:'xlsx'|'xls'='xlsx'){
 const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([[...GENERAL_HEADERS],...rows]),'synthetic');return XLSX.write(b,{type:'array',bookType:type}) as ArrayBuffer;
}
describe('general mall review preserves evidence instead of issuing orders',()=>{
 test.each(['data','formula'] as const)('undersized dimension cannot hide sparse row 6000 %s',async kind=>{
  const b=XLSX.read(file([fixture()]),{type:'array'});
  b.Sheets.synthetic.A6000=kind==='formula'?{t:'n',v:2,f:'1+1'}:{t:'s',v:'SYNTHETIC_LATE_ROW'};
  b.Sheets.synthetic['!ref']='A1:AD6000';
  const zip=await JSZip.loadAsync(XLSX.write(b,{type:'array',bookType:'xlsx'}));
  const xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  zip.file('xl/worksheets/sheet1.xml',xml.replace(/<dimension ref="[^"]+"\/>/,'<dimension ref="A1"/>'));
  const raw=await zip.generateAsync({type:'arraybuffer'});
  await expect(verifyExpansion(raw)).resolves.toBeUndefined();
  expect(()=>parseGeneralFile(raw)).toThrow('ROWS');
  expect(()=>prepareGeneral(raw)).toThrow('ROWS');
 });
 test.each(['xls','xlsx'] as const)('%s round trip preserves long string keys, every row and quantity',type=>{
  const raw=file([fixture(),fixture({1:'',2:'SAB-B',9:''})],type);const parsed=parseGeneralFile(raw);
  expect(parsed.rows[0][0]).toBe('12345678901234567890123456');expect(parsed.rows[1][1]).toBe('');
  const r=prepareGeneral(raw);expect(r.report).toMatchObject({rows:2,uploadAllowed:false,dispatchEnabled:false,approval:'not_provided',reference:'not_provided',issues:[]});
  const b=XLSX.read(r.output,{type:'array'});expect(b.SheetNames[0]).toBe('안내_업로드금지');
  const trace=XLSX.utils.sheet_to_json<Cell[]>(b.Sheets['원본행추적_변경없음'],{header:1,defval:null}).slice(1);
  expect(trace[0].slice(1)).toEqual(parsed.rows[0]);expect(trace[1][0]).toBe(3);
 });
 test('already split set and repeated seven-column rows are preserved; aggregate is raw row sum',()=>{
  const rows=[fixture({14:2}),fixture({12:'AVK-B',14:3}),fixture({2:'SAB-B',1:'SUB-B',14:2})];
  const r=reviewGeneral(table(rows));expect(r.reviewRows).toHaveLength(3);expect(r.traceRows.map(x=>x[15])).toEqual([2,3,2]);
  expect(r.report.issues.every(i=>i.code==='QUANTITY_DIFFERENCE')).toBe(true);
  expect(r.report.channels[0]).toMatchObject({rows:3,orderQuantity:3,shipmentQuantity:7});
 });
 test('duplicate and conflicting source lines are flagged on both rows, never removed',()=>{
  const r=reviewGeneral(table([fixture(),fixture(),fixture({14:2})]));
  expect(r.reviewRows).toHaveLength(3);expect(r.report.issues).toContainEqual({code:'DUPLICATE_ROW',row:2});
  expect(r.report.issues).toContainEqual({code:'DUPLICATE_ROW',row:3});expect(r.report.issues).toContainEqual({code:'AMBIGUOUS_LINE_KEY',row:4});
 });
 test('different batch and duplicate multiplicity cannot pass comparison',()=>{
  expect(reviewGeneral(table([fixture()]),table([fixture({2:'OTHER'})])).report.reference).toBe('different_batch');
  expect(reviewGeneral(table([fixture(),fixture()]),table([fixture()])).report.reference).toBe('different_batch');
  const a=table([fixture(),fixture({2:'B'})]);expect(reviewGeneral(a,table([...a.rows].reverse())).report.reference).toBe('same_batch');
  expect(reviewGeneral(table([fixture()]),table([fixture({16:200})])).report.issues).toContainEqual({code:'REFERENCE_DIFFERENCE',row:undefined});
 });
 test.each([0,-1,1.5,'2개','1e3',Number.MAX_SAFE_INTEGER+1])('invalid quantity %s stays unchanged and held',value=>{
  const r=reviewGeneral(table([fixture({10:value})]));expect(r.report.issues).toContainEqual({code:'INVALID_QUANTITY',row:2});expect(r.traceRows[0][11]).toBe(value);
 });
 test('missing mapping, numeric keys, unknown state and separate flow stay unapproved',()=>{
  const r=reviewGeneral(table([fixture({0:123,12:'',13:'',6:'출고완료',4:'AVK_직원판매',29:''})]));
  expect(r.report.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['NUMERIC_KEY','MISSING_MAPPING','UNCONFIRMED_STATUS','SEPARATE_WORKFLOW']));
  expect(r.traceRows[0][7]).toBe('출고완료');expect(r.report.uploadAllowed).toBe(false);
 });
 test('7-column review and reordered/extra schemas are unsupported input',()=>{
  expect(()=>reviewGeneral({...table([fixture()]),headers:[...GENERAL_HEADERS].reverse()})).toThrow('SCHEMA');
  const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['쇼핑몰명','상품명'],['synthetic','synthetic']]),'review');
  expect(()=>parseGeneralFile(XLSX.write(b,{type:'array',bookType:'xlsx'}))).toThrow('SCHEMA');
 });
 test('repairs A1 dimension based on actual cells without changing file bytes',async()=>{
  const zip=await JSZip.loadAsync(file([fixture()]));const xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string');zip.file('xl/worksheets/sheet1.xml',xml.replace(/<dimension ref="[^"]+"\/>/,'<dimension ref="A1"/>'));
  const raw=await zip.generateAsync({type:'arraybuffer'}),before=new Uint8Array(raw).slice();expect(parseGeneralFile(raw).rows).toHaveLength(1);expect(new Uint8Array(raw)).toEqual(before);
 });
 test('active content, additional sheets, overlarge inputs and wrong container rejected',()=>{
  for(const kind of ['formula','link','error','sheet'] as const){const b=XLSX.read(file([fixture()]),{type:'array'});const s=b.Sheets.synthetic;if(kind==='formula')s.A2.f='1+1';if(kind==='link')s.A2.l={Target:'https://example.invalid/'};if(kind==='error'){s.A2.t='e';s.A2.v=7;}if(kind==='sheet')XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['x']]),'extra');expect(()=>parseGeneralFile(XLSX.write(b,{type:'array',bookType:'xlsx'}))).toThrow();}
  expect(()=>checkContainer(new ArrayBuffer(MAX_FILE_BYTES+1))).toThrow('SIZE');expect(()=>checkContainer(new TextEncoder().encode('not an Excel file').buffer)).toThrow('FORMAT');
 });
 test('zip external-link parts and suspicious expansion are rejected before parser',async()=>{
  const zip=await JSZip.loadAsync(file([fixture()]));zip.file('xl/externalLinks/externalLink1.xml','<external/>');
  // Separate central-directory bound test; no malicious file is decompressed.
  const raw=file([fixture()]),copy=raw.slice(0),v=new DataView(copy);for(let i=0;i<copy.byteLength-46;i++){if(v.getUint32(i,true)===0x02014b50){v.setUint32(i+24,17*1024*1024,true);break;}}
  expect(()=>checkContainer(copy)).toThrow();
  const external=await zip.generateAsync({type:'arraybuffer'});expect(()=>checkContainer(external)).toThrow('ACTIVE_CONTENT');
 });
 test('streamed expansion handles legacy zero local sizes but rejects lying central directory',async()=>{
  const zip=await JSZip.loadAsync(file([fixture()]));const raw=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});const v=new DataView(raw);
  for(let i=0;i<raw.byteLength-46;i++){if(v.getUint32(i,true)===0x02014b50){const offset=v.getUint32(i+42,true);v.setUint32(offset+18,0,true);v.setUint32(offset+22,0,true);}}
  const before=new Uint8Array(raw).slice();await expect(verifyExpansion(raw)).resolves.toBeUndefined();expect(parseGeneralFile(raw).rows).toHaveLength(1);expect(new Uint8Array(raw)).toEqual(before);
  const lying=raw.slice(0),bad=new DataView(lying);for(let i=0;i<lying.byteLength-46;i++){if(bad.getUint32(i,true)===0x02014b50){bad.setUint32(i+24,1,true);break;}}
  await expect(verifyExpansion(lying)).rejects.toThrow();
 });
 test('formula-looking text remains text in review output',()=>{
  const {output}=prepareGeneral(file([fixture({8:'=1+1'})]));const b=XLSX.read(output,{type:'array',cellFormula:true});expect(b.Sheets['매핑검토_7열'].B2).toMatchObject({t:'s',v:'=1+1'});expect(b.Sheets['매핑검토_7열'].B2.f).toBeUndefined();
 });
});
