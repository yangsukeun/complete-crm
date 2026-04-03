"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher, SWR_KEYS } from "@/lib/api-swr";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  getUploadClientRejectReason,
  postUploadFile,
  UPLOAD_ERROR_MESSAGE,
  UPLOAD_TOAST_DURATION_MS,
} from "@/lib/upload-client-validate";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, ClipboardList, ImagePlus, MessageCircle, Plus, Search, Send, Trash2 } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";
import Image from "next/image";
import Link from "next/link";
import { ChatMessagesSkeleton } from "@/components/detail/detail-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

type User = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position?: string | null;
  role?: string;
};
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
  isSystem?: boolean;
  user: { id: string; name: string; position?: string | null };
};

type DelegateParsed = {
  assigneeUserId: string | null;
  title: string;
  dueDate: string;
  confidence: number;
  assigneeName: string | null;
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

/** iframe/base 등으로 상대 경로가 어긋나는 경우 방지 (현재 탭 origin 고정) */
function apiUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

function parseChatMessagesResponse(json: unknown): {
  messages: Message[];
  readAtByUserId: Record<string, string | null>;
} {
  if (Array.isArray(json)) {
    return { messages: json as Message[], readAtByUserId: {} };
  }
  if (!json || typeof json !== "object") {
    return { messages: [], readAtByUserId: {} };
  }
  const o = json as { messages?: unknown; readAtByUserId?: unknown };
  const messages = Array.isArray(o.messages) ? (o.messages as Message[]) : [];
  const readAtByUserId =
    o.readAtByUserId && typeof o.readAtByUserId === "object" && !Array.isArray(o.readAtByUserId)
      ? (o.readAtByUserId as Record<string, string | null>)
      : {};
  return { messages, readAtByUserId };
}

/** 내 메시지가 채팅 참가자 모두(나 제외)의 lastReadAt 이후로 읽혔는지 */
function isMessageReadByPeers(
  message: Message,
  myId: string | undefined,
  readAtByUserId: Record<string, string | null>
): boolean {
  if (!myId || message.user.id !== myId || message.isDeleted) return false;
  const msgT = new Date(message.createdAt).getTime();
  if (Number.isNaN(msgT)) return false;
  const peers = Object.entries(readAtByUserId).filter(([uid]) => uid !== myId);
  if (peers.length === 0) return false;
  return peers.every(([, iso]) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= msgT;
  });
}

export function ChatPageClient({ initialChatId = null }: { initialChatId?: string | null }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [readAtByUserId, setReadAtByUserId] = useState<Record<string, string | null>>({});
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
  const chatsRef = useRef<ChatItem[]>([]);
  const pendingReadSyncSigRef = useRef("");
  const lastReadSyncOkSigRef = useRef("");

  const isExecutive =
    session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
  const [delegateTaskMode, setDelegateTaskMode] = useState(false);
  const [delegateModalOpen, setDelegateModalOpen] = useState(false);
  const [delegateParsed, setDelegateParsed] = useState<DelegateParsed | null>(null);
  const [delegatePendingText, setDelegatePendingText] = useState("");
  const [delegateConfirmLoading, setDelegateConfirmLoading] = useState(false);
  const [delegateForm, setDelegateForm] = useState({
    assigneeUserId: "",
    title: "",
    dueDate: "",
  });
  const [delegateModalUsers, setDelegateModalUsers] = useState<User[]>([]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const resolveUserFromChats = useCallback((list: ChatItem[], userId: string): Message["user"] => {
    for (const c of list) {
      const p = c.participants.find((x) => x.id === userId);
      if (p) return { id: p.id, name: p.name, position: p.position ?? null };
    }
    return { id: userId, name: "사용자", position: null };
  }, []);

  const {
    data: swrChatList,
    mutate: mutateChats,
    isLoading: swrChatsLoading,
  } = useSWR<ChatItem[]>(session?.user?.id ? SWR_KEYS.chatsList : null, jsonFetcher, {
    dedupingInterval: 8000,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (swrChatsLoading && swrChatList === undefined) return;
    if (!swrChatList) {
      setChats([]);
      setLoading(false);
      return;
    }
    const list = swrChatList;
    setChats((prev: ChatItem[]) => {
      if (prev.length !== list.length) return list;
      const same = list.every(
        (c, i) =>
          prev[i]?.id === c.id &&
          prev[i]?.lastMessage?.createdAt === c.lastMessage?.createdAt
      );
      return same ? prev : list;
    });
    setLoading(false);
  }, [swrChatList, swrChatsLoading]);

  useEffect(() => {
    if (!swrChatList || !session?.user?.id) return;
    const myId = session.user.id;
    try {
      const next: Record<string, number> = {};
      for (const c of swrChatList) {
        if (!c.lastMessage || c.lastMessage.user?.id === myId) continue;
        const readAt =
          typeof localStorage !== "undefined" ? localStorage.getItem(CHAT_READ_KEY + c.id) : null;
        const isUnread = !readAt || new Date(c.lastMessage.createdAt) > new Date(readAt);
        if (isUnread && c.id !== selectedChatId) {
          next[c.id] = 1;
        }
      }
      setUnreadCounts((prevCounts: Record<string, number>) => {
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
  }, [swrChatList, selectedChatId, session?.user?.id]);

  useEffect(() => {
    if (swrChatsLoading && swrChatList === undefined) return;
    if (!swrChatList || !session?.user?.id) return;
    const myId = session.user.id;

    try {
      const toSync: string[] = [];
      for (const c of swrChatList) {
        if (!c.lastMessage || c.lastMessage.user?.id === myId) continue;
        const readAt =
          typeof localStorage !== "undefined" ? localStorage.getItem(CHAT_READ_KEY + c.id) : null;
        if (readAt && new Date(readAt) >= new Date(c.lastMessage.createdAt)) {
          toSync.push(c.id);
        }
      }
      if (toSync.length === 0) return;
      const sig = [...toSync].sort().join("|");
      if (sig === lastReadSyncOkSigRef.current || sig === pendingReadSyncSigRef.current) return;

      pendingReadSyncSigRef.current = sig;
      void fetch(apiUrl("/api/chats/read-sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chatIds: toSync }),
      })
        .then((res) => {
          if (res.ok) lastReadSyncOkSigRef.current = sig;
        })
        .finally(() => {
          if (pendingReadSyncSigRef.current === sig) pendingReadSyncSigRef.current = "";
        });
    } catch {
      pendingReadSyncSigRef.current = "";
    }
  }, [swrChatList, swrChatsLoading, session?.user?.id]);

  const fetchMessages = useCallback(
    async (chatId: string, silent?: boolean, sinceIso?: string | null) => {
      if (!silent) setMessageLoading(true);
      try {
        const url = sinceIso
          ? apiUrl(`/api/chats/${chatId}/messages?since=${encodeURIComponent(sinceIso)}`)
          : apiUrl(`/api/chats/${chatId}/messages?limit=50&markRead=1`);
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        const raw = await res.json();
        const { messages: list, readAtByUserId: readMap } = parseChatMessagesResponse(raw);
        if (Object.keys(readMap).length > 0) {
          setReadAtByUserId(readMap);
        }
        if (silent && sinceIso) {
          if (list.length === 0) return;
          setMessages((prev: Message[]) => {
            const existingIds = new Set(prev.map((m: Message) => m.id));
            const toAdd = list.filter((m: Message) => !existingIds.has(m.id));
            if (toAdd.length === 0) return prev;
            return [...prev, ...toAdd];
          });
        } else if (silent) {
          setMessages((prev: Message[]) => {
            if (prev.length !== list.length) return list;
            if (list.length === 0) return prev;
            if (prev[0]?.id !== list[0]?.id || prev[prev.length - 1]?.id !== list[list.length - 1]?.id)
              return list;
            return prev;
          });
        } else {
          setMessages(list);
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
    let debounceT: ReturnType<typeof setTimeout> | null = null;
    const onInbox = () => {
      if (debounceT) clearTimeout(debounceT);
      debounceT = setTimeout(() => {
        debounceT = null;
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          void mutateChats();
        }
      }, 320);
    };
    window.addEventListener("chat-inbox-refresh", onInbox);
    return () => {
      window.removeEventListener("chat-inbox-refresh", onInbox);
      if (debounceT) clearTimeout(debounceT);
    };
  }, [mutateChats]);

  useEffect(() => {
    const onRt = (ev: Event) => {
      const ce = ev as CustomEvent<{
        chatId: string;
        payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> };
      }>;
      const chatId = ce.detail?.chatId;
      const payload = ce.detail?.payload;
      if (!chatId || chatId !== selectedChatId || !payload) return;
      if (payload.eventType === "INSERT" && payload.new) {
        const row = payload.new as {
          id: string;
          body: string;
          userId: string;
          createdAt: string;
          isDeleted?: boolean;
        };
        setMessages((prev: Message[]) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          const user = resolveUserFromChats(chatsRef.current, row.userId);
          const createdAt =
            typeof row.createdAt === "string" ? row.createdAt : new Date(row.createdAt).toISOString();
          return [
            ...prev,
            { id: row.id, body: row.body, createdAt, isDeleted: row.isDeleted, user },
          ];
        });
      }
      if (payload.eventType === "UPDATE" && payload.new) {
        const row = payload.new as { id: string; body?: string; isDeleted?: boolean };
        setMessages((prev: Message[]) =>
          prev.map((m) =>
            m.id === row.id
              ? { ...m, body: row.body ?? m.body, isDeleted: row.isDeleted ?? m.isDeleted }
              : m
          )
        );
      }
    };
    window.addEventListener("chat-realtime", onRt as EventListener);
    return () => window.removeEventListener("chat-realtime", onRt as EventListener);
  }, [selectedChatId, resolveUserFromChats]);

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
      /* 읽음·readAt는 GET ?markRead=1 에서 처리 */
    } else {
      setMessages([]);
      setReadAtByUserId({});
    }
  }, [selectedChatId, fetchMessages]);

  useEffect(() => {
    if (!selectedChatId) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetch(apiUrl(`/api/chats/${selectedChatId}/messages?readMeta=1`), {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((raw) => {
          if (!raw) return;
          const { readAtByUserId: m } = parseChatMessagesResponse(raw);
          if (Object.keys(m).length > 0) setReadAtByUserId(m);
        })
        .catch(() => {});
    };
    const id = window.setInterval(tick, 24_000);
    return () => window.clearInterval(id);
  }, [selectedChatId]);

  useEffect(() => {
    if (modalOpen) {
      fetch(apiUrl("/api/users/list"), { credentials: "include" })
        .then((r: any) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => setUsers([]));
      setSelectedUserIds([]);
      setGroupName("");
    }
  }, [modalOpen]);

  useEffect(() => {
    if (scheduleModalOpen) {
      fetch(apiUrl("/api/schedules"), { credentials: "include" })
        .then((r: any) => (r.ok ? r.json() : []))
        .then(setSchedules)
        .catch(() => setSchedules([]));
    }
  }, [scheduleModalOpen]);

  useEffect(() => {
    if (delegateModalOpen) {
      fetch(apiUrl("/api/users/list"), { credentials: "include" })
        .then((r: any) => (r.ok ? r.json() : []))
        .then((list: User[]) =>
          setDelegateModalUsers(
            list.filter((u) => u.role === "USER" || u.role === "TEAM_LEAD")
          )
        )
        .catch(() => setDelegateModalUsers([]));
    }
  }, [delegateModalOpen]);

  useEffect(() => {
    if (mentionOpen && users.length === 0) {
      fetch(apiUrl("/api/users/list"), { credentials: "include" })
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
      const res = await fetch(apiUrl("/api/chats"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userIds: selectedUserIds,
          isGroup: selectedUserIds.length > 1,
          name: selectedUserIds.length > 1 ? groupName.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");
      setModalOpen(false);
      void mutateChats();
      toast.success("대화가 시작되었습니다.");
      router.push(`/chat/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const postChatAndAppendSystem = useCallback(
    async (userMessageBody: string, systemLine: string) => {
      if (!selectedChatId || !session?.user) return;
      const optimisticId = `temp-${Date.now()}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        body: userMessageBody,
        createdAt: new Date().toISOString(),
        user: {
          id: session.user.id!,
          name: session.user.name ?? session.user.email ?? "",
          position: (session.user as { position?: string | null }).position ?? undefined,
        },
      };
      setMessages((prev: Message[]) => [...prev, optimisticMessage]);
      requestAnimationFrame(() => scrollToBottom());
      try {
        const res = await fetch(apiUrl(`/api/chats/${selectedChatId}/messages`), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace": "TEAM",
          },
          credentials: "include",
          body: JSON.stringify({ body: userMessageBody }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "전송 실패");
        setMessages((prev: Message[]) =>
          prev.map((m: Message) => (m.id === optimisticId ? data : m))
        );
        const sys: Message = {
          id: `sys-${Date.now()}`,
          body: systemLine,
          createdAt: new Date().toISOString(),
          isSystem: true,
          user: { id: "__system__", name: "시스템", position: null },
        };
        setMessages((prev: Message[]) => [...prev, sys]);
        void mutateChats();
      } catch (e) {
        setMessages((prev: Message[]) => prev.filter((m: Message) => m.id !== optimisticId));
        throw e;
      }
    },
    [selectedChatId, session?.user, mutateChats, scrollToBottom]
  );

  const handleDelegateConfirm = async () => {
    if (!delegateForm.assigneeUserId || !delegateForm.title.trim() || !delegateForm.dueDate) {
      toast.error("담당자·프로젝트 제목·마감일을 확인하세요.");
      return;
    }
    setDelegateConfirmLoading(true);
    try {
      const res = await fetch(apiUrl("/api/ai/delegate-task"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace": "TEAM",
        },
        credentials: "include",
        body: JSON.stringify({
          confirm: true,
          assigneeUserId: delegateForm.assigneeUserId,
          title: delegateForm.title.trim(),
          dueDate: delegateForm.dueDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      const assigneeName =
        (data.assigneeName as string) || data.task?.assignedTo?.name || "담당자";
      const taskTitle = data.task?.title as string;
      setDelegateModalOpen(false);
      setDelegateParsed(null);
      const line = `✅ ${assigneeName}님께 ${taskTitle} 프로젝트가 등록되었습니다`;
      await postChatAndAppendSystem(delegatePendingText, line);
      toast.success("프로젝트가 등록되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "프로젝트 등록에 실패했습니다.");
    } finally {
      setDelegateConfirmLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedChatId || !newMessage.trim() || !session?.user) return;
    const body = newMessage.trim();

    if (delegateTaskMode && isExecutive) {
      setSending(true);
      try {
        const res = await fetch(apiUrl("/api/ai/delegate-task"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace": "TEAM",
          },
          credentials: "include",
          body: JSON.stringify({ text: body }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "프로젝트 지시 처리 실패");

        if (data.needsConfirmation && data.parsed) {
          const p = data.parsed as DelegateParsed;
          setDelegateParsed(p);
          setDelegatePendingText(body);
          setDelegateForm({
            assigneeUserId: p.assigneeUserId ?? "",
            title: p.title,
            dueDate: p.dueDate,
          });
          setDelegateModalOpen(true);
          setNewMessage("");
          return;
        }

        if (data.created && data.task) {
          const assigneeName =
            (data.assigneeName as string) ||
            data.task.assignedTo?.name ||
            "담당자";
          const title = data.task.title as string;
          setNewMessage("");
          await postChatAndAppendSystem(
            body,
            `✅ ${assigneeName}님께 ${title} 프로젝트가 등록되었습니다`
          );
          toast.success("프로젝트가 등록되었습니다.");
          return;
        }

        throw new Error("응답 형식이 올바르지 않습니다.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "프로젝트 지시에 실패했습니다.");
      } finally {
        setSending(false);
      }
      return;
    }

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
      const res = await fetch(apiUrl(`/api/chats/${selectedChatId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "전송 실패");
      setMessages((prev: any) =>
        prev.map((m: any) => (m.id === optimisticId ? data : m))
      );
      void mutateChats();
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
        const res = await fetch(apiUrl(`/api/chats/${chatId}/messages/${messageId}`), {
          method: "DELETE",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "삭제 실패");
        setMessages((prev: any) =>
          prev.map((m: any) => (m.id === messageId ? { ...m, isDeleted: true } : m))
        );
        void mutateChats();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      }
    },
    [mutateChats]
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
    setPasteUploading(true);
    try {
      const { url, name } = await postUploadFile(file);
      const displayName = name || file.name;
      const append = isImage ? `\n![](${url})` : `\n[${displayName}](${url})`;
      setNewMessage((prev: any) => prev + append);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE.server, {
        duration: UPLOAD_TOAST_DURATION_MS,
      });
    } finally {
      setPasteUploading(false);
    }
  }, [session?.user]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (!files?.length || !session?.user) return;
    const file = files[0];
    const reject = getUploadClientRejectReason(file);
    if (reject) {
      e.preventDefault();
      toast.error(UPLOAD_ERROR_MESSAGE[reject], { duration: UPLOAD_TOAST_DURATION_MS });
      return;
    }
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

  const handleLeaveChat = async () => {
    if (!selectedChatId) return;
    if (!confirm("이 채팅방에서 나가시겠습니까?")) return;
    try {
      const res = await fetch(apiUrl(`/api/chats/${selectedChatId}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "나가기 실패");
      setChats((prev: any) => prev.filter((c: any) => c.id !== selectedChatId));
      setSelectedChatId(null);
      setMessages([]);
      router.push("/chat");
      toast.success("채팅방에서 나갔습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "채팅방 나가기에 실패했습니다.");
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeadline
          title="채팅"
          description="직원과 1:1 또는 그룹 대화를 나누고, 일정 초대·이미지 공유를 할 수 있습니다."
        />
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
                <div className="space-y-2 p-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-md border border-transparent px-2 py-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
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
                    <Link
                      href={`/chat/${chat.id}`}
                      prefetch={false}
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
                    </Link>
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
                <div className="flex items-center gap-2">
                  {!isParticipant && (
                    <span className="text-muted-foreground rounded bg-muted px-2 py-0.5 text-xs">
                      관리자 보기 전용
                    </span>
                  )}
                  {isParticipant && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleLeaveChat}
                    >
                      나가기
                    </Button>
                  )}
                </div>
              </div>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
                {messageLoading ? (
                  <ChatMessagesSkeleton />
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">
                    {messages.map((m: any) => {
                      if (m.isSystem || m.user?.id === "__system__") {
                        return (
                          <div key={m.id} className="flex justify-center px-2">
                            <div className="max-w-[min(520px,100%)] rounded-lg border border-dashed border-emerald-200 bg-emerald-50/80 px-3 py-2 text-center text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                              {m.body}
                            </div>
                          </div>
                        );
                      }
                      const isMine = session?.user?.id === m.user.id;
                      const canDelete =
                        isMine &&
                        !m.isDeleted &&
                        Date.now() - new Date(m.createdAt).getTime() < DELETE_ALLOWED_MS;
                      const showRead = isMessageReadByPeers(m, session?.user?.id, readAtByUserId);
                      const bubbleBody = m.isDeleted ? (
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
                                  <span key={i} className="relative mt-1 block max-h-64 max-w-full">
                                    <Image
                                      src={src}
                                      alt={imgMatch[1] || "이미지"}
                                      width={800}
                                      height={256}
                                      unoptimized
                                      className="max-h-64 max-w-full rounded object-contain"
                                    />
                                  </span>
                                );
                              }
                              if (part.match(/^https?:\/\//)) {
                                return (
                                  <a
                                    key={i}
                                    href={part}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline"
                                  >
                                    {part}
                                  </a>
                                );
                              }
                              return part;
                            })}
                        </p>
                      );
                      return (
                        <div
                          key={m.id}
                          className={`group flex w-full min-w-0 ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`flex max-w-[min(85%,520px)] min-w-0 flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}
                          >
                            {!isMine && (
                              <span className="text-muted-foreground px-0.5 text-xs font-medium">
                                {formatUserName(m.user)}
                              </span>
                            )}
                            <div
                              className={`relative w-full rounded-2xl border px-3 py-2 shadow-sm ${
                                isMine
                                  ? "rounded-tr-sm border-amber-300 bg-amber-100 text-foreground dark:border-amber-800 dark:bg-amber-950/55 dark:text-amber-50"
                                  : "rounded-tl-sm border-sky-300 bg-sky-100 text-foreground dark:border-sky-800 dark:bg-sky-950/55 dark:text-sky-50"
                              }`}
                            >
                              {canDelete && selectedChatId && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0.5 top-0.5 size-7 opacity-70 hover:opacity-100"
                                  title="메시지 삭제 (10분 이내)"
                                  onClick={() => handleDeleteMessage(selectedChatId, m.id)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                              {bubbleBody}
                              <div
                                className={`mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground ${isMine ? "justify-end" : "justify-start"}`}
                              >
                                <span>{formatKstDateTime(m.createdAt)}</span>
                                {isMine && showRead && !m.isDeleted && (
                                  <span className="text-primary font-medium dark:text-sky-300" title="상대가 읽음">
                                    읽음
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} aria-hidden />
                  </div>
                )}
                {isParticipant ? (
                  <div className="relative flex flex-wrap items-end gap-2 pt-2">
                    {isExecutive && (
                      <Button
                        type="button"
                        variant={delegateTaskMode ? "default" : "outline"}
                        size="sm"
                        className="shrink-0 gap-1"
                        title="켜면 전송 시 AI가 프로젝트를 등록합니다 (대표·관리자)"
                        onClick={() => setDelegateTaskMode((v: boolean) => !v)}
                      >
                        <ClipboardList className="size-4" />
                        프로젝트 지시
                      </Button>
                    )}
                    <div className="relative min-w-0 flex-1 basis-[200px]">
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

      <Dialog open={delegateModalOpen} onOpenChange={setDelegateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>프로젝트 지시 확인</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            AI 판단 신뢰도가 낮아 내용을 확인한 뒤 등록합니다. 담당자·제목·마감일을 수정할 수 있습니다.
          </p>
          {delegateParsed && (
            <p className="text-xs text-muted-foreground">
              신뢰도: {(delegateParsed.confidence * 100).toFixed(0)}%
            </p>
          )}
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>담당자</Label>
              <Select
                value={delegateForm.assigneeUserId || undefined}
                onValueChange={(v: string) =>
                  setDelegateForm((f: typeof delegateForm) => ({ ...f, assigneeUserId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="직원 선택" />
                </SelectTrigger>
                <SelectContent>
                  {delegateModalUsers.map((u: User) => (
                    <SelectItem key={u.id} value={u.id}>
                      {formatUserName(u)}
                      {u.department ? ` · ${u.department}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="delegate-title">프로젝트 제목</Label>
              <Input
                id="delegate-title"
                value={delegateForm.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDelegateForm((f: typeof delegateForm) => ({ ...f, title: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="delegate-due">마감일 (KST)</Label>
              <Input
                id="delegate-due"
                type="date"
                value={delegateForm.dueDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDelegateForm((f: typeof delegateForm) => ({ ...f, dueDate: e.target.value }))
                }
              />
            </div>
            {delegatePendingText && (
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <span className="font-medium">원문:</span> {delegatePendingText}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelegateModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleDelegateConfirm} disabled={delegateConfirmLoading}>
              {delegateConfirmLoading ? "등록 중..." : "프로젝트 등록"}
            </Button>
          </DialogFooter>
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

function formatKstDateTime(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
