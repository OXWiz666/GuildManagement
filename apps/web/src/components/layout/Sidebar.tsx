"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import { useAuth } from "@/lib/auth-context";
import { prefetchForRoute } from "@/lib/prefetch";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    section: "Command",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        ),
      },
      {
        label: "Statistics",
        href: "/dashboard/statistics",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
      {
        label: "Faction",
        href: "/dashboard/faction",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" />
            <path d="M8 11h8" />
            <path d="M10 8v7" />
            <path d="M14 8v7" />
          </svg>
        ),
      },
      {
        label: "My Gear",
        href: "/dashboard/equipment",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2.5l-2.5 2.5-2.5-2.5-6 3.5 2.5 4 1.5-1v9.5h9v-9.5l1.5 1 2.5-4-6-3.5z" />
            <path d="M9.5 5l2.5 2.5 2.5-2.5" />
          </svg>
        ),
      },
    ],
  },
  {
    section: "Boss Operations",
    items: [
      {
        label: "Boss Rotation",
        href: "/dashboard/boss-rotation",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67" />
          </svg>
        ),
        roles: ["ADMIN", "FACTION_LEADER", "GUILD_LEADER", "OFFICER", "CORE_MEMBER", "ELITE_MEMBER", "MEMBER"],
      },
      {
        label: "Guild Activities",
        href: "/dashboard/boss-schedule",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
      {
        label: "Boss Attendance",
        href: "/dashboard/boss-attendance",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
        ),
      },
    ],
  },
  {
    section: "Guild Control",
    items: [
      {
        label: "Members",
        href: "/dashboard/members",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        ),
      },
      {
        label: "Audit Log",
        href: "/dashboard/audit",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        ),
        roles: ["ADMIN", "FACTION_LEADER", "GUILD_LEADER", "OFFICER", "CORE_MEMBER", "ELITE_MEMBER"],
      },
      {
        label: "Guild Inventory",
        href: "/dashboard/guild-market",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        ),
      },
      {
        label: "Distribution",
        href: "/dashboard/distribution",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="4" rx="1" />
            <path d="M12 8v13M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
            <path d="M12 8S10 2 7 4s5 4 5 4M12 8s2-6 5-4-5 4-5 4" />
          </svg>
        ),
      },
    ],
  },
  {
    section: "Leadership",
    items: [
      {
        label: "Guild Settings",
        href: "/dashboard/guild-settings",
        icon: (
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        ),
        roles: ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"],
      },
    ],
  },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const activeGuildId = user?.guilds?.[0]?.guildId;

  // Warm the destination page's data the moment a pointer/keyboard focus
  // lands on its link — by the time a hover-then-click actually happens,
  // the query cache is usually already populated (see lib/prefetch.ts).
  const handlePrefetch = (href: string) => prefetchForRoute(href, activeGuildId);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen w-[280px] z-50
          bg-[var(--obsidian-elevated)]/95 backdrop-blur-xl
          border-r border-[var(--metal-border)]
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          flex flex-col pb-safe
        `}
      >
        {/* Brand */}
        <div className="px-6 py-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-3.5 group"
            onClick={onClose}
          >
            <div className="relative h-[42px] w-[42px] shrink-0">
              {/* Gold glow orbit ring */}
              <div
                className="absolute -inset-1.5 rounded-2xl border border-[var(--metal-border)] transition-colors duration-500 group-hover:border-[var(--forge-gold)]/30"
                style={{ animation: "spin-slow 16s linear infinite" }}
              >
                <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-[var(--forge-gold)] shadow-[0_0_10px_2px_rgba(212,168,83,0.6)]" />
              </div>
              <div className="absolute inset-0 overflow-hidden rounded-xl border border-[var(--metal-border)] bg-[var(--obsidian-surface)] backdrop-blur flex items-center justify-center transition-all duration-300 group-hover:border-[var(--forge-gold)]/30 group-hover:shadow-[0_0_12px_2px_rgba(212,168,83,0.15)]">
                <Image
                  src="/forgekeep-icon.png"
                  alt="ForgeKeep"
                  width={34}
                  height={34}
                  className="h-[34px] w-[34px] object-contain transition-transform duration-500 group-hover:scale-110"
                  draggable={false}
                />
              </div>
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-wider uppercase font-fantasy text-gold-gradient-light">
                ForgeKeep
              </h1>
              <p className="text-[9px] text-[var(--forge-gold-dim)] font-semibold tracking-[0.25em] uppercase mt-0.5 transition-colors duration-300 group-hover:text-[var(--forge-gold)]">
                Guild System
              </p>
            </div>
          </Link>
        </div>

        {/* Guild Switcher */}
        {user && (
          <div className="px-5 pb-5">
            <p className="text-[10px] font-semibold text-[var(--forge-gold-dim)] uppercase tracking-[0.14em] px-2 mb-2.5 font-fantasy">
              Guild
            </p>
            <GuildSwitcher
              guilds={user.guilds}
              onSelect={onClose}
            />
          </div>
        )}

        {/* Divider */}
        <div className="mx-5 section-divider-gold" />

        {/* Grouped Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-5 overflow-y-auto overflow-x-hidden">
          {navGroups.map((group) => {
            // Filter items based on roles and guild membership
            const filteredItems = group.items.filter((item) => {
              const hasNoGuild = user?.guilds && user.guilds.length === 0;
              if (hasNoGuild && item.href !== "/dashboard" && item.href !== "/dashboard/settings") {
                return false;
              }
              const activeGuild = user?.guilds?.[0];
              const activeRole = activeGuild?.role;
              if (item.roles && (!activeRole || !item.roles.includes(activeRole))) {
                return false;
              }
              return true;
            });

            if (filteredItems.length === 0) return null;

            return (
              <div key={group.section}>
                {/* Section Label */}
                <div className="flex items-center gap-2.5 px-3 mb-2">
                  <span className="text-[10px] font-semibold text-[var(--forge-gold-dim)]/70 uppercase tracking-[0.14em] font-fantasy">
                    {group.section}
                  </span>
                  <span className="flex-1 h-px bg-gradient-to-r from-[var(--metal-border)] to-transparent" />
                </div>

                {/* Nav Items */}
                <div className="space-y-0.5">
                  {filteredItems.map((item: NavItem) => {
                    const isActive =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        onMouseEnter={() => handlePrefetch(item.href)}
                        onFocus={() => handlePrefetch(item.href)}
                        onTouchStart={() => handlePrefetch(item.href)}
                        className={`
                          relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium
                          transition-all duration-200 cursor-pointer group overflow-hidden
                          ${
                            isActive
                              ? "text-[var(--forge-gold-bright)] bg-[var(--forge-glow)] border border-[var(--metal-border)]"
                              : "text-white/50 hover:text-white/85 hover:bg-white/[0.03] border border-transparent hover:border-white/[0.04]"
                          }
                        `}
                      >
                        {/* Active left indicator with gold glow */}
                        {isActive && (
                          <>
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--forge-gold)] shadow-[0_0_10px_3px_rgba(212,168,83,0.40)]" />
                            <span
                              aria-hidden
                              className="absolute inset-0 opacity-50 pointer-events-none"
                              style={{
                                background:
                                  "linear-gradient(90deg, rgba(212,168,83,0.12), transparent 60%)",
                              }}
                            />
                          </>
                        )}
                        {/* Hover shimmer */}
                        {!isActive && (
                          <span
                            aria-hidden
                            className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
                            style={{
                              background:
                                "linear-gradient(90deg, transparent, rgba(212,168,83,0.04), transparent)",
                            }}
                          />
                        )}
                        <span
                          className={`relative transition-all duration-300 ${
                            isActive
                              ? "text-[var(--forge-gold)]"
                              : "text-white/35 group-hover:text-white/65 group-hover:scale-110"
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className="relative">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Platform (Super Admin) — visible only to platform admins */}
          {user?.platformRole && (
            <div>
              <div className="flex items-center gap-2.5 px-3 mb-2">
                <span className="text-[10px] font-semibold text-[var(--forge-gold-dim)]/70 uppercase tracking-[0.14em] font-fantasy">
                  Platform
                </span>
                <span className="flex-1 h-px bg-gradient-to-r from-[var(--metal-border)] to-transparent" />
              </div>
              <div className="space-y-0.5">
                <Link
                  href="/admin"
                  onClick={onClose}
                  className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 cursor-pointer group overflow-hidden text-[var(--forge-gold-bright)] hover:bg-[var(--forge-glow)] border border-[var(--metal-border)]"
                >
                  <span className="relative text-[var(--forge-gold)]">
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </span>
                  <span className="relative">Super Admin</span>
                </Link>
              </div>
            </div>
          )}
        </nav>

        {/* User info */}
        {user && (
          <div className="p-5 border-t border-[var(--metal-border)]">
            <div className="flex items-center gap-3.5 px-1">
              <Avatar src={user.avatarUrl} name={user.displayName} size="sm" showStatus isOnline />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-300 truncate">
                  {user.displayName}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

// ─── Guild / Faction Switcher ────────────────────

interface Guild {
  guildId: string;
  guildName: string;
  guildSlug: string;
  guildAvatarUrl: string | null;
  role: string;
  rankName: string;
  joinedAt: string;
}

function GuildSwitcher({
  guilds,
  onSelect,
}: {
  guilds: Guild[];
  onSelect: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const active = guilds[activeIndex];

  if (!active) {
    return (
      <div className="px-3 py-2.5 rounded-lg bg-white/[0.02] border border-[var(--metal-border)] text-center">
        <p className="text-[11px] text-zinc-600">No guilds yet</p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[var(--forge-glow)] transition-all duration-200 text-left cursor-pointer border border-[var(--metal-border)] hover:border-[var(--forge-gold)]/20 group"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="h-7 w-7 rounded-md bg-[var(--forge-glow)] border border-[var(--metal-border)] flex items-center justify-center text-[10px] font-semibold text-[var(--forge-gold)] shrink-0 transition-transform duration-300 group-hover:scale-[1.04]">
          {active.guildName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-zinc-300 truncate">
            {active.guildName}
          </p>
          <Badge role={active.role} size="sm" />
        </div>
        {guilds.length > 1 && (
          <svg
            className={`h-3.5 w-3.5 text-zinc-600 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {isOpen && guilds.length > 1 && (
        <div className="mt-1 space-y-0.5 animate-scale-in" role="listbox">
          {guilds.map((guild, i) => (
            <button
              key={guild.guildId}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => {
                setActiveIndex(i);
                setIsOpen(false);
                onSelect();
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer
                ${i === activeIndex ? "bg-[var(--forge-glow)] text-[var(--forge-gold-bright)]" : "text-white/50 hover:bg-white/[0.03] hover:text-white/85"}`}
            >
              <div className="h-5 w-5 rounded bg-[var(--forge-glow)] flex items-center justify-center text-[9px] font-semibold text-[var(--forge-gold)] shrink-0">
                {guild.guildName[0]}
              </div>
              <p className="text-[11px] truncate flex-1">{guild.guildName}</p>
              {i === activeIndex && (
                <svg className="h-3 w-3 text-[var(--forge-gold)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
