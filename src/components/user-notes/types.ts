export type UserNoteDto = {
  id: string;
  title: string;
  content: string;
  colorHex: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string; brand: { name: string } } | null;
};
