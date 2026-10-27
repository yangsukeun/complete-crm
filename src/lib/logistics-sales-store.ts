import { createHash,randomUUID } from "node:crypto";
import type { PrismaClient,Prisma } from "@prisma/client";
import { planSales,requireSalesUser,salesCommand,SalesError,type SalesRecord } from "./logistics-sales";

/** Existing CRM Prisma connection; every request rechecks current DB department inside its transaction. */
export class LogisticsSalesStore {
 constructor(private db:Pick<PrismaClient,"$transaction">){}
 private async authorize(tx:Prisma.TransactionClient,actor:string|null){
  requireSalesUser(actor?await tx.user.findUnique({where:{id:actor},select:{id:true,department:true,accountDisabled:true}}):null);
 }
 private rows(tx:Prisma.TransactionClient){return tx.$queryRaw<SalesRecord[]>`SELECT id,kind,parent_id AS "parentId",version,data FROM logistics_sales_records WHERE scope='logistics' ORDER BY id`;}
 async read(actor:string|null){return this.db.$transaction(async tx=>{await this.authorize(tx,actor);return this.rows(tx);});}
 async execute(actor:string|null,input:unknown){
  return this.db.$transaction(async tx=>{
   await this.authorize(tx,actor);
   const parsed=salesCommand.safeParse(input);if(!parsed.success)throw new SalesError(400,"입력 형식을 확인하세요.");
   const c=parsed.data;const hash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
   // Bounded pilot: serialize this scope, then idempotency lookup before optimistic version check.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(724802,1)`;
   const prior=await tx.$queryRaw<Array<{hash:string;result:SalesRecord[]}>>`SELECT hash,result FROM logistics_sales_commands WHERE actor=${actor} AND request_key=${c.key}`;
   if(prior[0]){if(prior[0].hash!==hash)throw new SalesError(409,"같은 요청 키에 다른 내용이 있습니다.");return prior[0].result;}
   const before=await this.rows(tx);const after=planSales(before,c,randomUUID());
   const changed=after.filter(r=>JSON.stringify(r)!==JSON.stringify(before.find(b=>b.id===r.id)));
   for(const r of changed){const data=JSON.stringify(r.data);await tx.$executeRaw`INSERT INTO logistics_sales_records(id,scope,kind,parent_id,version,data) VALUES(${r.id},'logistics',${r.kind},${r.parentId},${r.version},${data}::jsonb) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,data=EXCLUDED.data`;}
   const beforeChanged=before.filter(r=>changed.some(n=>n.id===r.id));
   const original=JSON.stringify(c),old=JSON.stringify(beforeChanged),result=JSON.stringify(changed);
   await tx.$executeRaw`INSERT INTO logistics_sales_commands(id,actor,request_key,hash,command,before,result) VALUES(${randomUUID()},${actor},${c.key},${hash},${original}::jsonb,${old}::jsonb,${result}::jsonb)`;
   return changed;
  },{isolationLevel:"ReadCommitted",maxWait:5000,timeout:10000});
 }
}
