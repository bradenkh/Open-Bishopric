"use client";

import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Calling, WardBusiness } from "@/types";
import {
  WARD_BUSINESS_CATEGORIES,
  AUTO_SEEDED_CATEGORIES,
  makeEntry,
} from "@/lib/ward";

interface Props {
  business: WardBusiness;
  callings: Calling[];
  /** Who is presiding — printed on the business document. */
  presiding: string;
  onPresidingChange: (value: string) => void;
  onChange: (next: WardBusiness) => void;
}

/**
 * Inline editor for a sacrament meeting's ward business, one block per fixed
 * category (see WARD_BUSINESS_CATEGORIES). Release / Sustainings / Setting Aparts
 * are auto-seeded from callings when the doc is first opened and offer a "Pull
 * from callings" action to top up new lines; every category is freely editable.
 * Mirrors BulletinEditor: mutations bubble a whole new object up via onChange and
 * the parent persists.
 */
export function BusinessEditor({ business, callings, presiding, onPresidingChange, onChange }: Props) {
  function setEntries(category: string, entries: WardBusiness[string]) {
    onChange({ ...business, [category]: entries });
  }

  function addLine(category: string) {
    setEntries(category, [...(business[category] ?? []), makeEntry("")]);
  }

  function updateLine(category: string, id: string, text: string) {
    setEntries(
      category,
      (business[category] ?? []).map((e) => (e.id === id ? { ...e, text } : e)),
    );
  }

  function removeLine(category: string, id: string) {
    setEntries(category, (business[category] ?? []).filter((e) => e.id !== id));
  }

  /** Append callings-derived lines not already present (dedupe by exact text). */
  function pullFromCallings(category: string) {
    const derive = AUTO_SEEDED_CATEGORIES[category as keyof typeof AUTO_SEEDED_CATEGORIES];
    if (!derive) return;
    const entries = business[category] ?? [];
    const present = new Set(entries.map((e) => e.text));
    const additions = derive(callings)
      .filter((text) => !present.has(text))
      .map(makeEntry);
    if (additions.length === 0) return;
    setEntries(category, [...entries, ...additions]);
  }

  return (
    <div className="space-y-3">
      {/* Presiding — printed on the business document header */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">Presiding</label>
        <Input
          value={presiding}
          onChange={(e) => onPresidingChange(e.target.value)}
          placeholder="Who is presiding"
          className="h-8"
        />
      </div>

      {WARD_BUSINESS_CATEGORIES.map((category) => {
        const entries = business[category] ?? [];
        const isAuto = category in AUTO_SEEDED_CATEGORIES;
        return (
          <div key={category} className="rounded-lg border border-border bg-card p-3 space-y-2">
            {/* Category header */}
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex-1">
                {category}
                {entries.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground/60 tabular-nums">{entries.length}</span>
                )}
              </p>
              {isAuto && (
                <>
                  <span className="text-[10px] font-medium text-muted-foreground/60 rounded-full bg-muted px-1.5 py-0.5">
                    auto
                  </span>
                  <button
                    type="button"
                    onClick={() => pullFromCallings(category)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Add matching lines from the callings pipeline"
                  >
                    <RefreshCw className="h-3 w-3" /> Pull from callings
                  </button>
                </>
              )}
            </div>

            {/* Lines */}
            {entries.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/50 italic">No items yet</p>
            ) : (
              <ul className="space-y-1">
                {entries.map((entry) => (
                  <li key={entry.id} className="group flex items-center gap-2">
                    <Input
                      value={entry.text}
                      onChange={(e) => updateLine(category, entry.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addLine(category); }
                      }}
                      placeholder="Name — position, or a note"
                      className="h-8 flex-1"
                    />
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground/40 hover:text-red-600"
                      onClick={() => removeLine(category, entry.id)}
                      title="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => addLine(category)}
            >
              <Plus className="h-3 w-3" /> Add line
            </Button>
          </div>
        );
      })}
    </div>
  );
}
