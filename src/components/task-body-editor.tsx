"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
// 한국어 로케일 임포트
import { ko } from "@blocknote/core/locales";
import {
  // Formatting Toolbar (플로팅 툴바)
  FormattingToolbar,
  FormattingToolbarController,
  // Side Menu
  SideMenu,
  SideMenuController,
  AddBlockButton,
  DragHandleButton,
} from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { taskBodySchema } from "@/lib/blocknote-youtube";
import { Badge } from "@/components/ui/badge";

const AUTO_SAVE_DEBOUNCE_MS = 1500;

// 한국어 사전 + 커스텀 플레이스홀더 오버라이드
const koreanDictionary = {
  ...ko,
  placeholders: {
    ...ko.placeholders,
    default: "내용을 입력하거나 '/'를 눌러 메뉴를 여세요",
    heading: "제목",
    bulletListItem: "목록 항목",
    numberedListItem: "목록 항목",
    checkListItem: "할 일",
  },
};

// 노션 스타일 사이드 메뉴 (드래그 핸들 + 블록 추가)
function NotionStyleSideMenu() {
  return (
    <SideMenu>
      <AddBlockButton key="addBlockButton" />
      <DragHandleButton key="dragHandleButton" />
    </SideMenu>
  );
}

type TaskBodyEditorProps = {
  taskId: string;
  initialDescription: string | null;
  onSaved: () => void;
  className?: string;
};

export function TaskBodyEditor({
  taskId,
  initialDescription,
  onSaved,
  className,
}: TaskBodyEditorProps) {
  // 파일 업로드 핸들러
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "업로드 실패");
    return data.url;
  }, []);

  // 한국어 사전 메모이제이션
  const dictionary = useMemo(() => koreanDictionary, []);

  // BlockNote 에디터 생성
  const editor = useCreateBlockNote({
    schema: taskBodySchema,
    uploadFile,
    // 한국어 로컬라이제이션
    dictionary,
    // 기본 설정
    defaultStyles: true,
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const loadedInitialRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // 초기 콘텐츠 로드
  useEffect(() => {
    if (!editor || loadedInitialRef.current) return;
    const raw = (initialDescription ?? "").trim();
    loadedInitialRef.current = true;
    if (!raw) return;
    try {
      const blocks = editor.tryParseMarkdownToBlocks(raw);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
      }
    } catch {
      // ignore parse/replace errors
    }
  }, [editor, initialDescription]);

  // 자동 저장
  const performSave = useCallback(async () => {
    if (!editor) return;
    setSaveStatus("saving");
    try {
      const markdown = editor.blocksToMarkdownLossy(editor.document);
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: markdown || null }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setSaveStatus("saved");
      onSavedRef.current();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      toast.error("본문 자동 저장에 실패했습니다.");
      setSaveStatus("idle");
    }
  }, [taskId, editor]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 변경 시 디바운스 저장
  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      performSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [performSave]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 헤더: 타이틀 + 저장 상태 */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-100 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">📝 본문</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
            자동저장
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saving" && (
            <span className="text-xs text-amber-600 animate-pulse flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              저장 중...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-green-500" />
              저장됨
            </span>
          )}
        </div>
      </div>

      {/* 에디터 영역 - 노션 스타일 + 플로팅 툴바 */}
      <div 
        className={cn(
          "notion-editor-wrapper",
          "min-h-[320px] rounded-lg relative",
          // 스태킹 컨텍스트 분리 - Sheet 내부에서도 툴바가 위에 표시되도록
          "isolate",
          // overflow 제거 - 툴바가 잘리지 않도록
          "overflow-visible",
          // 에디터 내부 스타일 오버라이드
          "[&_.bn-editor]:min-h-[280px]",
          "[&_.bn-editor]:px-3",
          "[&_.bn-editor]:py-4",
          "[&_.bn-editor]:overflow-visible",
          // 블록 스타일
          "[&_.bn-block-outer]:my-1",
          "[&_.bn-block-content]:leading-relaxed",
          // Mantine 컨테이너 스타일
          "[&_.bn-mantine]:border-0",
          "[&_.bn-mantine]:bg-transparent",
          "[&_.bn-mantine]:rounded-lg",
          "[&_.bn-mantine]:overflow-visible",
          "[&_.bn-container]:overflow-visible",
          // 텍스트 스타일
          "[&_.bn-inline-content]:text-[15px]",
          "[&_.bn-inline-content]:leading-[1.7]",
          "[&_h1_.bn-inline-content]:text-2xl",
          "[&_h1_.bn-inline-content]:font-bold",
          "[&_h2_.bn-inline-content]:text-xl",
          "[&_h2_.bn-inline-content]:font-semibold",
          "[&_h3_.bn-inline-content]:text-lg",
          "[&_h3_.bn-inline-content]:font-medium",
          // 코드 블록 스타일
          "[&_code]:bg-gray-100",
          "[&_code]:px-1.5",
          "[&_code]:py-0.5",
          "[&_code]:rounded",
          "[&_code]:text-sm",
          "[&_code]:font-mono",
          "[&_code]:text-violet-600",
          // 체크박스 스타일
          "[&_.bn-checkbox]:accent-violet-500"
        )}
        style={{ isolation: "isolate" }}
      >
        <BlockNoteView
          editor={editor}
          theme="light"
          onChange={handleChange}
          // 기본 툴바 비활성화 - 커스텀 플로팅 툴바 사용
          formattingToolbar={false}
          sideMenu={false}
          slashMenu={true}
        >
          {/* 플로팅 서식 툴바 - 텍스트 선택 시에만 표시 */}
          <FormattingToolbarController
            formattingToolbar={() => <FormattingToolbar />}
          />
          
          {/* 커스텀 사이드 메뉴 */}
          <SideMenuController sideMenu={NotionStyleSideMenu} />
        </BlockNoteView>
      </div>

      {/* 도움말 */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="font-medium text-gray-700">💡 사용법:</span>{" "}
          <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px] mx-0.5">텍스트 드래그</kbd> 서식 툴바 표시 | 
          <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px] mx-0.5">/</kbd> 블록 메뉴 | 
          <kbd className="px-1.5 py-0.5 bg-white rounded border text-[10px] mx-0.5">⋮⋮</kbd> 드래그로 블록 이동 |
          이미지/파일 드래그 또는 붙여넣기(Ctrl+V)
        </p>
      </div>
    </div>
  );
}
