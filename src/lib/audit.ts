import prisma from "@/lib/prisma";

const AUDIT_FIELDS = new Set([
  "status",
  "assignedToId",
  "dueDate",
  "projectId",
  "archivedAt",
  "deletedAt",
  "completedAt",
]);

export function serializeAuditValue(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString();
  }
  return String(v);
}

export async function logAudit(input: {
  taskId: string;
  actorId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
}): Promise<void> {
  if (!AUDIT_FIELDS.has(input.field)) return;
  try {
    await prisma.taskAuditLog.create({
      data: {
        taskId: input.taskId,
        actorId: input.actorId,
        field: input.field,
        oldValue: input.oldValue,
        newValue: input.newValue,
      },
    });
  } catch (e) {
    console.error("[audit] TaskAuditLog insert failed", e);
  }
}
