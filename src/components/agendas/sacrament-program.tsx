"use client";

import { Plus, Trash2, ChevronUp, ChevronDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BulletinRow, SacramentProgram } from "@/types";
import { anchorIndex, makeRow } from "@/lib/bulletin";
import { cn } from "@/lib/utils";

interface Props {
  program: SacramentProgram;
  onChange: (next: SacramentProgram) => void;
}

/**
 * Table editor for the bulletin's order of service. The "Administration of the
 * Sacrament" anchor is fixed in the middle; rows can be added above or below it
 * and edited inline. The whole thing is just the bulletin JSON (program.rows).
 */
export function BulletinEditor({ program, onChange }: Props) {
  const rows = program.rows;
  const anchor = anchorIndex(rows);

  function setField<K extends keyof SacramentProgram>(key: K, value: string) {
    onChange({ ...program, [key]: value || undefined });
  }

  function setRows(next: BulletinRow[]) {
    onChange({ ...program, rows: next });
  }

  function updateRow(id: string, patch: Partial<BulletinRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function deleteRow(id: string) {
    setRows(rows.filter((r) => r.id !== id));
  }

  /** Insert a blank row just above the anchor (bottom of the pre-sacrament section). */
  function addAbove() {
    const i = anchor < 0 ? rows.length : anchor;
    setRows([...rows.slice(0, i), makeRow(), ...rows.slice(i)]);
  }

  /** Insert a blank row at the very end (bottom of the post-sacrament section). */
  function addBelow() {
    setRows([...rows, makeRow()]);
  }

  /** Move a row up/down within its section — never crossing the anchor. */
  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    if (rows[idx].anchor || rows[target].anchor) return;
    const next = [...rows];
    [next[idx], next[target]] = [next[target], next[idx]];
    setRows(next);
  }

  const field = (label: string, key: keyof SacramentProgram, placeholder = "") => (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <Input
        value={(program[key] as string | undefined) ?? ""}
        onChange={(e) => setField(key, e.target.value)}
        placeholder={placeholder}
        className="h-8"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Editable bulletin header */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field("Presiding", "presiding", "Name")}
          {field("Conducting", "conducting", "Name")}
          {field("Second hour", "secondHour", "e.g. Sunday School")}
          {field("Chorister", "chorister", "Name")}
          {field("Organist", "organist", "Name")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Spiritual thought / quote</label>
            <Textarea
              value={program.quote ?? ""}
              onChange={(e) => setField("quote", e.target.value)}
              placeholder="Optional quote printed on the bulletin"
              rows={2}
            />
          </div>
          {field("Attribution", "quoteBy", "e.g. President Oaks")}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Presiding prints only on the ward business document. Conducting prints on the bulletin.
        </p>
      </div>

      <ul className="space-y-1">
        {rows.map((row, idx) => {
          if (row.anchor) {
            return (
              <li key={row.id} className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2">
                <Lock className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-sm font-medium text-center">{row.label}</span>
              </li>
            );
          }
          const upDisabled  = idx === 0 || rows[idx - 1]?.anchor;
          const downDisabled = idx === rows.length - 1 || rows[idx + 1]?.anchor;
          return (
            <li key={row.id} className="group flex items-center gap-2 rounded-lg bg-card border border-border px-2 py-1.5">
              <div className="flex flex-col">
                <button className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20" onClick={() => move(idx, -1)} disabled={upDisabled} title="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20" onClick={() => move(idx, 1)} disabled={downDisabled} title="Move down">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={row.label}
                onChange={(e) => updateRow(row.id, { label: e.target.value })}
                placeholder="Item (e.g. Opening Hymn)"
                className="h-8 flex-1"
              />
              <Input
                value={row.value ?? ""}
                onChange={(e) => updateRow(row.id, { value: e.target.value || undefined })}
                placeholder="Detail (e.g. #19, 'We Thank Thee…') — blank = full width"
                className="h-8 flex-1"
              />
              <button
                className="shrink-0 text-muted-foreground/40 hover:text-red-600"
                onClick={() => deleteRow(row.id)}
                title="Remove row"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className={cn("flex flex-wrap gap-2 pt-1")}>
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addAbove}>
          <Plus className="h-3 w-3" /> Add row above sacrament
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={addBelow}>
          <Plus className="h-3 w-3" /> Add row below sacrament
        </Button>
      </div>
    </div>
  );
}
