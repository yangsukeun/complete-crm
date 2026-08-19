import { NameWithBirthday } from "@/components/ui/color-chip";
import { csOrgRank, csOrgRankLabel, type CsOrgNode } from "@/lib/cs-org";
import { cn } from "@/lib/utils";

function rankTone(rank: ReturnType<typeof csOrgRank>) {
  if (rank === "chief") return "border-violet-300 bg-violet-50";
  if (rank === "lead") return "border-sky-300 bg-sky-50";
  if (rank === "deputy") return "border-teal-300 bg-teal-50";
  return "border-border bg-card";
}

function OrgCard({ node }: { node: CsOrgNode }) {
  const rank = csOrgRank(node.position);
  return (
    <div className={cn("relative z-10 w-[6.75rem] rounded-md border px-1.5 py-1 shadow-sm", rankTone(rank))}>
      <p className="text-[9px] font-semibold leading-none tracking-wide text-muted-foreground">
        {node.position || csOrgRankLabel(rank)}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold leading-tight">
        <NameWithBirthday name={node.name} birthdayToday={node.birthdayToday} />
      </p>
      {node.clients.length > 0 ? (
        <p className="mt-1 line-clamp-4 text-[9px] leading-tight text-slate-700">
          {node.clients.join(" · ")}
        </p>
      ) : (
        <p className="text-muted-foreground mt-1 text-[9px] leading-tight">업체 없음</p>
      )}
    </div>
  );
}

function OrgBranch({ node, isRoot = false }: { node: CsOrgNode; isRoot?: boolean }) {
  const kids = node.children;
  return (
    <li className="relative flex flex-col items-center px-0.5">
      {!isRoot ? <span className="h-3 w-px bg-slate-300" /> : null}
      <OrgCard node={node} />
      {kids.length > 0 ? (
        <>
          <span className="h-3 w-px bg-slate-300" />
          <ul className="relative flex justify-center">
            {kids.length > 1 ? (
              <span
                className="pointer-events-none absolute top-0 h-px bg-slate-300"
                style={{
                  left: `calc(50% / ${kids.length})`,
                  right: `calc(50% / ${kids.length})`,
                }}
              />
            ) : null}
            {kids.map((child) => (
              <OrgBranch key={child.id} node={child} />
            ))}
          </ul>
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
    <div className="space-y-4">
      {roots.length === 0 && unassigned.length === 0 ? (
        <p className="text-muted-foreground text-sm">표시할 구성원이 없습니다.</p>
      ) : roots.length > 0 ? (
        <div className="overflow-x-auto">
          <ul className="mx-auto flex w-max">
            {roots.map((node) => (
              <OrgBranch key={node.id} node={node} isRoot />
            ))}
          </ul>
        </div>
      ) : null}
      {unassigned.length > 0 ? (
        <section>
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold">사원</h2>
          <div className="flex flex-wrap justify-center gap-1.5">
            {unassigned.map((node) => (
              <OrgCard key={node.id} node={node} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
