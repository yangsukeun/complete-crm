"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import Shepherd from "shepherd.js";
import type { Tour } from "shepherd.js";
import "shepherd.js/dist/css/shepherd.css";
import { ONBOARDING_TOUR_START_EVENT } from "@/lib/onboarding-tour-events";

const TOUR_KEY = "onboarding-main";

type TourStepRow = {
  orderIndex: number;
  targetSelector: string;
  title: string;
  bodyMd: string;
  placement: string;
  route: string | null;
};

function waitForSelector(selector: string, timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (document.querySelector(selector)) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("tour-target-timeout"));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function postProgress(body: Record<string, unknown>) {
  await fetch("/api/help/tour-progress", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function normalizePath(p: string) {
  const x = (p.split("?")[0] ?? p) || "/";
  return x.length > 1 && x.endsWith("/") ? x.slice(0, -1) : x;
}

export function TourProvider() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tourRef = useRef<InstanceType<typeof Shepherd.Tour> | null>(null);
  const autoNavDoneRef = useRef(false);
  const buildingRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") autoNavDoneRef.current = false;
  }, [status]);

  const disposeTour = useCallback(() => {
    const t = tourRef.current;
    tourRef.current = null;
    if (!t) return;
    try {
      t.hide();
    } catch {
      /* ignore */
    }
  }, []);

  const buildAndStartTour = useCallback(
    async (steps: TourStepRow[]) => {
      if (buildingRef.current || !steps.length) return;
      buildingRef.current = true;
      try {
        disposeTour();
        const tour = new Shepherd.Tour({
          useModalOverlay: true,
          exitOnEsc: true,
          keyboardNavigation: true,
          defaultStepOptions: {
            cancelIcon: { enabled: true },
            scrollTo: { behavior: "smooth", block: "center" },
            classes: "shepherd-theme-complete-crm",
          },
        });
        tourRef.current = tour;

        const sorted = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);

        let completedOk = false;
        tour.on(
          "complete",
          () => {
            completedOk = true;
            void postProgress({ tourKey: TOUR_KEY, action: "complete" });
          },
          undefined,
          true
        );
        tour.on(
          "cancel",
          () => {
            if (completedOk) return;
            void postProgress({ tourKey: TOUR_KEY, action: "skip" });
          },
          undefined,
          true
        );

        sorted.forEach((step, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === sorted.length - 1;
          const placement = (["top", "bottom", "left", "right"].includes(step.placement)
            ? step.placement
            : "bottom") as "top" | "bottom" | "left" | "right";

          tour.addStep({
            id: `onboarding-step-${step.orderIndex}`,
            title: step.title,
            text: () => {
              const wrap = document.createElement("div");
              wrap.className = "text-sm leading-relaxed text-foreground";
              wrap.textContent = step.bodyMd;
              return wrap;
            },
            attachTo: {
              element: step.targetSelector as `${string}`,
              on: placement,
            },
            canClickTarget: true,
            beforeShowPromise: async () => {
              const raw = step.route?.trim() || "/tasks";
              const [pathPart, queryPart] = raw.split("?");
              const targetPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
              const cur = normalizePath(window.location.pathname);
              if (cur !== normalizePath(targetPath)) {
                const dest = queryPart ? `${targetPath}?${queryPart}` : targetPath;
                await router.push(dest);
                await new Promise((r) => setTimeout(r, 600));
              }
              try {
                await waitForSelector(step.targetSelector);
              } catch {
                /* 타겟 없음 */
              }
            },
            buttons: [
              {
                text: "건너뛰기",
                classes: "shepherd-button-secondary",
                action(this: Tour) {
                  void this.cancel();
                },
              },
              ...(isFirst
                ? []
                : [
                    {
                      text: "이전",
                      classes: "shepherd-button-secondary",
                      action(this: Tour) {
                        this.back();
                      },
                    },
                  ]),
              {
                text: isLast ? "완료" : "다음",
                action(this: Tour) {
                  if (isLast) {
                    void this.complete();
                  } else {
                    this.next();
                  }
                },
              },
            ],
          });
        });

        await tour.start();
      } finally {
        buildingRef.current = false;
      }
    },
    [disposeTour, router]
  );

  /** 로그인 후 투어 미완료면 /tasks?onboardingTour=1 로 1회 이동 */
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;
    if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return;
    if (autoNavDoneRef.current) return;

    let cancelled = false;
    (async () => {
      const progRes = await fetch(`/api/help/tour-progress?tourKey=${encodeURIComponent(TOUR_KEY)}`, {
        credentials: "include",
      });
      if (cancelled) return;
      const prog = progRes.ok ? await progRes.json() : [];
      const p = Array.isArray(prog) && prog[0];
      if (p?.completedAt || p?.skippedAt) return;

      autoNavDoneRef.current = true;
      const onTasksWithFlag =
        pathname.startsWith("/tasks") && searchParams.get("onboardingTour") === "1";
      if (!onTasksWithFlag) {
        await router.push("/tasks?onboardingTour=1");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams, session?.user?.id, status]);

  /** 마인드맵 준비 후 투어 시작 + 쿼리 정리 */
  useEffect(() => {
    if (status !== "authenticated") return;
    if (!pathname.startsWith("/tasks")) return;
    if (searchParams.get("onboardingTour") !== "1") return;

    let cancelled = false;
    (async () => {
      await new Promise((r) => setTimeout(r, 900));
      if (cancelled) return;

      const progRes = await fetch(`/api/help/tour-progress?tourKey=${encodeURIComponent(TOUR_KEY)}`, {
        credentials: "include",
      });
      const prog = progRes.ok ? await progRes.json() : [];
      const p = Array.isArray(prog) && prog[0];
      if (p?.completedAt || p?.skippedAt) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.delete("onboardingTour");
        const qs = sp.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        return;
      }

      const stepsRes = await fetch(`/api/help/tour-steps?tourKey=${encodeURIComponent(TOUR_KEY)}`, {
        credentials: "include",
      });
      const steps = stepsRes.ok ? ((await stepsRes.json()) as TourStepRow[]) : [];
      if (!steps.length) return;

      await buildAndStartTour(steps);

      const sp = new URLSearchParams(searchParams.toString());
      sp.delete("onboardingTour");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    })();

    return () => {
      cancelled = true;
    };
  }, [buildAndStartTour, pathname, router, searchParams, status]);

  useEffect(() => {
    const onRestart = () => {
      void (async () => {
        await postProgress({ tourKey: TOUR_KEY, action: "reset" });
        autoNavDoneRef.current = true;
        await router.push("/tasks?onboardingTour=1");
      })();
    };
    window.addEventListener(ONBOARDING_TOUR_START_EVENT, onRestart);
    return () => window.removeEventListener(ONBOARDING_TOUR_START_EVENT, onRestart);
  }, [router]);

  useEffect(() => () => disposeTour(), [disposeTour]);

  return null;
}
