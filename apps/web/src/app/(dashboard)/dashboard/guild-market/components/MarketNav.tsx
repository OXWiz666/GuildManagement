"use client";

import { type ReactNode } from "react";

export type MarketTab =
  | "loot"
  | "accounting"
  | "rankings"
  | "legendary"
  | "distribution"
  | "history";

interface TabDef {
  value: MarketTab;
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
  coins: ico(
    <>
      <ellipse cx="8" cy="6" rx="6" ry="3" />
      <path d="M2 6v4c0 1.66 2.69 3 6 3s6-1.34 6-3V6" />
      <path d="M2 10v4c0 1.66 2.69 3 6 3" />
      <circle cx="17" cy="15" r="5" />
    </>,
  ),
  ledger: ico(
    <>
      <path d="M4 4a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2z" />
      <path d="M8 7h6M8 11h6M8 15h3" />
    </>,
  ),
  trophy: ico(
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M6 2h12v7a6 6 0 0 1-12 0z" />
      <path d="M9 21h6M12 15v6" />
    </>,
  ),
  sparkle: ico(
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  ),
  gift: ico(
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
      <path d="M12 8S10 2 7 4s5 4 5 4M12 8s2-6 5-4-5 4-5 4" />
    </>,
  ),
  scroll: ico(
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3h5" />
      <path d="M16 3H8v14a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
      <path d="M11 8h4M11 12h4" />
    </>,
  ),
};

const GROUPS: Group[] = [
  {
    key: "treasury",
    label: "Treasury",
    tabs: [
      { value: "loot", label: "Loot Sales", short: "Loot", icon: ICONS.coins },
      { value: "accounting", label: "Accounting", short: "Ledger", icon: ICONS.ledger },
      { value: "rankings", label: "Rankings", short: "Ranks", icon: ICONS.trophy },
    ],
  },
  {
    key: "distribution",
    label: "Distribution",
    tabs: [
      { value: "legendary", label: "Legendary Priority", short: "Legendary", icon: ICONS.sparkle },
      { value: "distribution", label: "Member Wishlist", short: "Wishlist", icon: ICONS.gift },
      { value: "history", label: "History", short: "History", icon: ICONS.scroll },
    ],
  },
];

export default function MarketNav({
  active,
  onChange,
  counts,
}: {
  active: MarketTab;
  onChange: (tab: MarketTab) => void;
  counts?: Partial<Record<MarketTab, number>>;
}) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 backdrop-blur p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {GROUPS.map((group, gi) => (
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
                {/* Active underline glow */}
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
