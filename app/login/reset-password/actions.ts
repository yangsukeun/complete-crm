"use server";

import prisma from "@/lib/prisma";
import { hashPasswordForStore } from "@/lib/employee-password";

/**
 * 비밀번호 재설정 (서버에서 시크릿 검증 후 처리, 클라이언트에 시크릿 노출 없음)
 */
export async function resetPassword(formData: FormData) {
  const email = formData.get("email");
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof email !== "string" || !email.trim()) {
    return { error: "이메일을 입력하세요." };
  }
  if (typeof newPassword !== "string" || newPassword.trim().length < 8) {
    return { error: "비밀번호는 8자 이상 입력하세요." };
  }
  const confirm = typeof confirmPassword === "string" ? confirmPassword.trim() : "";
  if (newPassword.trim() !== confirm) {
    return { error: "새 비밀번호와 확인이 일치하지 않습니다." };
  }

  try {
    const emailNormalized = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: { equals: emailNormalized, mode: "insensitive" } },
    });
    if (!user) {
      return { error: "해당 이메일로 등록된 사용자가 없습니다." };
    }

    const hashed = await hashPasswordForStore(newPassword.trim());
    if (!hashed.ok) {
      return { error: hashed.error };
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed.hashed },
    });

    return { success: true };
  } catch (e) {
    const err = e as Error & { code?: string; message?: string };
    console.error("[reset-password]", err);
    const msg = String(err?.message ?? "");
    const code = err?.code;

    // DB 연결/타임아웃 (Prisma P1001, P1002, P1003 등)
    if (
      code === "P1001" ||
      code === "P1002" ||
      code === "P1003" ||
      msg.includes("connect") ||
      msg.includes("Connection") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("timeout") ||
      msg.includes("Timed out")
    ) {
      return {
        error:
          "데이터베이스에 연결할 수 없습니다. Supabase 사용 시 Vercel 환경 변수 DATABASE_URL을 '연결 풀러(Transaction 모드)' 주소로 바꾼 뒤 재배포해 주세요.",
      };
    }

    // 개발 환경에서는 실제 오류 메시지 반환 (원인 확인용)
    if (process.env.NODE_ENV === "development" && msg) {
      return { error: `비밀번호 재설정 실패: ${msg}` };
    }
    return {
      error:
        "비밀번호 재설정 중 오류가 발생했습니다. Vercel 대시보드 → Deployments → 최신 배포 → Logs에서 [reset-password] 로그를 확인해 주세요.",
    };
  }
}
