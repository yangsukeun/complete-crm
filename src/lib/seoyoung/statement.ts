import {calculate,type State} from './settlement';
// September statement positions, verified by parent against original. No monthly actuals copied.
export const STATEMENT_ROWS=[
 ['storage','보관비','팔레트','1000*1100*1500','월'],['rack','','경량랙','1400*600*2000','월'],
 ['in_pallet','입고비','팔레트','1000*1100*1500','pallet'],['in_box_small','','박스','~80cm / 2kg이하','EA'],['in_box_large','','박스','80cm~ / 2kg이상','EA'],
 ['out_pallet','출고비','팔레트','1000*1100*1500','pallet'],['outbound','','박스','택배사 기준 대형사이즈까지','건'],
 ['ship_tiny','택배비','극소','~80cm / 2kg이하','건'],['ship_small','','소','~100cm / 5kg이하','건'],['ship_medium','','중','~120cm / 10kg이하','건'],['ship_large','','대','~140cm / 20kg이하','건'],['ship_extra','','특대','~160cm / 20kg이하','건'],['island','','제주 및 도서산간 지역','사이즈별 택배비 외','건'],['returns','','반품','사이즈별 택배비 외','건'],
 ['packing','포장 작업비','포장','','EA'],['work_1P','','세트작업비','1P','EA'],['work_2P','','세트작업비','2P','EA'],['work_2P_COSTCO','','세트작업비','2P(코스트코)','EA'],['work_3P','','세트작업비','3P','EA'],['pungmi','','세트작업비','풍미정','EA'],['box_tiny','','박스','극소','EA'],['box_small','','박스','소','EA'],['adjust_small','박스비용','소','','EA'],['adjust_tiny','','극소','','EA'],
] as const;
export const SEPTEMBER_SHEETS=['거래명세표','일반 출고품','세트 1P','세트 2P','co2P','완성2P','세트 3p','완성 3P','동원출고','홈쇼핑 출고건','반품건','파렛트내역'];
export function statementRows(s:State){const result=calculate(s);return STATEMENT_ROWS.map(([code,item,content,spec,unit],i)=>{const line=result.lines.find(l=>l.code===code);return {row:i+11,code,item,content,spec,unit,quantity:s.rows.length?(line?.quantity??null):null,rate:line?.rate??null,amount:s.rows.length?(line?.amount??null):null,tax:!s.rows.length||line?.amount===undefined||line.amount===null?null:line.amount/10,source:line?.source||'미확인',confirmed:line?.confirmed??false};});}
