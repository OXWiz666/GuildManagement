"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PREDEFINED_BOSSES } from "@guild/shared";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { discordApi, guildApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface Integration {
  server: {
    discordGuildId: string;
    timezone: string;
    linkedAt: string;
    linkedByName: string | null;
  } | null;
  channels: Array<{ purpose: string; channelId: string }>;
  aliases: Array<{ id: string; alias: string; bossName: string }>;
  canManage: boolean;
}

const CHANNEL_LABELS: Record<string, { label: string; hint: string; command: string }> = {
  NOTIFICATION: {
    label: "Notifications",
    hint: "Spawn warnings, spawn and kill alerts post here.",
    command: "!notifhere",
  },
  COMMAND: {
    label: "Commands",
    hint: "When set, the bot only answers in this channel.",
    command: "!cmdhere",
  },
  THREAD: {
    label: "Threads",
    hint: "Boss threads are created here.",
    command: "!threadhere",
  },
};

/**
 * Guild Settings → Discord Integration.
 *
 * Guild-level config, distinct from the per-user account link in
 * /dashboard/settings. Shows which Discord server serves this guild, where its
 * notifications go, and the boss aliases its members can type.
 *
 * Binding and channel selection stay Discord-side commands on purpose: both
 * need a Discord context the website doesn't have (which server sent this, and
 * which channel you're standing in). This surfaces their result, and owns the
 * one thing that needs no Discord context — aliases.
 */
export default function DiscordIntegrationSection({ guildId }: { guildId: string }) {
  const { addToast } = useToast();

  const [data, setData] = useState<Integration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alias, setAlias] = useState("");
  const [bossName, setBossName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The invite code is what `!bindguild` takes. Fetched here so an unconnected
  // guild gets the exact command to paste, rather than a pointer to go find a
  // code on another page.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    // One round trip for both — the panel is useless without either.
    const [integration, invite] = await Promise.all([
      discordApi.getGuildIntegration(guildId),
      guildApi.getInviteCode(guildId),
    ]);

    if (integration.success && integration.data) setData(integration.data);
    else addToast("error", integration.error?.message || "Couldn't load Discord settings");

    // A guild may simply not have a code yet — that's a normal state the UI
    // offers to fix, not an error worth a toast.
    if (invite.success) setInviteCode(invite.data?.inviteCode ?? null);

    setIsLoading(false);
  }, [guildId, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateInvite() {
    setIsGenerating(true);
    try {
      const result = await guildApi.generateInviteCode(guildId);
      if (result.success && result.data?.inviteCode) {
        setInviteCode(result.data.inviteCode);
        addToast("success", "Guild invite code generated");
      } else {
        addToast("error", result.error?.message || "Couldn't generate an invite code");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyBindCommand() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(`!bindguild ${inviteCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (insecure context/permissions); the command is
      // on screen to type, so this isn't worth an error toast.
      addToast("info", "Copy failed — type the command manually.");
    }
  }

  const bossOptions = useMemo(
    () => [...PREDEFINED_BOSSES].map((b) => b.name).sort((a, b) => a.localeCompare(b)),
    [],
  );

  const channelMap = useMemo(
    () => new Map((data?.channels ?? []).map((c) => [c.purpose, c.channelId])),
    [data],
  );

  async function addAlias(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await discordApi.addBossAlias(guildId, alias, bossName);
      if (result.success) {
        addToast("success", `"${alias}" now means ${bossName}`);
        setAlias("");
        setBossName("");
        await load();
      } else {
        addToast("error", result.error?.message || "Couldn't save that alias");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function removeAlias(id: string, label: string) {
    setBusyId(id);
    try {
      const result = await discordApi.removeBossAlias(guildId, id);
      if (result.success) {
        addToast("success", `Removed "${label}"`);
        await load();
      } else {
        addToast("error", result.error?.message || "Couldn't remove that alias");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return <div className="h-64 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />;
  }

  if (!data) return null;

  const guildAliases = data.aliases;

  return (
    <div className="space-y-5">
      {/* ─── Connection status ─── */}
      <Card
        eyebrow="Integration"
        title="Discord"
        description="Connect this guild to a Discord server so members can check timers, log kills and update CP without opening the site."
        right={
          data.server ? (
            <Pill tone="ok">Connected</Pill>
          ) : (
            <Pill tone="off">Not connected</Pill>
          )
        }
      >
        {data.server ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discord Server ID" value={<code className="text-[12px]">{data.server.discordGuildId}</code>} />
            <Field label="Timezone" value={data.server.timezone} />
            <Field
              label="Connected"
              value={new Date(data.server.linkedAt).toLocaleDateString()}
            />
            <Field label="Connected by" value={data.server.linkedByName ?? "—"} />
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[12px] text-white/60 leading-relaxed">
              No Discord server is connected yet. Run this in your Discord server as a Guild
              Leader:
            </p>

            {inviteCode ? (
              <div className="mt-2.5 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-black/30 px-3 py-2 font-mono text-[13px] text-[var(--forge-gold)]">
                  !bindguild {inviteCode}
                </code>
                <Button variant="secondary" onClick={copyBindCommand}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : (
              <div className="mt-2.5">
                <p className="text-[12px] text-white/45 mb-2.5">
                  This guild has no invite code yet — generate one to bind Discord.
                </p>
                <Button onClick={generateInvite} disabled={isGenerating}>
                  {isGenerating ? "Generating…" : "Generate invite code"}
                </Button>
              </div>
            )}

            <p className="mt-3 text-[11px] text-white/35 leading-relaxed">
              Binding runs in Discord because it needs to know which server the command came from —
              something this page can&apos;t see. The same code is also used to invite members, and
              is shown on the Members page.
            </p>
          </div>
        )}
      </Card>

      {/* ─── Channels ─── */}
      {data.server && (
        <Card
          eyebrow="Routing"
          title="Channels"
          description="Set from inside Discord — the bot uses the channel you run the command in."
        >
          <div className="space-y-2.5">
            {Object.entries(CHANNEL_LABELS).map(([purpose, meta]) => {
              const channelId = channelMap.get(purpose);
              return (
                <div
                  key={purpose}
                  className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white/85">{meta.label}</p>
                    <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{meta.hint}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {channelId ? (
                      <code className="text-[11px] text-emerald-300/80">#{channelId}</code>
                    ) : (
                      <code className="text-[11px] text-white/35">{meta.command}</code>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!channelMap.has("NOTIFICATION") && (
            <p className="mt-3 text-[11px] text-amber-300/70 leading-relaxed">
              No notification channel set — the bot won&apos;t post spawn or kill alerts until a
              Officer runs <code>!notifhere</code> in the channel you want them in.
            </p>
          )}
        </Card>
      )}

      {/* ─── Aliases ─── */}
      <Card
        eyebrow="Shortcuts"
        title="Boss aliases"
        description="Map your guild's shorthand onto real boss names, so !spawn and !kill accept what people actually type."
      >
        {data.canManage && data.server && (
          <form onSubmit={addAlias} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end mb-4">
            <Input
              label="Alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. baron"
            />
            <div>
              <label className="block text-[11px] text-white/50 mb-1.5">Boss</label>
              <select
                value={bossName}
                onChange={(e) => setBossName(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-[13px] text-white/85 outline-none transition-colors focus:border-[var(--forge-gold)]/50"
              >
                <option value="">Select a boss…</option>
                {bossOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={isSaving || !alias || !bossName}>
              {isSaving ? "Saving…" : "Add"}
            </Button>
          </form>
        )}

        {guildAliases.length === 0 ? (
          <p className="text-[12px] text-white/40 leading-relaxed">
            No aliases yet.{" "}
            {data.server
              ? "Add one above, or run !alias add <alias> <boss> in Discord."
              : "Connect a Discord server first."}
          </p>
        ) : (
          <div className="space-y-2">
            {guildAliases.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <code className="text-[12px] text-[var(--forge-gold)]">{row.alias}</code>
                  <span className="text-white/25">→</span>
                  <span className="text-[13px] text-white/80 truncate">{row.bossName}</span>
                </div>
                {data.canManage && (
                  <Button
                    variant="ghost"
                    onClick={() => removeAlias(row.id, row.alias)}
                    disabled={busyId === row.id}
                  >
                    {busyId === row.id ? "Removing…" : "Remove"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Local presentational helpers ───
// Kept in-file rather than exported: they're layout for this panel only, and
// the shared SettingsCard lives under the account-settings route.

function Card({
  eyebrow,
  title,
  description,
  right,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative glass rounded-2xl p-6 md:p-7 border border-white/[0.06] overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-6 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.16), transparent)",
        }}
      />
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">{eyebrow}</span>
            <span className="h-px w-10 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h2 className="text-[16px] font-semibold text-white tracking-tight">{title}</h2>
          {description && (
            <p className="text-[12px] text-white/45 mt-1.5 leading-relaxed">{description}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
}

function Pill({ tone, children }: { tone: "ok" | "off"; children: React.ReactNode }) {
  const styles =
    tone === "ok"
      ? "text-emerald-300/90 bg-emerald-400/10 border-emerald-400/20"
      : "text-white/40 bg-white/[0.03] border-white/[0.08]";
  const dot = tone === "ok" ? "bg-emerald-400" : "bg-white/30";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] rounded-full border px-2.5 py-1 ${styles}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{label}</p>
      <div className="text-[13px] text-white/80 mt-1 truncate">{value}</div>
    </div>
  );
}
