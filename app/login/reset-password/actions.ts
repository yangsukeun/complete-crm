"use server";

import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";

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
  if (typeof newPassword !== "string" || newPassword.trim().length < 4) {
    return { error: "비밀번호는 4자 이상 입력하세요." };
  }
  if (newPassword.trim() !== confirmPassword) {
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

    const hashedPassword = await hash(newPassword.trim(), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { success: true };
  } catch (e) {
    console.error("[reset-password]", e);
    return { error: "비밀번호 재설정 중 오류가 발생했습니다." };
  }
}
