/* Historical file transformations only. No network, dispatch or ERP writes. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require(process.env.AVENT_XLSX_MODULE || 'xlsx');
const VERSION = 'actual-adapter-1';
const DISPLAY = ['쇼핑몰명','(쇼핑몰) 상품명','(쇼핑몰) 옵션명','(쇼핑몰) 주문 수량','(AVK) 출고 수량','(AVK) 상품명','수령자'];
const SHORTAGE = ['발주일','거래처코드','거래처명','출하창고','거래유형','ERP품목코드','품목명','수량','수취인명','수취인연락처1','수취인연락처2','수취인주소'];
const TRACKING = ['주문번호','송장번호'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const text = x => x == null ? '' : String(x);
function index(headers, name) {
  const hits = headers.flatMap((h,i)=>h===name?[i]:[]);
  if(hits.length!==1) throw new Error('필수 열 없음/중복: '+name);
  return hits[0];
}
function numeric(value) {
  const s=text(value).trim();
  if(!/^-?\d+(?:\.\d+)?$/.test(s)) throw new Error('숫자 형식 검토 필요');
  // File values here are integer quantities and money; never silently round.
  const n=Number(s);
  if(!Number.isSafeInteger(n)) throw new Error('정수 범위/소수 검토 필요');
  return n;
}
function sum(table, column) {
  const i=index(table.headers,column);
  return table.rows.reduce((s,r)=>s+numeric(r[i]),0);
}
function read(file) {
  // SheetJS scans worksheet cells; repair range from actual parsed cells too.
  const book=XLSX.readFile(file,{cellDates:false,cellFormula:false,cellHTML:false});
  return fromBook(book);
}
function readBuffer(data) {
  if(!Buffer.isBuffer(data)||data.length>1024*1024)throw Error('INPUT_LIMIT');
  const book=XLSX.read(data,{type:'buffer',cellDates:false,cellFormula:true,cellHTML:false});
  return fromBook(book,true);
}
function fromBook(book,bounded=false) {
  if(book.SheetNames.length!==1)throw new Error('다중 시트: 이 파일 프로필은 단일 시트만 허용');
  const sheet=book.Sheets[book.SheetNames[0]];
  let maxR=0,maxC=0;
  for(const k of Object.keys(sheet)) if(/^[A-Z]+[1-9][0-9]*$/.test(k)) {
    const c=XLSX.utils.decode_cell(k);maxR=Math.max(maxR,c.r);maxC=Math.max(maxC,c.c);
    if(bounded&&(c.r>5000||c.c>99))throw Error('WORKSHEET_LIMIT');
    if(bounded&&(sheet[k].f||sheet[k].t==='e'))throw Error('FORMULA_OR_CELL_ERROR_UNSUPPORTED');
  }
  sheet['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:maxR,c:maxC}});
  const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true,raw:true});
  // Only supported pair profiles have their header in row 1.
  const headers=grid[0].map(text);
  while(headers.length && headers.at(-1)==='')headers.pop();
  if(grid.slice(1).some(r=>r.slice(headers.length).some(v=>text(v)!=='')))
    throw new Error('헤더 범위 밖 값 존재: 열을 임의로 버리지 않습니다.');
  const entries=grid.slice(1).map((r,i)=>({row:r.slice(0,headers.length),sourceRow:i+2}))
    .filter(e=>e.row.some(v=>text(v)!==''));
  return {headers,rows:entries.map(e=>e.row),sourceRows:entries.map(e=>e.sourceRow),sheetCount:book.SheetNames.length};
}
function project(table, columns) {
  const indices=columns.map(h=>index(table.headers,h));
  return {headers:columns,rows:table.rows.map(r=>indices.map(i=>r[i]??'')),sourceRows:table.sourceRows};
}
function compare(actual, expected) {
  if(JSON.stringify(actual.headers)!==JSON.stringify(expected.headers))
    return {match:false,headerMismatch:true,rowCount:[actual.rows.length,expected.rows.length],changedCells:null};
  let changedCells=0;const byColumn={};
  for(let r=0;r<Math.max(actual.rows.length,expected.rows.length);r++)for(let c=0;c<actual.headers.length;c++)
    if(text(actual.rows[r]?.[c])!==text(expected.rows[r]?.[c])) {
      changedCells++;byColumn[actual.headers[c]]=(byColumn[actual.headers[c]]||0)+1;
    }
  return {match:changedCells===0 && actual.rows.length===expected.rows.length,headerMismatch:false,
    rowCount:[actual.rows.length,expected.rows.length],changedCells,byColumn};
}
function payment(table) {
  const order=index(table.headers,'주문번호'), amount=index(table.headers,'최종 결제 금액');
  index(table.headers,'품목별주문번호');
  const seen=new Map(); let duplicates=0;
  const rows=table.rows.map(r=>{
    if(!text(r[order]).trim())throw new Error('주문키 누락');
    const value=numeric(r[amount]),copy=[...r],id=text(r[order]);
    if(seen.has(id)) {
      if(seen.get(id)!==value)throw new Error('동일 주문 결제금액 상충: 임의 선택 금지');
      copy[amount]=0;duplicates++;
    } else seen.set(id,value);
    return copy;
  });
  return {table:{...table,rows},audit:{orders:seen.size,paymentDuplicateRows:duplicates,
    sourceRepeatedPaymentSum:sum(table,'최종 결제 금액'),expectedUniqueOrderPaymentSum:[...seen.values()].reduce((a,b)=>a+b,0),
    processedPaymentSum:rows.reduce((s,r)=>s+numeric(r[amount]),0),quantityBefore:sum(table,'수량'),
    quantityAfter:sum({...table,rows},'수량'),itemOrderIdsPreserved:true}};
}
function shortage(table) {
  const first=index(table.headers,'발주일');let removed=0;
  const entries=table.rows.map((row,i)=>({row,sourceRow:table.sourceRows[i]})).filter(e=>{
    if(/^(합계|총계|총 합계)$/.test(text(e.row[first]).trim())) {removed++;return false;}return true;
  });
  const filtered={...table,rows:entries.map(e=>e.row),sourceRows:entries.map(e=>e.sourceRow)};
  return {table:project(filtered,SHORTAGE),audit:{summaryRowsRemoved:removed,quantityBeforeExcludingSummary:sum(filtered,'수량'),
    quantityAfter:sum(filtered,'수량'),sourceAmountExcludingSummary:sum(filtered,'금액합계'),amountNotInOutputTemplate:true}};
}
function tracking(table) {
  const projected=project(table,TRACKING),channel=index(table.headers,'판매처');
  const counts=new Map(), channels={};
  for(let i=0;i<projected.rows.length;i++) {
    if(projected.rows[i].some(v=>!text(v).trim()))throw new Error('송장/주문번호 누락: 검토 필요');
    const k=JSON.stringify(projected.rows[i].map(text));counts.set(k,(counts.get(k)||0)+1);
    const name=text(table.rows[i][channel]);channels[name]=(channels[name]||0)+1;
  }
  return {table:projected,audit:{duplicatePairExcess:projected.rows.length-counts.size,duplicatesPreserved:true,
    quantitySource:sum(table,'수량'),quantityNotInOutputTemplate:true,channels,
    scopeWarning:channels['AVK_직원판매']?'직원판매 행이 존재함: 제외 설명과 범위 동일성 미확인, 원본대로 보존':null}};
}
function sabang(table) {
  const id=index(table.headers,'(사방넷) 주문코드'),code=index(table.headers,'(AVK) 상품코드');
  const state=index(table.headers,'주문상태'),channel=index(table.headers,'쇼핑몰명'),date=index(table.headers,'주문일자');
  const states={},channels={},dates=[];let cancel=0;
  // Internal order keys never enter the seven-column display output.
  const internal=table.rows.map((r,i)=>{
    if(!text(r[id]).trim())throw new Error('사방넷 주문코드 누락');
    const s=text(r[state]),c=text(r[channel]);states[s]=(states[s]||0)+1;channels[c]=(channels[c]||0)+1;
    if(/취소|cancel/i.test(s))cancel++;
    dates.push(text(r[date]).slice(0,10));
    return {sourceRow:table.sourceRows[i],sabangOrderCode:text(r[id]),avkProductCode:text(r[code]),status:s,channel:c};
  });
  dates.sort();
  return {table:project(table,DISPLAY),internal,audit:{internalKeysPreserved:internal.length,
    missingProductCodeRows:internal.filter(r=>!r.avkProductCode).length,
    repeatedInternalOrderKeys:internal.length-new Set(internal.map(r=>r.sabangOrderCode)).size,
    sourceOrderQuantity:sum(table,'(쇼핑몰) 주문 수량'),sourceShipmentQuantity:sum(table,'(AVK) 출고 수량'),
    sourceSalesAmount:sum(table,'총판매액'),amountNotInOutputTemplate:true,
    states,channels,cancelStatusRows:cancel,dateRange:[dates[0],dates.at(-1)],
    statusPolicy:'historical_replay_only; status preserved; no dispatch eligibility'}};
}
function writeTable(file, table) {
  const book=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet([table.headers,...table.rows]);
  XLSX.utils.book_append_sheet(book,sheet,'과거검증');XLSX.writeFile(book,file);
}
function execute(source,out) {
  const files=fs.readdirSync(source).filter(n=>/\.xlsx?$/i.test(n));
  function locate(prefix){const found=files.filter(n=>n.startsWith(prefix+'.'));if(found.length!==1)throw new Error('파일 선택 모호: '+prefix);return path.join(source,found[0]);}
  const specs=[['10-1','10-2',sabang],['10-3','10-4',sabang],['1-2','1-3',payment],['1-4','1-5',payment],['4-1','4-2',shortage],['6-1','6-2',tracking]];
  if(fs.existsSync(out))throw new Error('결과 폴더가 이미 있습니다. 기존 결과 보존을 위해 새 폴더를 지정하세요.');
  const reports=[],outputs=[];
  for(const [before,after,adapter] of specs){
    const sourceFile=locate(before),expectedFile=locate(after),a=read(sourceFile),b=read(expectedFile);
    const result=adapter(a),comparison=compare(result.table,b);
    const quantities={};
    for(const col of ['수량','(쇼핑몰) 주문 수량','(AVK) 출고 수량'])if(result.table.headers.includes(col)&&b.headers.includes(col))
      quantities[col]={generated:sum(result.table,col),expected:sum(b,col)};
    reports.push({pair:before+' -> '+after,sourceRows:a.rows.length,expectedRows:b.rows.length,
      generatedRows:result.table.rows.length,sourceSha256:hash(fs.readFileSync(sourceFile)),expectedSha256:hash(fs.readFileSync(expectedFile)),
      comparison,quantities,...result.audit});
    outputs.push({name:before+'-generated.xlsx',table:result.table,internal:result.internal});
  }
  fs.mkdirSync(out,{recursive:true});
  for(const output of outputs){
    writeTable(path.join(out,output.name),output.table);
    // Internal map contains codes only, no recipient/address/contact fields.
    if(output.internal)fs.writeFileSync(path.join(out,output.name+'.internal.json'),JSON.stringify(output.internal));
  }
  const report={version:VERSION,historicalOnly:true,dispatchEnabled:false,inventoryVerified:false,
    completeAutomationVerified:false,excelFiles:files.length,pairs:reports,
    untestedFiles:files.filter(n=>!specs.some(([a,b])=>n.startsWith(a+'.')||n.startsWith(b+'.'))),
    note:'파일 변환 재현 검증. 전체 매핑/BOM/행사/재고/취소 처리/운영 상태 대조를 검증한 것은 아님.'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));return report;
}
module.exports={read,readBuffer,project,compare,payment,shortage,tracking,sabang,execute,DISPLAY,SHORTAGE,TRACKING};
if(require.main===module){
  try {const [source,out]=process.argv.slice(2);if(!source||!out)throw new Error('사용법: node actual_adapter.cjs SOURCE_DIR NEW_OUTPUT_DIR');
    const report=execute(source,out);console.log(JSON.stringify(report,null,2));process.exitCode=report.pairs.every(p=>p.comparison.match)?0:2;
  }catch(e){console.error('검증 중단: '+e.message);process.exitCode=1;}
}
