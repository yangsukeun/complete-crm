import type {PrismaClient} from '@prisma/client';
import type {Enrollment,EnrollmentDb} from './ocr-device-issuer';
export function enrollmentDatabase(db:Pick<PrismaClient,'$transaction'>):EnrollmentDb{
 return {transaction:fn=>db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(724803,1)`;
  return fn({
   activeUser:async id=>{const u=await tx.user.findUnique({where:{id},select:{accountDisabled:true}});return !!u&&!u.accountDisabled;},
   get:async id=>{
    const rows=await tx.$queryRaw<{row:Enrollment}[]>`SELECT jsonb_build_object('id',id,'companyId',company_id,'registeredBy',registered_by,'registeredAt',extract(epoch from registered_at)*1000,'expiresAt',extract(epoch from expires_at)*1000,'tokenIssuedAt',extract(epoch from token_issued_at)*1000,'tokenExpiresAt',extract(epoch from token_expires_at)*1000,'tokenHash',token_hash,'state',issuer_state->>'state','requestKey',issuer_state->>'requestKey','audit',issuer_state->'audit','delivery',issuer_state->'delivery') AS row FROM crm_ocr_devices WHERE id=${id}::uuid FOR UPDATE`;
    if(rows[0]&&!rows[0].row.state)throw new Error('Existing registration requires manual inspection');return rows[0]?.row??null;
   },
   anyOtherRegistration:async id=>{const rows=await tx.$queryRaw<{present:boolean}[]>`SELECT EXISTS(SELECT 1 FROM crm_ocr_devices WHERE id<>${id}::uuid) AS present`;return rows[0].present;},
   save:async row=>{const state=JSON.stringify({state:row.state,requestKey:row.requestKey,audit:row.audit,delivery:row.delivery});
    await tx.$executeRaw`INSERT INTO crm_ocr_devices(id,company_id,client_id,is_synthetic,label,registered_by,registered_at,expires_at,revoked_at,token_hash,token_issued_at,token_expires_at,issuer_state)
    VALUES(${row.id}::uuid,${row.companyId}::uuid,NULL,true,'YSK-PC1 synthetic pilot',${row.registeredBy},${new Date(row.registeredAt)},${new Date(row.expiresAt)},${row.state==='revoked'?new Date():null},${row.tokenHash},${row.tokenIssuedAt===null?null:new Date(row.tokenIssuedAt)},${row.tokenExpiresAt===null?null:new Date(row.tokenExpiresAt)},${state}::jsonb)
    ON CONFLICT(id) DO UPDATE SET revoked_at=EXCLUDED.revoked_at,token_hash=EXCLUDED.token_hash,token_issued_at=EXCLUDED.token_issued_at,token_expires_at=EXCLUDED.token_expires_at,issuer_state=EXCLUDED.issuer_state`;
   },
  });
 })};
}
