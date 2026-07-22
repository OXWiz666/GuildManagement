"use client";

import { useEffect, useState } from "react";
import {
  CUSTOMIZABLE_ROLES,
  ROLE_DISPLAY_NAMES,
  type GuildRoleType,
  type CustomizableRoleType,
} from "@guild/shared";
import { guildApi, type CustomRoleData, type GuildMemberData } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import { queryClient } from "@/lib/query";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { type RoleSelection } from "./RoleList";

const ROLE_COLORS = ["slate", "amber", "cyan", "emerald", "violet", "rose", "sky", "orange"] as const;
const PERMISSION_LEVELS = ["OFFICER", "MEMBER"] as const;
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

interface Props {
  guildId: string;
  selection: RoleSelection;
  customRoles: CustomRoleData[];
  roleDisplayOverrides: Partial<Record<GuildRoleType, string>>;
  members: GuildMemberData[];
  cpTiers: { coreMinCp?: number; eliteMinCp: number; upperMinCp: number };
  onCpTierChange: (key: "coreMinCp" | "eliteMinCp" | "upperMinCp", value: string) => void;
  onSaveCpThresholds: () => Promise<void> | void;
  isCpThresholdDirty: boolean;
  isSavingCpThresholds: boolean;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
  // Passes the full created role, not just its id — the parent seeds it into
  // its optimistic `customRoles` list synchronously (see
  // RoleManagementSection), so selecting it doesn't hit the gap before the
  // invalidated query actually refetches.
  onCreated: (role: CustomRoleData) => void;
  onCancelNew: () => void;
}

/** Right-hand editor — Discord's "role detail" panel. Remounted (via a `key`
 *  at the call site) every time `selection` changes so draft state never
 *  leaks between roles. */
function memberMatchesCpRank(
  cp: number,
  band: GuildRoleType | null,
  cpTiers: { coreMinCp?: number; eliteMinCp: number; upperMinCp: number },
) {
  const coreMinCp = cpTiers.coreMinCp ?? Number.POSITIVE_INFINITY;
  if (band === "CORE_MEMBER") return cp >= coreMinCp;
  if (band === "ELITE_MEMBER") return cp >= cpTiers.eliteMinCp && cp < coreMinCp;
  if (band === "MEMBER") return cp < cpTiers.eliteMinCp;
  return false;
}

export default function RoleEditorPanel({
  guildId,
  selection,
  customRoles,
  roleDisplayOverrides,
  members,
  cpTiers,
  onCpTierChange,
  onSaveCpThresholds,
  isCpThresholdDirty,
  isSavingCpThresholds,
  onDirtyChange,
  onSaved,
  onDeleted,
  onCreated,
  onCancelNew,
}: Props) {
  const { addToast } = useToast();
  const { resolveRoleName } = useRoleDisplayNames();
  const [tab, setTab] = useState<"display" | "members">("display");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomRoleData | null>(null);

  const existingCustom = selection.kind === "custom" ? customRoles.find((r) => r.id === selection.id) ?? null : null;

  const isBand = selection.kind === "band";
  const isNew = selection.kind === "new";
  const bandValue: GuildRoleType | null = isBand ? (selection as { kind: "band"; band: GuildRoleType }).band : null;

  const [name, setName] = useState<string>(() => {
    if (bandValue) return roleDisplayOverrides[bandValue] || ROLE_DISPLAY_NAMES[bandValue];
    if (existingCustom) return existingCustom.name;
    return "";
  });
  const [color, setColor] = useState<string>(existingCustom?.color ?? "amber");
  const [band, setBand] = useState<CustomizableRoleType>(
    (existingCustom?.band as CustomizableRoleType) ?? "OFFICER",
  );

  function refresh() {
    queryClient.invalidateQueries(`guild_custom_roles:${guildId}`);
    queryClient.invalidateQueries(`guild_settings:${guildId}`);
    queryClient.invalidateQueries(`guild_members:${guildId}`);
  }

  const roleMembers = isBand
    ? members.filter((m) => memberMatchesCpRank(m.cp ?? 0, bandValue, cpTiers))
    : existingCustom
      ? members.filter((m) => m.customRole?.id === existingCustom.id)
      : [];

  const roleEditorDirty = isBand
    ? name.trim() !== (bandValue ? roleDisplayOverrides[bandValue] || ROLE_DISPLAY_NAMES[bandValue] : "")
    : isNew
      ? Boolean(name.trim()) || color !== "amber" || band !== "OFFICER"
      : existingCustom
        ? name.trim() !== existingCustom.name || color !== existingCustom.color
        : false;

  useEffect(() => {
    onDirtyChange(roleEditorDirty);
    return () => onDirtyChange(false);
  }, [onDirtyChange, roleEditorDirty]);

  async function saveBand() {
    const trimmed = name.trim();
    if (!trimmed) {
      addToast("error", "Role name can't be empty");
      return;
    }
    setSaving(true);
    try {
      // The backend replaces the whole roleDisplayNames JSON blob on save
      // (no server-side merge) — always send every band's current name, not
      // just the one being edited, or the other three get wiped out.
      const roleDisplayNames: Record<string, string> = {};
      for (const role of CUSTOMIZABLE_ROLES) {
        roleDisplayNames[role] = role === bandValue ? trimmed : roleDisplayOverrides[role] || ROLE_DISPLAY_NAMES[role];
      }
      const result = await guildApi.updateSettings(guildId, { roleDisplayNames });
      if (result.success) {
        if (isCpThresholdDirty) {
          await onSaveCpThresholds();
        }
        addToast("success", "Rank settings updated");
        refresh();
        onSaved();
      } else {
        addToast("error", result.error?.message || "Failed to save role name");
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveCustom() {
    if (!existingCustom) return;
    const trimmed = name.trim();
    if (!trimmed) {
      addToast("error", "Role name can't be empty");
      return;
    }
    setSaving(true);
    try {
      const result = await guildApi.updateCustomRole(guildId, existingCustom.id, { name: trimmed, color });
      if (result.success) {
        addToast("success", "Role updated");
        refresh();
        onSaved();
      } else {
        addToast("error", result.error?.message || "Failed to save role");
      }
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    const trimmed = name.trim();
    if (!trimmed) {
      addToast("error", "Role name is required");
      return;
    }
    setSaving(true);
    try {
      const result = await guildApi.createCustomRole(guildId, { name: trimmed, color, band });
      if (result.success && result.data?.role) {
        addToast("success", "Role created");
        refresh();
        onCreated(result.data.role);
      } else {
        addToast("error", result.error?.message || "Failed to create role");
      }
    } finally {
      setSaving(false);
    }
  }

  function deleteRole() {
    if (existingCustom) setDeleteTarget(existingCustom);
  }

  async function confirmDeleteRole() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await guildApi.deleteCustomRole(guildId, deleteTarget.id);
      if (result.success) {
        addToast("success", "Role deleted");
        refresh();
        setDeleteTarget(null);
        onDeleted();
      } else {
        addToast("error", result.error?.message || "Failed to delete role");
      }
    } finally {
      setDeleting(false);
    }
  }

  const previewRole = bandValue ?? band;
  const previewCustomName = isBand ? undefined : name.trim() || "New Role";
  const previewCustomColor = isBand ? undefined : color;
  const cpThreshold =
    bandValue === "CORE_MEMBER"
      ? {
          label: `${resolveRoleName("CORE_MEMBER")} min CP`,
          value: cpTiers.coreMinCp ?? 0,
          key: "coreMinCp" as const,
          help: "Members at or above this Combat Power automatically qualify for the Core rank.",
        }
      : bandValue === "ELITE_MEMBER"
      ? {
          label: `${resolveRoleName("ELITE_MEMBER")} min CP`,
          value: cpTiers.eliteMinCp,
          key: "eliteMinCp" as const,
          help: "Members at or above this Combat Power automatically qualify for the Elite rank unless they meet Core.",
        }
      : bandValue === "MEMBER"
        ? {
            label: "Member rank",
            value: 0,
            key: "upperMinCp" as const,
            help: "Member is the default rank for active members below the Elite CP requirement.",
          }
        : null;

  return (
    <>
    <div className="flex-1 min-w-0 rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Badge role={previewRole} size="md" customName={previewCustomName} customColor={previewCustomColor} />
          {isBand && <span className="text-[10px] text-white/30">Built-in rank tier</span>}
          {isNew && <span className="text-[10px] text-[var(--forge-gold-bright)]">New role</span>}
        </div>
        <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
          {(["display", "members"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              disabled={isNew && t === "members"}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                tab === t ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {t === "display" ? "Display" : `Members${!isNew ? ` (${roleMembers.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {tab === "display" ? (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Role name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  placeholder={isNew ? "e.g. Raid Leader" : undefined}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary-500/40"
                />
              </div>

              {isBand && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                  {cpThreshold ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                          {cpThreshold.label}
                        </label>
                        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">CP Threshold</span>
                      </div>
                      {cpThreshold.key !== "upperMinCp" && (
                        <input
                          type="number"
                          min={0}
                          value={cpThreshold.value}
                          onChange={(e) => onCpTierChange(cpThreshold.key, e.target.value)}
                          className="mt-2 w-full px-3.5 py-2.5 rounded-xl bg-black/25 border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary-500/40"
                        />
                      )}
                      <p className="mt-2 text-[10px] leading-relaxed text-white/35">{cpThreshold.help}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">CP Threshold</p>
                      <p className="mt-2 text-sm font-semibold text-white/80">Permission role</p>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">Permissions are managed separately from CP ranks.</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {isBand ? (
              <p className="text-[11px] text-white/40 leading-relaxed">
                This is one of the built-in CP rank tiers. Renaming it changes the label shown across the app, and CP requirements decide which members qualify.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Color</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ROLE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-7 w-7 rounded-full ${SWATCH_CLASS[c]} transition-transform cursor-pointer ${
                          color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#0f0f16] scale-110" : "opacity-70 hover:opacity-100"
                        }`}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-2">Permission level</label>
                  {isNew ? (
                    <div className="flex flex-wrap gap-1.5">
                      {PERMISSION_LEVELS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBand(b)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                            band === b
                              ? "bg-primary-500/15 border-primary-500/40 text-white"
                              : "bg-white/[0.03] border-white/[0.08] text-white/60 hover:text-white"
                          }`}
                        >
                          {resolveRoleName(b)}
                        </button>
                      ))}
                    </div>
                  ) : existingCustom ? (
                    <>
                      <span className="inline-flex px-2.5 py-1.5 rounded-lg text-xs border bg-white/[0.03] border-white/[0.08] text-white/70">
                        {resolveRoleName(existingCustom.band)}
                      </span>
                      <p className="text-[10px] text-white/30 mt-1.5">Permission level can&apos;t be changed after creation — delete and recreate instead.</p>
                    </>
                  ) : (
                    // `selection` can point at a custom role id that isn't in
                    // `customRoles` yet — right after creating one (parent's
                    // query hasn't refetched) or right after another officer
                    // deletes the one currently open. Render a neutral
                    // placeholder instead of crashing on a null read.
                    <span className="inline-flex px-2.5 py-1.5 rounded-lg text-xs border bg-white/[0.03] border-white/[0.08] text-white/30 italic">
                      Loading…
                    </span>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
              <div>
                {!isBand && !isNew && (
                  <Button variant="ghost" size="sm" onClick={deleteRole} isLoading={deleting} className="text-rose-300/80 hover:text-rose-300">
                    Delete role
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isNew && (
                  <Button variant="ghost" size="sm" onClick={onCancelNew} disabled={saving}>
                    Cancel
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={isBand ? saveBand : isNew ? createRole : saveCustom}
                  isLoading={saving || isSavingCpThresholds}
                  disabled={!name.trim()}
                >
                  {isNew ? "Create Role" : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
            {roleMembers.length === 0 ? (
              <p className="text-[12px] text-white/35 italic py-4 text-center">No members hold this role yet.</p>
            ) : (
              roleMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03]">
                  <Avatar name={m.ign || m.user.displayName} src={m.user.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-white truncate">{m.ign || m.user.displayName}</p>
                    <p className="text-[10px] text-white/35 truncate">{m.user.displayName}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
    <ConfirmModal
      show={Boolean(deleteTarget)}
      title="Delete Role"
      message={
        deleteTarget
          ? `Delete the "${deleteTarget.name}" role? Members holding it revert to the plain ${resolveRoleName(deleteTarget.band)} rank.`
          : ""
      }
      confirmText="Delete role"
      cancelText="Cancel"
      isDanger
      isSubmitting={deleting}
      onConfirm={confirmDeleteRole}
      onCancel={() => setDeleteTarget(null)}
    />
    </>
  );
}
