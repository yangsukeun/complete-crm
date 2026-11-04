import {test,expect} from 'vitest';
import * as XLSX from 'xlsx';
import {initialState,calculate,type Row} from '../src/lib/seoyoung/settlement';
import {exportSettlement} from '../src/lib/seoyoung/export';
import {SEPTEMBER_SHEETS,statementRows} from '../src/lib/seoyoung/statement';
test('September rows, positions, merges and first 12 tabs retained; monthly actuals not copied',async()=>{
 const s=initialState('2026-10');const b=XLSX.read(await exportSettlement(s),{type:'array',cellFormula:true});
 expect(b.SheetNames.slice(0,12)).toEqual(SEPTEMBER_SHEETS);const w=b.Sheets['거래명세표'];
 expect(w.B10.v).toBe('품목');expect(w.AF10.v).toBe('세액');expect(w.F11.v).toBe('팔레트');expect(w.M29.v).toBe('3P');expect(w.F34.v).toBe('극소');expect(w.S11).toBeUndefined();expect(w.S17).toBeUndefined();
 expect(w.AA35.f).toBe('SUM(AA11:AA34)');expect(w.F36.f).toBe('AA35+AF35');expect(w['!merges']?.map(XLSX.utils.encode_range)).toContain('B2:AG3');expect(statementRows(s)).toHaveLength(24);
});
test('unknown box type holds outbound, packing, shipping and box fees instead of zero-rate assumptions',()=>{
 const s=initialState('2026-10');s.rows=[{id:'synthetic',fileHash:'hash',fileName:'synthetic.xlsx',sheet:'data',line:2,item:'synthetic',quantity:1,invoice:'SYN1',boxType:'',boxUse:'',packing:'',combined:'',issues:[]} satisfies Row];
 s.classification.synthetic={category:'general',work:'none',reason:'synthetic'};s.parcels.SYN1={reviewed:true,exclude:false,reason:'unknown',outbound:'general',size:'unknown',sizeEvidence:'unknown',boxCount:1,packing:1,boxTiny:1,boxSmall:0};
 const r=calculate(s);for(const code of ['outbound','packing','ship_tiny','box_tiny'])expect(r.lines.find(l=>l.code===code)?.quantity).toBe(0);expect(r.issues.some(i=>i.includes('출고·포장·택배·박스비 보류'))).toBe(true);expect(r.confirmedTotal).toBeNull();
});
test('negative box adjustments require evidence and stay separate from physical quantities',()=>{const s=initialState('2026-10');const e=s.extras.find(e=>e.code==='adjust_tiny')!;e.quantity=-2;e.rate=550;e.confirmed=false;const r=calculate(s);expect(r.lines.find(l=>l.code==='adjust_tiny')?.amount).toBe(-1100);expect(r.issues.some(i=>i.includes('추가 비용 미확정'))).toBe(true);expect(r.confirmedTotal).toBeNull();});
test('synthetic reconstruction of revised reference counts excludes 280 unknown parcels including 268 general',()=>{
 const s=initialState('2026-10');s.classification.general={category:'general',work:'none',reason:'synthetic'};s.classification.set={category:'3P',work:'none',reason:'synthetic'};
 for(let i=0;i<9683;i++){const general=i<9304,unknown=i<268||(i>=9304&&i<9316),id='SYN'+i;s.rows.push({id,fileHash:'synthetic',fileName:'synthetic.xlsx',sheet:'synthetic',line:i+2,item:general?'general':'set',quantity:1,invoice:id,boxType:unknown?'':'극소',boxUse:'',packing:'',combined:'',issues:[]});s.parcels[id]={reviewed:true,exclude:false,reason:'synthetic',outbound:general?'general':'set_excluded',size:unknown?'unknown':'tiny',sizeEvidence:unknown?'unknown':'original',boxCount:1,packing:null,boxTiny:0,boxSmall:0};}
 const r=calculate(s);expect(r.lines.find(l=>l.code==='outbound')?.quantity).toBe(9036);expect(r.lines.find(l=>l.code==='packing')?.quantity).toBe(9403);expect(r.issues.filter(i=>i.includes('출고·포장·택배·박스비 보류'))).toHaveLength(280);
 // Reference arithmetic only, not proof of original 45-file parsing or all fee categories.
 expect(36477750+3647775).toBe(40125525);expect(r.confirmedTotal).toBeNull();
});
