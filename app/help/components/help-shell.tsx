"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { HelpSidebarContent } from "./help-sidebar";

export function HelpShell({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
        <Button type="button" variant="outline" size="icon" onClick={() => setMobileOpen(true)} aria-label="메뉴">
          <Menu className="size-5" />
        </Button>
        <span className="font-semibold text-sm">도움말 센터</span>
        <span className="w-10" />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(100vw-2rem,18rem)] p-4" ariaTitle="도움말 메뉴">
          <HelpSidebarContent isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="mx-auto flex max-w-6xl">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-muted/10 p-4 md:block lg:w-64">
          <HelpSidebarContent isAdmin={isAdmin} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
