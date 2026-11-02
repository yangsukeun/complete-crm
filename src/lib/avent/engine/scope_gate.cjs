'use strict';
function scopeGate(table){
 const channelColumns=table.headers.flatMap((h,i)=>['판매처','쇼핑몰명'].includes(h)?[i]:[]);
 const rows=table.rows.filter(r=>channelColumns.some(i=>String(r[i]??'').trim()==='AVK_직원판매'));
 const quantityColumns=['수량','(쇼핑몰) 주문 수량','(AVK) 출고 수량'].filter(h=>table.headers.includes(h));
 const quantities=Object.fromEntries(quantityColumns.map(h=>{const i=table.headers.indexOf(h);const values=rows.map(r=>Number(r[i]));return [h,values.every(Number.isSafeInteger)?values.reduce((a,b)=>a+b,0):null];}));
 return {status:rows.length?'manual_confirmation_required':channelColumns.length?'no_employee_rows_observed':'channel_not_available',
  code:rows.length?'EMPLOYEE_SALES_SCOPE_UNCONFIRMED':null,employeeRows:rows.length,quantities,
  inclusionDecision:'unconfirmed',rowsPreserved:true,dispatchAllowed:false,
  message:rows.length?'직원판매 포함/제외 미확정. 원본행과 수량을 보존했습니다. 모른다는 답변은 제외 승인이 아니며 담당자 확인 전 발주 대상 확정은 차단됩니다.':'실제 발주 승인은 제공하지 않습니다.'};
}
module.exports={scopeGate};
