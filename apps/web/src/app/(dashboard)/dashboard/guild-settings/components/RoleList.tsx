"use client";

import { CUSTOMIZABLE_ROLES, type GuildRoleType } from "@guild/shared";
import { type CustomRoleData } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";

export type RoleSelection = { kind: "band"; band: GuildRoleType } | { kind: "custom"; id: string } | { kind: "new" };

export function selectionKey(sel: RoleSelection): string {
  return sel.kind === "band" ? `band:${sel.band}` : sel.kind === "custom" ? `custom:${sel.id}` : "new";
}

const BAND_DOT_CLASS: Record<string, string> = {
  OFFICER: "bg-blue-400",
  CORE_MEMBER: "bg-cyan-400",
  ELITE_MEMBER: "bg-emerald-400",
  MEMBER: "bg-zinc-400",
};

const CUSTOM_DOT_CLASS: Record<string, string> = {
  slate: "bg-zinc-400",
  amber: "bg-amber-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  orange: "bg-orange-400",
};

interface Props {
  customRoles: CustomRoleData[];
  selection: RoleSelection;
  onSelect: (sel: RoleSelection) => void;
  onCreateNew: () => void;
  memberCount: (sel: RoleSelection) => number;
  onMove: (role: CustomRoleData, direction: -1 | 1) => void;
  busyRoleId: string | null;
}

/** Discord Server Settings-style role list: built-in rank bands up top
 *  (locked, always present, rename-only) then guild-created custom roles
 *  below (reorderable, deletable) — one flat list, one selection model. */
export default function RoleList({
  customRoles,
  selection,
  onSelect,
  onCreateNew,
  memberCount,
  onMove,
  busyRoleId,
}: Props) {
  const { resolveRoleName } = useRoleDisplayNames();
  const ordered = [...customRoles].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const selKey = selectionKey(selection);

  return (
    <div className="w-full lg:w-[240px] shrink-0 space-y-4">
      <button
        type="button"
        onClick={onCreateNew}
        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
          selKey === "new"
            ? "border-[var(--forge-gold)]/50 bg-[var(--forge-gold)]/10 text-[var(--forge-gold-bright)]"
            : "border-dashed border-white/15 text-white/50 hover:text-white/85 hover:border-white/30"
        }`}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create Role
      </button>

      <div>
        <p className="px-1 mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">Default ranks</p>
        <div className="space-y-0.5">
          {CUSTOMIZABLE_ROLES.map((band) => {
            const sel: RoleSelection = { kind: "band", band };
            const isActive = selKey === selectionKey(sel);
            return (
              <button
                key={band}
                type="button"
                onClick={() => onSelect(sel)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] font-medium transition-colors cursor-pointer ${
                  isActive ? "bg-white/[0.08] text-white" : "text-white/60 hover:text-white/90 hover:bg-white/[0.03]"
                }`}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${BAND_DOT_CLASS[band]}`} />
                <span className="truncate flex-1">{resolveRoleName(band)}</span>
                <svg className="h-3 w-3 text-white/20 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Built-in">
                  <rect x="5" y="11" width="14" height="9" rx="1.5" />
                  <path d="M8 11V7a4 4 0 018 0v4" />
                </svg>
                <span className="text-[10px] font-mono text-white/25 shrink-0 min-w-[16px] text-right">{memberCount(sel)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="px-1 mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">Custom roles</p>
        {ordered.length === 0 ? (
          <p className="px-2.5 py-3 text-[11px] text-white/30 italic">No custom roles yet.</p>
        ) : (
          <div className="space-y-0.5">
            {ordered.map((role, i) => {
              const sel: RoleSelection = { kind: "custom", id: role.id };
              const isActive = selKey === selectionKey(sel);
              return (
                <div
                  key={role.id}
                  className={`group flex items-center gap-1 rounded-lg transition-colors ${
                    isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(sel)}
                    className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 text-left text-[13px] font-medium cursor-pointer ${
                      isActive ? "text-white" : "text-white/60 hover:text-white/90"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${CUSTOM_DOT_CLASS[role.color] || CUSTOM_DOT_CLASS.slate}`} />
                    <span className="truncate flex-1">{role.name}</span>
                    <span className="text-[10px] font-mono text-white/25 shrink-0 min-w-[16px] text-right">{memberCount(sel)}</span>
                  </button>
                  <div className="hidden group-hover:flex flex-col shrink-0 pr-1">
                    <button
                      type="button"
                      onClick={() => onMove(role, -1)}
                      disabled={i === 0 || busyRoleId === role.id}
                      className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer leading-none"
                      aria-label="Move up"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 15l-6-6-6 6" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(role, 1)}
                      disabled={i === ordered.length - 1 || busyRoleId === role.id}
                      className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer leading-none"
                      aria-label="Move down"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
