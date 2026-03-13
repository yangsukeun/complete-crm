"use client";

import { useState, useEffect, useCallback } from "react";
import { Folder, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FileEntry = {
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: string | null;
};

function getParentPath(p: string): string | null {
  const normalized = p.replace(/\//g, "\\").trim();
  if (!normalized || normalized === "\\") return null;
  if (/^[A-Za-z]:\\?$/i.test(normalized)) return null;
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= 1) return null;
  parts.pop();
  const joined = parts.join("\\");
  return /^[A-Za-z]:$/i.test(parts[0] ?? "") ? joined + "\\" : joined;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return i === 0 ? `${v} B` : `${v.toFixed(2)} ${units[i]}`;
}

function formatMtime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR");
  } catch {
    return "—";
  }
}

export default function DocumentsPage() {
  const [currentPath, setCurrentPath] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async (pathOrPreset: { path?: string; preset?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (pathOrPreset.preset) params.set("preset", pathOrPreset.preset);
      else if (pathOrPreset.path !== undefined) params.set("path", pathOrPreset.path);
      const res = await fetch(`/api/files?${params.toString()}`);
      const data = await res.json();
      if (data.path) setCurrentPath(data.path);
      setAddressInput(data.path ?? currentPath);
      setEntries(data.entries ?? []);
      setError(data.error ?? null);
    } catch (e) {
      setEntries([]);
      setError("목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList({ preset: "root" });
  }, []);

  useEffect(() => {
    setAddressInput(currentPath);
  }, [currentPath]);

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = addressInput.trim();
    if (!value) return;
    setCurrentPath(value);
    fetchList({ path: value });
  };

  const handlePreset = (preset: "documents" | "downloads" | "root") => {
    fetchList({ preset });
  };

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      const sep = currentPath.endsWith("\\") || currentPath.endsWith("/") ? "" : "\\";
      const next = `${currentPath}${sep}${entry.name}`;
      setCurrentPath(next);
      fetchList({ path: next });
    } else {
      alert(`다운로드 기능은 준비 중입니다: ${entry.name}`);
    }
  };

  const parentPath = getParentPath(currentPath);

  return (
    <main className="min-h-screen bg-[#0a0f1a] text-slate-100 flex flex-col">
      <div className="border-b border-slate-700/50 px-4 py-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-slate-100">문서</span>
          <span className="text-slate-500 text-sm">PC의 폴더·파일을 탐색합니다. 경로를 입력하거나 폴더를 클릭해 이동하세요.</span>
        </div>
        <form onSubmit={handleAddressSubmit} className="flex gap-2 items-center max-w-3xl">
          <span className="text-slate-500 text-sm shrink-0">경로</span>
          <Input
            value={addressInput}
            onChange={(e: any) => setAddressInput(e.target.value)}
            placeholder="C:\ 또는 경로 입력 후 Enter"
            className="flex-1 h-9 bg-slate-800/80 border-slate-600 text-slate-100 font-mono text-sm placeholder:text-slate-500 focus-visible:ring-cyan-500"
          />
          <Button type="submit" size="sm" className="bg-slate-700 hover:bg-slate-600 text-slate-200">
            이동
          </Button>
        </form>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-52 border-r border-slate-700/50 p-4 flex flex-col gap-2 shrink-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">즐겨찾기</p>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            onClick={() => handlePreset("documents")}
          >
            📁 내 문서
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            onClick={() => handlePreset("root")}
          >
            💾 C드라이브 (C:)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-slate-300 hover:text-slate-100 hover:bg-slate-800"
            onClick={() => handlePreset("downloads")}
          >
            ⬇️ 다운로드
          </Button>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 p-4">
          {error && (
            <p className="text-amber-400/90 text-sm mb-2" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="text-slate-500 text-sm">불러오는 중...</p>
          ) : (
            <div className="border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/50">
                    <th className="text-left py-2.5 px-3 text-slate-400 font-medium w-10" />
                    <th className="text-left py-2.5 px-3 text-slate-400 font-medium">이름</th>
                    <th className="text-left py-2.5 px-3 text-slate-400 font-medium w-24">크기</th>
                    <th className="text-left py-2.5 px-3 text-slate-400 font-medium w-40">수정한 날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {parentPath !== null && (
                    <tr
                      className="border-b border-slate-700/30 hover:bg-slate-800/60 cursor-pointer"
                      onClick={() => {
                        setCurrentPath(parentPath);
                        fetchList({ path: parentPath });
                      }}
                    >
                      <td className="py-2 px-3">
                        <Folder className="w-5 h-5 text-slate-500" />
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-300">.. (상위 폴더)</td>
                      <td className="py-2 px-3 text-slate-500">—</td>
                      <td className="py-2 px-3 text-slate-500">—</td>
                    </tr>
                  )}
                  {entries.map((entry: any) => (
                    <tr
                      key={entry.name}
                      className="border-b border-slate-700/30 last:border-0 hover:bg-slate-800/60 cursor-pointer"
                      onClick={() => handleEntryClick(entry)}
                    >
                      <td className="py-2 px-3">
                        {entry.isDirectory ? (
                          <Folder className="w-5 h-5 text-amber-400/90" />
                        ) : (
                          <FileIcon className="w-5 h-5 text-slate-500" />
                        )}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-200">{entry.name}</td>
                      <td className="py-2 px-3 text-slate-400 tabular-nums">{formatSize(entry.size)}</td>
                      <td className="py-2 px-3 text-slate-400">{formatMtime(entry.mtime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
