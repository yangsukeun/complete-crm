import {createHash} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {requireSalesUser,SalesError} from '../logistics-sales';
import {calculate} from './settlement';
import {draftCommandSchema,type DraftRecord} from './draft';
export class SeoyoungDraftStore{
 constructor(private db:Pick<PrismaClient,'$transaction'>){}
 private async authorize(tx:Prisma.TransactionClient,actor:string|null){requireSalesUser(actor?await tx.user.findUnique({where:{id:actor},select:{id:true,department:true,accountDisabled:true}}):null);}
 private async row(tx:Prisma.TransactionClient,month:string){const rows=await tx.$queryRaw<DraftRecord[]>`SELECT month,version,status,payload AS state,updated_at AS "updatedAt",updated_by AS "updatedBy" FROM seoyoung_settlement_drafts WHERE scope='logistics' AND customer='seoyoung' AND month=${month}`;return rows[0]||null;}
 async read(actor:string|null,month?:string){if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new SalesError(400,'정산월 형식 오류');return this.db.$transaction(async tx=>{await this.authorize(tx,actor);if(month)return this.row(tx,month);return tx.$queryRaw<Pick<DraftRecord,'month'|'version'|'status'|'updatedAt'>[]>`SELECT month,version,status,updated_at AS "updatedAt" FROM seoyoung_settlement_drafts WHERE scope='logistics' AND customer='seoyoung' ORDER BY month DESC LIMIT 120`;});}
 async execute(actor:string|null,input:unknown){return this.db.$transaction(async tx=>{
  await this.authorize(tx,actor);const parsed=draftCommandSchema.safeParse(input);if(!parsed.success)throw new SalesError(400,'초안 형식·비식별 처리·항목 연결을 확인하세요.');const c=parsed.data,month=c.action==='save'?c.state.month:c.month;
  const hash=createHash('sha256').update(JSON.stringify(c)).digest('hex');await tx.$queryRaw`SELECT pg_advisory_xact_lock(724804,1)`;
  const prior=await tx.$queryRaw<{hash:string;month:string}[]>`SELECT hash,month FROM seoyoung_settlement_events WHERE actor=${actor} AND request_key=${c.key}`;
  if(prior[0]){if(prior[0].hash!==hash)throw new SalesError(409,'같은 요청 키의 내용이 다릅니다.');return {record:await this.row(tx,prior[0].month),replayed:true};}
  const before=await this.row(tx,month);if((before?.version||0)!==c.expectedVersion)throw new SalesError(409,'같은 월 초안이 생성 또는 수정되었습니다. 다시 열어 비교하세요.');
  if(c.action==='review'&&!before)throw new SalesError(404,'저장한 초안이 없습니다.');
  const state=structuredClone(c.action==='save'?c.state:before!.state),version=(before?.version||0)+1;state.revision=version;state.approvedRevision=null;state.history=[];
  if(c.action==='review'){if(!calculate(state).ready)throw new SalesError(409,'미확정 항목을 모두 검토해야 검토 완료로 표시할 수 있습니다.');state.approvedRevision=version;}
  const status=c.action==='review'?'reviewed':'draft',payload=JSON.stringify(state),stateHash=createHash('sha256').update(payload).digest('hex');
  await tx.$executeRaw`INSERT INTO seoyoung_settlement_drafts(scope,customer,month,version,status,payload,updated_by) VALUES('logistics','seoyoung',${month},${version},${status},${payload}::jsonb,${actor}) ON CONFLICT(scope,customer,month) DO UPDATE SET version=EXCLUDED.version,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await tx.$executeRaw`INSERT INTO seoyoung_settlement_events(actor,request_key,hash,scope,customer,month,version,action,state_hash) VALUES(${actor},${c.key},${hash},'logistics','seoyoung',${month},${version},${c.action},${stateHash})`;
  return {record:await this.row(tx,month),replayed:false};
 },{isolationLevel:'ReadCommitted',maxWait:5000,timeout:10000});}
 async history(actor:string|null,month:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new SalesError(400,'정산월 형식 오류');return this.db.$transaction(async tx=>{await this.authorize(tx,actor);return tx.$queryRaw`SELECT version,action,actor,created_at AS "createdAt",state_hash AS "stateHash" FROM seoyoung_settlement_events WHERE scope='logistics' AND customer='seoyoung' AND month=${month} ORDER BY version DESC LIMIT 200`;});}
}
