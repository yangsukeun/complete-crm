import * as XLSX from 'xlsx';
import {GENERAL_HEADERS,REVIEW_HEADERS,MAX_FILE_BYTES,MAX_ROWS,reviewGeneral,type Table,type Cell} from './general-review';

export function checkContainer(data:ArrayBuffer){
 if(data.byteLength<8||data.byteLength>MAX_FILE_BYTES)throw Error('SIZE');
 const bytes=new Uint8Array(data),view=new DataView(data);
 if(bytes.slice(0,8).every((v,i)=>v===[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1][i]))return;
 if(view.getUint32(0,true)!==0x04034b50)throw Error('FORMAT');
 // Bound ZIP expansion before SheetJS parses XLSX. Reject ZIP64, encryption and active/external parts.
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(view.getUint32(p,true)===0x06054b50){end=p;break;}}
 if(end<0||end+22+view.getUint16(end+20,true)!==bytes.length||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('ZIP');
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
 if(!count||count>256||count!==view.getUint16(end+8,true)||start+size!==end)throw Error('ZIP');
 let p=start,total=0;const names=new Set<string>(),entries:{offset:number;body:number;compressed:number;expanded:number;method:number}[]=[];
 for(let n=0;n<count;n++){
  if(p+46>end||view.getUint32(p,true)!==0x02014b50)throw Error('ZIP');
  const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true),compressed=view.getUint32(p+20,true),expanded=view.getUint32(p+24,true),nameLength=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),offset=view.getUint32(p+42,true);
  if(flags&1||![0,8].includes(method)||expanded===0xffffffff||compressed===0xffffffff||offset===0xffffffff||p+46+nameLength+extra+comment>end||offset+30>start)throw Error('ZIP');
  const name=new TextDecoder().decode(bytes.slice(p+46,p+46+nameLength));
  if(names.has(name)||name.includes('..')||name.startsWith('/')||/externalLinks|vbaProject|macrosheets|connections\.xml|queryTables|embeddings/i.test(name))throw Error('ACTIVE_CONTENT');names.add(name);
  if(view.getUint32(offset,true)!==0x04034b50||view.getUint16(offset+6,true)!==flags||view.getUint16(offset+8,true)!==method)throw Error('ZIP');
  const localName=view.getUint16(offset+26,true),localExtra=view.getUint16(offset+28,true),body=offset+30+localName+localExtra;
  if(body+compressed>start||new TextDecoder().decode(bytes.slice(offset+30,offset+30+localName))!==name)throw Error('ZIP');
  // Do not trust conflicting local sizes even when the central directory looks small.
  const localCompressed=view.getUint32(offset+18,true),localExpanded=view.getUint32(offset+22,true);
  if(!(flags&8)&&((localCompressed!==0&&localCompressed!==compressed)||(localExpanded!==0&&localExpanded!==expanded)))throw Error('ZIP');
  total+=expanded;if(total>16*1024*1024||expanded>8*1024*1024||expanded>Math.max(compressed*200,128*1024))throw Error('SIZE');
  entries.push({offset,body,compressed,expanded,method});p+=46+nameLength+extra+comment;
 }
 if(p!==end||!names.has('xl/workbook.xml')||!names.has('[Content_Types].xml'))throw Error('ZIP');
 return entries;
}

/** Stream and count actual expansion before invoking the legacy XLSX parser. */
export async function verifyExpansion(data:ArrayBuffer){
 const entries=checkContainer(data);if(!entries)return;
 let total=0;
 for(const e of entries){
  if(e.method===0){if(e.compressed!==e.expanded)throw Error('ZIP');total+=e.expanded;continue;}
  const reader=new Blob([data.slice(e.body,e.body+e.compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;total+=value.byteLength;if(size>e.expanded||size>8*1024*1024||total>16*1024*1024)throw Error('SIZE');}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  if(size!==e.expanded)throw Error('ZIP');
 }
}

export function parseGeneralFile(data:ArrayBuffer):Table{
 const entries=checkContainer(data);
 // Normalize legacy zero local sizes only in a copy; retain the original bytes and hash.
 const parsingData=entries?data.slice(0):data;
 if(entries){const view=new DataView(parsingData);for(const e of entries){if(view.getUint32(e.offset+18,true)===0)view.setUint32(e.offset+18,e.compressed,true);if(view.getUint32(e.offset+22,true)===0)view.setUint32(e.offset+22,e.expanded,true);}}
 const book=XLSX.read(parsingData,{type:'array',cellFormula:true,cellHTML:false,cellText:false,cellDates:false,bookVBA:true,sheetRows:MAX_ROWS+2});
 if(book.vbaraw||book.SheetNames.length!==1||(book.Workbook?.Names?.length??0)>0)throw Error('ACTIVE_CONTENT');
 const sheet=book.Sheets[book.SheetNames[0]];
 if(sheet['!fullref']){const range=XLSX.utils.decode_range(sheet['!fullref']);if(range.e.r>MAX_ROWS||range.e.c>29)throw Error('ROWS');}
 let lastRow=0;
 for(const [address,cell] of Object.entries(sheet)){
  if(address.startsWith('!'))continue;
  if(!/^[A-Z]+[1-9]\d*$/.test(address))throw Error('FORMAT');
  const at=XLSX.utils.decode_cell(address);
  if(at.r>MAX_ROWS||at.c>29)throw Error('ROWS');
  if(cell.f||cell.l||cell.t==='e')throw Error('ACTIVE_CONTENT');
  if(typeof cell.v==='string'&&cell.v.length>2000)throw Error('SIZE');
  lastRow=Math.max(lastRow,at.r);
 }
 // Actual cells, not a possibly incorrect A1-only worksheet dimension, define the range.
 const headers=Array.from({length:30},(_,c)=>String(sheet[XLSX.utils.encode_cell({r:0,c})]?.v??''));
 if(JSON.stringify(headers)!==JSON.stringify(GENERAL_HEADERS))throw Error('SCHEMA');
 const rows:Cell[][]=[],sourceRows:number[]=[];
 for(let r=1;r<=lastRow;r++){
  const row=Array.from({length:30},(_,c)=>sheet[XLSX.utils.encode_cell({r,c})]?.v??null) as Cell[];
  if(row.every(v=>v===null||v===''))continue;
  rows.push(row);sourceRows.push(r+1);
 }
 return {headers,rows,sourceRows};
}

export function prepareGeneral(source:ArrayBuffer,reference?:ArrayBuffer){
 const result=reviewGeneral(parseGeneralFile(source),reference?parseGeneralFile(reference):undefined);
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['검수 전용 · 이지어드민 업로드 금지'],['발주 승인·완료 결과가 아닙니다. 실제 업로드 스키마 미확정.'],
  ['원본 행·키·수량 보존. 상품 매핑·세트·사은품을 새로 계산하지 않습니다.'],
  ['담당자 검토 항목 수',result.report.issues.length],['비교본 배치 확인',result.report.reference]
 ]),'안내_업로드금지');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['채널 참조','원본 쇼핑몰명','원본 행 수','원본 행 주문수량 합 (판매주문 총계 아님)','원본 행 출고수량 합'],...result.report.channels.map((c,i)=>[`채널 ${i+1}`,c.name,c.rows,c.orderQuantity??'수량 오류',c.shipmentQuantity??'수량 오류'])]),'채널대조');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[...REVIEW_HEADERS],...result.reviewRows]),'매핑검토_7열');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['원본 Excel 행',...GENERAL_HEADERS],...result.traceRows]),'원본행추적_변경없음');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['원본 Excel 행','검토 코드'],...result.report.issues.map(i=>[i.row??'전체',i.code])]),'예외목록');
 const output=XLSX.write(book,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
 if(output.byteLength>16*1024*1024)throw Error('SIZE');
 return {report:result.report,output};
}
