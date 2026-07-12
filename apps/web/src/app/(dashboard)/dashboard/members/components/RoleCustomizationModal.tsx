"use client";

import { useState } from "react";
import { CUSTOMIZABLE_ROLES, ROLE_DISPLAY_NAMES, type GuildRoleType } from "@guild/shared";
import { guildApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { queryClient } from "@/lib/query";

interface RoleCustomizationModalProps {
  guildId: string;
  currentOverrides: Partial<Record<GuildRoleType, string>>;
  onClose: () => void;
}

export default function RoleCustomizationModal({
  guildId,
  currentOverrides,
  onClose,
}: RoleCustomizationModalProps) {
  const { addToast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const role of CUSTOMIZABLE_ROLES) {
      initial[role] = currentOverrides[role] || ROLE_DISPLAY_NAMES[role];
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  function setDraft(role: string, value: string) {
    setDrafts((d) => ({ ...d, [role]: value }));
  }

  function resetRole(role: string) {
    setDrafts((d) => ({ ...d, [role]: ROLE_DISPLAY_NAMES[role as GuildRoleType] }));
  }

  async function save() {
    const roleDisplayNames: Partial<Record<GuildRoleType, string>> = {};
    for (const role of CUSTOMIZABLE_ROLES) {
      const value = drafts[role]?.trim();
      if (!value) {
        addToast("error", `${ROLE_DISPLAY_NAMES[role]}'s name can't be empty`);
        return;
      }
      roleDisplayNames[role] = value;
    }

    setSaving(true);
    try {
      const result = await guildApi.updateSettings(guildId, { roleDisplayNames });
      if (result.success) {
        addToast("success", "Role names updated");
        queryClient.invalidateQueries(`guild_settings:${guildId}`);
        queryClient.invalidateQueries(`guild_members:${guildId}`);
        onClose();
      } else {
        addToast("error", result.error?.message || "Failed to save role names");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-strong rounded-2xl p-6 max-w-lg w-full mx-4 animate-scale-in max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Role Customization</h3>
            <p className="text-xs text-white/45 mt-0.5">
              Rename your guild&apos;s rank tiers. Permissions stay exactly the same — only the
              label shown across the app changes.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 cursor-pointer shrink-0" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {CUSTOMIZABLE_ROLES.map((role) => {
            const isDefault = drafts[role] === ROLE_DISPLAY_NAMES[role];
            return (
              <div key={role} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45 mb-1.5">
                  {ROLE_DISPLAY_NAMES[role]}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[role]}
                    onChange={(e) => setDraft(role, e.target.value)}
                    maxLength={32}
                    placeholder={ROLE_DISPLAY_NAMES[role]}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary-500/40"
                  />
                  {!isDefault && (
                    <button
                      onClick={() => resetRole(role)}
                      className="text-[11px] text-white/50 hover:text-white px-2 py-1 cursor-pointer shrink-0"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save} isLoading={saving}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
