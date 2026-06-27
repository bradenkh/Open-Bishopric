"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { Announcement, Meeting, WardInfo } from "@/types";
import { downloadNodeAsPdf } from "@/lib/print";
import { formatText } from "@/lib/format-text";

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
.bulletin .footer{margin-top:16px;text-align:center;font-size:9pt}
.bulletin .footer .roles{display:flex;justify-content:center;gap:40px;margin-bottom:8px}
.bulletin .footer .second{margin-bottom:14px}
.bulletin .footer .contacts{font-size:8.5pt;color:#222;line-height:1.5}
.bulletin .right .quote{text-align:center;font-size:9.5pt;margin-bottom:16px}
.bulletin .right .quote .by{display:block;margin-top:3px}
.bulletin .right h2{text-align:center;font-size:12pt;font-weight:700;text-decoration:underline;margin:0 0 12px}
.bulletin .right .ann{margin-bottom:11px;font-size:9pt}
.bulletin .right .ann .t{font-weight:700}
.bulletin .right .ann .meta{color:#555;font-style:italic}
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

/** A light "June 19 · 6:00 PM · location" meta line for an announcement. */
function announcementMeta(a: Announcement): string {
  const bits: string[] = [];
  if (a.date) {
    const [, m, d] = a.date.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let when = `${months[m - 1]} ${d}`;
    if (a.time) {
      const [h, min] = a.time.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const hr = h % 12 === 0 ? 12 : h % 12;
      when += ` · ${hr}:${String(min).padStart(2, "0")} ${period}`;
    }
    bits.push(when);
  }
  if (a.location) bits.push(a.location);
  return bits.join(" · ");
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
  const program = meeting.program ?? { rows: [] };
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (!ref.current || downloading) return;
    setDownloading(true);
    try {
      await downloadNodeAsPdf(ref.current, `${ward.wardName} Bulletin`);
    } finally {
      setDownloading(false);
    }
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
                {program.conducting && (
                  <li>
                    <span className="label">Conducting</span>
                    <span className="value">{program.conducting}</span>
                  </li>
                )}
                {program.rows.map((row) => {
                  if (!row.value) {
                    return <li key={row.id} className="full">{row.label}</li>;
                  }
                  return (
                    <li key={row.id}>
                      <span className="label">{row.label}</span>
                      <span className="value">{row.value}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="footer">
                <div className="roles">
                  {program.chorister && <span>Chorister – {program.chorister}</span>}
                  {program.organist && <span>Organist – {program.organist}</span>}
                </div>
                {program.secondHour && <div className="second">Second hour – {program.secondHour}</div>}
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
                announcements.map((a) => {
                  const meta = announcementMeta(a);
                  return (
                    <p key={a.id} className="ann">
                      <span className="t">{a.title}:</span>{" "}
                      {a.description && formatText(a.description)}
                      {meta && <span className="meta"> ({meta})</span>}
                    </p>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={download} disabled={downloading} className="gap-2">
            {downloading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              : <><Download className="h-4 w-4" /> Download PDF</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
