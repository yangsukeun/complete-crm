import { describe, expect, it } from "vitest";
import {
  hasGoogleTasksScope,
  googleOauthScopesForRole,
  GOOGLE_TASKS_SCOPE,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
} from "@/lib/google-oauth";
import {
  parseGoogleTaskDue,
  planGoogleTaskChange,
  googleTaskTitle,
} from "@/lib/google-tasks-map";

describe("google oauth scopes", () => {
  it("adds Tasks only for executive/admin", () => {
    expect(googleOauthScopesForRole("USER")).toEqual([GOOGLE_CALENDAR_EVENTS_SCOPE]);
    expect(googleOauthScopesForRole("EXECUTIVE")).toContain(GOOGLE_TASKS_SCOPE);
    expect(googleOauthScopesForRole("ADMIN")).toContain(GOOGLE_TASKS_SCOPE);
  });

  it("detects missing tasks scope on legacy calendar-only tokens", () => {
    expect(hasGoogleTasksScope(null)).toBe(false);
    expect(hasGoogleTasksScope(GOOGLE_CALENDAR_EVENTS_SCOPE)).toBe(false);
    expect(hasGoogleTasksScope(`${GOOGLE_CALENDAR_EVENTS_SCOPE} ${GOOGLE_TASKS_SCOPE}`)).toBe(true);
  });
});

describe("google task mapping", () => {
  it("parses due as KST calendar day", () => {
    const d = parseGoogleTaskDue("2026-08-28T00:00:00.000Z");
    expect(d?.toISOString()).toBe("2026-08-27T15:00:00.000Z");
  });

  it("creates CRM task from new google item", () => {
    const plan = planGoogleTaskChange(
      { id: "gt1", title: "폰에서 추가", notes: "메모", due: "2026-08-28T00:00:00.000Z", status: "needsAction" },
      null
    );
    expect(plan.action).toBe("create");
    if (plan.action === "create") {
      expect(plan.title).toBe("폰에서 추가");
      expect(plan.description).toBe("메모");
      expect(plan.isCompleted).toBe(false);
    }
  });

  it("updates title/due from google but does not uncomplete CRM or require memo sync", () => {
    const plan = planGoogleTaskChange(
      { id: "gt1", title: "새 제목", due: "2026-08-29T00:00:00.000Z", status: "needsAction" },
      {
        title: "옛 제목",
        description: null,
        dueDate: parseGoogleTaskDue("2026-08-28T00:00:00.000Z"),
        isCompleted: true,
        projectId: "proj-keep",
      }
    );
    expect(plan.action).toBe("update");
    if (plan.action === "update") {
      expect(plan.title).toBe("새 제목");
      expect(plan.completeCrm).toBe(false);
    }
  });

  it("completes CRM when google is completed", () => {
    const plan = planGoogleTaskChange(
      { id: "gt1", title: "할일", status: "completed" },
      {
        title: "할일",
        description: null,
        dueDate: null,
        isCompleted: false,
        projectId: null,
      }
    );
    expect(plan.action).toBe("update");
    if (plan.action === "update") expect(plan.completeCrm).toBe(true);
  });

  it("does not delete CRM when google marks deleted", () => {
    const plan = planGoogleTaskChange(
      { id: "gt1", title: "지움", deleted: true },
      {
        title: "지움",
        description: null,
        dueDate: null,
        isCompleted: false,
        projectId: "keep-me",
      }
    );
    expect(plan).toEqual({ action: "skip", reason: "deleted" });
  });

  it("uses placeholder title when empty", () => {
    expect(googleTaskTitle("  ")).toBe("(제목 없음)");
  });
});
