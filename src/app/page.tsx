"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LDSChurchIcon } from "@/components/icons/lds-church-icon";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { InstallBanner } from "@/components/pwa/InstallBanner";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-background px-6 py-16">
      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center w-full max-w-sm">
        {/* Logo */}
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 shadow-sm">
          <LDSChurchIcon className="h-10 w-10 text-primary" />
        </div>

        {/* Title + tagline */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Open Bishopric</h1>
          <p className="text-muted-foreground leading-relaxed">
            Ward leadership management for bishops, counselors, and clerks.
          </p>
        </div>

        {/* CTA */}
        <Button asChild size="lg" className="w-full rounded-xl text-base">
          <Link href="/login">Sign In</Link>
        </Button>

        {/* PWA install prompt (shows only when installable / dismissed) */}
        <InstallBanner variant="inline" />
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground mt-8">
        Open Bishopric · For the ward
      </p>
    </div>
  );
}
