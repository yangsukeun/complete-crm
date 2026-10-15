const { dialog, ipcMain, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("./settings");

/**
 * 웹 CRM의 NAS 문서함·구글 드라이브 항목을 이 PC의 로컬 경로로 열어 준다.
 *
 * - NAS: 설정의 nasUncRoot(예: \\NAS\문서공유)가 File Station 경로 /문서공유 에 대응한다.
 *   공유 폴더 이름은 UNC 경로에서 자동으로 계산한다.
 * - 구글 드라이브: 설정의 driveRoot(예: G:\공유 드라이브\컴플리트)가 CRM 탐색기 루트에 대응한다.
 *
 * 웹에서 받은 경로는 신뢰하지 않는다. 지정된 루트 밖을 가리키면 거부한다.
 */

const ROOT_LABEL = {
  nas: { title: "NAS 문서함 폴더", key: "nasUncRoot", example: "\\\\NAS\\문서공유" },
  drive: { title: "구글 드라이브 폴더", key: "driveRoot", example: "G:\\공유 드라이브\\컴플리트" },
};

/** 바로 실행되면 위험한 형식. 이런 파일은 열지 않고 탐색기에서 위치만 보여 준다 */
const BLOCKED_EXT = new Set([
  ".exe", ".com", ".bat", ".cmd", ".msi", ".msp", ".scr", ".pif", ".cpl", ".hta",
  ".js", ".jse", ".vbs", ".vbe", ".wsf", ".wsh", ".ps1", ".psm1", ".lnk", ".url",
  ".reg", ".jar", ".appref-ms", ".application", ".gadget", ".inf", ".sct",
]);

class LocalPathError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** 경로 조각 하나가 안전한 파일·폴더 이름인지 */
function assertSafeSegment(seg) {
  if (typeof seg !== "string" || seg.length === 0 || seg.length > 255) {
    throw new LocalPathError("INVALID_PATH", "경로가 올바르지 않습니다.");
  }
  if (seg === "." || seg === ".." || /[\\/:*?"<>|\u0000-\u001f]/.test(seg)) {
    throw new LocalPathError(
      "INVALID_PATH",
      `PC에서 쓸 수 없는 이름이 들어 있습니다: ${seg}`
    );
  }
}

/** root 아래의 경로인지 최종 확인 (정규화 후) */
function joinInsideRoot(root, segments) {
  segments.forEach(assertSafeSegment);
  const resolvedRoot = path.win32.resolve(root);
  const target = path.win32.resolve(resolvedRoot, ...segments);
  const rel = path.win32.relative(resolvedRoot, target);
  if (rel.startsWith("..") || path.win32.isAbsolute(rel)) {
    throw new LocalPathError("OUTSIDE_ROOT", "허용된 폴더 밖의 경로입니다.");
  }
  return target;
}

/** \\서버\공유\하위 → File Station 경로 /공유/하위 */
function nasSharePathFromUnc(unc) {
  const m = /^\\\\[^\\]+\\(.+)$/.exec(unc.replace(/\//g, "\\").replace(/\\+$/, ""));
  if (!m) return null;
  return "/" + m[1].split("\\").filter(Boolean).join("/");
}

function resolveNas(nasPath) {
  const root = settings.get("nasUncRoot");
  if (!root) throw new LocalPathError("NOT_CONFIGURED", "NAS 문서함 폴더가 지정되지 않았습니다.");
  const sharePath = nasSharePathFromUnc(root);
  if (!sharePath) throw new LocalPathError("NOT_CONFIGURED", "NAS 폴더는 \\\\서버\\공유폴더 형식이어야 합니다.");

  if (typeof nasPath !== "string" || !nasPath.startsWith("/")) {
    throw new LocalPathError("INVALID_PATH", "경로가 올바르지 않습니다.");
  }
  const parts = nasPath.split("/").filter(Boolean);
  const shareParts = sharePath.split("/").filter(Boolean);
  const insideShare =
    parts.length >= shareParts.length &&
    shareParts.every((p, i) => p.toLowerCase() === parts[i].toLowerCase());
  if (!insideShare) {
    throw new LocalPathError("OUTSIDE_ROOT", `지정된 NAS 폴더(${sharePath}) 밖의 파일입니다.`);
  }
  return joinInsideRoot(root, parts.slice(shareParts.length));
}

function resolveDrive(segments) {
  const root = settings.get("driveRoot");
  if (!root) throw new LocalPathError("NOT_CONFIGURED", "구글 드라이브 폴더가 지정되지 않았습니다.");
  if (!Array.isArray(segments) || segments.length > 64) {
    throw new LocalPathError("INVALID_PATH", "경로가 올바르지 않습니다.");
  }
  return joinInsideRoot(root, segments);
}

/** Z:\하위 처럼 네트워크 드라이브로 연결한 경로를 \\서버\공유\하위 로 바꾼다 */
function mappedDriveToUnc(p) {
  const m = /^([a-zA-Z]):\\?(.*)$/.exec(p);
  if (!m) return Promise.resolve(null);
  // 한글 공유 이름이 깨지지 않도록 UTF-8로 출력
  const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Get-PSDrive -Name ${m[1]} -ErrorAction SilentlyContinue).DisplayRoot`;
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, encoding: "utf8" },
      (err, stdout) => {
        const unc = (stdout || "").trim();
        if (err || !unc.startsWith("\\\\")) return resolve(null);
        resolve(path.win32.join(unc, m[2] || ""));
      }
    );
  });
}

/** 트레이 메뉴·안내 대화상자에서 루트 폴더를 고른다. 고르면 true */
async function chooseRoot(kind, parentWindow) {
  const { title, key, example } = ROOT_LABEL[kind];
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    title: `${title} 지정 (예: ${example})`,
    defaultPath: settings.get(key) || undefined,
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return false;

  let picked = result.filePaths[0];
  if (kind === "nas" && !nasSharePathFromUnc(picked)) {
    picked = (await mappedDriveToUnc(picked)) || picked;
  }
  if (kind === "nas" && !nasSharePathFromUnc(picked)) {
    await dialog.showMessageBox(parentWindow ?? undefined, {
      type: "warning",
      title,
      message: "NAS 폴더는 네트워크 경로로 지정해 주세요.",
      detail: `예: ${example}\n폴더 선택 창 주소 표시줄에 직접 입력할 수 있습니다.`,
    });
    return false;
  }
  settings.set(key, picked);
  return true;
}

/** 지정되지 않았으면 지금 지정할지 묻고, 지정하면 true */
async function offerChooseRoot(kind, parentWindow, message) {
  const { title, example } = ROOT_LABEL[kind];
  const { response } = await dialog.showMessageBox(parentWindow ?? undefined, {
    type: "question",
    title,
    message,
    detail: `이 PC에서 ${title}를 지정하면 CRM 항목을 바로 열 수 있습니다.\n예: ${example}`,
    buttons: ["지금 지정", "취소"],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0 && chooseRoot(kind, parentWindow);
}

async function exists(p) {
  try {
    return await fs.promises.stat(p);
  } catch {
    return null;
  }
}

/**
 * action: "open" = 연결 프로그램으로 열기, "reveal" = 탐색기에서 위치 보기
 * 결과: { ok: true } | { ok: false, code, message }
 */
async function handle(kind, target, action, parentWindow) {
  const resolve = kind === "nas" ? resolveNas : resolveDrive;
  let local;
  try {
    local = resolve(target);
  } catch (e) {
    if (e.code === "NOT_CONFIGURED" && (await offerChooseRoot(kind, parentWindow, e.message))) {
      return handle(kind, target, action, parentWindow);
    }
    return { ok: false, code: e.code || "ERROR", message: e.message };
  }

  const stat = await exists(local);
  if (!stat) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message:
        kind === "nas"
          ? "이 PC에서 NAS 파일을 찾을 수 없습니다. 사내망에 연결되어 있는지, NAS 폴더 지정이 맞는지 확인하세요."
          : "이 PC에서 파일을 찾을 수 없습니다. Google Drive for desktop이 실행 중인지, 드라이브 폴더 지정이 맞는지 확인하세요.",
    };
  }

  if (action === "reveal") {
    // 폴더면 그 폴더를 열고, 파일이면 상위 폴더에서 선택해 보여 준다
    if (stat.isDirectory()) {
      const err = await shell.openPath(local);
      return err ? { ok: false, code: "OPEN_FAILED", message: err } : { ok: true };
    }
    shell.showItemInFolder(local);
    return { ok: true };
  }

  if (!stat.isDirectory() && BLOCKED_EXT.has(path.extname(local).toLowerCase())) {
    shell.showItemInFolder(local);
    return {
      ok: false,
      code: "BLOCKED",
      message: "실행 파일은 바로 열지 않습니다. 탐색기에서 위치를 보여 드렸습니다.",
    };
  }
  const err = await shell.openPath(local);
  return err ? { ok: false, code: "OPEN_FAILED", message: err } : { ok: true };
}

/** isAllowedSender(frame): CRM 페이지에서 온 요청만 받는다 */
function setupLocalFiles({ isAllowedSender, getWindow }) {
  const on = (channel, kind, action) =>
    ipcMain.handle(channel, (e, target) => {
      if (!isAllowedSender(e.senderFrame)) {
        return { ok: false, code: "FORBIDDEN", message: "허용되지 않은 요청입니다." };
      }
      return handle(kind, target, action, getWindow());
    });

  on("crm:nas-open", "nas", "open");
  on("crm:nas-reveal", "nas", "reveal");
  on("crm:drive-open", "drive", "open");
  on("crm:drive-reveal", "drive", "reveal");
}

module.exports = { setupLocalFiles, chooseRoot, resolveNas, resolveDrive, nasSharePathFromUnc };
