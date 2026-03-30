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

  const sync = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    const iframe = iframeRef.current;
    if (!outer || !inner || !iframe) return;
    syncIframeScaleLayout(outer, inner, iframe);
  }, []);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(sync));
    ro.observe(outer);
    return () => ro.disconnect();
  }, [sync]);

  const onLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const el = e.currentTarget;
    try {
      const doc = el.contentWindow?.document;
      if (!doc?.body) return;
      const body = doc.body;
      const htmlEl = doc.documentElement;
      const prevB = body.style.overflow;
      const prevH = htmlEl.style.overflow;
      body.style.overflow = "hidden";
      htmlEl.style.overflow = "hidden";
      const h = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        htmlEl.scrollHeight,
        htmlEl.offsetHeight,
        minLogicalHeight
      );
      body.style.overflow = prevB;
      htmlEl.style.overflow = prevH;
      const finalH = Math.min(Math.max(h + 32, minLogicalHeight), maxLogicalHeight);
      el.style.height = `${finalH}px`;
    } catch {
      el.style.height = `${Math.max(minLogicalHeight, 400)}px`;
    }
    requestAnimationFrame(sync);
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
