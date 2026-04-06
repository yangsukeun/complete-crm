"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function useIsMdUp(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = () => setV(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return v;
}

interface SplitViewProps {
  list: ReactNode;
  detail: ReactNode | null;
  onClose?: () => void;
  listMinWidth?: number;
  defaultSplit?: number;
  /** true면 좌·우 각각 화면의 정확히 50%, 구분선 드래그 비활성 */
  fixedHalfSplit?: boolean;
  className?: string;
  /** 우측 상세 컬럼에 추가 클래스 */
  detailColumnClassName?: string;
}

export function SplitView({
  list,
  detail,
  onClose,
  listMinWidth = 320,
  defaultSplit = 0.4,
  fixedHalfSplit = false,
  className,
  detailColumnClassName,
}: SplitViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [splitRatio, setSplitRatio] = useState(defaultSplit);

  useEffect(() => {
    setSplitRatio(defaultSplit);
  }, [defaultSplit]);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!detail) return;
      e.preventDefault();
      setIsDragging(true);
      const startX = e.clientX;
      const startRatio = splitRatio;
      const el = containerRef.current;
      const containerWidth = el?.getBoundingClientRect().width ?? window.innerWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const w = containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
        const delta = ev.clientX - startX;
        const newRatio = Math.min(
          0.7,
          Math.max(listMinWidth / w, startRatio + delta / containerWidth)
        );
        setSplitRatio(newRatio);
      };

      const onMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [splitRatio, listMinWidth, detail]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isExpanded) {
        setIsExpanded(false);
      } else if (onClose) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, onClose]);

  if (isExpanded && detail) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background",
          className
        )}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-muted-foreground text-xs">전체 화면</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="rounded-md p-1.5 transition-colors hover:bg-muted"
              title="Split 뷰로 복귀"
            >
              <Minimize2 size={14} className="text-muted-foreground" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                  onClose();
                }}
                className="rounded-md p-1.5 transition-colors hover:bg-muted"
                title="닫기"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{detail}</div>
      </div>
    );
  }

  if (fixedHalfSplit && detail) {
    return (
      <div ref={containerRef} className={cn("relative flex h-full min-h-0 overflow-hidden", className)}>
        <div
          style={{ width: "50%" }}
          className="flex min-h-0 flex-shrink-0 flex-col overflow-auto"
        >
          {list}
        </div>
        <div className="bg-border w-px flex-shrink-0" role="separator" aria-orientation="vertical" />
        <div
          className={cn(
            "flex min-h-0 w-1/2 min-w-0 flex-shrink-0 flex-col overflow-hidden border-l",
            detailColumnClassName
          )}
        >
          <div className="flex flex-shrink-0 items-center justify-end gap-1 border-b px-3 py-1.5">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="rounded-md p-1.5 transition-colors hover:bg-muted"
              title="전체 화면으로 확장"
            >
              <Maximize2 size={14} className="text-muted-foreground" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 transition-colors hover:bg-muted"
                title="닫기"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{detail}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative flex h-full min-h-0 overflow-hidden", className)}>
      <div
        style={{ width: detail ? `${splitRatio * 100}%` : "100%" }}
        className="flex min-h-0 flex-shrink-0 flex-col overflow-auto transition-[width] duration-200"
      >
        {list}
      </div>

      {detail && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleDividerMouseDown}
          className={cn(
            "relative w-1 flex-shrink-0 cursor-col-resize transition-colors",
            isDragging ? "bg-primary/40" : "bg-border hover:bg-primary/25"
          )}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}

      {detail && (
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l",
            detailColumnClassName
          )}
        >
          <div className="flex flex-shrink-0 items-center justify-end gap-1 border-b px-3 py-1.5">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="rounded-md p-1.5 transition-colors hover:bg-muted"
              title="전체 화면으로 확장"
            >
              <Maximize2 size={14} className="text-muted-foreground" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 transition-colors hover:bg-muted"
                title="닫기"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{detail}</div>
        </div>
      )}
    </div>
  );
}
