import { NameWithBirthday } from "@/components/ui/color-chip";
import { csOrgRank, csOrgRankLabel, type CsOrgNode } from "@/lib/cs-org";
import { cn } from "@/lib/utils";

function rankTone(rank: ReturnType<typeof csOrgRank>) {
  if (rank === "chief") return "border-violet-300 bg-violet-50";
  if (rank === "lead") return "border-sky-300 bg-sky-50";
  if (rank === "deputy") return "border-teal-300 bg-teal-50";
  return "border-border bg-card";
}

function OrgCard({ node, compact = false }: { node: CsOrgNode; compact?: boolean }) {
  const rank = csOrgRank(node.position);
  return (
    <div
      className={cn(
        "h-full rounded-lg border px-3 py-2.5 shadow-sm",
        compact ? "min-h-[5.5rem]" : "w-full",
        rankTone(rank)
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">
        {node.position || csOrgRankLabel(rank)}
      </p>
      <p className="mt-0.5 text-sm font-semibold leading-snug">
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
        <p className="text-muted-foreground mt-2 text-xs">담당 업체 없음</p>
      )}
    </div>
  );
}

const STAFF_GRID = "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3";

function OrgChildren({ nodes }: { nodes: CsOrgNode[] }) {
  if (nodes.length === 0) return null;
  const nested = nodes.filter((n) => n.children.length > 0);
  const leaves = nodes.filter((n) => n.children.length === 0);
  return (
    <div className="space-y-3">
      {nested.map((node) => (
        <OrgBranch key={node.id} node={node} />
      ))}
      {leaves.length > 0 ? (
        <ul className={STAFF_GRID}>
          {leaves.map((node) => (
            <li key={node.id}>
              <OrgCard node={node} compact />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OrgBranch({ node }: { node: CsOrgNode }) {
  return (
    <div className="space-y-2">
      <OrgCard node={node} />
      {node.children.length > 0 ? (
        <div className="ml-1 space-y-3 border-l-2 border-slate-200 pl-3">
          <OrgChildren nodes={node.children} />
        </div>
      ) : null}
    </div>
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
        <div className="space-y-4">
          {roots.map((node) => (
            <OrgBranch key={node.id} node={node} />
          ))}
        </div>
      ) : null}
      {unassigned.length > 0 ? (
        <section>
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold">사원</h2>
          <ul className={STAFF_GRID}>
            {unassigned.map((node) => (
              <li key={node.id}>
                <OrgCard node={node} compact />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
