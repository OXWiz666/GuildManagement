"use client";

import { useEffect, useState } from "react";
import { DISTRIBUTION_TIERS, DISTRIBUTION_TIER_LABELS, DEFAULT_MARKET_RULES } from "@guild/shared";
import { marketApi, type MarketRulesData, type MountCatalogItem } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { useQuery, queryClient } from "@/lib/query";
import CheckboxCombobox from "@/components/ui/CheckboxCombobox";
import MountWishlistSection from "./MountWishlistSection";

interface Props {
  guildId: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

type Tier = (typeof DISTRIBUTION_TIERS)[number];
type CatalogField = "logCatalog" | "materialCatalog";
type SelectionField = "mountIds" | "materialKeys" | "logKeys";

function newCatalogKey(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
  return `${base}_${Math.random().toString(36).slice(2, 7)}`;
}

const rulesKey = (guildId: string) => `market_rules:${guildId}`;

export default function DistributionRulesSection({ guildId, onDirtyChange }: Props) {
  const { addToast } = useToast();
  const [rules, setRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [savedRules, setSavedRules] = useState<MarketRulesData>(DEFAULT_MARKET_RULES as MarketRulesData);
  const [isSaving, setIsSaving] = useState(false);

  const { data: fetchedRules, isLoading } = useQuery<MarketRulesData | null>(
    rulesKey(guildId),
    async () => {
      const res = await marketApi.getRules(guildId);
      return res.success && res.data ? res.data.rules : null;
    },
    { staleTime: 30000 },
  );

  useEffect(() => {
    if (fetchedRules) {
      setRules(fetchedRules);
      setSavedRules(fetchedRules);
    }
  }, [fetchedRules]);

  const setThreshold = (tier: Tier, field: "logs" | "materials", v: string) =>
    setRules((r) => ({
      ...r,
      limits: { ...r.limits, [tier]: { ...r.limits[tier], [field]: parseInt(v, 10) || 0 } },
    }));

  const toggleSelected = (tier: Tier, field: SelectionField, key: string) =>
    setRules((r) => {
      const tierLimits = r.limits[tier];
      const current = tierLimits[field] || [];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...r, limits: { ...r.limits, [tier]: { ...tierLimits, [field]: next } } };
    });

  const renameCatalogItem = (catalogField: CatalogField, key: string, label: string) =>
    setRules((r) => ({
      ...r,
      [catalogField]: (r[catalogField] || []).map((item) => (item.key === key ? { ...item, label } : item)),
    }));

  // Adding a new catalog item also checks it for the tier the leader was
  // editing — they opened this control because they want THIS tier to have it.
  const addCatalogItem = (catalogField: CatalogField, selField: "logKeys" | "materialKeys", tier: Tier, label: string) =>
    setRules((r) => {
      const existing = catalogField && r[catalogField]?.find((item) => item.label.trim().toLowerCase() === label.trim().toLowerCase());
      const key = existing?.key ?? newCatalogKey(label);
      const catalog = existing ? r[catalogField] || [] : [...(r[catalogField] || []), { key, label }];
      const tierLimits = r.limits[tier];
      const current = tierLimits[selField] || [];
      const nextSelected = current.includes(key) ? current : [...current, key];
      return {
        ...r,
        [catalogField]: catalog,
        limits: { ...r.limits, [tier]: { ...tierLimits, [selField]: nextSelected } },
      };
    });

  const mountsKey = `market_mounts:${guildId}`;
  const { data: mountData } = useQuery(
    mountsKey,
    async () => {
      const res = await marketApi.listMounts(guildId);
      return res.success && res.data ? res.data.mounts : [];
    },
    { staleTime: 30000 },
  );
  const mounts = ((mountData || []) as MountCatalogItem[]).filter((m) => m.isActive);
  const mountItems = mounts.map((m) => ({ key: m.id, label: m.name }));

  async function save() {
    setIsSaving(true);
    try {
      const res = await marketApi.updateRules(guildId, rules);
      if (res.success) {
        if (res.data) {
          setRules(res.data.rules);
          setSavedRules(res.data.rules);
          queryClient.setQueryData(rulesKey(guildId), res.data.rules);
        }
        addToast("success", "Distribution rules updated.");
      } else addToast("error", res.error?.message || "Failed to save rules");
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  const isRulesDirty = JSON.stringify(rules) !== JSON.stringify(savedRules);
  const isDirty = isRulesDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  return (
    <div className="space-y-6">
      <div className="relative glass rounded-2xl p-6 border border-white/[0.06] overflow-hidden">
        <span aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,168,83,0.45), transparent)" }} />
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[var(--forge-gold-bright)] uppercase tracking-[0.22em]">Distribution rules</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[var(--forge-gold)]/30 to-transparent" />
        </div>
        <p className="text-sm text-white/45 mb-5 leading-relaxed">
          Set per-tier item request limits. CP thresholds now live in Moderator & Permission so rank rules stay together.
        </p>

      {isLoading ? (
        <p className="text-xs text-white/40 py-4">Loading rules…</p>
      ) : (
        <div className="space-y-6">
          {/* Per-tier limits */}
          <div className="overflow-x-auto scroll-fade-x">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/55 mb-2">Per-tier item limits</h3>
            <p className="text-[11px] text-white/35 mb-2">
              Check which items a tier can be given; type a new name to add it to the guild's list. Mounts come from the Mount data section below.
            </p>
            <table className="w-full text-[12px] min-w-[720px]">
              <thead>
                <tr className="text-[10px] text-white/45 font-bold uppercase tracking-wider text-left">
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 px-2">Logs</th>
                  <th className="py-2 px-2">Mount</th>
                  <th className="py-2 px-2">Materials</th>
                </tr>
              </thead>
              <tbody>
                {DISTRIBUTION_TIERS.map((tier) => (
                  <tr key={tier}>
                    <td className="py-2 pr-3 font-semibold text-white/80 align-top">{DISTRIBUTION_TIER_LABELS[tier]}</td>

                    {/* Logs — shared quantity threshold + which log items are checkable */}
                    <td className="py-1.5 px-2 align-top">
                      <div className="space-y-1.5 w-44">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-white/35 uppercase tracking-wide">Cap</span>
                          <input
                            type="number"
                            min={0}
                            value={rules.limits[tier].logs}
                            onChange={(e) => setThreshold(tier, "logs", e.target.value)}
                            className="w-16 rounded-lg bg-surface-100 border border-white/8 text-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>
                        <CheckboxCombobox
                          items={rules.logCatalog || []}
                          selectedKeys={rules.limits[tier].logKeys || []}
                          onToggle={(key) => toggleSelected(tier, "logKeys", key)}
                          onRename={(key, label) => renameCatalogItem("logCatalog", key, label)}
                          onAdd={(label) => addCatalogItem("logCatalog", "logKeys", tier, label)}
                          placeholder="No logs assigned"
                          addPlaceholder="Add a log item…"
                          emptyHint="No log items yet — add one below."
                        />
                      </div>
                    </td>

                    {/* Mount — multi-select over the existing Mount data catalog */}
                    <td className="py-1.5 px-2 align-top">
                      <div className="w-44">
                        <CheckboxCombobox
                          items={mountItems}
                          selectedKeys={rules.limits[tier].mountIds || []}
                          onToggle={(key) => toggleSelected(tier, "mountIds", key)}
                          placeholder="No mounts assigned"
                          emptyHint="Add mounts in Mount data below."
                        />
                      </div>
                    </td>

                    {/* Materials — shared quantity threshold + which materials are checkable */}
                    <td className="py-1.5 px-2 align-top">
                      <div className="space-y-1.5 w-44">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-white/35 uppercase tracking-wide">Cap</span>
                          <input
                            type="number"
                            min={0}
                            value={rules.limits[tier].materials}
                            onChange={(e) => setThreshold(tier, "materials", e.target.value)}
                            className="w-16 rounded-lg bg-surface-100 border border-white/8 text-white px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>
                        <CheckboxCombobox
                          items={rules.materialCatalog || []}
                          selectedKeys={rules.limits[tier].materialKeys || []}
                          onToggle={(key) => toggleSelected(tier, "materialKeys", key)}
                          onRename={(key, label) => renameCatalogItem("materialCatalog", key, label)}
                          onAdd={(label) => addCatalogItem("materialCatalog", "materialKeys", tier, label)}
                          placeholder="No materials assigned"
                          addPlaceholder="Add a material…"
                          emptyHint="No materials yet — add one below."
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Magnetic strength={4}>
            <Button variant="primary" size="sm" onClick={save} isLoading={isSaving}>
              Save distribution rules
            </Button>
          </Magnetic>
        </div>
      )}
    </div>
      <MountWishlistSection guildId={guildId} />
    </div>
  );
}
