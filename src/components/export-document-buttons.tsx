"use client";

import { useState } from "react";
import { FileDown, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadContentAsPdf, downloadContentAsPptx } from "@/lib/export/document-download";
import { toast } from "sonner";

type Props = {
  title: string;
  bodyPlain: string;
  fileBase: string;
  /** 버튼 크기·스타일만 조정 */
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost";
};

export function ExportDocumentButtons({ title, bodyPlain, fileBase, size = "sm", variant = "outline" }: Props) {
  const [busy, setBusy] = useState<null | "pdf" | "pptx">(null);

  const run = async (kind: "pdf" | "pptx") => {
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadContentAsPdf({ title, body: bodyPlain, fileBase });
      else await downloadContentAsPptx({ title, body: bodyPlain, fileBase });
      toast.success(kind === "pdf" ? "PDF를 저장했습니다." : "PPTX를 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "파일 생성에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} disabled={busy !== null} className="gap-1.5">
          <FileDown className="size-4" />
          보내기
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={busy !== null} onClick={() => void run("pdf")}>
          <FileDown className="mr-2 size-4" />
          PDF 다운로드
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy !== null} onClick={() => void run("pptx")}>
          <Presentation className="mr-2 size-4" />
          PowerPoint (.pptx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
