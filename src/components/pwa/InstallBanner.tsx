"use client";

import { useState } from "react";
import { Church, X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { IOSInstallInstructions } from "./IOSInstallInstructions";
import { cn } from "@/lib/utils";

interface Props {
  /** "banner" = fixed strip above bottom nav (dashboard).
   *  "inline" = card block inside a page (landing). */
  variant?: "banner" | "inline";
}

export function InstallBanner({ variant = "banner" }: Props) {
  const { canInstall, isIOS, isInstalled, promptInstall, dismiss } = usePWAInstall();
  const [iosOpen, setIosOpen] = useState(false);

  // Nothing to show
  if (!canInstall || isInstalled) return null;

  const handleInstall = () => {
    if (isIOS) {
      setIosOpen(true);
    } else {
      promptInstall();
    }
  };

  const handleDismiss = () => {
    dismiss();
    setIosOpen(false);
  };

  if (variant === "banner") {
    return (
      <>
        <div
          className={cn(
            // Sits above the 64px bottom nav; hidden on desktop where sidebar is shown
            "fixed bottom-16 left-0 right-0 z-30 lg:hidden",
            "border-t border-border bg-background shadow-lg"
          )}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Church className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">Install Open Bishopric</p>
              <p className="text-xs text-muted-foreground leading-tight truncate">
                Add to home screen for quick access
              </p>
            </div>
            <Button size="sm" onClick={handleInstall} className="shrink-0 gap-1.5">
              {isIOS ? <Smartphone className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {isIOS ? "How to" : "Install"}
            </Button>
            <button
              onClick={handleDismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <IOSInstallInstructions
          open={iosOpen}
          onClose={() => { setIosOpen(false); handleDismiss(); }}
        />
      </>
    );
  }

  // Inline variant (landing page)
  return (
    <>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Church className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Install for quick access</p>
            <p className="text-xs text-muted-foreground">Works offline, no app store needed</p>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Button onClick={handleInstall} className="mt-3 w-full gap-2" size="sm">
          {isIOS ? <Smartphone className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {isIOS ? "Add to Home Screen" : "Install App"}
        </Button>
      </div>
      <IOSInstallInstructions
        open={iosOpen}
        onClose={() => { setIosOpen(false); handleDismiss(); }}
      />
    </>
  );
}
