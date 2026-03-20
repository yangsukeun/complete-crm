import { redirect } from "next/navigation";

/** 구 개발용 우회 — 일반 로그인으로 통일 */
export default function DevLoginPage() {
  redirect("/login");
}
