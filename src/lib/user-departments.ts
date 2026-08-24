/**
 * 주부서 + 겸직 부서 통합.
 * - primary: User.department
 * - additional: User.additionalDepartments (JSON 배열, 주부서 중복 제외)
 * - all: primary ∪ additional (정규화·중복 제거)
 */

import { normalizeDepartment } from "@/lib/leave-department-access";

export type UserDepartments = {
  primary: string | null;
  additional: string[];
  all: string[];
};

export function parseAdditionalDepartments(
  value: string | null | undefined | readonly string[]
): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .map((x) => normalizeDepartment(typeof x === "string" ? x : ""))
          .filter((x) => x.length > 0)
      ),
    ];
  }
  const raw = String(value).trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return [
      ...new Set(
        arr
          .filter((x): x is string => typeof x === "string")
          .map((x) => normalizeDepartment(x))
          .filter((x) => x.length > 0)
      ),
    ];
  } catch {
    return [];
  }
}

export function serializeAdditionalDepartments(depts: readonly string[]): string | null {
  const cleaned = [
    ...new Set(depts.map((d) => normalizeDepartment(d)).filter((d) => d.length > 0)),
  ];
  if (cleaned.length === 0) return null;
  return JSON.stringify(cleaned);
}

export function getUserDepartments(input: {
  department?: string | null;
  additionalDepartments?: string | null | readonly string[];
}): UserDepartments {
  const primaryRaw = normalizeDepartment(input.department);
  const primary = primaryRaw.length > 0 ? primaryRaw : null;
  const additional = parseAdditionalDepartments(input.additionalDepartments).filter(
    (d) => !primary || d !== primary
  );
  const all = primary ? [primary, ...additional] : [...additional];
  return { primary, additional, all };
}
