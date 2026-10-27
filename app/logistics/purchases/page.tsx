import Link from 'next/link';
import {getAppSession} from '@/auth';
import prisma from '@/lib/prisma';
import {redirect,notFound} from 'next/navigation';
import {requireSalesUser,SalesError} from '@/lib/logistics-sales';
import PaymentRequests from '../../finance/requests/page';
export const dynamic='force-dynamic';
export default async function Page(){
 const actor=(await getAppSession())?.user?.id;if(!actor)redirect('/login');
 const user=await prisma.user.findUnique({where:{id:actor},select:{id:true,department:true,accountDisabled:true}});
 try{requireSalesUser(user);}catch(e){if(e instanceof SalesError)notFound();throw e;}
 return <><header className="mx-auto max-w-6xl space-y-2 p-4"><Link href="/logistics">← 3PL 운영실</Link><h1 className="text-2xl font-bold">구매·지출 요청</h1><p>기존 결제 요청의 입력·승인·증빙을 그대로 사용합니다. 표시되는 조회 범위와 서버 권한이 적용됩니다. 승인 및 지급 기록은 은행 송금을 실행하지 않습니다.</p></header><PaymentRequests/></>;
}
