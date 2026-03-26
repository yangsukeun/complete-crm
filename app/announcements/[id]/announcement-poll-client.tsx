"use client";

import { useState } from "react";
import { Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type PollOpt = { text: string; count: number };

export function AnnouncementPollClient({
  announcementId,
  pollOptions,
  initialMyVoteIndex,
}: {
  announcementId: string;
  pollOptions: PollOpt[];
  initialMyVoteIndex: number | null;
}) {
  const router = useRouter();
  const [myVoteIndex, setMyVoteIndex] = useState<number | null>(initialMyVoteIndex);
  const [voting, setVoting] = useState(false);

  const handleVote = async (optionIndex: number) => {
    setVoting(true);
    try {
      const res = await fetch(`/api/announcements/${announcementId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "투표 실패");
      toast.success("투표가 반영되었습니다.");
      setMyVoteIndex(optionIndex);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "투표에 실패했습니다.");
    } finally {
      setVoting(false);
    }
  };

  if (!pollOptions.length) return null;

  return (
    <div className="mt-6 space-y-2">
      <p className="flex items-center gap-1 text-muted-foreground text-sm font-medium">
        <Vote className="size-4" />
        투표
      </p>
      <div className="flex flex-wrap gap-2">
        {pollOptions.map((opt, idx) => (
          <Button
            key={idx}
            type="button"
            variant={myVoteIndex === idx ? "default" : "outline"}
            size="sm"
            onClick={() => handleVote(idx)}
            disabled={voting || myVoteIndex !== null}
            className="text-xs"
          >
            {opt.text} ({opt.count}표)
          </Button>
        ))}
      </div>
    </div>
  );
}
