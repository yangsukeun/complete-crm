"use client";

import { useCallback, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteMantineShell } from "@/components/blocknote-mantine-shell";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { postUploadFile } from "@/lib/upload-client-validate";

export type DocsEditorProps = {
  className?: string;
};

export function DocsEditor({ className }: DocsEditorProps) {
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const { url } = await postUploadFile(file);
    return url;
  }, []);

  const [title, setTitle] = useState("");
  const editor = useCreateBlockNote({ uploadFile });

  const handleSave = useCallback(() => {
    const blocks = editor.document;
    const payload = { title, blocks };
    console.log("[DocsEditor] Save payload:", payload);
  }, [title, editor]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 상단: 저장 버튼 (우측) */}
      <div className="flex justify-end pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSave}
          className="text-muted-foreground hover:text-foreground"
        >
          저장
        </Button>
      </div>

      {/* 제목: 테두리 없음, 큰 글씨 */}
      <input
        type="text"
        value={title}
        onChange={(e: any) => setTitle(e.target.value)}
        placeholder="제목 없음"
        className="mb-2 w-full resize-none border-0 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground md:text-4xl"
      />

      {/* 본문: BlockNote 에디터 */}
      <div className="min-h-[360px] rounded-lg bg-white text-gray-900 [&_.bn-editor]:min-h-[320px] [&_.bn-editor]:bg-white [&_.bn-mantine]:border-0 [&_.bn-mantine]:bg-transparent [&_.bn-block-outer]:gap-2">
        <BlockNoteMantineShell>
          <BlockNoteView editor={editor} theme="light" />
        </BlockNoteMantineShell>
      </div>
    </div>
  );
}
