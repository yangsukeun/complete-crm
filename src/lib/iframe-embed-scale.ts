/** 노션/피그마형: iframe 내부는 고정 PC 너비로 레이아웃 후, 부모에서 transform scale로 맞춤 */

export const IFRAME_EMBED_DESKTOP_WIDTH = 1200;

export function syncIframeScaleLayout(
  outer: HTMLElement,
  inner: HTMLElement,
  iframe: HTMLIFrameElement
): void {
  const w = outer.getBoundingClientRect().width;
  const s = w > 0 ? Math.min(1, w / IFRAME_EMBED_DESKTOP_WIDTH) : 1;
  inner.style.transform = `scale(${s})`;
  const hStr = iframe.style.height;
  const h = parseFloat(hStr);
  const logicalH =
    Number.isFinite(h) && h > 0 ? h : (iframe.offsetHeight > 10 ? iframe.offsetHeight : 200);
  outer.style.height = `${Math.max(Math.ceil(logicalH * s), 1)}px`;
}

export type IframeScaleMount = {
  outer: HTMLDivElement;
  inner: HTMLDivElement;
  updateScale: () => void;
  disconnect: () => void;
};

export function mountIframeMobileScale(iframe: HTMLIFrameElement): IframeScaleMount {
  const outer = document.createElement("div");
  outer.style.cssText = "width:100%;overflow:hidden;line-height:0;";
  const inner = document.createElement("div");
  inner.style.cssText = `width:${IFRAME_EMBED_DESKTOP_WIDTH}px;transform-origin:0 0;will-change:transform;`;
  iframe.style.width = `${IFRAME_EMBED_DESKTOP_WIDTH}px`;
  iframe.style.maxWidth = `${IFRAME_EMBED_DESKTOP_WIDTH}px`;
  iframe.style.display = "block";
  inner.appendChild(iframe);
  outer.appendChild(inner);

  const updateScale = () => syncIframeScaleLayout(outer, inner, iframe);

  const ro = new ResizeObserver(() => requestAnimationFrame(updateScale));
  ro.observe(outer);

  return {
    outer,
    inner,
    updateScale,
    disconnect: () => {
      ro.disconnect();
    },
  };
}
