// /signup 라우트가 배포에 포함되도록 (404 방지)
export const dynamic = "force-dynamic";

export default function SignupLayout({
  children,
}: { children: React.ReactNode }) {
  return <>{children}</>;
}
