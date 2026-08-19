import { NameWithBirthday } from "@/components/ui/color-chip";
import { csOrgRank, csOrgRankLabel, type CsOrgNode } from "@/lib/cs-org";
import { cn } from "@/lib/utils";

function rankTone(rank: ReturnType<typeof csOrgRank>) {
  if (rank === "chief") return "border-violet-300 bg-violet-50";
  if (rank === "lead") return "border-sky-300 bg-sky-50";
  if (rank === "deputy") return "border-teal-300 bg-teal-50";
  return "border-border bg-card";
}

function OrgCard({ node, fill = false }: { node: CsOrgNode; fill?: boolean }) {
  const rank = csOrgRank(node.position);
  return (
    <div
      className={cn(
        "relative z-10 rounded-xl border px-4 py-3 shadow-sm",
        fill ? "h-full w-full" : "min-w-44 max-w-56",
        rankTone(rank)
      )}
    >
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">
        {node.position || csOrgRankLabel(rank)}
      </p>
      <p className="mt-0.5 font-semibold leading-snug">
        <NameWithBirthday name={node.name} birthdayToday={node.birthdayToday} />
      </p>
      {node.clients.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {node.clients.map((name) => (
            <li
              key={name}
              className="rounded-md bg-white/80 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-[11px]">담당 업체 없음</p>
      )}
    </div>
  );
}

const STAFF_GRID = "grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

function OrgBranch({
  node,
  isRoot = false,
  depth = 0,
  className,
}: {
  node: CsOrgNode;
  isRoot?: boolean;
  depth?: number;
  className?: string;
}) {
  const kids = node.children;
  const nested = kids.filter((n) => n.children.length > 0);
  const leaves = kids.filter((n) => n.children.length === 0);
  const managersSideBySide = depth === 0 && nested.length > 1;

  return (
    <li className={cn("relative flex min-w-0 flex-col items-center px-2", className)}>
      {!isRoot ? <span className="h-6 w-px bg-slate-300" /> : null}
      <OrgCard node={node} />
      {kids.length > 0 ? (
        <>
          <span className="h-6 w-px bg-slate-300" />
          {nested.length > 0 ? (
            <ul
              className={cn(
                "relative flex w-full",
                managersSideBySide ? "flex-wrap justify-center" : "flex-col items-center"
              )}
            >
              {managersSideBySide ? (
                <span
                  className="pointer-events-none absolute top-0 h-px bg-slate-300"
                  style={{
                    left: `calc(50% / ${nested.length})`,
                    right: `calc(50% / ${nested.length})`,
                  }}
                />
              ) : null}
              {nested.map((child) => (
                <OrgBranch
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  className={managersSideBySide ? "w-full lg:w-1/2" : "w-full"}
                />
              ))}
            </ul>
          ) : null}
          {leaves.length > 0 ? (
            <ul className={STAFF_GRID}>
              {leaves.map((child) => (
                <li key={child.id} className="flex min-w-0 flex-col items-center">
                  <span className="h-6 w-px bg-slate-300" />
                  <OrgCard node={child} fill />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function CsOrgPyramid({
  roots,
  unassigned,
}: {
  roots: CsOrgNode[];
  unassigned: CsOrgNode[];
}) {
  return (
    <div className="space-y-8">
      {roots.length === 0 && unassigned.length === 0 ? (
        <p className="text-muted-foreground text-sm">표시할 구성원이 없습니다.</p>
      ) : roots.length > 0 ? (
        <ul className="flex w-full flex-col items-center">
          {roots.map((node) => (
            <OrgBranch key={node.id} node={node} isRoot depth={0} className="w-full" />
          ))}
        </ul>
      ) : null}
      {unassigned.length > 0 ? (
        <section>
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold">사원</h2>
          <ul className={cn(STAFF_GRID, "mx-auto")}>
            {unassigned.map((node) => (
              <li key={node.id}>
                <OrgCard node={node} fill />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
