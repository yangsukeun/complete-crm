import { createHash } from 'node:crypto';
import prisma from '@/lib/prisma';
import { reviewSchema, type TestSnapshot } from './cs-complete-test';
import type { z } from 'zod';
export type TestReview = z.infer<typeof reviewSchema>;
export function sourceHash(source:TestSnapshot){return createHash('sha256').update(JSON.stringify(source)).digest('hex');}
export class TestConflict extends Error {}
export async function listTestReviews(){
 return prisma.$queryRaw<{id:string;version:number;updatedAt:Date;snapshotId:string;employeeCount:number;entryCount:number}[]>`
 SELECT s."id",s."version",s."updatedAt",o."snapshot"->>'snapshotId' AS "snapshotId",
 jsonb_array_length(o."snapshot"->'employees') AS "employeeCount",jsonb_array_length(o."snapshot"->'entries') AS "entryCount"
 FROM "CsCompleteTestState" s JOIN "CsCompleteTestSource" o ON o."id"=s."id" ORDER BY s."updatedAt" DESC LIMIT 100`;
}
export async function readTestReview(id:string){
 const rows=await prisma.$queryRaw<{id:string;version:number;payload:TestReview}[]>`SELECT "id","version","payload" FROM "CsCompleteTestState" WHERE "id"=${id}`;
 return rows[0]??null;
}
export async function saveTestReview(input:TestReview,expectedVersion:number,actorId:string){
 const review=reviewSchema.parse(input);const id=sourceHash(review.source);const payload=JSON.stringify(review);
 return prisma.$transaction(async tx=>{
  if(expectedVersion===0){
   await tx.$executeRaw`INSERT INTO "CsCompleteTestSource" ("id","snapshot","createdBy") VALUES (${id},${JSON.stringify(review.source)}::jsonb,${actorId}) ON CONFLICT DO NOTHING`;
   const added=await tx.$executeRaw`INSERT INTO "CsCompleteTestState" ("id","version","payload","updatedBy") VALUES (${id},1,${payload}::jsonb,${actorId}) ON CONFLICT DO NOTHING`;
   if(!added)throw new TestConflict('이미 저장된 원본입니다. 서버 사본을 다시 열어 주세요.');
  }else{
   const changed=await tx.$executeRaw`UPDATE "CsCompleteTestState" SET "payload"=${payload}::jsonb,"version"="version"+1,"updatedBy"=${actorId},"updatedAt"=now() WHERE "id"=${id} AND "version"=${expectedVersion}`;
   if(!changed)throw new TestConflict('다른 세션에서 변경했습니다. 현재 사본을 내보낸 뒤 서버 사본을 다시 열어 주세요.');
  }
  const version=expectedVersion+1;
  await tx.$executeRaw`INSERT INTO "CsCompleteTestRevision" ("id","version","payload","actorId") VALUES (${id},${version},${payload}::jsonb,${actorId})`;
  return {id,version};
 });
}
