import { jsPDF } from "jspdf";
import type { Announcement, Meeting, WardInfo } from "@/types";

/**
 * Draws the sacrament meeting bulletin as a letter-size PDF with real (vector)
 * text. It runs in the browser (the bulletin dialog's Download button) and on
 * the server (the MCP `getBulletinPdf` tool), so the file someone inspects
 * remotely is the same file that gets printed.
 *
 * The layout mirrors BULLETIN_CSS in components/agendas/bulletin.tsx: a wide
 * left column (welcome, order of service, footer) and a narrow right column
 * (quote, announcements). Sizes are in points, matching the CSS's pt values.
 */

export interface BulletinPdfInput {
  meeting: Pick<Meeting, "date" | "program">;
  ward: WardInfo;
  announcements: Pick<Announcement, "title" | "description">[];
}

// Letter page, 0.5in margins, plus the bulletin's own 0.3in padding.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36 + 21.6;
const GAP = 22.5;
const INNER_W = PAGE_W - MARGIN * 2;
const LEFT_W = ((INNER_W - GAP) * 1.7) / 2.7;
const RIGHT_W = INNER_W - GAP - LEFT_W;
const LEFT_X = MARGIN;
const RIGHT_X = MARGIN + LEFT_W + GAP;
const BOTTOM = PAGE_H - MARGIN;
const LINE = 1.35;
const FONT = "times";

type Style = "normal" | "bold" | "italic" | "bolditalic";
interface Run { text: string; style: Style }

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function bulletinDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[m - 1]} ${ordinal(d)}, ${y}`;
}

/**
 * The standard PDF fonts only cover WinAnsi (cp1252). Curly quotes, dashes and
 * accented letters are in it; anything else is swapped for a close ASCII form
 * so it can't print as garbage.
 */
function clean(text: string): string {
  return text
    .replace(/[‐‑‒]/g, "-")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7e¡-ÿ–—‘’‚“”„†‡•…‰€™ŒœŠšŸŽžƒˆ˜]/g, "");
}

/** Split **bold** / *italic* markup (the announcement format) into styled runs. */
function parseRuns(line: string, base: Style): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const idx = m.index!;
    if (idx > last) runs.push({ text: line.slice(last, idx), style: base });
    if (m[2] !== undefined) runs.push({ text: m[2], style: base === "italic" ? "bolditalic" : "bold" });
    else if (m[3] !== undefined) runs.push({ text: m[3], style: base === "bold" ? "bolditalic" : "italic" });
    last = idx + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), style: base });
  return runs;
}

interface Word { text: string; style: Style; space: boolean }

/** Break styled runs into lines no wider than `width`. */
function wrapRuns(pdf: jsPDF, runs: Run[], size: number, width: number): Word[][] {
  // A word carries a leading space only when whitespace came before it, so
  // "**Bold:** text" keeps its space while "**Bo**ld" stays one word.
  const words: Word[] = [];
  let sawSpace = false;
  for (const run of runs) {
    for (const p of clean(run.text).split(/(\s+)/)) {
      if (p === "") continue;
      if (/^\s+$/.test(p)) { sawSpace = true; continue; }
      words.push({ text: p, style: run.style, space: words.length > 0 && sawSpace });
      sawSpace = false;
    }
  }

  const widthOf = (w: Word) => {
    pdf.setFont(FONT, w.style);
    pdf.setFontSize(size);
    return pdf.getTextWidth(w.text);
  };
  pdf.setFont(FONT, "normal");
  pdf.setFontSize(size);
  const spaceW = pdf.getTextWidth(" ");

  // Pieces with no space between them (e.g. an italic date and the colon after
  // it) wrap together as one unit.
  const units: Word[][] = [];
  for (const w of words) {
    if (w.space || units.length === 0) units.push([w]);
    else units[units.length - 1].push(w);
  }

  const lines: Word[][] = [];
  let cur: Word[] = [];
  let curW = 0;
  for (const unit of units) {
    const uw = unit.reduce((n, w) => n + widthOf(w), 0);
    const add = (cur.length ? spaceW : 0) + uw;
    if (cur.length && curW + add > width) {
      lines.push(cur);
      cur = [{ ...unit[0], space: false }, ...unit.slice(1)];
      curW = uw;
    } else {
      cur.push(cur.length ? unit[0] : { ...unit[0], space: false }, ...unit.slice(1));
      curW += add;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function lineWidth(pdf: jsPDF, line: Word[], size: number): number {
  let w = 0;
  for (const word of line) {
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(size);
    if (word.space) w += pdf.getTextWidth(" ");
    pdf.setFont(FONT, word.style);
    w += pdf.getTextWidth(word.text);
  }
  return w;
}

type Align = "left" | "center" | "right";

/**
 * Draw wrapped text starting with its first line's top at `top`. Returns the
 * y just below the last line.
 */
function drawText(
  pdf: jsPDF,
  text: string | Run[],
  opts: { x: number; width: number; top: number; size: number; style?: Style; align?: Align; underline?: boolean },
): number {
  const { x, width, size, align = "left" } = opts;
  const lineH = size * LINE;
  const paragraphs = typeof text === "string" ? text.split("\n").map((l) => parseRuns(l, opts.style ?? "normal")) : [text];
  let y = opts.top;
  for (const runs of paragraphs) {
    const lines = runs.length ? wrapRuns(pdf, runs.map((r) => ({ ...r })), size, width) : [[]];
    for (const line of lines) {
      const w = lineWidth(pdf, line, size);
      let cx = align === "center" ? x + (width - w) / 2 : align === "right" ? x + width - w : x;
      // Baseline sits about 0.8 of the font size below the line box's top,
      // centred in the 1.35 line height like the browser does.
      const baseline = y + (lineH - size) / 2 + size * 0.8;
      const startX = cx;
      for (const word of line) {
        pdf.setFont(FONT, "normal");
        pdf.setFontSize(size);
        if (word.space) cx += pdf.getTextWidth(" ");
        pdf.setFont(FONT, word.style);
        pdf.text(word.text, cx, baseline);
        cx += pdf.getTextWidth(word.text);
      }
      if (opts.underline && line.length) {
        pdf.setLineWidth(0.6);
        pdf.setDrawColor(17, 17, 17);
        pdf.line(startX, baseline + 1.5, startX + w, baseline + 1.5);
      }
      y += lineH;
    }
  }
  return y;
}

function measureLines(pdf: jsPDF, text: string, size: number, width: number, style: Style = "normal"): number {
  return text.split("\n").reduce((n, l) => n + Math.max(1, wrapRuns(pdf, parseRuns(l, style), size, width).length), 0);
}

/** Build the bulletin PDF. */
export function buildBulletinPdf({ meeting, ward, announcements }: BulletinPdfInput): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  pdf.setProperties({ title: `${ward.wardName} Bulletin – ${bulletinDate(meeting.date)}`.trim() });
  pdf.setTextColor(17, 17, 17);
  const program = meeting.program ?? { rows: [] };

  // Columns flow independently; each starts a new page when it runs out of room.
  let page = 1;
  const pageFor = (n: number) => {
    while (pdf.getNumberOfPages() < n) pdf.addPage();
    pdf.setPage(n);
  };
  const flow = (y: number, needed: number, top: number): number => {
    if (y + needed <= BOTTOM) return y;
    page += 1;
    pageFor(page);
    return top;
  };

  // ── Left column ────────────────────────────────────────────────────────────
  let y = MARGIN;
  const centre = { x: LEFT_X, width: LEFT_W, align: "center" as const };
  y = drawText(pdf, `Welcome to the ${ward.wardName}`, { ...centre, top: y, size: 17, style: "bold" }) + 6;
  for (const sub of [ward.churchName, ward.stake, ward.address]) {
    y = drawText(pdf, sub ?? "", { ...centre, top: y + 1, size: 9, style: "bold" }) + 1;
  }
  y += 12;
  y = drawText(pdf, `${ward.meetingTitle} – ${ward.meetingTime}`, { ...centre, top: y, size: 12, style: "bold" });
  y = drawText(pdf, bulletinDate(meeting.date), { ...centre, top: y, size: 12, style: "bold" });
  y += 12;

  const rows: { label: string; value?: string }[] = [];
  if (program.conducting) rows.push({ label: "Conducting", value: program.conducting });
  for (const r of program.rows) rows.push({ label: r.label, value: r.value });

  const SIZE = 10;
  const PAD = 6.75;
  const lineH = SIZE * LINE;
  const innerW = LEFT_W - 3;
  for (const row of rows) {
    let height: number;
    if (!row.value) {
      height = measureLines(pdf, row.label, SIZE, innerW) * lineH;
    } else {
      const valueW = innerW * 0.6;
      const labelW = innerW - valueW - 10.5;
      height = Math.max(measureLines(pdf, row.label, SIZE, labelW), measureLines(pdf, row.value, SIZE, valueW)) * lineH;
    }
    y = flow(y, height + PAD * 2, MARGIN);
    const top = y + PAD;
    if (!row.value) {
      drawText(pdf, row.label, { x: LEFT_X + 1.5, width: innerW, top, size: SIZE, align: "center" });
    } else {
      const valueW = innerW * 0.6;
      const labelW = innerW - valueW - 10.5;
      drawText(pdf, row.label, { x: LEFT_X + 1.5, width: labelW, top, size: SIZE });
      drawText(pdf, row.value, { x: LEFT_X + 1.5 + innerW - valueW, width: valueW, top, size: SIZE, align: "right" });
    }
    y = top + height + PAD;
    pdf.setLineWidth(0.75);
    pdf.setDrawColor(188, 188, 188);
    pdf.line(LEFT_X, y, LEFT_X + LEFT_W, y);
  }

  // Footer: chorister / organist, leadership contacts, submission note.
  y += 12;
  const roles = [
    program.chorister ? `Chorister – ${program.chorister}` : "",
    program.organist ? `Organist – ${program.organist}` : "",
  ].filter(Boolean);
  const contacts = ward.leadership
    .map((l) => `${l.name}, ${l.role}${l.phone ? `: ${l.phone}` : ""}`)
    .join("; ");
  const footerH =
    (roles.length ? 9 * LINE + 6 : 0) +
    (contacts ? measureLines(pdf, contacts, 8.5, LEFT_W) * 8.5 * 1.5 : 0) +
    (ward.submissionNote ? 7.5 + measureLines(pdf, ward.submissionNote, 8.5, LEFT_W) * 8.5 * 1.5 : 0);
  y = flow(y, footerH, MARGIN);
  if (roles.length) {
    // Like the CSS's flex row: the roles centred together, 30pt apart.
    pdf.setFont(FONT, "normal");
    pdf.setFontSize(9);
    const widths = roles.map((r) => pdf.getTextWidth(clean(r)));
    const total = widths.reduce((a, b) => a + b, 0) + 30 * (roles.length - 1);
    let rx = LEFT_X + (LEFT_W - total) / 2;
    roles.forEach((r, i) => {
      drawText(pdf, r, { x: rx, width: widths[i] + 1, top: y, size: 9 });
      rx += widths[i] + 30;
    });
    y += 9 * LINE + 6;
  }
  if (contacts) {
    y = drawContacts(pdf, contacts, y);
  }
  if (ward.submissionNote) {
    drawContacts(pdf, ward.submissionNote, y + 7.5);
  }

  // ── Right column ───────────────────────────────────────────────────────────
  page = 1;
  pageFor(1);
  let ry = MARGIN;
  const rc = { x: RIGHT_X, width: RIGHT_W, align: "center" as const };
  if (program.quote) {
    ry = drawText(pdf, program.quote, { ...rc, top: ry, size: 9.5 });
    if (program.quoteBy) ry = drawText(pdf, `-${program.quoteBy}`, { ...rc, top: ry + 2, size: 9.5 });
    ry += 12;
  }
  ry = drawText(pdf, "Announcements", { ...rc, top: ry, size: 12, style: "bold", underline: true }) + 9;

  const list = announcements.length ? announcements : [{ title: "", description: "No announcements." }];
  for (const a of list) {
    const firstLine = (a.description ?? "").split("\n");
    const head = a.title ? `**${a.title.replace(/\*/g, "")}:** ` : "";
    const body = [head + (firstLine[0] ?? ""), ...firstLine.slice(1)].join("\n");
    const h = measureLines(pdf, body, 9, RIGHT_W) * 9 * LINE;
    ry = flow(ry, h, MARGIN);
    ry = drawText(pdf, body, { x: RIGHT_X, width: RIGHT_W, top: ry, size: 9 }) + 8;
  }

  pdf.setPage(1);
  return pdf;
}

function drawContacts(pdf: jsPDF, text: string, top: number): number {
  pdf.setTextColor(34, 34, 34);
  const size = 8.5;
  const paragraphs = text.split("\n");
  let y = top;
  for (const p of paragraphs) {
    const lines = wrapRuns(pdf, parseRuns(p, "normal"), size, LEFT_W);
    for (const line of lines) {
      const w = lineWidth(pdf, line, size);
      let cx = LEFT_X + (LEFT_W - w) / 2;
      const baseline = y + (size * 1.5 - size) / 2 + size * 0.8;
      for (const word of line) {
        pdf.setFont(FONT, "normal");
        pdf.setFontSize(size);
        if (word.space) cx += pdf.getTextWidth(" ");
        pdf.setFont(FONT, word.style);
        pdf.text(word.text, cx, baseline);
        cx += pdf.getTextWidth(word.text);
      }
      y += size * 1.5;
    }
  }
  pdf.setTextColor(17, 17, 17);
  return y;
}

/** The bulletin PDF as raw bytes. */
export function bulletinPdfBytes(input: BulletinPdfInput): Uint8Array {
  return new Uint8Array(buildBulletinPdf(input).output("arraybuffer"));
}
