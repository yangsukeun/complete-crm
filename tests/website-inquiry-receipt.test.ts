import { it, expect } from 'vitest';
import { confirmedInquiryReceipt } from '../src/lib/website-inquiry-receipt';
const requestId='11111111-1111-4111-8111-111111111111';
const receipt={schema_version:'1',mode:'production',request_id:requestId,inquiry_id:'22222222-2222-4222-8222-222222222222',persisted:true,duplicate:false,notification_status:'queued'};
it('confirms only matching committed receipts; duplicate status and notification semantics remain distinct',()=>{
 expect(confirmedInquiryReceipt(201,receipt,requestId)).toEqual(receipt);
 expect(confirmedInquiryReceipt(200,{...receipt,duplicate:true,notification_status:'not_configured'},requestId)).not.toBeNull();
 for(const patch of [{persisted:false},{persisted:null},{mode:'preview'},{request_id:receipt.inquiry_id},{inquiry_id:'invalid'},{notification_status:'delivered'},{duplicate:true}])expect(confirmedInquiryReceipt(201,{...receipt,...patch},requestId)).toBeNull();
 expect(confirmedInquiryReceipt(200,{success:true},requestId)).toBeNull();
 expect(confirmedInquiryReceipt(503,receipt,requestId)).toBeNull();
 expect(confirmedInquiryReceipt(200,receipt,requestId)).toBeNull();
});
