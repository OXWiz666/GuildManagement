"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Avatar from "@/components/ui/Avatar";
import { adminApi, type PlatformAdminProfile } from "@/lib/api";

// ─── Icons (inline, stroke-based to match the app's visual language) ──────
type IconProps = { className?: string };
const Icon = {
  overview: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  users: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </svg>
  ),
  guilds: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  billing: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  ),
  flags: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </svg>
  ),
  bell: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  settings: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  api: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 17l6-6-6-6" />
      <path d="M12 19h8" />
    </svg>
  ),
  logout: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  menu: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  shield: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M8 9h8" />
      <path d="M10 9v4l-2 2h8l-2-2V9" />
    </svg>
  ),
};

// Platform modules, grouped. Phase 0 ships Overview + Management; later phases
// enable the Platform group (see the Super Admin roadmap).
type NavItem = { href: string; label: string; ready: boolean; icon: (p: IconProps) => React.ReactNode };
type NavSection = { title: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    title: "Command",
    items: [{ href: "/admin", label: "Overview", ready: true, icon: Icon.overview }],
  },
  {
    title: "Management",
    items: [
      { href: "/admin/users", label: "Users", ready: true, icon: Icon.users },
      { href: "/admin/guilds", label: "Guilds", ready: true, icon: Icon.guilds },
      { href: "/admin/billing", label: "Billing", ready: true, icon: Icon.billing },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/feature-flags", label: "Feature Flags", ready: false, icon: Icon.flags },
      { href: "/admin/announcements", label: "Notifications", ready: false, icon: Icon.bell },
      { href: "/admin/settings", label: "System Settings", ready: false, icon: Icon.settings },
      { href: "/admin/api", label: "API & Analytics", ready: false, icon: Icon.api },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((s) => s.items);

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--obsidian-deep)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle 420px at 50% 42%, rgba(212,168,83,0.08), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-5">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-2xl border border-white/[0.05] bg-white/[0.01] backdrop-blur-sm" />
          <div className="premium-loader-spin absolute inset-0 rounded-2xl border-2 border-transparent border-t-[var(--forge-gold)]" />
          <Icon.shield className="premium-loader-pulse relative h-6 w-6 text-[var(--forge-gold)]" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/40">{label}</p>
      </div>
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, isSessionReady, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<PlatformAdminProfile | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close overlays when the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

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

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    window.location.href = "/login";
  }

  const pageTitle = useMemo(() => {
    // Longest matching href wins so /admin/users beats /admin.
    const match = ALL_ITEMS.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return match?.label ?? "Overview";
  }, [pathname]);

  if (!mounted || isLoading || !isSessionReady) return <LoadingScreen label="Loading" />;
  if (!isAuthenticated) return <LoadingScreen label="Redirecting" />;
  if (checking || !profile) return <LoadingScreen label="Verifying access" />;

  const roleLabel = profile.role.replace(/_/g, " ");
  const displayName = user?.displayName ?? "Administrator";
  const email = user?.email ?? "";

  const navTree = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <Link
        href="/admin"
        className="group flex items-center gap-3 px-5 py-5"
      >
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--forge-gold)]/25 bg-gradient-to-br from-[var(--forge-gold)]/15 to-transparent">
          <Icon.shield className="h-5 w-5 text-[var(--forge-gold-bright)] transition-transform duration-300 group-hover:scale-110" />
          <span className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ boxShadow: "0 0 22px 2px rgba(212,168,83,0.25)" }} />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-black tracking-tight text-white">
            ForgeKeep
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold-bright)]">
            Platform
          </span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-white/25">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                if (!item.ready) {
                  return (
                    <li key={item.href}>
                      <span className="group flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/25">
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white/30">
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
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                        active
                          ? "bg-gradient-to-r from-[var(--forge-gold)]/[0.14] to-transparent text-white"
                          : "text-white/55 hover:bg-white/[0.04] hover:text-white/90"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--forge-gold)]"
                          style={{ boxShadow: "0 0 12px 1px rgba(212,168,83,0.6)" }}
                        />
                      )}
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                          active ? "text-[var(--forge-gold-bright)]" : "text-white/45 group-hover:text-[var(--forge-gold)]"
                        }`}
                      />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User card + logout */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
          <Avatar src={user?.avatarUrl} name={displayName} size="sm" showStatus isOnline />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-semibold text-white">{displayName}</p>
            <p className="truncate text-[10px] text-white/40">{email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-[12px] font-semibold text-rose-300/90 transition-all duration-200 hover:border-rose-500/40 hover:bg-rose-500/[0.12] hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon.logout className="h-4 w-4" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-[var(--obsidian-deep)] text-white/85">
      {/* Ambient background — radial gold glow + faint grid, marks this as the platform console */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle 640px at 84% -8%, rgba(212,168,83,0.06), transparent 60%), radial-gradient(circle 520px at 0% 100%, rgba(120,140,220,0.05), transparent 55%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(circle 900px at 70% 0%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle 900px at 70% 0%, black, transparent 75%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/[0.06] bg-[#0a0b10]/70 backdrop-blur-xl lg:block">
          {navTree}
        </aside>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-72 border-r border-white/[0.08] bg-[#0a0b10] shadow-2xl">
              {navTree}
            </aside>
          </div>
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0b0c10]/70 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 lg:px-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileNavOpen(true)}
                  className="rounded-lg p-1.5 text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white lg:hidden"
                  aria-label="Open menu"
                >
                  <Icon.menu className="h-5 w-5" />
                </button>
                <div className="leading-tight">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold-bright)]">
                    Super Admin
                  </p>
                  <h1 className="text-lg font-black tracking-tight text-white">{pageTitle}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="hidden items-center gap-1.5 rounded-lg border border-[var(--forge-gold)]/25 bg-[var(--forge-gold)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--forge-gold-bright)] sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--forge-gold-bright)]" style={{ boxShadow: "0 0 8px 1px rgba(245,197,66,0.7)" }} />
                  {roleLabel}
                </span>

                {/* User menu */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen((o) => !o)}
                    onBlur={() => setTimeout(() => setUserMenuOpen(false), 120)}
                    className="flex items-center gap-2 rounded-xl border border-transparent px-1.5 py-1 transition-all hover:border-white/[0.08] hover:bg-white/[0.04]"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                  >
                    <Avatar src={user?.avatarUrl} name={displayName} size="sm" showStatus isOnline />
                    <svg
                      className={`hidden h-3.5 w-3.5 text-white/40 transition-transform duration-300 sm:block ${userMenuOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div
                      role="menu"
                      className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d12]/95 py-1.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                    >
                      <div className="border-b border-white/[0.06] px-4 py-3">
                        <p className="text-[12px] font-semibold text-white">{displayName}</p>
                        <p className="mt-0.5 truncate text-[10px] text-white/40">{email}</p>
                        <span className="mt-2 inline-block rounded border border-[var(--forge-gold)]/25 bg-[var(--forge-gold)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--forge-gold-bright)]">
                          {roleLabel}
                        </span>
                      </div>
                      <button
                        role="menuitem"
                        onMouseDown={handleLogout}
                        disabled={loggingOut}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-rose-300/90 transition-colors hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-60"
                      >
                        <Icon.logout className="h-4 w-4" />
                        {loggingOut ? "Signing out…" : "Sign out"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div key={pathname} className="animate-fade-in">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
