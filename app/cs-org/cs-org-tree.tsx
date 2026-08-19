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
    <div className={cn("relative z-10 min-w-44 max-w-56 rounded-xl border px-4 py-3 shadow-sm", rankTone(rank))}>
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

function OrgBranch({ node, isRoot = false }: { node: CsOrgNode; isRoot?: boolean }) {
  const kids = node.children;
  return (
    <li className="relative flex flex-col items-center px-4">
      {!isRoot ? <span className="mb-0 h-6 w-px bg-slate-300" /> : null}
      <OrgCard node={node} />
      {kids.length > 0 ? (
        <>
          <span className="h-6 w-px bg-slate-300" />
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
    <div className="space-y-10 pb-4">
      {roots.length === 0 && unassigned.length === 0 ? (
        <p className="text-muted-foreground text-sm">표시할 구성원이 없습니다.</p>
      ) : roots.length > 0 ? (
        <div className="overflow-x-auto pb-4">
          <ul className="mx-auto flex w-max">
            {roots.map((node) => (
              <OrgBranch key={node.id} node={node} isRoot />
            ))}
          </ul>
        </div>
      ) : null}
      {unassigned.length > 0 ? (
        <section>
          <h2 className="cs-section-title mb-4">사원</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            팀장·부팀장이 여러 명이면 설정 창고에서 누구 밑인지 지정하세요.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {unassigned.map((node) => (
              <OrgCard key={node.id} node={node} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
