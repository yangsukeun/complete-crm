import { DocsEditorDynamic } from "@/components/docs-editor-dynamic";

export const dynamic = "force-dynamic";

export default function DocsNewPage() {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* A4 용지처럼 중앙 정렬, max-w-[800px], 여백 */}
      <div className="mx-auto max-w-[800px] px-6 py-10 md:px-12 md:py-14">
        {/* 메모장 느낌: 하얀 작성 영역, 테두리 최소화 */}
        <div className="rounded-sm bg-white shadow-sm">
          <DocsEditorDynamic className="px-6 py-6 md:px-10 md:py-8" />
        </div>
      </div>
    </div>
  );
}
