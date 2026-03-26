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
  className,
}: {
  assignees?: TaskAssigneeAvatarUser[] | null;
  assignedTo?: TaskAssigneeAvatarUser | null;
  size?: number;
  className?: string;
}) {
  const list =
    assignees != null && assignees.length > 0 ? assignees : assignedTo ? [assignedTo] : [];
  if (list.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const shown = list.slice(0, 3);
  const more = list.length - 3;
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
