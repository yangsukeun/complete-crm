import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const DEFAULT_PATH = process.platform === "win32" ? "C:\\" : process.cwd();

function normalizePath(raw: string): string {
  const decoded = decodeURIComponent(raw.trim());
  if (process.platform === "win32") {
    return path.normalize(decoded.replace(/\//g, path.sep));
  }
  return path.normalize(decoded);
}

function getPathFromPreset(preset: string): string {
  const home = os.homedir();
  if (preset === "documents") return path.join(home, "Documents");
  if (preset === "downloads") return path.join(home, "Downloads");
  if (preset === "root" || preset === "c") return process.platform === "win32" ? "C:\\" : "/";
  return DEFAULT_PATH;
}

export async function GET(req: NextRequest) {
  try {
    const rawPath = req.nextUrl.searchParams.get("path");
    const preset = req.nextUrl.searchParams.get("preset");
    const dir = rawPath ? normalizePath(rawPath) : preset ? getPathFromPreset(preset) : DEFAULT_PATH;

    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {
      return Response.json({ entries: [], error: "경로가 존재하지 않습니다." });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return Response.json({ entries: [], error: "폴더 경로가 아닙니다." });
    }

    const names = fs.readdirSync(resolved, { withFileTypes: true });
    const entries = names.map((dirent: any) => {
      const fullPath = path.join(resolved, dirent.name);
      let size = 0;
      let mtime: string | null = null;
      try {
        const s = fs.statSync(fullPath);
        size = s.size;
        mtime = s.mtime.toISOString();
      } catch {
        // 권한 등으로 stat 실패 시 0, null 유지
      }
      return {
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        size,
        mtime,
      };
    });

    // 폴더 먼저, 그 다음 파일. 이름 정렬
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return Response.json({ entries, path: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "목록을 불러올 수 없습니다.";
    return Response.json(
      { entries: [], error: message },
      { status: 200 }
    );
  }
}
