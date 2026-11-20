import type { DiaryLink, DiaryNote, DiaryView } from "./rua-diary";

export const canonicalTopicName = (title: string) => title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");

type TimelineEntry = { note: DiaryNote; link: DiaryLink };
export type ProjectTimeline = { key: string; title: string; entries: TimelineEntry[]; latest: TimelineEntry; pending: number };
export const diaryTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
}).format(new Date(iso));

export function buildTimeline(view: DiaryView): ProjectTimeline[] {
  const groups = new Map<string, TimelineEntry[]>();
  for (const note of view.notes) {
    for (const link of note.links) {
      if (!link.project) continue;
      const key = canonicalTopicName(link.project);
      if (!key) continue;
      const items = groups.get(key);
      if (items) items.push({ note, link });
      else groups.set(key, [{ note, link }]);
    }
  }
  return [...groups].map(([key, entries]) => {
    entries.sort((a, b) => Date.parse(a.note.createdAt) - Date.parse(b.note.createdAt));
    const title = entries.find(item => item.link.reviewed)?.link.project ?? entries[0].link.project!;
    return { key, title, entries, latest: entries.at(-1)!, pending: entries.filter(item => !item.link.reviewed).length };
  }).sort((a, b) => Date.parse(b.latest.note.createdAt) - Date.parse(a.latest.note.createdAt) || a.title.localeCompare(b.title, "ko-KR"));
}

/** Only make a local, visibly unconfirmed recommendation. Never invent or persist a topic here. */
export function suggestTopic(excerpt: string, titles: string[]): string {
  const normalized = canonicalTopicName(excerpt);
  const matches = titles.filter(title => canonicalTopicName(title).length >= 2 && normalized.includes(canonicalTopicName(title)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return "";
  const explicit = excerpt.match(/^\s*(?:[-•]\s+)?([^:\n]{2,60})\s*[:：]\s+\S/u)?.[1]?.trim();
  return explicit ?? "";
}

export function sourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function detailsFor({ note }: TimelineEntry) {
  const item = note.checkpoint;
  if (!item) return [];
  return ([
    ["결정", item.decision],
    ["진행 내용", item.progress],
    ["막힌 일", item.blocker],
    ["다음 단계", item.nextStep],
  ] as const).filter((pair): pair is readonly [typeof pair[0], string] => !!pair[1]);
}

export function projectHandoff(project: ProjectTimeline) {
  const verified = project.entries.filter(entry => entry.link.reviewed);
  if (!verified.length) return "";
  const latest = verified.at(-1)!;
  return [
    `프로젝트: ${project.title}`,
    `최신 확인 기록: ${latest.link.excerpt}`,
    `다음 단계(최신 기록 기준): ${latest.note.checkpoint?.nextStep ?? "기록되지 않음"}`,
    "아래 시간순 기록을 읽고 업무를 이어가세요. 분류 확인은 사실 검증이나 실행 승인을 의미하지 않습니다.",
    ...(project.pending ? [`미확인 분류 ${project.pending}건은 제외했습니다.`] : []),
    "",
    "시간순 기록 (KST)",
    ...verified.flatMap(entry => [
      `[${diaryTime(entry.note.createdAt)}] ${entry.link.stage}: ${entry.link.excerpt}`,
      ...detailsFor(entry).map(([name, value]) => `${name}: ${value}`),
      ...(entry.note.checkpoint ? [`근거 상태: ${entry.note.checkpoint.evidence}`] : ["근거 상태: 프로젝트 연결만 확인함"]),
      ...((entry.note.checkpoint?.sources ?? []).flatMap(source => sourceUrl(source.url) ? [`자료: ${source.label ?? "링크"} (${source.url})`] : [])),
      "",
    ]),
  ].join("\n");
}
