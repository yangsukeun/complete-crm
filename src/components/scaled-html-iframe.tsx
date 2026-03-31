"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import {
  IFRAME_EMBED_DESKTOP_WIDTH,
  syncIframeScaleLayout,
} from "@/lib/iframe-embed-scale";

type Props = {
  srcDoc: string;
  title: string;
  className?: string;
  /** outer 래퍼용 (margin 등) */
  style?: CSSProperties;
  minLogicalHeight?: number;
  maxLogicalHeight?: number;
};

/**
 * srcDoc HTML은 내부에서 1200px 폭으로 렌더한 뒤, 부모 너비에 맞게 scale.
 * 복사한 랜딩 페이지 등은 늦게 레이아웃이 잡히므로 ResizeObserver·이미지 load로 높이 재측정.
 */
export function ScaledHtmlIframe({
  srcDoc,
  title,
  className,
  style,
  minLogicalHeight = 100,
  maxLogicalHeight = 3000,
}: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentCleanupRef = useRef<(() => void) | null>(null);

  const sync = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const iframe = iframeRef.current;
    if (!outer || !inner || !iframe) return;
    syncIframeScaleLayout(outer, inner, iframe);
  }, []);

  const measureAndSync = useCallback(
    (iframe: HTMLIFrameElement) => {
      try {
        const doc = iframe.contentWindow?.document;
        if (!doc?.body) return;
        const body = doc.body;
        const htmlEl = doc.documentElement;
        const h = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          htmlEl.scrollHeight,
          htmlEl.offsetHeight,
          minLogicalHeight
        );
        const finalH = Math.min(Math.max(h + 32, minLogicalHeight), maxLogicalHeight);
        iframe.style.height = `${finalH}px`;
      } catch {
        iframe.style.height = `${Math.max(minLogicalHeight, 400)}px`;
      }
      requestAnimationFrame(sync);
    },
    [minLogicalHeight, maxLogicalHeight, sync]
  );

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(sync));
    ro.observe(outer);
    return () => ro.disconnect();
  }, [sync]);

  useEffect(() => () => contentCleanupRef.current?.(), []);

  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const el = e.currentTarget;
    contentCleanupRef.current?.();
    contentCleanupRef.current = null;

    measureAndSync(el);

    try {
      const doc = el.contentWindow?.document;
      if (!doc?.body) return;

      let raf = 0;
      const schedule = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => measureAndSync(el));
      };

      const ro = new ResizeObserver(schedule);
      ro.observe(doc.body);
      ro.observe(doc.documentElement);

      doc.querySelectorAll("img").forEach((img) => {
        if (!img.complete) img.addEventListener("load", schedule, { once: true });
      });

      const t1 = window.setTimeout(schedule, 100);
      const t2 = window.setTimeout(schedule, 600);

      contentCleanupRef.current = () => {
        clearTimeout(t1);
        clearTimeout(t2);
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    } catch {
      /* 문서 접근 불가 시 무시 */
    }
  };

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        width: "100%",
        overflow: "hidden",
        lineHeight: 0,
        ...style,
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: IFRAME_EMBED_DESKTOP_WIDTH,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <iframe
          ref={iframeRef}
          title={title}
          srcDoc={srcDoc}
          style={{
            width: IFRAME_EMBED_DESKTOP_WIDTH,
            maxWidth: IFRAME_EMBED_DESKTOP_WIDTH,
            display: "block",
            border: "none",
            minHeight: Math.max(minLogicalHeight, 200),
            background: "white",
            colorScheme: "light",
          }}
          onLoad={onLoad}
        />
      </div>
    </div>
  );
}
