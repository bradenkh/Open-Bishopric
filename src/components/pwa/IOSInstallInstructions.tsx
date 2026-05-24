"use client";

import { Share, PlusSquare, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: Share,
    title: "Tap the Share button",
    description: "Find it at the bottom of your Safari browser bar",
  },
  {
    icon: PlusSquare,
    title: 'Tap "Add to Home Screen"',
    description: "Scroll down in the share sheet to find this option",
  },
  {
    icon: Check,
    title: 'Tap "Add" to confirm',
    description: "Open Bishopric will appear on your home screen",
  },
];

export function IOSInstallInstructions({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Home Screen</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          Install Open Bishopric for quick access and an app-like experience.
        </p>

        <ol className="space-y-4 mt-1">
          {STEPS.map(({ icon: Icon, title, description }, i) => (
            <li key={i} className="flex items-start gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
