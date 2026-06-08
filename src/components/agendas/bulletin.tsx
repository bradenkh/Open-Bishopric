"use client";

import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { Announcement, Meeting, ProgramItem, WardInfo } from "@/types";

// Self-contained styles travel with the bulletin markup so the exact same DOM
// renders identically in the on-screen preview and the print iframe.
const BULLETIN_CSS = `
.bulletin{font-family:Georgia,'Times New Roman',serif;color:#111;background:#fff;width:100%;max-width:7.5in;margin:0 auto;padding:0.3in;box-sizing:border-box;display:grid;grid-template-columns:1.7fr 1fr;gap:30px;font-size:10pt;line-height:1.35}
.bulletin .welcome{text-align:center;margin-bottom:12px}
.bulletin .welcome h1{font-size:17pt;font-weight:700;margin:0 0 8px}
.bulletin .welcome .sub{font-size:9pt;font-weight:700;margin:1px 0}
.bulletin .welcome .meeting{font-size:12pt;font-weight:700;margin-top:12px}
.bulletin .welcome .date{font-size:12pt;font-weight:700}
.bulletin ul.program{list-style:none;margin:0;padding:0}
.bulletin ul.program li{border-bottom:1px solid #bcbcbc;padding:9px 2px;display:flex;justify-content:space-between;gap:14px}
.bulletin ul.program li.full{justify-content:center;text-align:center}
.bulletin ul.program .value{text-align:right;max-width:60%}
.bulletin .business{width:100%}
.bulletin .business .bh{text-align:center;font-weight:700}
.bulletin .business ul{margin:5px 0 0;padding-left:20px;text-align:left}
.bulletin .footer{margin-top:16px;text-align:center;font-size:9pt}
.bulletin .footer .roles{display:flex;justify-content:center;gap:40px;margin-bottom:8px}
.bulletin .footer .second{margin-bottom:14px}
.bulletin .footer .contacts{font-size:8.5pt;color:#222;line-height:1.5}
.bulletin .right .quote{text-align:center;font-size:9.5pt;margin-bottom:16px}
.bulletin .right .quote .by{display:block;margin-top:3px}
.bulletin .right h2{text-align:center;font-size:12pt;font-weight:700;text-decoration:underline;margin:0 0 12px}
.bulletin .right .ann{margin-bottom:11px;font-size:9pt}
.bulletin .right .ann .t{font-weight:700}
@media print{.bulletin{max-width:none;padding:0}}
`;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function bulletinDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[m - 1]} ${ordinal(d)}, ${y}`;
}

/** Right-hand value for a program row; empty string means a full-width row. */
function programValue(item: ProgramItem): string {
  switch (item.kind) {
    case "hymn":
      if (item.hymnNumber && item.topic) return `#${item.hymnNumber}, '${item.topic}'`;
      if (item.hymnNumber) return `#${item.hymnNumber}`;
      return item.topic ? `'${item.topic}'` : "";
    case "prayer":
      return item.person ?? "";
    case "speaker":
    case "musical_number":
      return item.person || item.topic || "";
    case "other":
      return item.person || item.topic || "";
    default:
      return "";
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
  ward: WardInfo;
  announcements: Announcement[];
}

export function BulletinDialog({ open, onOpenChange, meeting, ward, announcements }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const program = meeting.program ?? { items: [] };

  function print() {
    const node = ref.current;
    if (!node) return;
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
      `<!DOCTYPE html><html><head><title>${ward.wardName} Bulletin</title>` +
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulletin preview</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-white p-2 overflow-x-auto">
          <div className="bulletin" ref={ref}>
            <style dangerouslySetInnerHTML={{ __html: BULLETIN_CSS }} />

            {/* Left column: welcome + program + footer */}
            <div className="left">
              <div className="welcome">
                <h1>Welcome to the {ward.wardName}</h1>
                <p className="sub">{ward.churchName}</p>
                <p className="sub">{ward.stake}</p>
                <p className="sub">{ward.address}</p>
                <p className="meeting">{ward.meetingTitle} – {ward.meetingTime}</p>
                <p className="date">{bulletinDate(meeting.date)}</p>
              </div>

              <ul className="program">
                {program.items.map((item) => {
                  if (item.kind === "announcements") return null;
                  const label = item.label || item.kind;
                  if (item.kind === "business") {
                    const lines = (item.notes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
                    if (lines.length === 0) return null;
                    return (
                      <li key={item.id} className="full" style={{ display: "block" }}>
                        <div className="business">
                          <div className="bh">{label}</div>
                          <ul>
                            {lines.map((l, i) => <li key={i}>{l}</li>)}
                          </ul>
                        </div>
                      </li>
                    );
                  }
                  const value = programValue(item);
                  if (!value) {
                    return <li key={item.id} className="full">{label}</li>;
                  }
                  return (
                    <li key={item.id}>
                      <span className="label">{label}</span>
                      <span className="value">{value}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="footer">
                <div className="roles">
                  {program.chorister && <span>Chorister – {program.chorister}</span>}
                  {program.organist && <span>Organist – {program.organist}</span>}
                </div>
                {ward.secondHour && <div className="second">Second hour – {ward.secondHour}</div>}
                <div className="contacts">
                  {ward.leadership.map((l, i) => (
                    <span key={i}>
                      {l.name}, {l.role}{l.phone ? `: ${l.phone}` : ""}
                      {i < ward.leadership.length - 1 ? "; " : ""}
                    </span>
                  ))}
                </div>
                {ward.submissionNote && (
                  <div className="contacts" style={{ marginTop: "10px" }}>{ward.submissionNote}</div>
                )}
              </div>
            </div>

            {/* Right column: quote + announcements */}
            <div className="right">
              {program.quote && (
                <div className="quote">
                  {program.quote}
                  {program.quoteBy && <span className="by">-{program.quoteBy}</span>}
                </div>
              )}
              <h2>Announcements</h2>
              {announcements.length === 0 ? (
                <p className="ann">No announcements.</p>
              ) : (
                announcements.map((a) => (
                  <p key={a.id} className="ann">
                    <span className="t">{a.title}:</span> {a.details}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={print} className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
