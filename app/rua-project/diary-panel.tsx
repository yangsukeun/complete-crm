"use client";
import { useRef, useState } from "react";
import { FLOW_STAGES, type DiaryView, type DiaryNote } from "@/lib/rua-diary";

export function DiaryPanel({ initial }: { initial: DiaryView }) {
  const [view, setView] = useState(initial);
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ body: string; key: string } | null>(null);
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    const fingerprint = JSON.stringify(body);
    if (pending.current?.body !== fingerprint) pending.current = { body: fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/rua-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, key: pending.current.key, source: "human" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const next = await fetch("/api/rua-work?view=diary", { cache: "no-store" });
      if (!next.ok) throw new Error("저장 상태를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요.");
      setView(await next.json()); pending.current = null;
      if (body.action === "diary") setRaw("");
      setMessage(body.action === "diary" ? "이야기를 남겼어요. 나에게만 보이는 기록입니다." : "연결을 바꿨어요. 원문은 그대로 남아 있습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결을 확인한 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const projects = [...new Set(view.notes.flatMap(n => n.links.flatMap(l => l.project ? [l.project] : [])))];
  const timeline = (project: string) => view.notes.flatMap(note => note.links.filter(l => l.project === project).map(link => ({ note, link })));
  const date = (value: string) => new Date(value).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
  function classification(note: DiaryNote) {
    return <div className="diary-link-list">{note.links.map(link => <div className="diary-link" key={link.index}><p>{link.project ?? "프로젝트 미지정"} · {link.stage} <span className={link.reviewed ? "diary-reviewed" : "diary-pending"}>{link.reviewed ? "확인함" : "분류 확인 필요"}</span></p><blockquote>{link.excerpt}</blockquote><details><summary>분류 수정</summary><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void save({ action: "classify", id: note.id, version: note.version, classification: { index: link.index, project: String(data.get("project")).trim() || null, stage: data.get("stage") } }); }}><label>프로젝트<input aria-label={`프로젝트 ${note.id} ${link.index}`} name="project" defaultValue={link.project ?? ""} placeholder="이름을 쓰거나 비워 두세요" list="diary-projects" maxLength={100} /></label><label>흐름<select name="stage" defaultValue={link.stage}>{FLOW_STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label><button disabled={busy}>분류 확인</button></form></details></div>)}</div>;
  }
  return <div className="diary-shell"><div className="diary-heading"><p className="diary-eyebrow">나만의 작업 노트</p><h1>루와의 프로젝트</h1><p>오늘 있었던 일, 생각난 다음 일을 편하게 남겨 주세요.</p></div><form className="diary-composer" onSubmit={e => { e.preventDefault(); void save({ action: "diary", raw }); }}><label htmlFor="diary-note">오늘의 이야기</label><textarea id="diary-note" name="note" value={raw} onChange={e => setRaw(e.target.value)} maxLength={12000} required placeholder="오늘 물한골은 도메인 기다리는 중이고, 소셜다잇소는 공간을 외주로 넘기기로 했다." /><div className="diary-composer-footer"><span>나에게만 보관 · 자동 공유 없음</span><button disabled={busy || !raw.trim()}>기록 남기기</button></div></form><p role="status" className="diary-message">{message}</p><p className="diary-adapter-note">지금은 프로젝트 이름과 일부 표현을 맞추는 로컬 규칙 제안입니다. AI 의미 분석은 아직 연결되지 않았어요. 완료 여부나 실행 승인은 판단하지 않습니다.</p><datalist id="diary-projects">{[...new Set(["물한골", "소셜다잇소", ...projects])].map(p => <option key={p} value={p} />)}</datalist><section className="diary-projects"><h2>프로젝트별 흐름</h2><p className="diary-section-hint">요청 → 진행 내용 → 결정/대기 → 다음 단계 · 기록한 순서대로 이어집니다.</p>{projects.length === 0 ? <p className="diary-empty">이야기를 남기면 여기에 프로젝트 흐름이 모여요. 이름을 찾지 못한 기록은 아래에서 연결할 수 있어요.</p> : projects.map(project => { const entries = timeline(project); const latest = entries[entries.length - 1]; return <article className="diary-project-card" key={project}><div className="diary-card-title"><h3>{project}</h3><span>{latest.link.stage} 기록 {latest.link.reviewed ? "확인함" : "· 확인 필요"}</span></div><p className="diary-current">최근 이야기: {latest.link.excerpt}</p><ol className="diary-timeline">{entries.map(({ note, link }) => <li key={`${note.id}-${link.index}`}><div><time dateTime={note.createdAt}>{date(note.createdAt)}</time><span className="diary-phase">{link.stage}</span>{!link.reviewed && <span className="diary-pending">분류 확인 필요</span>}</div><p>{link.excerpt}</p><a href={`#${note.id}`}>원문 보기 · 분류 수정</a></li>)}</ol></article>; })}</section><section className="diary-recent"><h2>최근 기록</h2>{view.notes.length === 0 ? <p className="diary-empty">아직 기록이 없어요. 첫 이야기를 남겨 보세요.</p> : [...view.notes].reverse().map(note => <article id={note.id} key={note.id} className="diary-note"><time dateTime={note.createdAt}>{date(note.createdAt)}</time><p className="diary-original">{note.raw}</p>{classification(note)}</article>)}</section><p className="diary-sharing">개인 기록은 공유되지 않습니다. ChatGPT 대화 자동 동기화와 직원 공유 기능은 연결되지 않았습니다.</p></div>;
}
