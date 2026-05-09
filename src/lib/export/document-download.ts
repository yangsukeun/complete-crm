"use client";

function sanitizeFileBase(name: string): string {
  return name.replace(/[^\w\uAC00-\uD7A3\-]+/g, "_").slice(0, 80) || "export";
}

export async function downloadContentAsPdf(opts: {
  title: string;
  body: string;
  fileBase: string;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(opts.title, pageW - margin * 2);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 18 + 12;

  doc.setFontSize(11);
  const bodyText = opts.body.trim() || "(내용 없음)";
  const lines = doc.splitTextToSize(bodyText, pageW - margin * 2);
  const lineHeight = 14;
  for (let i = 0; i < lines.length; i++) {
    if (y > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines[i] as string, margin, y);
    y += lineHeight;
  }
  doc.save(`${sanitizeFileBase(opts.fileBase)}.pdf`);
}

export async function downloadContentAsPptx(opts: {
  title: string;
  body: string;
  fileBase: string;
}): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  slide.addText(opts.title, { x: 0.5, y: 0.35, w: 12, h: 0.8, fontSize: 24, bold: true });
  slide.addText(opts.body.trim() || "(내용 없음)", {
    x: 0.5,
    y: 1.25,
    w: 12.5,
    h: 5.5,
    fontSize: 12,
    valign: "top",
    wrap: true,
  });
  await pptx.writeFile({ fileName: `${sanitizeFileBase(opts.fileBase)}.pptx` });
}
