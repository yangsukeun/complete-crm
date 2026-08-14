"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CsScreen } from "@/components/cs-screen";
import { toast } from "sonner";

type LoungePost = {
  id: string;
  type: "NOTICE" | "LOUNGE";
  content: string;
  nickname: string | null;
  createdAt: string;
  likeCount: number;
  dislikeCount: number;
  myVote: "LIKE" | "DISLIKE" | null;
  isMine: boolean;
  authorName?: string | null;
};

type ListPayload = {
  posts: LoungePost[];
  canPostNotice: boolean;
  viewerName: string;
  error?: string;
};

const GUIDE = "닉네임으로 익명 표시됩니다. 자유롭게 이야기해 주세요 (욕설 금지)";
const PREVIEW = 3;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function PostCard({
  post,
  canModerate,
  onVote,
  onDelete,
}: {
  post: LoungePost;
  canModerate: boolean;
  onVote: (id: string, value: "LIKE" | "DISLIKE") => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {post.type === "NOTICE" ? (post.authorName || "공지") : post.nickname || "익명"}
          </p>
          <p className="text-muted-foreground text-xs font-medium">{formatWhen(post.createdAt)}</p>
        </div>
        {(post.isMine || canModerate) && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => onDelete(post.id)}
            aria-label="삭제"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <div
        className="whitespace-pre-wrap break-words text-sm font-normal leading-relaxed text-foreground"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />
      <div className="mt-3 flex items-center gap-1">
        <Button
          type="button"
          variant={post.myVote === "LIKE" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-2"
          onClick={() => onVote(post.id, "LIKE")}
        >
          <ThumbsUp className="size-3.5" />
          {post.likeCount}
        </Button>
        <Button
          type="button"
          variant={post.myVote === "DISLIKE" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-2"
          onClick={() => onVote(post.id, "DISLIKE")}
        >
          <ThumbsDown className="size-3.5" />
          {post.dislikeCount}
        </Button>
      </div>
    </article>
  );
}

function SectionHeader({
  title,
  href,
  showAll,
}: {
  title: string;
  href: string;
  showAll: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="cs-section-title">{title}</h2>
      {showAll && (
        <Link href={href} className="text-sm font-semibold text-primary hover:underline">
          전체보기
        </Link>
      )}
    </div>
  );
}

export function CsLoungeClient() {
  const searchParams = useSearchParams();
  const tabRaw = searchParams.get("tab");
  const tab = tabRaw === "notice" || tabRaw === "lounge" ? tabRaw : "home";

  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loungeText, setLoungeText] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [posting, setPosting] = useState<"LOUNGE" | "NOTICE" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cs-lounge/posts");
      const body = (await res.json().catch(() => ({}))) as ListPayload;
      if (!res.ok) throw new Error(body.error || "목록을 불러오지 못했습니다.");
      setData(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (type: "LOUNGE" | "NOTICE") => {
    const content = type === "LOUNGE" ? loungeText : noticeText;
    setPosting(type);
    try {
      const res = await fetch("/api/cs-lounge/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content }),
      });
      const body = (await res.json().catch(() => ({}))) as LoungePost & { error?: string };
      if (!res.ok) throw new Error(body.error || "작성에 실패했습니다.");
      if (type === "LOUNGE") setLoungeText("");
      else setNoticeText("");
      setData((prev) =>
        prev
          ? { ...prev, posts: [body, ...prev.posts.filter((p) => p.id !== body.id)] }
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "작성에 실패했습니다.");
    } finally {
      setPosting(null);
    }
  };

  const onVote = async (id: string, value: "LIKE" | "DISLIKE") => {
    try {
      const res = await fetch(`/api/cs-lounge/posts/${encodeURIComponent(id)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const body = (await res.json().catch(() => ({}))) as LoungePost & { error?: string };
      if (!res.ok) throw new Error(body.error || "투표에 실패했습니다.");
      setData((prev) =>
        prev ? { ...prev, posts: prev.posts.map((p) => (p.id === id ? body : p)) } : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "투표에 실패했습니다.");
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("이 글을 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/cs-lounge/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "삭제에 실패했습니다.");
      setData((prev) => (prev ? { ...prev, posts: prev.posts.filter((p) => p.id !== id) } : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const notices = useMemo(
    () => data?.posts.filter((p) => p.type === "NOTICE") ?? [],
    [data]
  );
  const lounge = useMemo(
    () => data?.posts.filter((p) => p.type === "LOUNGE") ?? [],
    [data]
  );

  const showNotice = tab === "home" || tab === "notice";
  const showLounge = tab === "home" || tab === "lounge";
  const noticeList = tab === "home" ? notices.slice(0, PREVIEW) : notices;
  const loungeList = tab === "home" ? lounge.slice(0, PREVIEW) : lounge;

  return (
    <CsScreen>
      <section className="rounded-2xl border border-primary/15 bg-primary/5 px-6 py-8 md:px-8 md:py-10">
        <p className="text-3xl font-extrabold tracking-tight break-keep text-foreground md:text-4xl">
          좋은 하루! 오늘 하루도 화이팅입니다! 💪
        </p>
        <p className="text-muted-foreground mt-3 text-base font-medium">
          CS 업무의 효율을 높여주는 사내 통합 플랫폼입니다
        </p>
      </section>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className={tab === "home" ? "grid gap-8 lg:grid-cols-2" : "grid gap-8"}>
          {showNotice && (
            <section id="notice" className="flex flex-col gap-4">
              <SectionHeader
                title="최근 공지사항"
                href="/cs-lounge?tab=notice"
                showAll={tab === "home"}
              />
              {data?.canPostNotice && tab !== "home" && (
                <div className="rounded-xl border bg-card p-5">
                  <Textarea
                    value={noticeText}
                    onChange={(e) => setNoticeText(e.target.value)}
                    placeholder="공지 내용을 입력하세요"
                    maxLength={2000}
                    className="min-h-20 font-normal"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!noticeText.trim() || posting === "NOTICE"}
                      onClick={() => void submit("NOTICE")}
                    >
                      {posting === "NOTICE" && <Loader2 className="size-3.5 animate-spin" />}
                      공지 등록
                    </Button>
                  </div>
                </div>
              )}
              {noticeList.length === 0 ? (
                <p className="text-muted-foreground text-sm font-medium">등록된 공지가 없습니다.</p>
              ) : (
                noticeList.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    canModerate={!!data?.canPostNotice}
                    onVote={onVote}
                    onDelete={onDelete}
                  />
                ))
              )}
            </section>
          )}

          {showLounge && (
            <section id="lounge" className="flex flex-col gap-4">
              <SectionHeader
                title="실시간 익명 라운지"
                href="/cs-lounge?tab=lounge"
                showAll={tab === "home"}
              />
              <div className="rounded-xl border bg-card p-5">
                <p className="mb-1 text-sm font-semibold text-foreground">속마음 털어놓기</p>
                <p className="text-muted-foreground mb-2 text-xs font-medium">{GUIDE}</p>
                <Textarea
                  value={loungeText}
                  onChange={(e) => setLoungeText(e.target.value)}
                  placeholder="속마음 털어놓기"
                  maxLength={2000}
                  className="min-h-24 font-normal"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!loungeText.trim() || posting === "LOUNGE"}
                    onClick={() => void submit("LOUNGE")}
                  >
                    {posting === "LOUNGE" && <Loader2 className="size-3.5 animate-spin" />}
                    익명으로 남기기
                  </Button>
                </div>
              </div>
              {loungeList.length === 0 ? (
                <p className="text-muted-foreground text-sm font-medium">아직 글이 없습니다.</p>
              ) : (
                loungeList.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    canModerate={!!data?.canPostNotice}
                    onVote={onVote}
                    onDelete={onDelete}
                  />
                ))
              )}
            </section>
          )}
        </div>
      )}
    </CsScreen>
  );
}
