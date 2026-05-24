"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, Users, CheckSquare, Church } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/members", label: "Members", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/callings", label: "Callings", icon: Church },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background pb-safe lg:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn("h-5 w-5 shrink-0", active && "stroke-[2.5]")}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
      <div
        aria-hidden="true"
        className="flex items-center justify-center bg-red-600 py-0.5 select-none"
      >
        <span className="text-[9px] font-bold tracking-widest text-white uppercase">
          Confidential – Bishopric
        </span>
      </div>
    </nav>
  );
}
