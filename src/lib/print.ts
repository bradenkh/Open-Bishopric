/**
 * Print a single DOM node by cloning its markup into a hidden iframe. The node
 * is expected to carry its own <style> (self-contained), so it renders the same
 * in the iframe as it does on screen.
 */
export function printNode(node: HTMLElement, title: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><title>${title}</title>` +
    `<style>@page{size:letter;margin:0.5in}body{margin:0}</style>` +
    `</head><body>${node.outerHTML}</body></html>`,
  );
  doc.close();

  const win = iframe.contentWindow;
  if (!win) { document.body.removeChild(iframe); return; }
  win.focus();
  setTimeout(() => {
    win.print();
    setTimeout(() => document.body.removeChild(iframe), 500);
  }, 300);
}
