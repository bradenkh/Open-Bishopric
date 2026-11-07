import { jsPDF } from "jspdf";
import type { Announcement, Meeting, WardInfo } from "@/types";

/**
 * Draws the sacrament meeting bulletin as a letter-size PDF with real (vector)
 * text. It runs in the browser (the bulletin dialog's Download button) and on
 * the server (the MCP `getBulletinPdf` tool), so the file someone inspects
 * remotely is the same file that gets printed.
 *
 * Layout: a full-width letterhead with the meeting and date set between rules,
 * then two columns (order of service on the left, a boxed panel with the quote
 * and announcements on the right), and the bishopric's contacts along the
 * bottom of the page. Black and white only, for the ward's printer.
 */

export interface BulletinPdfInput {
  meeting: Pick<Meeting, "date" | "program">;
  ward: WardInfo;
  announcements: Pick<Announcement, "title" | "description">[];
}

// Letter page, 0.5in margins, plus the bulletin's own 0.3in padding.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const GAP = 22;
const INNER_W = PAGE_W - MARGIN * 2;
const LEFT_W = (INNER_W - GAP) * 0.6;
const RIGHT_W = INNER_W - GAP - LEFT_W;
const LEFT_X = MARGIN;
const RIGHT_X = MARGIN + LEFT_W + GAP;
const BOTTOM = PAGE_H - MARGIN;
const LINE = 1.35;
const FONT = "times";

// The bulletin is printed in black and white, so everything is black or gray
// line work and text: no colour and no filled areas.
type RGB = [number, number, number];
const INK: RGB = [17, 17, 17];
const ACCENT: RGB = INK;
const MUTED: RGB = [85, 85, 85];
const GOLD: RGB = [120, 120, 120];
const RULE: RGB = [170, 170, 170];

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
    .replace(/[\u2010\u2011\u2012]/g, "-")
    .replace(/[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u20ac\u2122\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc]/g, "");
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
    for (const p of clean(run.text).split(/([ \t\r\n]+)/)) {
      if (p === "") continue;
      if (/^[ \t\r\n]+$/.test(p)) { sawSpace = true; continue; }
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
  const program = meeting.program ?? { rows: [] };
  const color = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB, w: number) => { pdf.setDrawColor(c[0], c[1], c[2]); pdf.setLineWidth(w); };

  // ── Footer (measured first so the columns know where to stop) ──────────────
  const FOOT_SIZE = 8.5;
  // One paragraph: "Name, Role: (555) 555-5555; ..." then the submission note.
  // Phone numbers use non-breaking spaces so they never split across lines.
  const contacts = ward.leadership
    .map((l) => `**${l.name}**, ${l.role}${l.phone ? `: ${l.phone.replace(/ /g, "\u00a0")}` : ""}`)
    .join(";  ");
  const FOOT_W = INNER_W - 40;
  const note = (ward.submissionNote ?? "").replace(/\((\d{3})\) (\d{3})/g, "($1)\u00a0$2");
  const contactLines = contacts ? measureLines(pdf, contacts, FOOT_SIZE, FOOT_W) : 0;
  const noteLines = note ? measureLines(pdf, note, FOOT_SIZE, FOOT_W, "italic") : 0;
  const footerH = 10 + contactLines * FOOT_SIZE * LINE + (contactLines && noteLines ? 4 : 0) + noteLines * FOOT_SIZE * LINE;
  const footerTop = BOTTOM - footerH;

  // ── Letterhead ─────────────────────────────────────────────────────────────
  let y = MARGIN;
  const full = { x: MARGIN, width: INNER_W, align: "center" as const };
  color(ACCENT);
  y = drawText(pdf, `Welcome to the ${ward.wardName}`, { ...full, top: y, size: 22, style: "bold" }) + 2;
  color(MUTED);
  const subs = [ward.churchName, [ward.stake, ward.address].filter(Boolean).join("  ·  ")].filter(Boolean);
  for (const sub of subs) y = drawText(pdf, sub, { ...full, top: y, size: 9.5, style: "italic" });
  y += 8;

  // Meeting title, time and date between a heavy and a light rule.
  const bandH = 26;
  stroke(INK, 1.6);
  pdf.line(MARGIN, y, MARGIN + INNER_W, y);
  stroke(INK, 0.5);
  pdf.line(MARGIN, y + 2.5, MARGIN + INNER_W, y + 2.5);
  pdf.line(MARGIN, y + bandH - 2.5, MARGIN + INNER_W, y + bandH - 2.5);
  stroke(INK, 1.6);
  pdf.line(MARGIN, y + bandH, MARGIN + INNER_W, y + bandH);
  color(INK);
  const band = [ward.meetingTitle, ward.meetingTime, bulletinDate(meeting.date)].filter(Boolean).join("   •   ");
  drawText(pdf, band, { ...full, top: y + (bandH - 12 * LINE) / 2, size: 12, style: "bold" });
  y += bandH + 16;
  const columnsTop = y;

  // Column bodies flow onto extra pages only if a week is unusually long.
  let page = 1;
  let lastPage = 1;
  const pageFor = (n: number) => {
    while (pdf.getNumberOfPages() < n) pdf.addPage();
    pdf.setPage(n);
    lastPage = Math.max(lastPage, n);
  };
  const flow = (yy: number, needed: number, limit: number): number => {
    if (yy + needed <= limit) return yy;
    page += 1;
    pageFor(page);
    return MARGIN;
  };
  const colBottom = footerTop - 14;

  // ── Left column: order of service ──────────────────────────────────────────
  const heading = (text: string, x: number, width: number, top: number): number => {
    color(ACCENT);
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(10);
    pdf.setCharSpace(1.6);
    const label = text.toUpperCase();
    const w = pdf.getTextWidth(label) + 1.6 * label.length;
    const cx = x + (width - w) / 2;
    const base = top + 10;
    pdf.text(label, cx, base);
    pdf.setCharSpace(0);
    stroke(GOLD, 0.8);
    pdf.line(x, base - 3.5, cx - 8, base - 3.5);
    pdf.line(cx + w + 8, base - 3.5, x + width, base - 3.5);
    return top + 22;
  };
  y = heading("Order of Service", LEFT_X, LEFT_W, y);

  const rows: { label: string; value?: string }[] = [];
  if (program.conducting) rows.push({ label: "Conducting", value: program.conducting });
  for (const r of program.rows) rows.push({ label: r.label, value: r.value });
  const roles = [
    program.chorister ? `Chorister: ${program.chorister}` : "",
    program.organist ? `Organist: ${program.organist}` : "",
  ].filter(Boolean);

  const SIZE = 10.5;
  const LABEL_SIZE = 8.5;
  const lineH = SIZE * LINE;
  const valueW = LEFT_W * 0.62;
  const heights = rows.map((row) =>
    row.value
      ? measureLines(pdf, row.value, SIZE, valueW) * lineH
      : measureLines(pdf, row.label, SIZE + 0.5, LEFT_W - 20, "italic") * lineH,
  );
  // Spread spare room across the rows so the program fills the column.
  const rolesH = roles.length ? 9 * LINE + 12 : 0;
  const natural = heights.reduce((a, h) => a + h + 12, 0);
  const spare = colBottom - y - rolesH - natural - 6; // a little slack for rounding
  const PAD = 6 + (rows.length ? Math.min(5, Math.max(0, spare / rows.length / 2)) : 0);

  rows.forEach((row, i) => {
    const h = heights[i];
    y = flow(y, h + PAD * 2, colBottom);
    const top = y + PAD;
    if (!row.value) {
      // A row with no value (the sacrament) is a set-off break in the program.
      stroke(INK, 0.5);
      pdf.line(LEFT_X, y + 1.5, LEFT_X + LEFT_W, y + 1.5);
      pdf.line(LEFT_X, y + h + PAD * 2 - 1.5, LEFT_X + LEFT_W, y + h + PAD * 2 - 1.5);
      color(ACCENT);
      drawText(pdf, row.label, { x: LEFT_X + 10, width: LEFT_W - 20, top, size: SIZE + 0.5, style: "italic", align: "center" });
    } else {
      // Labels are short, letter-spaced small caps on one line.
      color(MUTED);
      pdf.setFont(FONT, "normal");
      pdf.setFontSize(LABEL_SIZE);
      pdf.setCharSpace(0.6);
      pdf.text(clean(row.label.toUpperCase()), LEFT_X, top + (lineH - SIZE) / 2 + SIZE * 0.8);
      pdf.setCharSpace(0);
      color(INK);
      drawText(pdf, row.value, { x: LEFT_X + LEFT_W - valueW, width: valueW, top, size: SIZE, align: "right" });
    }
    y = top + h + PAD;
    const next = rows[i + 1];
    if (row.value && next?.value) {
      stroke(RULE, 0.6);
      pdf.line(LEFT_X, y, LEFT_X + LEFT_W, y);
    }
  });

  if (roles.length) {
    y = flow(y, rolesH, colBottom) + 12;
    color(MUTED);
    drawText(pdf, roles.join("     |     "), { x: LEFT_X, width: LEFT_W, top: y, size: 9, style: "italic", align: "center" });
  }
  const leftEndPage = page;

  // ── Right column: quote and announcements in a boxed panel ────────────────
  page = 1;
  pageFor(1);
  const PANEL_PAD = 12;
  const px = RIGHT_X + PANEL_PAD;
  const pw = RIGHT_W - PANEL_PAD * 2;
  const panelTop = columnsTop;
  // The box hugs its contents, so it is drawn once the text is laid out:
  // `boxTop` is where the box starts on the page being filled.
  let boxTop = panelTop;
  const drawBox = (bottom: number) => {
    stroke(RULE, 0.6);
    pdf.rect(RIGHT_X, boxTop, RIGHT_W, bottom - boxTop, "S");
    stroke(INK, 1.6);
    pdf.line(RIGHT_X, boxTop, RIGHT_X + RIGHT_W, boxTop);
  };

  let ry = panelTop + PANEL_PAD + 2;
  if (program.quote) {
    color(ACCENT);
    pdf.setFont(FONT, "bold");
    pdf.setFontSize(26);
    pdf.text("“", RIGHT_X + RIGHT_W / 2, ry + 16, { align: "center" });
    ry += 14;
    color(INK);
    ry = drawText(pdf, program.quote, { x: px, width: pw, top: ry, size: 10, style: "italic", align: "center" });
    if (program.quoteBy) {
      color(MUTED);
      ry = drawText(pdf, `– ${program.quoteBy}`, { x: px, width: pw, top: ry + 3, size: 9, align: "center" });
    }
    ry += 14;
  }
  ry = heading("Announcements", px, pw, ry);

  const list = announcements.length ? announcements : [{ title: "", description: "No announcements this week." }];
  // The text size adapts to the week: it grows (up to 10.5pt) on a light week
  // and shrinks (down to 7.5pt) to keep a heavy week on one page, and the box
  // ends just below the last announcement. Past 7.5pt the announcements carry
  // on to a second page rather than getting unreadable.
  const annHeight = (size: number) =>
    list.reduce((sum, a, i) =>
      sum +
      (a.title ? measureLines(pdf, a.title, size + 1, pw, "bold") * (size + 1) * LINE + 1 : 0) +
      (a.description ? measureLines(pdf, a.description, size, pw) * size * LINE : 0) +
      (i < list.length - 1 ? 13 : 0), 0);
  const fits = (size: number) => ry + annHeight(size) <= colBottom - PANEL_PAD;
  let ANN = 9;
  while (ANN < 10.5 && fits(ANN + 0.25)) ANN += 0.25;
  while (ANN > 7.5 && !fits(ANN)) ANN -= 0.25;
  list.forEach((a, i) => {
    const titleH = a.title ? measureLines(pdf, a.title, ANN + 1, pw, "bold") * (ANN + 1) * LINE : 0;
    const bodyH = a.description ? measureLines(pdf, a.description, ANN, pw) * ANN * LINE : 0;
    if (ry + titleH + bodyH > colBottom - PANEL_PAD) {
      // Continued on a new page: close this page's box at the column bottom
      // and start a new box at the top of the next page.
      drawBox(colBottom);
      ry = flow(ry, titleH + bodyH, colBottom - PANEL_PAD);
      boxTop = ry;
      ry += PANEL_PAD + 2;
    }
    if (a.title) {
      color(ACCENT);
      ry = drawText(pdf, a.title.replace(/\*/g, ""), { x: px, width: pw, top: ry, size: ANN + 1, style: "bold" }) + 1;
    }
    if (a.description) {
      color(INK);
      ry = drawText(pdf, a.description, { x: px, width: pw, top: ry, size: ANN });
    }
    if (i < list.length - 1) {
      ry += 6;
      stroke(GOLD, 0.5);
      pdf.line(px + pw * 0.35, ry, px + pw * 0.65, ry);
      ry += 7;
    }
  });

  drawBox(Math.min(colBottom, ry + PANEL_PAD));

  // ── Footer on the last page ────────────────────────────────────────────────
  pageFor(Math.max(lastPage, leftEndPage, page));
  let fy = footerTop;
  stroke(ACCENT, 0.8);
  pdf.line(MARGIN, fy, MARGIN + INNER_W, fy);
  fy += 10;
  if (contacts) {
    color(INK);
    fy = drawText(pdf, contacts, { x: MARGIN + 20, width: FOOT_W, top: fy, size: FOOT_SIZE, align: "center" }) + 4;
  }
  if (ward.submissionNote) {
    color(MUTED);
    drawText(pdf, note, { x: MARGIN + 20, width: FOOT_W, top: fy, size: FOOT_SIZE, style: "italic", align: "center" });
  }

  pdf.setPage(1);
  return pdf;
}

/** The bulletin PDF as raw bytes. */
export function bulletinPdfBytes(input: BulletinPdfInput): Uint8Array {
  return new Uint8Array(buildBulletinPdf(input).output("arraybuffer"));
}
