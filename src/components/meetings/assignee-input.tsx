"use client";

/**
 * Assignee typeahead — the same roster autocomplete used on the Tasks screen:
 * search ward members, pick one (canonical name + id), or type any name to
 * assign someone outside the ward (name only, no id).
 *
 * Controlled via `value` ({ id?, name }) and `onChange`. Each instance manages
 * its own dropdown state, so several can coexist (quick-add row + each task row).
 */

import { useMemo, useRef, useState } from "react";
import { User, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Member } from "@/types";
import { cn } from "@/lib/utils";

export interface AssigneeValue {
  id?: string;
  name: string;
}

export function AssigneeInput({
  value,
  onChange,
  members,
  placeholder = "Assign to (optional)",
  className,
  inputRef,
  onEnter,
}: {
  value: AssigneeValue;
  onChange: (v: AssigneeValue) => void;
  members: Member[];
  placeholder?: string;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Called on Enter (e.g. to submit a quick-add row). */
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const owners = useMemo(
    () =>
      [...members]
        .filter((m) => m.isActive)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
        ),
    [members],
  );

  const query = value.name.trim().toLowerCase();
  const matches = (query
    ? owners.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(query))
    : owners
  ).slice(0, 8);
  const isExactMember = owners.some(
    (m) => `${m.firstName} ${m.lastName}`.toLowerCase() === query,
  );

  const closeSoon = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        autoComplete="off"
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (closeSoon.current) clearTimeout(closeSoon.current);
          closeSoon.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setOpen(false);
            onEnter?.();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={value.id ? "pr-8" : undefined}
      />
      {value.id && (
        <Check className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
      )}
      {open && (matches.length > 0 || (!!value.name.trim() && !isExactMember)) && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full min-w-[12rem] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: m.id, name: `${m.firstName} ${m.lastName}` });
                  setOpen(false);
                }}
              >
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">
                  {m.firstName} {m.lastName}
                </span>
                {!m.email && <span className="text-[10px] text-muted-foreground">no email</span>}
              </button>
            </li>
          ))}
          {!!value.name.trim() && !isExactMember && (
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ name: value.name.trim() });
                  setOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  Use &ldquo;{value.name.trim()}&rdquo; (not in the ward)
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
