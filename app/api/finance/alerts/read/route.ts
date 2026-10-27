import {resolveFinanceAccess} from "@/lib/finance-access";
import {financeScopePrismaWhere} from "@/lib/finance-scope";
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 자금 관리 페이지 진입 시 본인 알람 전체 읽음 처리 (팀장/이체담당자/요청자 공통) */
export async function POST() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {scope}=await resolveFinanceAccess(session.user.id);
    await prisma.paymentRequestAlert.updateMany({where:{userId:session.user.id,readAt:null,request:{...financeScopePrismaWhere(scope)}},data:{readAt:new Date()}});
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "알람 읽음 처리에 실패했습니다." }, { status: 500 });
  }
}
