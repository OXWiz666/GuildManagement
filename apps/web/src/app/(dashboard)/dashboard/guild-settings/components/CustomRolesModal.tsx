"use client";

import { useState } from "react";
import { CUSTOMIZABLE_ROLES, type GuildRoleType } from "@guild/shared";
import { guildApi, type CustomRoleData } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { queryClient } from "@/lib/query";

interface CustomRolesModalProps {
  guildId: string;
  roles: CustomRoleData[];
  onClose: () => void;
}

const ROLE_COLORS = ["slate", "amber", "cyan", "emerald", "violet", "rose", "sky", "orange"] as const;

const SWATCH_CLASS: Record<string, string> = {
  slate: "bg-zinc-400",
  amber: "bg-amber-400",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  orange: "bg-orange-400",
};

const BADGE_CLASS: Record<string, string> = {
  slate: "bg-white/[0.06] text-zinc-300 border-white/[0.14]",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/25",
  sky: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  orange: "bg-orange-500/10 text-orange-400 border-orange-500/25",
};

const EMPTY_DRAFT = { name: "", color: "amber" as string, band: "OFFICER" as GuildRoleType };

export default function CustomRolesModal({ guildId, roles, onClose }: CustomRolesModalProps) {
  const { addToast } = useToast();
  const { resolveRoleName } = useRoleDisplayNames();
  const [draft, setDraft] = useState<{ name: string; color: string; band: GuildRoleType }>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rolesKey = `guild_custom_roles:${guildId}`;

  function refresh() {
    queryClient.invalidateQueries(rolesKey);
    queryClient.invalidateQueries(`guild_members:${guildId}`);
  }

  function startEdit(role: CustomRoleData) {
    setEditingId(role.id);
    setDraft({ name: role.name, color: role.color, band: role.band as GuildRoleType });
  }

  function resetForm() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      addToast("error", "Role name is required");
      return;
    }
    setSaving(true);
    try {
      const result = editingId
        ? await guildApi.updateCustomRole(guildId, editingId, { name, color: draft.color })
        : await guildApi.createCustomRole(guildId, { name, color: draft.color, band: draft.band });
      if (result.success) {
        addToast("success", editingId ? "Role updated" : "Role created");
        resetForm();
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to save role");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: CustomRoleData) {
    if (!confirm(`Delete the "${role.name}" role? Members holding it revert to the plain ${resolveRoleName(role.band)} rank.`)) return;
    setBusyId(role.id);
    try {
      const result = await guildApi.deleteCustomRole(guildId, role.id);
      if (result.success) {
        addToast("success", "Role deleted");
        if (editingId === role.id) resetForm();
        refresh();
      } else {
        addToast("error", result.error?.message || "Failed to delete role");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function move(role: CustomRoleData, direction: -1 | 1) {
    const ordered = [...roles].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const index = ordered.findIndex((r) => r.id === role.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    setBusyId(role.id);
    try {
      await Promise.all([
        guildApi.updateCustomRole(guildId, role.id, { sortOrder: swapWith.sortOrder }),
        guildApi.updateCustomRole(guildId, swapWith.id, { sortOrder: role.sortOrder }),
      ]);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const ordered = [...roles].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-2xl p-6 max-w-lg w-full mx-4 animate-scale-in max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Custom Roles</h3>
            <p className="text-xs text-white/45 mt-0.5">
              Create your own named ranks (e.g. &quot;Raid Leader&quot;). Each one fully inherits the
              permissions of the tier you assign it to — only the name and color are custom.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 cursor-pointer shrink-0" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Existing custom roles */}
        <div className="space-y-2 mb-5">
          {ordered.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
              <p className="text-sm text-white/50">No custom roles yet</p>
              <p className="text-[11px] text-white/35 mt-1">Create your first one below.</p>
            </div>
          ) : (
            ordered.map((role, i) => (
              <div key={role.id} className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    onClick={() => move(role, -1)}
                    disabled={i === 0 || busyId === role.id}
                    className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer leading-none"
                    aria-label="Move up"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button
                    onClick={() => move(role, 1)}
                    disabled={i === ordered.length - 1 || busyId === role.id}
                    className="text-white/30 hover:text-white/70 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer leading-none"
                    aria-label="Move down"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${BADGE_CLASS[role.color] || BADGE_CLASS.slate}`}>
                  {role.name}
                </span>
                <span className="text-[11px] text-white/35">{resolveRoleName(role.band)}-level</span>
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(role)}
                    className="text-[11px] text-white/50 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(role)}
                    disabled={busyId === role.id}
                    className="text-[11px] text-red-300/80 hover:text-red-300 px-2 py-1 cursor-pointer disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Create / edit form */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            {editingId ? "Edit role" : "New role"}
          </p>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Role name (e.g. Raid Leader)"
            maxLength={32}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500/40"
          />

          <div>
            <p className="text-[10px] text-white/40 mb-1.5">Permission level</p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOMIZABLE_ROLES.map((band) => (
                <button
                  key={band}
                  onClick={() => !editingId && setDraft((d) => ({ ...d, band }))}
                  disabled={!!editingId}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                    draft.band === band
                      ? "bg-primary-500/15 border-primary-500/40 text-white"
                      : "bg-white/[0.03] border-white/[0.08] text-white/60 hover:text-white"
                  }`}
                >
                  {resolveRoleName(band)}
                </button>
              ))}
            </div>
            {editingId && (
              <p className="text-[10px] text-white/30 mt-1">Permission level can&apos;t be changed after creation — delete and recreate instead.</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {ROLE_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setDraft((d) => ({ ...d, color }))}
                className={`h-6 w-6 rounded-full ${SWATCH_CLASS[color]} transition-transform cursor-pointer ${
                  draft.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-[#0f0f16] scale-110" : "opacity-70 hover:opacity-100"
                }`}
                aria-label={color}
              />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={save} isLoading={saving} disabled={!draft.name.trim()}>
              {editingId ? "Save changes" : "Add role"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
