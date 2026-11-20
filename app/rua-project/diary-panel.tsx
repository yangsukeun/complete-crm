"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DiaryProcessingPanel } from "./processing-panel";
import { EVIDENCE_STATES, FLOW_STAGES, type DiaryView, type DiaryNote } from "@/lib/rua-diary";
import { buildTimeline, canonicalTopicName, detailsFor, diaryTime, projectHandoff, sourceUrl, suggestTopic, type ProjectTimeline } from "@/lib/rua-timeline";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function Handoff({ project }: { project: ProjectTimeline }) {
  const text = projectHandoff(project);
  const [message, setMessage] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  if (!text) return <p className="rua-hint">인수인계에는 확인한 기록만 들어갑니다. 원문에서 프로젝트 연결을 먼저 확인해 주세요.</p>;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("복사했습니다. 다른 AI로 전송하지 않았습니다.");
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setMessage("복사가 차단됐습니다. 선택한 내용을 직접 복사해 주세요.");
    }
  }
  return <details className="rua-handoff">
    <summary>AI 인수인계 내용 미리보기</summary>
    <p className="rua-hint">다른 AI에 넘기기 전 개인정보와 비공개 내용을 확인해 주세요. 여기서는 텍스트만 복사합니다.</p>
    <textarea ref={preview} readOnly value={text} aria-label={`${project.title} 인수인계 내용`} rows={8} />
    <button type="button" onClick={() => void copy()}>인수인계 내용 복사</button>
    <p role="status" className="rua-hint">{message}</p>
  </details>;
}

export function DiaryPanel({ initial }: { initial: DiaryView }) {
  const [view, setView] = useState(initial);
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState("");
  const pending = useRef<{ body: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const composer = useRef<HTMLDetailsElement>(null);
  const topicInput = useRef<HTMLInputElement>(null);
  const archive = useRef<HTMLDetailsElement>(null);
  const projects = useMemo(() => buildTimeline(view), [view]);
  const titles = projects.map(project => project.title);
  const matchedTopic = projects.find(project => project.key === canonicalTopicName(topic));
  const unassigned = view.notes.reduce((sum, note) => sum + note.links.filter(link => !link.project).length, 0);

  useEffect(() => {
    function revealHash() {
      if (!/^#local-note-\d+$/.test(window.location.hash)) return;
      if (archive.current) archive.current.open = true;
      requestAnimationFrame(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" }));
    }
    revealHash();
    window.addEventListener("hashchange", revealHash);
    return () => window.removeEventListener("hashchange", revealHash);
  }, []);

  async function save(body: Record<string, unknown>) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    const fingerprint = JSON.stringify(body);
    try {
      if (pending.current?.body !== fingerprint) pending.current = { body: fingerprint, key: crypto.randomUUID() };
      const response = await fetch("/api/rua-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, key: pending.current.key, source: "human" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const next = await fetch("/api/rua-work?view=diary", { cache: "no-store" });
      if (!next.ok) throw new Error("저장 상태를 확인하지 못했습니다. 같은 내용으로 다시 확인해 주세요.");
      setView(await next.json());
      pending.current = null;
      setMessage(body.action === "diary" ? "원문을 남겼어요. 아래에서 프로젝트에 연결할 수 있어요."
        : body.action === "checkpoint" ? "프로젝트의 시간순 기록에 추가했어요." : "연결을 바꿨어요. 원문은 그대로 남아 있습니다.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "연결을 확인한 뒤 다시 시도해 주세요.");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function openComposer(title: string) {
    setTopic(title);
    if (composer.current) composer.current.open = true;
    if (title) requestAnimationFrame(() => document.getElementById("rua-summary")?.focus());
    else topicInput.current?.focus();
  }

  async function addCheckpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = matchedTopic?.title ?? field(data, "topic");
    const src = field(data, "source");
    if (src && !sourceUrl(src)) { setMessage("자료는 https://로 시작하는 링크만 추가해 주세요."); return; }
    const ok = await save({ action: "checkpoint", checkpoint: {
      topic: title, summary: field(data, "summary"), stage: field(data, "stage"), evidence: field(data, "evidence"),
      decision: field(data, "decision") || undefined, progress: field(data, "progress") || undefined,
      blocker: field(data, "blocker") || undefined, nextStep: field(data, "nextStep") || undefined,
      sources: src ? [{ url: src, label: field(data, "sourceLabel") || undefined }] : [],
    } });
    if (ok) { form.reset(); setTopic(title); if (composer.current) composer.current.open = false; }
  }

  function classification(note: DiaryNote) {
    return <div className="diary-link-list">{note.links.map(link => {
      const proposed = link.project ?? suggestTopic(link.excerpt, titles);
      return <div className="diary-link" key={`${link.index}-${note.version}`}>
        <p>{link.project ?? "프로젝트 미지정"} · {link.stage} <span className={link.reviewed ? "diary-reviewed" : "diary-pending"}>{link.reviewed ? "연결 확인함" : "분류 확인 필요"}</span></p>
        <blockquote>{link.excerpt}</blockquote>
        <details><summary>{link.reviewed ? "연결 수정" : "프로젝트 확인·연결"}</summary>
          {!link.project && proposed && <p className="rua-hint">이름 후보: {proposed}. 저장하기 전 맞는 프로젝트인지 확인해 주세요.</p>}
          <form onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const entered = field(data, "project");
            const existing = projects.find(p => p.key === canonicalTopicName(entered));
            void save({ action: "classify", id: note.id, version: note.version,
              classification: { index: link.index, project: existing?.title ?? (entered || null), stage: data.get("stage") } });
          }}>
            <label>프로젝트<input aria-label={`프로젝트 ${note.id} ${link.index}`} name="project" defaultValue={proposed}
              placeholder="기존 이름 선택 또는 새 프로젝트명" list="diary-projects" maxLength={100} /></label>
            <label>기록 유형<select name="stage" defaultValue={link.stage}>{FLOW_STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label>
            <button disabled={busy}>연결 저장</button>
          </form>
        </details>
      </div>;
    })}</div>;
  }

  return <div className="diary-shell">
    <header className="diary-heading">
      <p className="diary-eyebrow">대표 전용 · 업무 이어가기</p>
      <h1>루와의 대화</h1>
      <p>새 주제는 새 프로젝트로, 이어지는 대화는 같은 이름 아래 시간순으로 남겨요.</p>
    </header>
    <details className="rua-composer" ref={composer}>
      <summary>＋ 프로젝트 기록 추가</summary>
      <form onSubmit={event => void addCheckpoint(event)}>
        <div className="rua-fields">
          <label>프로젝트 제목<input name="topic" ref={topicInput} list="diary-projects" value={topic} onChange={e => setTopic(e.target.value)}
            maxLength={100} required placeholder="기존 프로젝트 선택 또는 새 제목 입력" /></label>
          <label>기록 유형<select name="stage" defaultValue="진행 내용">{FLOW_STAGES.map(stage => <option key={stage}>{stage}</option>)}</select></label>
        </div>
        <p className="rua-hint">{topic.trim() ? matchedTopic ? `‘${matchedTopic.title}’의 다음 기록으로 추가됩니다.` : "처음 쓰는 이름이에요. 새 프로젝트로 모입니다." : "기존 화제라면 저장된 제목을 선택해 주세요."}</p>
        <label>최신 대화 요약 한 줄<input id="rua-summary" name="summary" maxLength={160} required placeholder="예: 수정안 확정, 다음은 고객 확인" /></label>
        <details className="rua-optional">
          <summary>결정 · 진행 내용 · 대기 · 다음 단계 · 자료 입력</summary>
          <div className="rua-fields">
            <label>결정<textarea name="decision" maxLength={4000} rows={2} /></label>
            <label>진행 내용<textarea name="progress" maxLength={4000} rows={2} /></label>
            <label>막힌 일 / 대기<textarea name="blocker" maxLength={4000} rows={2} /></label>
            <label>다음 단계<textarea name="nextStep" maxLength={4000} rows={2} /></label>
            <label>근거 상태<select name="evidence" defaultValue="미확인">{EVIDENCE_STATES.map(state => <option key={state}>{state}</option>)}</select></label>
            <label>자료 이름<input name="sourceLabel" maxLength={120} /></label>
          </div>
          <label>자료 링크<input name="source" type="url" maxLength={2048} placeholder="https://" /></label>
        </details>
        <button disabled={busy}>프로젝트 기록 저장</button>
      </form>
    </details>
    <p role="status" className="diary-message">{message}</p>
    <datalist id="diary-projects">{titles.map(title => <option key={title} value={title} />)}</datalist>
    <section className="rua-projects" aria-label="프로젝트">
      <h2>프로젝트</h2>
      <p className="rua-hint">최근에 갱신된 프로젝트가 먼저 보여요. 제목을 누르면 처음부터 최신까지 펼쳐집니다.</p>
      {!projects.length && <p className="diary-empty">첫 프로젝트를 추가하거나 아래 원문을 프로젝트에 연결해 보세요.</p>}
      {projects.map(project => <details className="rua-project" key={project.key}>
        <summary>
          <span className="rua-project-text"><strong>{project.title}</strong><small>{project.latest.link.excerpt.replace(/\s+/gu, " ")}</small></span>
          <span className="rua-project-count">{project.entries.length}건<span className="rua-chevron" aria-hidden="true">⌄</span></span>
        </summary>
        <div className="rua-project-content">
          <div className="rua-project-actions">
            <button type="button" onClick={() => openComposer(project.title)}>이 프로젝트 이어 쓰기</button>
            {project.pending > 0 && <span className="diary-pending">분류 확인 필요 {project.pending}건</span>}
          </div>
          <ol className="diary-timeline">{project.entries.map(entry => {
            const { note, link } = entry;
            const details = detailsFor(entry);
            return <li key={`${note.id}-${link.index}`}>
              <div><time dateTime={note.createdAt}>{diaryTime(note.createdAt)}</time><span className="diary-phase">{link.stage}</span>
                {note.checkpoint && <span className="diary-phase">근거: {note.checkpoint.evidence}</span>}
                {!link.reviewed && <span className="diary-pending">분류 미확인</span>}</div>
              <p className="rua-entry-summary">{link.excerpt}</p>
              {!!details.length && <dl className="rua-entry-fields">{details.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>}
              {(note.checkpoint?.sources ?? []).map((source, index) => {
                const href = sourceUrl(source.url);
                return href ? <a className="rua-source" key={index} href={href} target="_blank" rel="noopener noreferrer">{source.label ?? "자료 링크"} ↗</a> : null;
              })}
              <a href={`#${note.id}`} onClick={() => { if (archive.current) archive.current.open = true; }}>원문 · 연결 수정</a>
            </li>;
          })}</ol>
          <Handoff project={project} />
        </div>
      </details>)}
    </section>
    <details className="rua-archive" ref={archive}>
      <summary>원문 기록과 프로젝트 연결 {unassigned > 0 ? `· 미연결 ${unassigned}건` : ""}</summary>
      <p className="rua-hint">기존 원문은 그대로 있어요. 이름을 찾지 못한 구간은 기존 프로젝트를 고르거나 새 이름으로 연결할 수 있어요.</p>
      <form className="diary-composer" onSubmit={async e => { e.preventDefault(); if (await save({ action: "diary", raw })) setRaw(""); }}>
        <label htmlFor="diary-note">오늘의 이야기</label>
        <p className="rua-hint">여러 화제가 섞인 원문을 그대로 남겨 둘 수 있어요.</p>
        <textarea id="diary-note" name="note" value={raw} onChange={e => setRaw(e.target.value)} maxLength={12000} required placeholder="예: 물한골: 고객 답변 대기. 소셜다잇소: 행사 장비 확인." />
        <div className="diary-composer-footer"><span>나에게만 보관 · 자동 공유 없음</span><button disabled={busy || !raw.trim()}>기록 남기기</button></div>
      </form>
      {!view.notes.length && <p className="diary-empty">아직 원문 기록이 없어요.</p>}
      {[...view.notes].reverse().map(note => <article id={note.id} key={note.id} className="diary-note">
        <time dateTime={note.createdAt}>{diaryTime(note.createdAt)}</time><p className="diary-original">{note.raw}</p>{classification(note)}
      </article>)}
    </details>
    <details className="rua-archive"><summary>기존 CRM 프로젝트와 연결한 개인 기록</summary>
      <DiaryProcessingPanel revision={view.notes.map(n => n.id + ":" + n.version).join(",")} />
    </details>
    <p className="diary-sharing">대표 전용 기록입니다. 이 화면에 저장된 기록만 정리하며, ChatGPT 대화 자동 수집·다른 AI 전송·직원 공유는 연결되지 않았습니다.</p>
  </div>;
}
