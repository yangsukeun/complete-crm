import { NextResponse } from 'next/server';
import { getAppSession } from '@/auth';
import prisma from '@/lib/prisma';
import { canUseCsCompleteTest, reviewSchema } from '@/lib/cs-complete-test';
import { listTestReviews, readTestReview, saveTestReview, TestConflict } from '@/lib/cs-complete-test-store';
import { z } from 'zod';
export const runtime='nodejs';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function actor(){const session=await getAppSession();if(!session?.user?.id)return {error:json({error:'로그인이 필요합니다.'},401)};const user=await prisma.user.findUnique({where:{id:session.user.id},select:{id:true,role:true,department:true,accountDisabled:true}});if(!user||!canUseCsCompleteTest(user))return {error:json({error:'TEST 접근 권한이 없습니다.'},403)};return {user};}
export async function GET(req:Request){try{const access=await actor();if(access.error)return access.error;const id=new URL(req.url).searchParams.get('id');if(!id)return json({records:await listTestReviews()});if(!/^[a-f0-9]{64}$/.test(id))return json({error:'사본 ID가 잘못되었습니다.'},400);const row=await readTestReview(id);return row?json(row):json({error:'사본을 찾을 수 없습니다.'},404);}catch{return json({error:'TEST 저장소를 읽지 못했습니다. 현재 페이지 사본은 유지됩니다.'},503);}}
const saveSchema=z.object({review:reviewSchema,expectedVersion:z.number().int().min(0).max(1000000)}).strict();
export async function PUT(req:Request){try{const access=await actor();if(access.error)return access.error;if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'허용되지 않은 요청 출처입니다.'},403);const text=await req.text();if(text.length>5_000_000)return json({error:'사본은 5MB 이하여야 합니다.'},413);let raw:unknown;try{raw=JSON.parse(text);}catch{return json({error:'JSON 형식을 확인하세요.'},400);}const p=saveSchema.safeParse(raw);if(!p.success)return json({error:'사본 구조와 건수를 확인하세요.'},400);return json(await saveTestReview(p.data.review,p.data.expectedVersion,access.user!.id));}catch(e){return e instanceof TestConflict?json({error:e.message},409):json({error:'TEST 저장 실패: 현재 페이지 사본을 내보내 보존하세요.'},503);}}
