import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {notFound,redirect} from 'next/navigation';
import {OCR_PILOT} from '@/lib/ocr-device-issuer';
import DevicePairForm from './pair-form';
export const dynamic='force-dynamic';
export default async function DevicePairPage(){const actor=(await getAppSession())?.user?.id;if(!actor)redirect('/login');if(actor!==OCR_PILOT.owner)notFound();const user=await prisma.user.findUnique({where:{id:actor},select:{accountDisabled:true}});if(!user||user.accountDisabled)notFound();return <main className="mx-auto max-w-2xl space-y-4 p-8"><h1 className="text-2xl font-bold">대표 PC OCR 일회 연결</h1><p>연결 준비 화면입니다. 운영 발급은 아직 비활성입니다. PC 도우미의 공개 연결 정보만 입력하세요. 개인키·토큰·비밀번호는 입력하지 마세요.</p><p>PC 1대 · 합성 자료만 · 등록 최대 7일 · 토큰 15분 · 연결 요청 5분. 실제 입고 권한은 없습니다.</p><DevicePairForm deviceId={OCR_PILOT.deviceId}/></main>;}
