// /signup 라우트가 배포에 포함되도록 (404 방지)
// (전역 force-dynamic 제거 후에도 이 라우트는 유지)
export const dynamic = "force-dynamic";

export default function SignupLayout({
  children,
}: { children: React.ReactNode }) {
  return <>{children}</>;
}
