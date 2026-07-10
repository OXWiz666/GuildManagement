"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { adminApi, type PlatformAdminProfile } from "@/lib/api";

// Platform modules — Phase 0 ships the shell + Overview only.
// Later phases enable the rest (see the Super Admin roadmap).
const NAV: { href: string; label: string; ready: boolean }[] = [
  { href: "/admin", label: "Overview", ready: true },
  { href: "/admin/users", label: "Users", ready: true },
  { href: "/admin/guilds", label: "Guilds", ready: true },
  { href: "/admin/billing", label: "Billing", ready: true },
  { href: "/admin/feature-flags", label: "Feature Flags", ready: false },
  { href: "/admin/announcements", label: "Notifications", ready: false },
  { href: "/admin/settings", label: "System Settings", ready: false },
  { href: "/admin/api", label: "API & Analytics", ready: false },
];

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-[var(--obsidian-deep)] flex flex-col items-center justify-center gap-4 text-white/60">
      <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-[var(--forge-gold)] animate-spin" />
      <p className="text-xs uppercase tracking-[0.24em] text-white/40">{label}</p>
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isSessionReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<PlatformAdminProfile | null>(null);

  useEffect(() => setMounted(true), []);

  // Redirect unauthenticated users to login (same contract as the dashboard shell).
  useEffect(() => {
    if (mounted && !isLoading && isSessionReady && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isLoading, isSessionReady, isAuthenticated, router]);

  // Once authenticated, verify platform-admin access. Non-admins go back to the app.
  useEffect(() => {
    if (!isSessionReady || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setChecking(true);
      try {
        const res = await adminApi.getMe();
        if (cancelled) return;
        if (res.success && res.data?.platformAdmin) {
          setProfile(res.data.platformAdmin);
        } else {
          router.replace("/dashboard");
        }
      } catch {
        if (!cancelled) router.replace("/dashboard");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSessionReady, isAuthenticated, router]);

  if (!mounted || isLoading || !isSessionReady) return <LoadingScreen label="Loading" />;
  if (!isAuthenticated) return <LoadingScreen label="Redirecting" />;
  if (checking || !profile) return <LoadingScreen label="Verifying access" />;

  const roleLabel = profile.role.replace("_", " ");

  return (
    <div className="min-h-screen bg-[var(--obsidian-deep)] text-white/85">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0b0c10]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-black tracking-tight text-white">
              ForgeKeep <span className="text-[var(--forge-gold-bright)]">Platform</span>
            </span>
            <span className="rounded-md border border-[var(--forge-gold)]/25 bg-[var(--forge-gold)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--forge-gold-bright)]">
              {roleLabel}
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-white/50 transition-colors hover:text-white/90"
          >
            ← Back to app
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Side nav */}
        <nav className="hidden w-52 shrink-0 md:block">
          <ul className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const base =
                "flex items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-all";
              if (!item.ready) {
                return (
                  <li key={item.href}>
                    <span className={`${base} cursor-not-allowed text-white/25`}>
                      {item.label}
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/30">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${base} ${
                      active
                        ? "bg-white/[0.06] text-white"
                        : "text-white/55 hover:bg-white/[0.03] hover:text-white/85"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
