"use client";

import { useState } from "react";
import SettingsCard from "../../settings/components/SettingsCard";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { marketApi, type MountCatalogItem } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useQuery, queryClient } from "@/lib/query";
import { MOUNT_PRESETS } from "@guild/shared";

interface MountWishlistSectionProps {
  guildId: string;
}

export default function MountWishlistSection({ guildId }: MountWishlistSectionProps) {
  const { addToast } = useToast();
  const [name, setName] = useState("");
  const [maxSlots, setMaxSlots] = useState("1");
  const [iconUrl, setIconUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = `market_mounts:${guildId}`;
  const { data, isLoading } = useQuery(
    key,
    async () => {
      const res = await marketApi.listMounts(guildId);
      return res.success && res.data ? res.data.mounts : [];
    },
    { staleTime: 30000 },
  );
  const mounts = (data || []) as MountCatalogItem[];
  const refresh = () => queryClient.invalidateQueries(key);

  async function addMount() {
    const slots = parseInt(maxSlots, 10);
    if (!name.trim()) {
      addToast("error", "Enter a mount name");
      return;
    }
    if (isNaN(slots) || slots < 1) {
      addToast("error", "Slots must be at least 1");
      return;
    }
    setIsSaving(true);
    try {
      const res = await marketApi.upsertMount(guildId, {
        name: name.trim(),
        maxSlots: slots,
        iconUrl: iconUrl.trim() || undefined,
      });
      if (res.success) {
        addToast("success", `Added ${name.trim()}.`);
        setName("");
        setMaxSlots("1");
        setIconUrl("");
        refresh();
      } else addToast("error", res.error?.message || "Failed to add mount");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  async function addPresetMount(presetName: string) {
    setBusyId(presetName);
    try {
      const res = await marketApi.upsertMount(guildId, { name: presetName, maxSlots: 1 });
      if (res.success) {
        addToast("success", `Added ${presetName}.`);
        refresh();
      } else addToast("error", res.error?.message || "Failed to add mount");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(mount: MountCatalogItem) {
    setBusyId(mount.id);
    try {
      const res = await marketApi.upsertMount(guildId, {
        id: mount.id,
        name: mount.name,
        maxSlots: mount.maxSlots,
        iconUrl: mount.iconUrl,
        isActive: !mount.isActive,
      });
      if (res.success) refresh();
      else addToast("error", res.error?.message || "Failed to update mount");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  async function removeMount(mount: MountCatalogItem) {
    if (!window.confirm(`Remove ${mount.name} from the mount catalog? This also clears its distribution history.`)) return;
    setBusyId(mount.id);
    try {
      const res = await marketApi.deleteMount(guildId, mount.id);
      if (res.success) {
        addToast("success", `Removed ${mount.name}.`);
        refresh();
      } else addToast("error", res.error?.message || "Failed to remove mount");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SettingsCard
      eyebrow="Leader Panel"
      title="Mount wishlist catalog"
      description="Define which mounts members can wish for and how many of each can be distributed. Each distribution consumes one slot."
    >
      {/* Add form */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
        <Input label="Mount name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delphon Saddle" />
        <div className="w-24">
          <Input label="Max slots" type="number" min={1} value={maxSlots} onChange={(e) => setMaxSlots(e.target.value)} />
        </div>
        <Button variant="primary" size="sm" onClick={addMount} isLoading={isSaving} className="mb-0.5">
          Add mount
        </Button>
      </div>
      <div className="mt-2">
        <Input label="Icon URL (optional)" value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} placeholder="https://…" />
      </div>

      {/* Known mount data — quick-add table */}
      <div className="mt-5">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 mb-2">Mount data</p>
        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-left text-[11px] uppercase tracking-wide text-white/40">
                <th className="px-3 py-2 font-medium">Mount name</th>
                <th className="px-3 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {MOUNT_PRESETS.map((presetName, i) => {
                const inCatalog = mounts.some((m) => m.name.toLowerCase() === presetName.toLowerCase());
                return (
                  <tr
                    key={presetName}
                    className={i % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}
                  >
                    <td className="px-3 py-2 text-white/80">{presetName}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => addPresetMount(presetName)}
                        disabled={inCatalog || busyId === presetName}
                        className={inCatalog ? "text-white/25" : "text-[var(--forge-gold-bright)]"}
                      >
                        {inCatalog ? "Added" : "Add"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Catalog list */}
      <div className="mt-5 space-y-2">
        {isLoading && mounts.length === 0 ? (
          <p className="text-xs text-white/40 py-2">Loading…</p>
        ) : mounts.length === 0 ? (
          <p className="text-xs text-white/35 py-4 border border-dashed border-white/[0.06] rounded-xl text-center">
            No mounts in the catalog yet.
          </p>
        ) : (
          mounts.map((mount) => (
            <div
              key={mount.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                mount.isActive ? "border-white/[0.08] bg-white/[0.02]" : "border-white/[0.05] bg-white/[0.01] opacity-60"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{mount.name}</p>
                <p className="text-[11px] text-white/45">
                  {mount.distributed}/{mount.maxSlots} distributed · {mount.remaining} slot(s) left
                  {!mount.isActive && <span className="text-white/30"> · hidden</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => toggleActive(mount)}
                  disabled={busyId === mount.id}
                  className="text-white/55"
                >
                  {mount.isActive ? "Hide" : "Show"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => removeMount(mount)}
                  disabled={busyId === mount.id}
                  className="text-rose-300/70"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </SettingsCard>
  );
}
