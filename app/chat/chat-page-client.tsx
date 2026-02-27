"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, ImagePlus, MessageCircle, Plus, Search, Send, Trash2 } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";

type User = { id: string; name: string; email: string; department: string | null; position?: string | null };
type ChatItem = {
  id: string;
  isGroup: boolean;
  name: string | null;
  participants: { id: string; name: string; position?: string | null }[];
  lastMessage: { body: string; createdAt: string; user: { id: string; name: string; position?: string | null } } | null;
};
type Message = {
  id: string;
  body: string;
  createdAt: string;
  isDeleted?: boolean;
  user: { id: string; name: string; position?: string | null };
};
type ScheduleItem = {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
};

const CHAT_READ_KEY = "chat_read_";
const DELETE_ALLOWED_MS = 10 * 60 * 1000; // 10분

export function ChatPageClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [chatSearch, setChatSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pasteUploading, setPasteUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const mentionStartPosRef = useRef(0);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const list = data as ChatItem[];
      setChats((prev: any) => {
        if (prev.length !== list.length) return list;
        const same = list.every(
          (c, i) =>
            prev[i]?.id === c.id &&
            prev[i]?.lastMessage?.createdAt === c.lastMessage?.createdAt
        );
        return same ? prev : list;
      });

      // localStorage 읽음 시각 기준으로 미읽음만 배지 표시 (읽은 대화는 숫자 제거)
      try {
        const myId = session?.user?.id;
        const next: Record<string, number> = {};
        for (const c of list) {
          if (!c.lastMessage || !myId || c.lastMessage.user?.id === myId) continue;
          const readAt =
            typeof localStorage !== "undefined" ? localStorage.getItem(CHAT_READ_KEY + c.id) : null;
          const isUnread = !readAt || new Date(c.lastMessage.createdAt) > new Date(readAt);
          if (isUnread && c.id !== selectedChatId) {
            next[c.id] = 1;
          }
        }
        setUnreadCounts((prevCounts: any) => {
          const prevKeys = Object.keys(prevCounts).sort().join();
          const nextKeys = Object.keys(next).sort().join();
          if (prevKeys !== nextKeys) return next;
          for (const k of Object.keys(next)) {
            if (prevCounts[k] !== next[k]) return next;
          }
          return prevCounts;
        });
      } catch {
        // ignore
      }
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [selectedChatId, session?.user?.id]);

  const fetchMessages = useCallback(
    async (chatId: string, silent?: boolean) => {
      if (!silent) setMessageLoading(true);
      try {
        const res = await fetch(`/api/chats/${chatId}/messages`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json() as Message[];
        if (silent) {
          setMessages((prev: any) => {
            if (prev.length !== data.length) return data;
            if (data.length === 0) return prev;
            if (prev[0]?.id !== data[0]?.id || prev[prev.length - 1]?.id !== data[data.length - 1]?.id)
              return data;
            return prev;
          });
        } else {
          setMessages(data);
        }
      } catch {
        if (!silent) setMessages([]);
      } finally {
        if (!silent) setMessageLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // 채팅 목록 폴링 (새 메시지 알림)
  useEffect(() => {
    const t = setInterval(() => {
      fetchChats();
    }, 5000);
    return () => clearInterval(t);
  }, [fetchChats]);

  useEffect(() => {
    if (selectedChatId) {
      fetchMessages(selectedChatId);
      setUnreadCounts((counts: any) => {
        const next = { ...counts };
        delete next[selectedChatId];
        return next;
      });
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(CHAT_READ_KEY + selectedChatId, new Date().toISOString());
        window.dispatchEvent(new Event("chat-read"));
      }
    } else setMessages([]);
  }, [selectedChatId, fetchMessages]);

  // 선택된 채팅 메시지 폴링(대화창에 새 메시지 반영, 로딩 표시 없이 백그라운드 갱신)
  useEffect(() => {
    if (!selectedChatId) return;
    const t = setInterval(() => {
      fetchMessages(selectedChatId, true);
    }, 2000);
    return () => clearInterval(t);
  }, [selectedChatId, fetchMessages]);

  useEffect(() => {
    if (modalOpen) {
      fetch("/api/users/list")
        .then((r: any) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => setUsers([]));
      setSelectedUserIds([]);
      setGroupName("");
    }
  }, [modalOpen]);

  useEffect(() => {
    if (scheduleModalOpen) {
      fetch("/api/schedules")
        .then((r: any) => (r.ok ? r.json() : []))
        .then(setSchedules)
        .catch(() => setSchedules([]));
    }
  }, [scheduleModalOpen]);

  useEffect(() => {
    if (mentionOpen && users.length === 0) {
      fetch("/api/users/list")
        .then((r: any) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [mentionOpen, users.length]);

  const handleCreateChat = async () => {
    if (selectedUserIds.length === 0) {
      toast.error("대화 상대를 선택하세요.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selectedUserIds,
          isGroup: selectedUserIds.length > 1,
          name: selectedUserIds.length > 1 ? groupName.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      setModalOpen(false);
      fetchChats();
      setSelectedChatId(data.id);
      setMessages([]);
      fetchMessages(data.id);
      toast.success("대화가 시작되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!selectedChatId || !newMessage.trim() || !session?.user) return;
    const body = newMessage.trim();
    setNewMessage("");
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      body,
      createdAt: new Date().toISOString(),
      user: {
        id: session.user.id!,
        name: session.user.name ?? session.user.email ?? "",
        position: (session.user as { position?: string | null }).position ?? undefined,
      },
    };
    setMessages((prev: any) => [...prev, optimisticMessage]);
    requestAnimationFrame(() => scrollToBottom());
    setSending(true);
    setTimeout(() => messageInputRef.current?.focus(), 0);
    try {
      const res = await fetch(`/api/chats/${selectedChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "전송 실패");
      setMessages((prev: any) =>
        prev.map((m: any) => (m.id === optimisticId ? data : m))
      );
      fetchChats();
    } catch (e) {
      setMessages((prev: any) => prev.filter((m: any) => m.id !== optimisticId));
      toast.error(e instanceof Error ? e.message : "전송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = useCallback(
    async (chatId: string, messageId: string) => {
      try {
        const res = await fetch(`/api/chats/${chatId}/messages/${messageId}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "삭제 실패");
        setMessages((prev: any) =>
          prev.map((m: any) => (m.id === messageId ? { ...m, isDeleted: true } : m))
        );
        fetchChats();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      }
    },
    [fetchChats]
  );

  const insertAtCursor = useCallback((text: string) => {
    const el = messageInputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = newMessage.slice(0, start);
    const after = newMessage.slice(end);
    const next = before + text + after;
    setNewMessage(next);
    setMentionOpen(false);
    setTimeout(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }, [newMessage]);

  const insertMention = useCallback((name: string) => {
    const el = messageInputRef.current;
    if (!el) return;
    const start = mentionStartPosRef.current;
    const end = el.selectionEnd;
    const before = newMessage.slice(0, start);
    const after = newMessage.slice(end);
    const text = `@${name} `;
    const next = before + text + after;
    setNewMessage(next);
    setMentionOpen(false);
    setTimeout(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }, [newMessage]);

  const uploadFileAndAppend = useCallback(async (file: File) => {
    if (!session?.user) return;
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(file.name);
    const allowed =
      isImage ||
      ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"].includes(file.type);
    if (!allowed) {
      toast.error("지원 형식: 이미지(JPEG/PNG/GIF/WebP), PDF, 문서, 텍스트");
      return;
    }
    setPasteUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");
      const url = data.url as string;
      const name = (data.name as string) || file.name;
      const append = isImage ? `\n![](${url})` : `\n[${name}](${url})`;
      setNewMessage((prev: any) => prev + append);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setPasteUploading(false);
    }
  }, [session?.user]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (!files?.length || !session?.user) return;
    const file = files[0];
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(file.name);
    const allowed =
      isImage ||
      ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"].includes(file.type);
    if (!allowed) return;
    e.preventDefault();
    uploadFileAndAppend(file);
  }, [session?.user, uploadFileAndAppend]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFileAndAppend(file);
      e.target.value = "";
    },
    [uploadFileAndAppend]
  );

  const selectedChat = chats.find((c: any) => c.id === selectedChatId);
  const mentionCandidates = (() => {
    const participants = selectedChat?.participants ?? [];
    const all = [...participants];
    const myId = session?.user?.id;
    const rest = users.filter((u: any) => !all.some((p: any) => p.id === u.id));
    all.push(...rest.map((p: any) => ({ id: p.id, name: p.name, position: p.position ?? null })));
    const uniq = all.filter((p, i) => all.findIndex((x: any) => x.id === p.id) === i && p.id !== myId);
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return uniq.slice(0, 8);
    return uniq.filter((p: any) => p.name.toLowerCase().includes(q)).slice(0, 8);
  })();
  const isParticipant = Boolean(
    selectedChat && session?.user?.id && selectedChat.participants.some((p: any) => p.id === session.user.id)
  );
  const chatTitle = selectedChat
    ? selectedChat.isGroup && selectedChat.name
      ? selectedChat.name
      : selectedChat.participants.map((p: any) => formatUserName(p)).join(", ")
    : "";

  const chatSearchTrim = chatSearch.trim().toLowerCase();
  const filteredChats =
    !chatSearchTrim
      ? chats
      : chats.filter((c: any) => {
          const nameMatch = Boolean(c.isGroup && c.name && c.name.toLowerCase().includes(chatSearchTrim));
          const participantMatch = c.participants.some((p: any) => formatUserName(p).toLowerCase().includes(chatSearchTrim));
          return nameMatch || participantMatch;
        });

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeadline title="채팅" />
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 size-4" />
          새 대화
        </Button>
      </div>

      <div className="grid flex-1 gap-4 overflow-hidden sm:grid-cols-[280px_1fr]">
        <Card className="flex flex-col overflow-hidden">
          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            {!loading && (
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
                  <Input
                    placeholder="대화 검색 (이름, 그룹명)"
                    value={chatSearch}
                    onChange={(e: any) => setChatSearch(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="text-muted-foreground p-4 text-center text-sm">불러오는 중...</p>
              ) : chats.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-sm">
                  대화가 없습니다. 새 대화를 시작하세요.
                </p>
              ) : filteredChats.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-sm">
                  검색 결과가 없습니다.
                </p>
              ) : (
                <ul className="divide-y">
                  {filteredChats.map((chat: any) => (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedChatId(chat.id)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        selectedChatId === chat.id ? "bg-muted" : ""
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 font-medium">
                        <span className="truncate">
                          {chat.isGroup && chat.name
                            ? chat.name
                            : chat.participants.map((p: any) => formatUserName(p)).join(", ")}
                        </span>
                        {(unreadCounts[chat.id] ?? 0) > 0 && (
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground"
                            aria-label={`미읽음 ${unreadCounts[chat.id]}건`}
                          >
                            {unreadCounts[chat.id] > 99 ? "99+" : unreadCounts[chat.id]}
                          </span>
                        )}
                      </span>
                      {chat.lastMessage && (
                        <span className="text-muted-foreground truncate text-xs">
                          {formatUserName(chat.lastMessage.user)}: {chat.lastMessage.body}
                        </span>
                      )}
                    </button>
                  </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!selectedChatId ? (
            <CardContent className="flex flex-1 items-center justify-center text-muted-foreground">
              왼쪽에서 대화를 선택하거나 새 대화를 시작하세요.
            </CardContent>
          ) : (
            <>
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="font-medium">{chatTitle}</span>
                {!isParticipant && (
                  <span className="text-muted-foreground rounded bg-muted px-2 py-0.5 text-xs">
                    관리자 보기 전용
                  </span>
                )}
              </div>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
                {messageLoading ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    메시지를 불러오는 중...
                  </p>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">
                    {messages.map((m: any) => {
                      const isMine = session?.user?.id === m.user.id;
                      const canDelete =
                        isMine &&
                        !m.isDeleted &&
                        Date.now() - new Date(m.createdAt).getTime() < DELETE_ALLOWED_MS;
                      return (
                        <div
                          key={m.id}
                          className="group flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-muted-foreground text-xs">{formatUserName(m.user)}</span>
                            {canDelete && selectedChatId && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 opacity-70 hover:opacity-100"
                                title="메시지 삭제 (10분 이내)"
                                onClick={() => handleDeleteMessage(selectedChatId, m.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                          {m.isDeleted ? (
                            <p className="text-muted-foreground italic text-sm">🚫 삭제된 메시지입니다</p>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {m.body
                                .split(/(!\[[^\]]*\]\([^)]+\)|https?:\/\/[^\s]+)/g)
                                .filter(Boolean)
                                .map((part: any, i: any) => {
                                  const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
                                  if (imgMatch) {
                                    const src = imgMatch[2];
                                    return (
                                      <span key={i} className="mt-1 block">
                                        <img
                                          src={src}
                                          alt={imgMatch[1] || "이미지"}
                                          className="max-h-64 max-w-full rounded object-contain"
                                        />
                                      </span>
                                    );
                                  }
                                  if (part.match(/^https?:\/\//)) {
                                    return (
                                      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                        {part}
                                      </a>
                                    );
                                  }
                                  return part;
                                })}
                            </p>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(m.createdAt), "MM/dd HH:mm", { locale: ko })}
                          </span>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} aria-hidden />
                  </div>
                )}
                {isParticipant ? (
                  <div className="relative flex gap-2 pt-2">
                    <div className="relative flex-1">
                      <Textarea
                        ref={messageInputRef}
                        placeholder="메시지 입력... (Enter 전송, Shift+Enter 줄바꿈, @멘션, 📅 일정, Ctrl+V 이미지·파일)"
                        value={newMessage}
                        rows={1}
                        className="min-h-10 max-h-32 resize-none py-2 pr-8"
                        onChange={(e: any) => {
                          const el = e.target;
                          const val = el.value;
                          const pos = el.selectionStart;
                          setNewMessage(val);
                          if (val[pos - 1] === "@") {
                            mentionStartPosRef.current = pos - 1;
                            setMentionOpen(true);
                            setMentionQuery("");
                            setMentionSelectedIndex(0);
                          } else if (mentionOpen) {
                            const start = mentionStartPosRef.current;
                            setMentionQuery(val.slice(start + 1, pos));
                            if (pos <= start || !val.slice(start).startsWith("@")) setMentionOpen(false);
                          }
                        }}
                        onKeyDown={(e: any) => {
                          if (mentionOpen && mentionCandidates.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setMentionSelectedIndex((i: any) => Math.min(i + 1, mentionCandidates.length - 1));
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setMentionSelectedIndex((i: any) => Math.max(i - 1, 0));
                              return;
                            }
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              const u = mentionCandidates[mentionSelectedIndex];
                              if (u) insertMention(u.name);
                              return;
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setMentionOpen(false);
                              return;
                            }
                          }
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        onPaste={handlePaste}
                      />
                      {pasteUploading && (
                        <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                          업로드 중...
                        </span>
                      )}
                    </div>
                    {mentionOpen && mentionCandidates.length > 0 && (
                      <div className="absolute bottom-full left-0 z-10 mb-1 max-h-48 w-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                        {mentionCandidates.map((u, i) => (
                          <button
                            key={u.id}
                            type="button"
                            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${i === mentionSelectedIndex ? "bg-accent" : "hover:bg-muted/50"}`}
                            onMouseDown={(e: any) => {
                              e.preventDefault();
                              insertMention(u.name);
                            }}
                          >
                            @{formatUserName(u)}
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp,application/pdf,.pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="이미지·파일 첨부"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending || pasteUploading}
                    >
                      <ImagePlus className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="일정 공유"
                      onClick={() => setScheduleModalOpen(true)}
                      disabled={sending}
                    >
                      <Calendar className="size-4" />
                    </Button>
                    <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()}>
                      <Send className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground border-t pt-2 text-center text-xs">
                    이 대화에는 참여하지 않았습니다. 메시지 보기만 가능합니다.
                  </p>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>일정 공유</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {schedules.length === 0 && <p className="text-muted-foreground py-2 text-center text-sm">일정이 없습니다.</p>}
            {schedules.map((s: any) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full flex-col items-start rounded-lg border p-2 text-left hover:bg-muted/50"
                onMouseDown={(e: any) => {
                  e.preventDefault();
                  const start = format(new Date(s.startTime), "yyyy-MM-dd HH:mm", { locale: ko });
                  const end = format(new Date(s.endTime), "HH:mm", { locale: ko });
                  const line = `\n📅 [${s.title}] ${start}~${end}\n/schedule`;
                  setNewMessage((prev: any) => prev + line);
                  setScheduleModalOpen(false);
                  setTimeout(() => messageInputRef.current?.focus(), 0);
                }}
              >
                <span className="font-medium">{s.title}</span>
                <span className="text-muted-foreground text-xs">
                  {format(new Date(s.startTime), "MM/dd HH:mm", { locale: ko })} ~ {format(new Date(s.endTime), "HH:mm", { locale: ko })}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 대화</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>대화 상대 선택</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-2">
                {users.map((u: any) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedUserIds.includes(u.id)}
                      onCheckedChange={(checked: any) =>
                        setSelectedUserIds((prev: any) =>
                          checked ? [...prev, u.id] : prev.filter((id: any) => id !== u.id)
                        )
                      }
                    />
                    <span>
                      {formatUserName(u)}
                      {u.department ? ` · ${u.department}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {selectedUserIds.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="group-name">그룹 이름 (선택)</Label>
                <Input
                  id="group-name"
                  value={groupName}
                  onChange={(e: any) => setGroupName(e.target.value)}
                  placeholder="그룹 채팅 이름"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCreateChat} disabled={creating || selectedUserIds.length === 0}>
              {creating ? "생성 중..." : "대화 시작"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
