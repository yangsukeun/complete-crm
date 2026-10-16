/**
 * 프로젝트(Task) ↔ 자료실(구글 공유 드라이브 탐색기) 연결.
 * 프로젝트의 "링크 및 첨부"에 탐색기 폴더 주소(/drive?folder=<구글 폴더 ID>)를 넣으면
 * 그 폴더를 프로젝트 자료 폴더로 본다. 별도 DB 컬럼 없이 기존 첨부를 그대로 쓴다.
 */
export const PROJECT_FOLDER_MARKER = "/drive?folder=";

export function findProjectFolderUrl(
  attachments: { url: string; type?: string | null }[] | null | undefined
): string | null {
  const hit = attachments?.find((a) => a.url.includes(PROJECT_FOLDER_MARKER));
  if (!hit) return null;
  // 절대 주소로 들어와도 CRM 안에서 열리도록 경로만 쓴다
  const at = hit.url.indexOf(PROJECT_FOLDER_MARKER);
  return hit.url.slice(at);
}
