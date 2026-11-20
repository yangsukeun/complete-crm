import { requireRepresentative } from "@/lib/representative-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "대표자 페이지", robots: { index: false, follow: false } };

export default async function RepresentativeLayout({ children }: { children: React.ReactNode }) {
  await requireRepresentative();
  return children;
}
