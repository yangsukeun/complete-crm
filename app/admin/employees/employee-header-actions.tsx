"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, FileSpreadsheet, Download } from "lucide-react";

export function EmployeeHeaderActions() {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    failed: number;
    createdList: { email: string; name: string }[];
    errors: { row: number; email?: string; message: string }[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("엑셀 파일을 선택하세요.");
      return;
    }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      toast.error("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/users/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "업로드에 실패했습니다.");
      }
      setResult(data);
      if (data.created > 0) {
        toast.success(`${data.created}명 등록되었습니다.`);
        router.refresh();
      }
      if (data.failed > 0) {
        toast.warning(`${data.failed}건 실패했습니다.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/admin/employees/new">
        <Button>
          <UserPlus className="mr-2 size-4" />
          계정 생성
        </Button>
      </Link>
      <Button variant="outline" onClick={() => setUploadOpen(true)}>
        <FileSpreadsheet className="mr-2 size-4" />
        엑셀 업로드
      </Button>

      <Dialog open={uploadOpen} onOpenChange={(open) => !open && closeUpload()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>직원 정보 엑셀 업로드</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-muted-foreground text-sm">
              엑셀 파일로 직원 정보를 일괄 등록할 수 있습니다. 첫 번째 행은 헤더로 사용됩니다.
            </p>
            <a
              href="/api/users/import/template"
              download
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Download className="size-4" />
              템플릿 다운로드 (직원등록_템플릿.xlsx)
            </a>
            <div className="space-y-2">
              <p className="text-sm font-medium">필수 컬럼: 이메일, 비밀번호, 이름</p>
              <p className="text-muted-foreground text-xs">
                선택: 역할(USER/TEAM_LEAD), 연락처, 업무 연락처, 업무 이메일, 은행계좌번호, 주소지, 주민번호, 부서, 직책, 입사일(YYYY-MM-DD)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="text-sm file:mr-2 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">선택: {file.name}</p>
            )}
            {result && (
              <div className="space-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
                <p>
                  <span className="font-medium text-green-600">{result.created}명</span> 등록됨
                  {result.failed > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-amber-600">{result.failed}건</span> 실패
                    </>
                  )}
                </p>
                {result.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto text-xs">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <p key={i} className="text-amber-700">
                        {err.row}행 {err.email}: {err.message}
                      </p>
                    ))}
                    {result.errors.length > 10 && (
                      <p className="text-muted-foreground">외 {result.errors.length - 10}건</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUpload}>
              {result ? "닫기" : "취소"}
            </Button>
            {!result && (
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? "업로드 중..." : "업로드"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
