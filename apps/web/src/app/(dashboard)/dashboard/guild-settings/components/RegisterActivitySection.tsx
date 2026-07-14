"use client";

import { useEffect, useState } from "react";
import { CUSTOMIZABLE_ROLES, DEFAULT_ACTIVITY_POINT_RULES } from "@guild/shared";
import { guildApi, type ActivityPointRuleData } from "@/lib/api";
import { useRoleDisplayNames } from "@/lib/useRoleDisplayNames";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import SettingsCard from "../../settings/components/SettingsCard";

interface Props {
  guildId: string;
}

function defaultMultipliers(): Record<string, number> {
  return CUSTOMIZABLE_ROLES.reduce(
    (acc, role) => {
      acc[role] = 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function newActivityRow(): ActivityPointRuleData {
  return {
    key: `ACTIVITY_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    basePoints: 0,
    multipliers: defaultMultipliers(),
  };
}

export default function RegisterActivitySection({ guildId }: Props) {
  const { addToast } = useToast();
  const { resolveRoleName } = useRoleDisplayNames();
  const [activities, setActivities] = useState<ActivityPointRuleData[]>(
    DEFAULT_ACTIVITY_POINT_RULES.activities.map((a) => ({ ...a, multipliers: { ...a.multipliers } })),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    guildApi
      .getActivityRules(guildId)
      .then((res) => {
        if (!cancelled && res.success && res.data) setActivities(res.data.rules.activities);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  function updateRow(key: string, patch: Partial<ActivityPointRuleData>) {
    setActivities((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateMultiplier(key: string, role: string, value: string) {
    const num = parseFloat(value);
    setActivities((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, multipliers: { ...r.multipliers, [role]: Number.isFinite(num) ? num : 0 } }
          : r,
      ),
    );
  }

  function addRow() {
    setActivities((rows) => [...rows, newActivityRow()]);
  }

  function removeRow(key: string) {
    setActivities((rows) => rows.filter((r) => r.key !== key));
  }

  async function save() {
    const trimmed = activities.map((a) => ({ ...a, label: a.label.trim() }));
    if (trimmed.some((a) => !a.label)) {
      addToast("error", "Every activity needs a name");
      return;
    }
    setIsSaving(true);
    try {
      const res = await guildApi.updateActivityRules(guildId, { activities: trimmed });
      if (res.success && res.data) {
        setActivities(res.data.rules.activities);
        addToast("success", "Activity registry updated.");
      } else {
        addToast("error", res.error?.message || "Failed to save activities");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsCard
      eyebrow="Guild Settings"
      title="Register Activity"
      description="Define the activities members earn Guild Points for, a base point value, and a customizable multiplier per rank. Add as many custom activities as you need."
    >
      {isLoading ? (
        <p className="text-xs text-white/40 py-4">Loading activities…</p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto scroll-fade-x">
            <table className="w-full text-[12px] min-w-[640px]">
              <thead>
                <tr className="text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                  <th className="py-2 pr-3">Activity</th>
                  <th className="py-2 px-2">Base</th>
                  <th colSpan={CUSTOMIZABLE_ROLES.length} className="py-1 px-2 text-center text-[9px] text-[var(--forge-gold-bright)] tracking-[0.18em]">
                    Multiplier · Customizable
                  </th>
                  <th className="py-2 pl-2" />
                </tr>
                <tr className="text-[10px] text-white/35 font-semibold uppercase tracking-wider text-left border-b border-white/[0.06]">
                  <th className="pb-2 pr-3" />
                  <th className="pb-2 px-2" />
                  {CUSTOMIZABLE_ROLES.map((role) => (
                    <th key={role} className="pb-2 px-2 text-center whitespace-nowrap">
                      {resolveRoleName(role)}
                    </th>
                  ))}
                  <th className="pb-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {activities.map((row) => (
                  <tr key={row.key} className="border-b border-white/[0.03] last:border-0">
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRow(row.key, { label: e.target.value })}
                        placeholder="Activity name"
                        className="w-full min-w-[140px] rounded-lg bg-surface-100 border border-white/8 text-white placeholder:text-white/25 px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        min={0}
                        value={row.basePoints}
                        onChange={(e) => updateRow(row.key, { basePoints: parseFloat(e.target.value) || 0 })}
                        className="w-16 rounded-lg bg-surface-100 border border-white/8 text-white px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                      />
                    </td>
                    {CUSTOMIZABLE_ROLES.map((role) => (
                      <td key={role} className="py-1.5 px-2">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={row.multipliers[role] ?? 1}
                          onChange={(e) => updateMultiplier(row.key, role, e.target.value)}
                          className="w-16 rounded-lg bg-surface-100 border border-white/8 text-white px-2 py-1.5 text-sm text-center focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                        />
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-right">
                      <Button variant="ghost" size="xs" onClick={() => removeRow(row.key)} className="text-rose-300/70">
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="w-full rounded-xl border border-dashed border-white/[0.12] py-2.5 text-[12px] font-semibold text-white/45 hover:text-white/80 hover:border-white/25 transition-colors cursor-pointer"
          >
            + Add an activity
          </button>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/[0.06]">
            <p className="text-[10px] text-white/35">Multiplier default is 1x — points awarded = base × multiplier for the member's rank.</p>
            <Magnetic strength={4}>
              <Button variant="primary" size="sm" onClick={save} isLoading={isSaving}>
                Save activities
              </Button>
            </Magnetic>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
