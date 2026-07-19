"use client";

import { useEffect, useState } from "react";
import { factionApi, type FactionOverviewData, type FactionStatusValue } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useQuery, queryClient } from "@/lib/query";
import FactionRolesTab from "./FactionRolesTab";

const STATUS_OPTIONS: FactionStatusValue[] = ["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"];

/**
 * Faction Settings — profile fields (Faction Leader/Admin) and, only for
 * platform Super Admins, the status lifecycle control. Status changes go
 * through POST /faction/status, which is gated by the requirePlatformAdmin
 * Hono middleware server-side — this UI gate is a convenience, not the
 * real boundary.
 */
export default function FactionSettingsTab({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isSuperAdmin = Boolean(user?.platformRole);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [statusReason, setStatusReason] = useState("");
  const [form, setForm] = useState({ name: "", description: "", avatarUrl: "", bannerUrl: "", code: "", server: "", region: "", game: "" });

  const { data: overview, isLoading } = useQuery<FactionOverviewData>(
    "faction_overview",
    async () => {
      const result = await factionApi.getOverview();
      return result.success && result.data ? result.data : { faction: null, guilds: [], totalGuilds: 0, totalMembers: 0, canManage: false };
    },
    { persist: true, staleTime: 30000 },
  );
  const faction = overview?.faction ?? null;

  useEffect(() => {
    if (!faction) return;
    setForm({
      name: faction.name || "",
      description: faction.description || "",
      avatarUrl: faction.avatarUrl || "",
      bannerUrl: faction.bannerUrl || "",
      code: faction.code || "",
      server: faction.server || "",
      region: faction.region || "",
      game: faction.game || "",
    });
  }, [faction]);

  async function saveProfile() {
    setIsSaving(true);
    try {
      const result = await factionApi.updateProfile(form);
      if (result.success) {
        addToast("success", "Faction profile updated");
        queryClient.invalidateQueries("faction_overview");
      } else {
        addToast("error", result.error?.message || "Failed to update faction profile");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(status: FactionStatusValue) {
    if (!faction) return;
    if (!confirm(`Change faction status to ${status}?`)) return;
    setIsChangingStatus(true);
    try {
      const result = await factionApi.updateStatus(faction.id, status, statusReason || undefined);
      if (result.success) {
        addToast("success", `Faction status set to ${status}`);
        setStatusReason("");
        queryClient.invalidateQueries("faction_overview");
      } else {
        addToast("error", result.error?.message || "Failed to change faction status");
      }
    } finally {
      setIsChangingStatus(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <h3 className="text-sm font-semibold text-white/80">Settings are restricted</h3>
        <p className="text-xs text-white/45 mt-1">Only Faction Leaders and Admins can edit faction settings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] gap-5 items-start">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Faction profile</h3>
          <p className="text-[11px] text-white/40 mt-1">Identity, display code, and world metadata used across faction pages.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
          <Field label="Faction code" value={form.code} onChange={(v) => setForm((p) => ({ ...p, code: v }))} placeholder="e.g. ABC" />
        </div>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={4}
            className="min-h-[112px] w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-amber-500/35 resize-none"
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Logo URL" value={form.avatarUrl} onChange={(v) => setForm((p) => ({ ...p, avatarUrl: v }))} />
          <Field label="Banner URL" value={form.bannerUrl} onChange={(v) => setForm((p) => ({ ...p, bannerUrl: v }))} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Server" value={form.server} onChange={(v) => setForm((p) => ({ ...p, server: v }))} />
          <Field label="Region" value={form.region} onChange={(v) => setForm((p) => ({ ...p, region: v }))} />
          <Field label="Game" value={form.game} onChange={(v) => setForm((p) => ({ ...p, game: v }))} />
        </div>
        <div className="flex justify-end border-t border-white/[0.06] pt-4">
          <Button variant="secondary" size="sm" onClick={saveProfile} isLoading={isSaving}>
            Save profile
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Roles</h3>
          <p className="text-[11px] text-white/40 mt-1">Grant faction-level officer, treasurer, and inventory permissions.</p>
        </div>
        <FactionRolesTab canManage={canManage} />
      </section>

      {isSuperAdmin && faction && (
        <section className="rounded-xl border border-red-500/[0.15] bg-red-500/[0.03] p-4 sm:p-5 space-y-4 xl:col-span-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Status lifecycle</h3>
              <p className="text-[11px] text-white/40 mt-1">Super Admin only. Current status: <span className="text-white/70 font-semibold">{faction.status}</span></p>
            </div>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">Reason (optional)</span>
              <input
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-red-500/35"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <Button
                  key={status}
                  variant={status === faction.status ? "secondary" : "ghost"}
                  size="sm"
                  disabled={status === faction.status}
                  isLoading={isChangingStatus}
                  onClick={() => changeStatus(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.16em] text-white/45 mb-2">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/35"
      />
    </label>
  );
}
