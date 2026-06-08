"use client";

import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { WardInfo } from "@/types";
import { printNode } from "@/lib/print";

const DOC_CSS = `
.biz-doc{font-family:Georgia,'Times New Roman',serif;color:#111;background:#fff;max-width:6.8in;margin:0 auto;padding:0.3in;box-sizing:border-box;font-size:12pt;line-height:1.5}
.biz-doc h1{text-align:center;font-size:16pt;font-weight:700;margin:0 0 4px}
.biz-doc .sub{text-align:center;font-size:10pt;margin:0 0 22px}
.biz-doc h2{font-size:12pt;font-weight:700;text-decoration:underline;margin:18px 0 10px}
.biz-doc ol{padding-left:24px;margin:0}
.biz-doc li{margin-bottom:10px}
.biz-doc .none{font-style:italic;color:#555}
.biz-doc .note{margin-top:24px;font-size:9.5pt;color:#444;border-top:1px solid #ccc;padding-top:10px}
`;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function docDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[m - 1]} ${ordinal(d)}, ${y}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Meeting date (YYYY-MM-DD) the business is read in. */
  date: string;
  /** Who is presiding — printed on the business document only. */
  presiding?: string;
  /** Sustaining / release lines, derived from callings. */
  items: string[];
  ward: WardInfo;
}

export function BusinessDialog({ open, onOpenChange, date, presiding, items, ward }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = items;

  function print() {
    if (ref.current) printNode(ref.current, `${ward.wardName} Ward Business`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ward business</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-white p-2 overflow-x-auto">
          <div className="biz-doc" ref={ref}>
            <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
            <h1>Ward Business</h1>
            <p className="sub">
              {ward.wardName} · {docDate(date)}
              {presiding ? ` · Presiding: ${presiding}` : ""}
            </p>

            <h2>Proposed to be sustained</h2>
            {lines.length === 0 ? (
              <p className="none">No ward business this week.</p>
            ) : (
              <ol>
                {lines.map((l, i) => <li key={i}>{l}</li>)}
              </ol>
            )}

            <p className="note">
              All who can sustain may do so by the uplifted hand. Any opposed may so signify.
            </p>
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
