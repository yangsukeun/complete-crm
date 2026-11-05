/** Local-only review contract. No order submission, mapping inference or quantity expansion. */
export const GENERAL_HEADERS = ['(쇼핑몰) 주문코드','(쇼핑몰) 부주문코드','(사방넷) 주문코드','쇼핑몰 코드','쇼핑몰명','주문일자','주문상태','(쇼핑몰) 상품코드','(쇼핑몰) 상품명','(쇼핑몰) 옵션명','(쇼핑몰) 주문 수량','품번코드(사방넷)','(AVK) 상품코드','(AVK) 상품명','(AVK) 출고 수량','판매가','총판매액','배송비','배송희망일','배송기재사항','주문자','주문자 전화번호','주문자 휴대폰번호','수령자','수령자 전화번호','수령자 휴대폰번호','우편번호','주소','택배사','운송장번호'] as const;
export const REVIEW_HEADERS = ['쇼핑몰명','(쇼핑몰) 상품명','(쇼핑몰) 옵션명','(쇼핑몰) 주문 수량','(AVK) 출고 수량','(AVK) 상품명','수령자'] as const;
export const MAX_FILE_BYTES=2*1024*1024;
export const MAX_ROWS=5000;
export type Cell=string|number|boolean|null;
export type Table={headers:string[];rows:Cell[][];sourceRows:number[]};
export type IssueCode='MISSING_KEY'|'NUMERIC_KEY'|'MISSING_MAPPING'|'INVALID_QUANTITY'|'QUANTITY_DIFFERENCE'|'UNCONFIRMED_STATUS'|'SEPARATE_WORKFLOW'|'INVALID_DATE'|'DUPLICATE_ROW'|'AMBIGUOUS_LINE_KEY'|'BATCH_MISMATCH'|'REFERENCE_DIFFERENCE';
export const ISSUE_LABELS:Record<IssueCode,string>={MISSING_KEY:'주문·상품 식별키 누락',NUMERIC_KEY:'숫자로 저장된 식별키: 원문 확인 필요',MISSING_MAPPING:'상품 매핑 코드 또는 상품명 누락',INVALID_QUANTITY:'수량은 양의 안전한 정수여야 합니다',QUANTITY_DIFFERENCE:'주문수량과 출고수량 차이: 세트·입수 근거 확인',UNCONFIRMED_STATUS:'신규주문 외 상태: 처리 대상 확인',SEPARATE_WORKFLOW:'일반몰 외 별도 업무 경로',INVALID_DATE:'주문일자 형식 확인 필요',DUPLICATE_ROW:'동일한 원본 행 반복: 삭제하지 않고 보존',AMBIGUOUS_LINE_KEY:'같은 식별키 조합의 서로 다른 행: 원본 확인',BATCH_MISMATCH:'비교본의 주문·품목 구성 또는 반복 횟수가 다릅니다',REFERENCE_DIFFERENCE:'같은 배치지만 셀 내용이 다릅니다'};
export type Issue={code:IssueCode;row?:number};
export type ReviewReport={schema:'sabang-30-review-v1';uploadAllowed:false;dispatchEnabled:false;approval:'not_provided';rows:number;reference:'not_provided'|'same_batch'|'different_batch';dateRange:string[];channels:{name:string;rows:number;orderQuantity:number|null;shipmentQuantity:number|null}[];issues:Issue[];sourceHash?:string;referenceHash?:string;scope:'mapping_review_only';rules:string[]};
const str=(x:Cell|undefined)=>x==null?'':String(x);
const idx=(header:string)=>GENERAL_HEADERS.indexOf(header as typeof GENERAL_HEADERS[number]);
const keyColumns=[0,1,2,3,7,12];
const key=(row:Cell[])=>JSON.stringify(keyColumns.map(i=>[typeof row[i],row[i]]));
const rowKey=(row:Cell[])=>JSON.stringify(row.map(v=>[typeof v,v]));
const quantity=(v:Cell)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?v:typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
function multiset(rows:Cell[][],fn:(r:Cell[])=>string){const counts=new Map<string,number>();for(const r of rows){const k=fn(r);counts.set(k,(counts.get(k)??0)+1);}return counts;}
function same(a:Map<string,number>,b:Map<string,number>){return a.size===b.size&&[...a].every(([k,v])=>b.get(k)===v);}
export function validateTable(table:Table){
 if(JSON.stringify(table.headers)!==JSON.stringify(GENERAL_HEADERS))throw Error('SCHEMA');
 if(!table.rows.length||table.rows.length>MAX_ROWS||table.sourceRows.length!==table.rows.length||table.rows.some(r=>r.length!==30))throw Error('ROWS');
}
export function reviewGeneral(source:Table,reference?:Table):{report:ReviewReport;reviewRows:Cell[][];traceRows:Cell[][]}{
 validateTable(source);if(reference)validateTable(reference);
 const issues:Issue[]=[],issueKeys=new Set<string>(),dates:string[]=[],groups=new Map<string,{name:string;rows:number;orderQuantity:number|null;shipmentQuantity:number|null}>();
 const seenRows=new Map<string,number>(),seenKeys=new Map<string,{row:number;content:string}>();
 const add=(code:IssueCode,row?:number)=>{const k=`${code}:${row}`;if(!issueKeys.has(k)){issueKeys.add(k);issues.push({code,row});}};
 source.rows.forEach((r,i)=>{
  const row=source.sourceRows[i];
  // Suborder code and option can legitimately be blank; preserve them without inventing values.
  for(const c of keyColumns){if(!str(r[c]).trim()){if(c!==1)add('MISSING_KEY',row);}else if(typeof r[c]!=='string')add('NUMERIC_KEY',row);}
  if(!str(r[12]).trim()||!str(r[13]).trim()||!str(r[8]).trim())add('MISSING_MAPPING',row);
  const ordered=quantity(r[10]),shipped=quantity(r[14]);
  if(ordered===null||shipped===null)add('INVALID_QUANTITY',row);
  else if(ordered!==shipped)add('QUANTITY_DIFFERENCE',row);
  if(r[6]!=='신규주문')add('UNCONFIRMED_STATUS',row);
  const name=str(r[4]).trim();
  if(!name)add('MISSING_KEY',row);
  if(/직원|임직원|카페\s*24|cafe\s*24|스타배송|네이트온|케이앤비|B2B|외부|베이비빌리/i.test(name))add('SEPARATE_WORKFLOW',row);
  const date=str(r[5]).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)add('INVALID_DATE',row);else dates.push(date);
  const group=groups.get(name)??{name,rows:0,orderQuantity:0,shipmentQuantity:0};group.rows++;
  const orderSum=group.orderQuantity===null||ordered===null?null:group.orderQuantity+ordered;
  const shipSum=group.shipmentQuantity===null||shipped===null?null:group.shipmentQuantity+shipped;
  group.orderQuantity=orderSum!==null&&Number.isSafeInteger(orderSum)?orderSum:null;group.shipmentQuantity=shipSum!==null&&Number.isSafeInteger(shipSum)?shipSum:null;groups.set(name,group);
  const content=rowKey(r),priorRow=seenRows.get(content);if(priorRow!==undefined){add('DUPLICATE_ROW',priorRow);add('DUPLICATE_ROW',row);}else seenRows.set(content,row);
  const k=key(r),prior=seenKeys.get(k);if(prior&&prior.content!==content){add('AMBIGUOUS_LINE_KEY',prior.row);add('AMBIGUOUS_LINE_KEY',row);}else if(!prior)seenKeys.set(k,{row,content});
 });
 let batch:ReviewReport['reference']='not_provided';
 if(reference){batch=same(multiset(source.rows,key),multiset(reference.rows,key))?'same_batch':'different_batch';if(batch==='different_batch')add('BATCH_MISMATCH');else if(!same(multiset(source.rows,rowKey),multiset(reference.rows,rowKey)))add('REFERENCE_DIFFERENCE');}
 dates.sort();
 const report:ReviewReport={schema:'sabang-30-review-v1',uploadAllowed:false,dispatchEnabled:false,approval:'not_provided',rows:source.rows.length,reference:batch,dateRange:dates.length?[dates[0],dates.at(-1)!]:[],channels:[...groups.values()],issues,scope:'mapping_review_only',rules:['원본 행·키·수량·순서를 보존하며 삭제·매핑 추정·세트/사은품 재증식하지 않습니다.','7열은 매핑 검토용이며 이지어드민 업로드 양식이 아닙니다.','상품 마스터와 배치의 최신성 및 일반몰 채널 적합성은 담당자 확인이 필요합니다.','비교본이 없으면 다른 배치 여부와 과거 처리 여부를 판정하지 않습니다.']};
 return {report,reviewRows:source.rows.map(r=>REVIEW_HEADERS.map(h=>r[idx(h)])),traceRows:source.rows.map((r,i)=>[source.sourceRows[i],...r])};
}
