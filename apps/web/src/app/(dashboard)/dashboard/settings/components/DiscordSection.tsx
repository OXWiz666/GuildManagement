"use client";

import { useCallback, useEffect, useState } from "react";
import SettingsCard from "./SettingsCard";
import Button from "@/components/ui/Button";
import { discordApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface LinkStatus {
  linked: boolean;
  discordUsername: string | null;
  linkedAt: string | null;
}

/**
 * Discord account linking.
 *
 * Mints a short-lived one-time code the member types into Discord as
 * `!link <code>`. Possession of the code proves possession of this logged-in
 * session, so the bot never handles a password and never has to trust a
 * self-reported Discord identity.
 */
export default function DiscordSection() {
  const { addToast } = useToast();

  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    const result = await discordApi.getLinkStatus();
    if (result.success && result.data) setStatus(result.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Live countdown on the issued code. One interval that only runs while a code
  // is actually live, so an idle settings tab isn't ticking every second.
  useEffect(() => {
    if (expiresAt === null) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        // Expired — drop it so the UI can't show a code that no longer works.
        setCode(null);
        setExpiresAt(null);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  async function generateCode() {
    setIsWorking(true);
    try {
      const result = await discordApi.createLinkCode();
      if (result.success && result.data) {
        setCode(result.data.code);
        setExpiresAt(new Date(result.data.expiresAt).getTime());
        setCopied(false);
      } else {
        addToast("error", result.error?.message || "Couldn't generate a link code.");
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function unlink() {
    setIsWorking(true);
    try {
      const result = await discordApi.unlink();
      if (result.success) {
        addToast("success", "Discord account unlinked.");
        setCode(null);
        setExpiresAt(null);
        await loadStatus();
      } else {
        addToast("error", result.error?.message || "Couldn't unlink your Discord account.");
      }
    } finally {
      setIsWorking(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`!link ${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (insecure context, permissions) — the
      // code is on screen to type manually, so this isn't worth an error toast.
      addToast("info", "Copy failed — type the command manually.");
    }
  }

  return (
    <SettingsCard
      eyebrow="Integrations"
      title="Discord"
      description="Link your Discord account to update Combat Power and log boss kills from Discord."
      right={
        status?.linked ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300/90 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Linked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40 bg-white/[0.03] border border-white/[0.08] rounded-full px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
            Not linked
          </span>
        )
      }
    >
      {isLoading ? (
        <div className="h-20 rounded-xl bg-white/[0.02] border border-white/[0.05] animate-pulse" />
      ) : status?.linked ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="min-w-0">
              <p className="text-[13px] text-white/85 font-medium truncate">
                {status.discordUsername ?? "Discord account"}
              </p>
              {status.linkedAt && (
                <p className="text-[11px] text-white/40 mt-0.5">
                  Linked {new Date(status.linkedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button variant="secondary" onClick={unlink} disabled={isWorking}>
              {isWorking ? "Unlinking…" : "Unlink"}
            </Button>
          </div>
          <p className="text-[12px] text-white/45 leading-relaxed">
            Try <code className="text-[var(--forge-gold)]">!cp</code> or{" "}
            <code className="text-[var(--forge-gold)]">!spawn</code> in your guild&apos;s Discord.
            Attach a screenshot to <code className="text-[var(--forge-gold)]">!cp</code> to scan
            your Combat Power automatically.
          </p>
        </div>
      ) : code ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--forge-gold)]/25 bg-[var(--forge-gold)]/[0.06] p-5 text-center">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 mb-3">
              Your one-time code
            </p>
            <p className="font-mono text-3xl tracking-[0.3em] text-[var(--forge-gold-bright)] select-all">
              {code}
            </p>
            <p className="text-[11px] text-white/40 mt-3">
              Expires in{" "}
              <span className="text-white/70 tabular-nums">
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[12px] text-white/60 mb-2">
              In your guild&apos;s Discord, send:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-[13px] text-[var(--forge-gold)] bg-black/30 rounded-lg px-3 py-2 truncate">
                !link {code}
              </code>
              <Button variant="secondary" onClick={copyCode}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[11px] text-white/35 mt-2.5 leading-relaxed">
              The bot deletes your message afterwards, so the code won&apos;t linger in channel
              history.
            </p>
          </div>

          <Button variant="secondary" onClick={generateCode} disabled={isWorking}>
            {isWorking ? "Generating…" : "Generate a new code"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="space-y-2.5 text-[12px] text-white/55">
            {[
              "Generate a one-time code below.",
              "Send !link <code> in your guild's Discord server.",
              "That's it — your accounts are connected.",
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="shrink-0 h-5 w-5 rounded-full bg-white/[0.05] border border-white/[0.08] grid place-items-center text-[10px] text-white/50">
                  {index + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <Button onClick={generateCode} disabled={isWorking}>
            {isWorking ? "Generating…" : "Generate link code"}
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}
