import { cn, formatUserName } from "@/lib/utils";

export type TaskAssigneeAvatarUser = {
  id: string;
  name: string;
  image?: string | null;
  position?: string | null;
};

export function TaskAssigneeAvatars({
  assignees,
  assignedTo,
  size = 22,
  maxVisible = 3,
  className,
}: {
  assignees?: TaskAssigneeAvatarUser[] | null;
  assignedTo?: TaskAssigneeAvatarUser | null;
  size?: number;
  /** 원형으로 보여줄 최대 인원 (초과 시 +N) */
  maxVisible?: number;
  className?: string;
}) {
  const list =
    assignees != null && assignees.length > 0 ? assignees : assignedTo ? [assignedTo] : [];
  if (list.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const cap = Math.max(1, maxVisible);
  const shown = list.slice(0, cap);
  const more = list.length - cap;
  return (
    <div
      className={cn("inline-flex items-center gap-1 align-middle", className)}
      title={list.map((u) => formatUserName(u)).join(", ")}
    >
      <div className="flex -space-x-1.5">
        {shown.map((u, i) => (
          <div
            key={u.id}
            className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card"
            style={{ width: size, height: size, zIndex: shown.length - i }}
            title={formatUserName(u)}
          >
            {u.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- 외부/Supabase URL
              <img src={u.image} alt="" className="size-full object-cover" />
            ) : (
              (u.name ?? "?").slice(0, 1)
            )}
          </div>
        ))}
      </div>
      {more > 0 ? (
        <span className="text-muted-foreground shrink-0 text-[10px] font-semibold">+{more}</span>
      ) : null}
    </div>
  );
}
