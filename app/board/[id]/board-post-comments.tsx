"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { MessageCircle, Send, AtSign, Loader2 } from "lucide-react";
import { formatUserName } from "@/lib/utils";

type User = { id: string; name: string; email?: string; department?: string | null; position?: string | null };
type Comment = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; position: string | null };
  mentioned: { id: string; name: string | null }[];
};

export function BoardPostComments({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/board/${postId}/comments`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (mentionOpen && users.length === 0) {
      fetch("/api/users/list")
        .then((r) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [mentionOpen, users.length]);

  const addMention = (user: User) => {
    if (mentionedUserIds.includes(user.id)) return;
    setMentionedUserIds((prev) => [...prev, user.id]);
    setBody((prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + `@${user.name} `);
    setMentionOpen(false);
  };

  const removeMention = (userId: string) => {
    setMentionedUserIds((prev) => prev.filter((id) => id !== userId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("댓글 내용을 입력하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/board/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          mentionedUserIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      setComments((prev) => [...prev, data]);
      setBody("");
      setMentionedUserIds([]);
      toast.success("댓글이 등록되었습니다.");
      if (mentionedUserIds.length > 0) {
        toast.info("태그한 사용자에게 알림이 전송되었습니다.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "댓글 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="size-4" />
        댓글 ({comments.length})
      </h3>

      <ul className="space-y-3">
        {loading ? (
          <li className="text-muted-foreground py-4 text-center text-sm">불러오는 중...</li>
        ) : comments.length === 0 ? (
          <li className="text-muted-foreground py-4 text-center text-sm">아직 댓글이 없습니다.</li>
        ) : (
          comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border bg-muted/30 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {c.user.name ?? "알 수 없음"}
                  {c.user.position ? ` · ${c.user.position}` : ""}
                </span>
                <span>{format(new Date(c.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              {c.mentioned.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.mentioned.map((m) => (
                    <Badge
                      key={m.id}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      <AtSign className="mr-0.5 size-3" />
                      {m.name ?? "알 수 없음"}
                    </Badge>
                  ))}
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1">
                <AtSign className="size-4" />
                태그
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <p className="text-muted-foreground mb-2 px-2 text-xs">
                태그된 사람에게 알림이 갑니다.
              </p>
              <ul className="max-h-48 overflow-y-auto">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addMention(u)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {formatUserName(u)}
                      {mentionedUserIds.includes(u.id) && (
                        <span className="text-primary text-xs">추가됨</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          {mentionedUserIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {mentionedUserIds.map((id) => {
                const u = users.find((x) => x.id === id);
                return (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="cursor-pointer gap-0.5 pr-1 text-xs"
                    onClick={() => removeMention(id)}
                  >
                    @{u?.name ?? id.slice(0, 6)} ×
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="댓글을 입력하세요. '태그' 버튼으로 동료를 태그하면 알림이 갑니다."
          rows={3}
          className="resize-none"
          disabled={submitting}
        />
        <Button type="submit" size="sm" disabled={submitting || !body.trim()}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="mr-1 size-4" />
          )}
          등록
        </Button>
      </form>
    </section>
  );
}
