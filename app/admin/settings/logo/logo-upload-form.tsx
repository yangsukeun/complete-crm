"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, Upload, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import NextImage from "next/image";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function LogoUploadForm() {
  const [currentLogoUrl, setCurrentLogoUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchLogo = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/logo");
      const data = res.ok ? await res.json() : { logoUrl: null };
      setCurrentLogoUrl(data.logoUrl ?? null);
    } catch {
      setCurrentLogoUrl(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogo();
  }, [fetchLogo]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      toast.error("JPEG, PNG, GIF, WebP, SVG 이미지만 사용할 수 있습니다.");
      setSelectedFile(null);
      return;
    }
    if (selectedFile.size > MAX_SIZE) {
      toast.error("파일 크기는 2MB 이하여야 합니다.");
      setSelectedFile(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleSave = async () => {
    if (!selectedFile) {
      toast.error("변경할 이미지를 선택하세요.");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("logo", selectedFile);
      const res = await fetch("/api/settings/logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "로고 저장에 실패했습니다.");
        return;
      }
      toast.success("로고가 저장되었습니다.");
      setSelectedFile(null);
      setPreviewUrl(null);
      await fetchLogo();
      window.dispatchEvent(new CustomEvent("logo-updated"));
    } catch {
      toast.error("로고 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const displayUrl = previewUrl ?? currentLogoUrl;

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
        로고 정보를 불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 미리보기 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-3 text-sm font-medium text-gray-700">미리보기</h3>
        <div className="flex min-h-[80px] items-center justify-center rounded-lg bg-gray-50 p-4">
          {displayUrl ? (
            <NextImage
              src={displayUrl}
              alt="로고 미리보기"
              width={256}
              height={64}
              unoptimized
              className="max-h-16 w-auto max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon className="size-10" />
              <span className="text-sm">설정된 로고가 없습니다. 기본 텍스트(COMPLETE CRM)가 표시됩니다.</span>
            </div>
          )}
        </div>
      </div>

      {/* 파일 업로드 (드래그 앤 드롭) */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="mb-3 text-sm font-medium text-gray-700">새 로고 업로드</h3>
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors",
            dragOver
              ? "border-indigo-400 bg-indigo-50/50"
              : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50"
          )}
        >
          <input
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            onChange={handleFileChange}
            className="sr-only"
          />
          <Upload className="size-8 text-gray-400" />
          <span className="text-center text-sm text-gray-600">
            이미지를 드래그하여 놓거나, 클릭하여 선택하세요.
          </span>
          <span className="text-xs text-gray-400">JPEG, PNG, GIF, WebP, SVG · 최대 2MB</span>
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!selectedFile || saving}>
          <Save className="mr-2 size-4" />
          {saving ? "저장 중…" : "저장하기"}
        </Button>
      </div>
    </div>
  );
}
