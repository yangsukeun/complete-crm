"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MessageCircle, Mail, CalendarDays, Loader2 } from "lucide-react";

type User = { id: string; name: string; email: string; department: string | null; position: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AIRequestToEmployeeModal({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [action, setAction] = useState<"chat" | "email" | "schedule">("chat");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedUserId("");
      setAction("chat");
      setMessage("");
      fetch("/api/users/list")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: User[]) => setUsers(Array.isArray(list) ? list : []))
        .catch(() => setUsers([]));
    }
  }, [open]);

  const selectedUser = users.find((u: any) => u?.id === selectedUserId);

  const handleSendChat = async () => {
    if (!selectedUserId || !message.trim()) {
      toast.error("직원을 선택하고 메시지를 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const createRes = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [selectedUserId] }),
      });
      const chatData = await createRes.json();
      if (!createRes.ok) throw new Error(chatData.error ?? "채팅방 생성 실패");
      const chatId = chatData.id;

      const msgRes = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message.trim() }),
      });
      if (!msgRes.ok) {
        const err = await msgRes.json().catch(() => ({}));
        throw new Error(err.error ?? "메시지 전송 실패");
      }
      toast.success("채팅 메시지를 보냈습니다.");
      onOpenChange(false);
      router.push(`/chat`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "전송에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEmail = () => {
    if (!selectedUser?.email) {
      toast.error("선택한 직원의 이메일이 없습니다.");
      return;
    }
    window.open(`mailto:${selectedUser?.email ?? ""}`, "_blank");
    onOpenChange(false);
  };

  const handleScheduleShare = () => {
    if (!selectedUserId) {
      toast.error("직원을 선택하세요.");
      return;
    }
    onOpenChange(false);
    router.push(`/schedule?openCreate=1&inviteUserId=${encodeURIComponent(selectedUserId)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>직원에게 요청</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>직원 선택</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="직원을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u: any) => (
                  <SelectItem key={u?.id ?? ""} value={u?.id ?? ""}>
                    {u?.name ?? ""}
                    {u?.position ? ` · ${u.position}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>요청 유형</Label>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant={action === "chat" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("chat")}
              >
                <MessageCircle className="mr-1.5 size-4" />
                채팅
              </Button>
              <Button
                type="button"
                variant={action === "email" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("email")}
              >
                <Mail className="mr-1.5 size-4" />
                이메일
              </Button>
              <Button
                type="button"
                variant={action === "schedule" ? "default" : "outline"}
                size="sm"
                onClick={() => setAction("schedule")}
              >
                <CalendarDays className="mr-1.5 size-4" />
                스케줄 공유
              </Button>
            </div>
          </div>

          {action === "chat" && (
            <div className="space-y-2">
              <Label htmlFor="req-msg">메시지</Label>
              <Textarea
                id="req-msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="보낼 메시지를 입력하세요"
                rows={3}
                className="resize-none"
              />
            </div>
          )}
          {action === "email" && selectedUser?.email && (
            <p className="text-sm text-muted-foreground">
              <strong>{selectedUser?.name ?? ""}</strong>님에게 이메일 앱으로 보내기: {selectedUser?.email ?? ""}
            </p>
          )}
          {action === "schedule" && selectedUser && (
            <p className="text-sm text-muted-foreground">
              <strong>{selectedUser?.name ?? ""}</strong>님을 초대할 새 일정을 만듭니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          {action === "chat" && (
            <Button onClick={handleSendChat} disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              채팅 보내기
            </Button>
          )}
          {action === "email" && (
            <Button onClick={handleOpenEmail} disabled={!selectedUser?.email}>
              <Mail className="mr-2 size-4" />
              이메일 앱으로 열기
            </Button>
          )}
          {action === "schedule" && (
            <Button onClick={handleScheduleShare} disabled={!selectedUserId}>
              <CalendarDays className="mr-2 size-4" />
              일정 만들기 및 공유
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
