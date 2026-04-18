"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpSearch } from "./help-search";

/** Cmd/Ctrl+K — 로그인 사용자 전역 도움말 검색 */
export function HelpGlobalSearchDialog() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (status !== "authenticated") return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status]);

  if (status !== "authenticated") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>도움말 검색</DialogTitle>
        </DialogHeader>
        <HelpSearch variant="modal" autoFocus onPick={() => setOpen(false)} />
        <p className="text-muted-foreground text-center text-xs">단축키: ⌘K / Ctrl+K</p>
      </DialogContent>
    </Dialog>
  );
}
