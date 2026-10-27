import { getAppSession } from "@/auth";
import { notFound } from "next/navigation";
import { OWNER } from "@/lib/rua-work";
import { openRuaStore } from "@/lib/rua-store";
import { DiaryPanel } from "./diary-panel";
import "./diary.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "루와의 프로젝트", robots: { index: false, follow: false } };
export default async function Page() {
  const actor = (await getAppSession())?.user?.id;
  if (actor !== OWNER) notFound();
  const store = await openRuaStore();
  let diary;
  try { diary = await store.readDiary(actor); }
  finally { store.close(); }
  return <main className="mx-auto max-w-4xl space-y-6 p-8"><DiaryPanel initial={diary} /></main>;
}
