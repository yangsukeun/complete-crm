export type UserNoteAttachment = { url: string; name: string };

export type UserNoteDto = {
  id: string;
  title: string;
  content: string;
  contentType?: string;
  /** 게시판 구분과 동일 (구 클라이언트·캐시에는 없을 수 있음) */
  category?: string;
  attachments?: UserNoteAttachment[];
  colorHex: string | null;
  pinned?: boolean;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; brand: { name: string } } | null;
};
