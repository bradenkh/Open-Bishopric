/**
 * Generate a downloadable PDF from a single DOM node. The node is expected to
 * carry its own <style> (self-contained), so it renders the same in the capture
 * iframe as it does in the on-screen preview.
 *
 * We clone the node's markup into a hidden, isolated iframe (free of the app's
 * Tailwind/oklch theme variables), rasterize that with html2canvas, then lay the
 * image into a letter-size PDF — paginating vertically when the content is taller
 * than a single page — and trigger a download.
 */
export async function downloadNodeAsPdf(node: HTMLElement, title: string) {
  // Letter @ 96dpi: 7.5in content width (8.5in page − 0.5in margins each side).
  const CONTENT_WIDTH_PX = 720;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = `${CONTENT_WIDTH_PX}px`;
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  };

  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
        `<style>html,body{margin:0;padding:0;background:#fff}</style>` +
        `</head><body>${node.outerHTML}</body></html>`,
    );
    doc.close();

    // Let fonts/layout settle before capturing.
    await new Promise((r) => setTimeout(r, 150));
    if (doc.fonts?.ready) {
      try { await doc.fonts.ready; } catch { /* ignore */ }
    }

    const body = doc.body;
    const captureWidth = CONTENT_WIDTH_PX;
    const captureHeight = Math.max(body.scrollHeight, body.offsetHeight);
    // Realize the full layout height so the rasterizer captures everything.
    iframe.style.height = `${captureHeight}px`;

    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await html2canvas(body, {
      backgroundColor: "#ffffff",
      scale: 2,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
    });

    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });

    const pageWidth = pdf.internal.pageSize.getWidth();   // 612pt
    const pageHeight = pdf.internal.pageSize.getHeight();  // 792pt
    const margin = 36;                                     // 0.5in
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    // Scale the captured image to the usable page width.
    const imgWidth = usableWidth;
    const imgHeight = (canvas.height / canvas.width) * imgWidth;
    const imgData = canvas.toDataURL("image/png");

    if (imgHeight <= usableHeight) {
      pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
    } else {
      // Slice the tall image across pages by repositioning it within a clipped
      // page region (top margin .. top margin + usableHeight).
      let remaining = imgHeight;
      let position = margin;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        // Mask the overflow below the usable area so the next slice starts clean.
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, margin + usableHeight, pageWidth, pageHeight, "F");
        pdf.rect(0, 0, pageWidth, margin, "F");
        remaining -= usableHeight;
        if (remaining > 0) {
          pdf.addPage();
          position -= usableHeight;
        }
      }
    }

    const filename = `${title}.pdf`.replace(/[\\/:*?"<>|]+/g, " ").trim();
    pdf.save(filename);
  } finally {
    cleanup();
  }
}
