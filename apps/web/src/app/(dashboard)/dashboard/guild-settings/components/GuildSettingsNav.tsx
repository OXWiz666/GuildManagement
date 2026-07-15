"use client";

import { type ReactNode } from "react";

export type GuildSettingsTab =
  | "points"
  | "activities"
  | "roles"
  | "distribution"
  | "mounts";

interface TabDef {
  value: GuildSettingsTab;
  label: string;
  short: string;
  icon: ReactNode;
  count?: number;
}

interface Group {
  key: string;
  label: string;
  tabs: TabDef[];
}

const ico = (path: ReactNode) => (
  <svg
    className="h-[15px] w-[15px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
);

const ICONS = {
  trophy: ico(
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M6 2h12v7a6 6 0 0 1-12 0z" />
      <path d="M9 21h6M12 15v6" />
    </>,
  ),
  hammer: ico(
    <>
      <path d="M14 5l5 5-3 3-5-5z" />
      <path d="M11 8L4 15a2 2 0 0 0 0 3 2 2 0 0 0 3 0l7-7" />
    </>,
  ),
  shield: ico(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  split: ico(
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </>,
  ),
  mount: ico(
    <>
      <path d="M4 18l3-9 4-2 3 3h4l2 3-2 5" />
      <circle cx="8" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>,
  ),
};

const GROUPS: Group[] = [
  {
    key: "configuration",
    label: "Configuration",
    tabs: [
      { value: "points", label: "Guild Points System", short: "Points", icon: ICONS.trophy },
      { value: "activities", label: "Activities Multiplier", short: "Activities", icon: ICONS.hammer },
      { value: "roles", label: "Moderator & Permission", short: "Roles", icon: ICONS.shield },
      { value: "distribution", label: "Distribution Rules", short: "Distribution", icon: ICONS.split },
      { value: "mounts", label: "Mount Wishlist", short: "Mounts", icon: ICONS.mount },
    ],
  },
];

export default function GuildSettingsNav({
  active,
  onChange,
  counts,
  visibleTabs,
}: {
  active: GuildSettingsTab;
  onChange: (tab: GuildSettingsTab) => void;
  counts?: Partial<Record<GuildSettingsTab, number>>;
  visibleTabs: Set<GuildSettingsTab>;
}) {
  const groups = GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => visibleTabs.has(tab.value)),
  })).filter((group) => group.tabs.length > 0);

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {groups.map((group, gi) => (
        <div key={group.key} className="flex items-center gap-1.5 shrink-0">
          {gi > 0 && (
            <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-white/[0.08]" />
          )}
          <span className="hidden lg:block pl-2 pr-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25 select-none">
            {group.label}
          </span>
          {group.tabs.map((tab) => {
            const isActive = active === tab.value;
            const count = counts?.[tab.value];
            return (
              <button
                key={tab.value}
                onClick={() => onChange(tab.value)}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "text-white/45 hover:text-white/85 hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className={`transition-colors duration-300 ${
                    isActive ? "text-[var(--forge-gold-bright)]" : "text-white/40 group-hover:text-white/70"
                  }`}
                >
                  {tab.icon}
                </span>
                <span className="whitespace-nowrap">
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.short}</span>
                </span>
                {typeof count === "number" && count > 0 && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-mono leading-none transition-colors duration-300 ${
                      isActive
                        ? "bg-[var(--forge-gold)]/15 text-[var(--forge-gold-bright)]"
                        : "bg-white/[0.05] text-white/40"
                    }`}
                  >
                    {count}
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute -bottom-[3px] left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-[var(--forge-gold)]"
                    style={{ boxShadow: "0 0 8px 1px rgba(212,168,83,0.6)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
