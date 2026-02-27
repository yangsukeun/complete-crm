"use client";

import { useState, useEffect, useRef } from "react";
import { Megaphone, Send, Loader2, Calendar, MapPin, Vote, Plus, Trash2 } from "lucide-react";
import { AIAssistToolbar } from "@/components/ai-assist-toolbar";
import { useAIAssistTarget } from "@/components/ai-assist-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

const NEW_ANNOUNCEMENT_HOURS = 72;

type PollOptionItem = { text: string; count: number };

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  eventDate: string | null;
  eventEndDate: string | null;
  location: string | null;
  pollOptions: PollOptionItem[] | null;
  myVoteIndex: number | null;
  createdByName: string;
  createdByPosition: string | null;
};

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export function AnnouncementsPageClient({ canCreate }: { canCreate: boolean }) {
  const [list, setList] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const contentRef = useRef(content);
  const titleRef = useRef(title);
  contentRef.current = content;
  titleRef.current = title;
  const aiCtx = useAIAssistTarget();

  const fetchList = async () => {
    try {
      const res = await fetch("/api/announcements");
      if (!res.ok) throw new Error("공지 목록 조회 실패");
      const data = await res.json();
      setList(data);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const isNew = (createdAt: string) => {
    const created = new Date(createdAt).getTime();
    return Date.now() - created < NEW_ANNOUNCEMENT_HOURS * 60 * 60 * 1000;
  };

  const addPollOption = () => {
    if (pollOptions.length >= 20) return;
    setPollOptions([...pollOptions, ""]);
  };
  const removePollOption = (i: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, idx) => idx !== i));
  };
  const setPollOptionAt = (i: number, value: string) => {
    const next = [...pollOptions];
    next[i] = value;
    setPollOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const opts = pollOptions.map((s: any) => s.trim()).filter(Boolean);
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        eventEndDate: eventEndDate ? new Date(eventEndDate).toISOString() : null,
        location: location.trim() || null,
      };
      if (opts.length > 0) body.pollOptions = opts;

      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      toast.success("공지사항이 등록되었습니다.");
      setTitle("");
      setContent("");
      setEventDate("");
      setEventEndDate("");
      setLocation("");
      setPollOptions(["", ""]);
      fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "공지 등록에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleVote = async (announcementId: string, optionIndex: number) => {
    setVotingId(announcementId);
    try {
      const res = await fetch(`/api/announcements/${announcementId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "투표 실패");
      toast.success("투표가 반영되었습니다.");
      fetchList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "투표에 실패했습니다.");
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {canCreate && (
        <section className="border-border rounded-xl border border-gray-200 bg-card p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
            <Megaphone className="size-5" />
            새 공지사항 작성
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">제목</Label>
              <Input
                id="announcement-title"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                placeholder="공지 제목을 입력하세요"
                maxLength={200}
                className="border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="announcement-content">내용</Label>
                <AIAssistToolbar
                  value={content}
                  onChange={setContent}
                  topic={title}
                  placeholder="공지 내용을 입력하세요"
                />
              </div>
              <Textarea
                id="announcement-content"
                value={content}
                onChange={(e: any) => setContent(e.target.value)}
                onFocus={() =>
                  aiCtx?.register({
                    getValue: () => contentRef.current,
                    onChange: setContent,
                    getTopic: () => titleRef.current,
                  })
                }
                onBlur={() => aiCtx?.unregister()}
                placeholder="공지 내용을 입력하세요"
                rows={6}
                className="resize-none border-gray-200"
              />
            </div>

            <div className="border-border space-y-3 rounded-lg border border-gray-200 bg-muted/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Calendar className="size-4" />
                일정 (달력) — 모임 날짜·장소
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">시작 일시</Label>
                  <Input
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e: any) => setEventDate(e.target.value)}
                    className="border-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">종료 일시</Label>
                  <Input
                    type="datetime-local"
                    value={eventEndDate}
                    onChange={(e: any) => setEventEndDate(e.target.value)}
                    className="border-gray-200"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-muted-foreground text-xs">
                  <MapPin className="size-3" /> 장소
                </Label>
                <Input
                  value={location}
                  onChange={(e: any) => setLocation(e.target.value)}
                  placeholder="예: 회의실 A, 줌 링크 등"
                  maxLength={500}
                  className="border-gray-200"
                />
              </div>
            </div>

            <div className="border-border space-y-3 rounded-lg border border-gray-200 bg-muted/20 p-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Vote className="size-4" />
                투표 (선택사항)
              </h3>
              <p className="text-muted-foreground text-xs">
                선택지를 입력하면 공지와 함께 투표가 열립니다. 비워두면 투표 없음.
              </p>
              <div className="space-y-2">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={opt}
                      onChange={(e: any) => setPollOptionAt(i, e.target.value)}
                      placeholder={`선택지 ${i + 1}`}
                      maxLength={200}
                      className="border-gray-200"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePollOption(i)}
                      disabled={pollOptions.length <= 2}
                      className="shrink-0 text-muted-foreground"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPollOption}
                  disabled={pollOptions.length >= 20}
                  className="gap-1"
                >
                  <Plus className="size-4" />
                  선택지 추가
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={submitLoading} className="bg-foreground text-background hover:bg-foreground/90">
                {submitLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                등록하기
              </Button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
          <Megaphone className="size-5" />
          공지사항 목록
        </h2>
        {loading ? (
          <div className="border-border flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-muted/30 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>불러오는 중...</span>
          </div>
        ) : list.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed border-gray-200 bg-muted/30 py-12 text-center text-muted-foreground">
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((a: any) => {
              const newAnnouncement = isNew(a.createdAt);
              return (
                <li
                  key={a.id}
                  className={
                    newAnnouncement
                      ? "announcement-new border-border rounded-xl border border-gray-200 bg-card p-5 shadow-sm transition-colors hover:bg-muted/50"
                      : "border-border rounded-xl border border-gray-200 bg-card p-5 shadow-sm transition-colors hover:bg-muted/50"
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{a.title}</span>
                      {newAnnouncement && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          ✨ 새 공지
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-sm">
                      {format(new Date(a.createdAt), "yyyy.MM.dd (EEE) HH:mm", { locale: ko })}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 whitespace-pre-wrap break-words text-sm">
                    {a.content}
                  </p>
                  {(a.eventDate || a.location) && (
                    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {a.eventDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-4 shrink-0" />
                          {format(new Date(a.eventDate), "M/d (EEE) HH:mm", { locale: ko })}
                          {a.eventEndDate &&
                            ` ~ ${format(new Date(a.eventEndDate), "M/d HH:mm", { locale: ko })}`}
                        </span>
                      )}
                      {a.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-4 shrink-0" />
                          {a.location}
                        </span>
                      )}
                    </div>
                  )}
                  {a.pollOptions && a.pollOptions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="flex items-center gap-1 text-muted-foreground text-xs font-medium">
                        <Vote className="size-3" />
                        투표
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {a.pollOptions.map((opt: any, idx: any) => (
                          <Button
                            key={idx}
                            type="button"
                            variant={a.myVoteIndex === idx ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleVote(a.id, idx)}
                            disabled={votingId === a.id || a.myVoteIndex !== null}
                            className="text-xs"
                          >
                            {opt.text} ({opt.count}표)
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-muted-foreground mt-3 text-xs">
                    {a.createdByName}
                    {a.createdByPosition ? ` · ${a.createdByPosition}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
