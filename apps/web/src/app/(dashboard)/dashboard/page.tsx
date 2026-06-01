"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  guildApi,
  dashboardApi,
  type JoinRequestData,
  type BossScheduleData,
} from "@/lib/api";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/ui/Toast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import {
  Reveal,
  StaggerReveal,
  TiltCard,
  Magnetic,
  Sparkline,
  LiveDot,
  SectionHeader,
  useCountUp,
  useReveal,
} from "@/components/dashboard/DashboardHelpers";

const CLASS_OPTIONS = [
  "Destroyer",
  "Paladin",
  "Hunter",
  "Mage",
  "Sorcerer",
  "Blitzblade",
  "Archer",
  "Venom",
  "Immortal Knight",
] as const;

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();

  // ─── Non-Guild Joining State ──────────────────
  const [pendingApp, setPendingApp] = useState<JoinRequestData | null>(null);
  const [isLoadingPending, setIsLoadingPending] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [verifiedGuild, setVerifiedGuild] = useState<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    avatarUrl: string | null;
  } | null>(null);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [ign, setIgn] = useState(user?.ign || "");
  const [cp, setCp] = useState(user?.cp ? user.cp.toLocaleString() : "");
  const [classType, setClassType] = useState(user?.class || "");
  const [weapon, setWeapon] = useState(user?.weapon || "");
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.ign) setIgn(user.ign);
      if (user.cp) setCp(user.cp.toLocaleString());
      if (user.class) setClassType(user.class);
      if (user.weapon) setWeapon(user.weapon);
    }
  }, [user]);

  // ─── Boss schedules State ────────────────
  const [bossSchedules, setBossSchedules] = useState<BossScheduleData[]>([]);
  const [isLoadingBosses, setIsLoadingBosses] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showKillModal, setShowKillModal] = useState<BossScheduleData | null>(
    null,
  );
  const [killTimeInput, setKillTimeInput] = useState("");
  const [isLoggingKill, setIsLoggingKill] = useState(false);

  // ─── Dashboard Stats State ────────────────────
  const [stats, setStats] = useState<{
    balance: { raw: number; value: string; sub: string; currencySymbol: string };
    guildPoints: { raw: number; value: string; sub: string };
    members: { raw: number; value: string; sub: string; online: number };
    bossToday: { raw: number; value: string; sub: string; total: number };
    recentActivity: Array<{
      type: "CREDIT" | "DEBIT" | "POINTS" | "INFO" | "CONFIG";
      action: string;
      detail: string;
      time: string;
    }>;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader;

  // Real-time ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pending application
  const loadPendingRequest = useCallback(async () => {
    if (activeGuild || !user) return;
    setIsLoadingPending(true);
    try {
      const result = await guildApi.getUserPendingRequest();
      if (result.success && result.data?.request) {
        setPendingApp(result.data.request);
      } else {
        setPendingApp(null);
      }
    } catch {
      // quiet fail
    } finally {
      setIsLoadingPending(false);
    }
  }, [activeGuild, user]);

  // Boss schedules
  const loadBossSchedules = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoadingBosses(true);
    try {
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      if (result.success && result.data?.schedules) {
        const activeSchedules = result.data.schedules
          .filter((s) => s.status !== "KILLED")
          .sort(
            (a, b) =>
              new Date(a.spawnTime).getTime() - new Date(b.spawnTime).getTime(),
          );
        setBossSchedules(activeSchedules.slice(0, 3));
      }
    } catch {
      // quiet fail
    } finally {
      setIsLoadingBosses(false);
    }
  }, [activeGuild]);

  // Dashboard stats
  const loadDashboardStats = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoadingStats(true);
    try {
      const result = await dashboardApi.getDashboardStats(activeGuild.guildId);
      if (result.success && result.data) {
        setStats(result.data);
      }
    } catch {
      // quiet fail
    } finally {
      setIsLoadingStats(false);
    }
  }, [activeGuild]);

  useEffect(() => {
    loadPendingRequest();
    if (activeGuild) {
      loadBossSchedules();
      loadDashboardStats();
    }
  }, [activeGuild, loadPendingRequest, loadBossSchedules, loadDashboardStats]);

  // Real-time Socket.IO listeners for instant dashboard updates
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleRealTimeRefresh = () => {
      loadBossSchedules();
      loadDashboardStats();
    };

    socket.on("boss_rotation_updated", handleRealTimeRefresh);
    socket.on("boss_schedule_deleted", handleRealTimeRefresh);

    return () => {
      socket.off("boss_rotation_updated", handleRealTimeRefresh);
      socket.off("boss_schedule_deleted", handleRealTimeRefresh);
    };
  }, [socket, activeGuild, loadBossSchedules, loadDashboardStats]);

  // Verify invite code
  async function handleVerifyCode() {
    if (!inviteCode.trim()) {
      setVerifyError("Please enter an invite code");
      return;
    }
    setIsVerifyingCode(true);
    setVerifyError("");
    setVerifiedGuild(null);
    try {
      const result = await guildApi.verifyInviteCode(inviteCode.trim());
      if (result.success && result.data?.guild) {
        setVerifiedGuild(result.data.guild);
        addToast("success", "Invite verified.");
      } else {
        setVerifyError("Invalid invite code");
      }
    } catch (err: any) {
      setVerifyError(err?.message || "Invalid or inactive invite code");
    } finally {
      setIsVerifyingCode(false);
    }
  }

  // Submit application
  async function handleSubmitApplication(e: React.FormEvent) {
    e.preventDefault();
    if (
      !verifiedGuild ||
      !ign.trim() ||
      !cp.trim() ||
      !classType ||
      !weapon.trim()
    ) {
      addToast("error", "Please fill in all character details");
      return;
    }
    const cpNumber = parseInt(cp.replace(/,/g, ""));
    if (isNaN(cpNumber) || cpNumber <= 0) {
      addToast("error", "Please enter a valid Combat Power (CP)");
      return;
    }

    setIsSubmittingApp(true);
    try {
      const result = await guildApi.applyToGuild({
        inviteCode: inviteCode.trim(),
        ign: ign.trim(),
        cp: cpNumber,
        class: classType,
        weapon: weapon.trim(),
      });

      if (result.success) {
        addToast("success", `Applied to ${result.data?.guildName}`);
        await loadPendingRequest();
      } else {
        addToast(
          "error",
          result.error?.message || "Failed to submit application",
        );
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to submit application");
    } finally {
      setIsSubmittingApp(false);
    }
  }

  // Cancel application
  async function handleCancelApplication() {
    if (!pendingApp) return;
    try {
      const result = await guildApi.cancelRequest(pendingApp.id);
      if (result.success) {
        addToast("info", "Application cancelled");
        setPendingApp(null);
        setVerifiedGuild(null);
        setInviteCode("");
        setIgn("");
        setCp("");
        setClassType("");
        setWeapon("");
      } else {
        addToast("error", "Failed to cancel application");
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to cancel application");
    }
  }

  // Check status
  async function handleCheckStatus() {
    addToast("info", "Checking application status...");
    try {
      await refreshUser();
      const result = await guildApi.getUserPendingRequest();
      if (result.success && result.data?.request) {
        setPendingApp(result.data.request);
        addToast("info", "Application is still pending review");
      } else {
        if (user && user.guilds.length > 0) {
          addToast("success", "Welcome to the guild!");
        } else {
          setPendingApp(null);
          addToast("warning", "Your application was declined or cancelled");
        }
      }
    } catch {
      addToast("error", "Error checking application status");
    }
  }

  // Log boss kill
  async function handleLogKill(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGuild || !showKillModal || !killTimeInput) return;

    setIsLoggingKill(true);
    try {
      const formattedTime = new Date(
        `${new Date().toISOString().split("T")[0]}T${killTimeInput}:00`,
      );
      const result = await dashboardApi.logBossKill(
        activeGuild.guildId,
        showKillModal.id,
        formattedTime.toISOString(),
      );
      if (result.success) {
        addToast("success", `Recorded death for ${showKillModal.bossName}`);
        setShowKillModal(null);
        setKillTimeInput("");
        await loadBossSchedules();
        await loadDashboardStats();
      }
    } catch (err: any) {
      addToast("error", err?.message || "Failed to log boss kill");
    } finally {
      setIsLoggingKill(false);
    }
  }

  // Countdown formatter
  function getTickingCountdown(spawnTimeStr: string) {
    const target = new Date(spawnTimeStr).getTime();
    const diff = target - currentTime;
    if (diff <= 0) return { expired: true, text: "LIVE", warning: false };

    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    const secs = Math.floor((diff % (60 * 1000)) / 1000);
    const text = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    const warning = diff <= 5 * 60 * 1000;

    return { expired: false, text, warning };
  }

  if (!user) return null;

  // ═══════════════════════════════════════════════════
  // NO GUILD VIEW
  // ═══════════════════════════════════════════════════
  if (user.guilds.length === 0) {
    return (
      <div className="relative max-w-7xl mx-auto w-full">
        <DashboardDecor />

        <div className="relative z-10 space-y-7 text-white/85">
          {/* Welcome */}
          <Reveal>
            <div className="pb-6 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
                  Onboarding
                </span>
                <span className="h-px w-12 bg-gradient-to-r from-white/15 to-transparent" />
              </div>
              <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-white tracking-tight">
                Welcome, {user.displayName}
                <span className="text-white/40">.</span>
              </h1>
              <p className="text-sm text-white/50 mt-2 leading-relaxed max-w-xl">
                Enter a Guild Invite Code to apply, then a leader will review
                your character details.
              </p>
            </div>
          </Reveal>

          {isLoadingPending ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Skeleton className="h-64 rounded-2xl" />
              </div>
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                {pendingApp ? (
                  <Reveal delay={120}>
                    <div className="relative glass-strong rounded-2xl p-6 md:p-7 border border-white/[0.08]">
                      <span
                        aria-hidden
                        className="absolute inset-x-6 top-0 h-px"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.20), transparent)",
                        }}
                      />
                      <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-white/[0.06]">
                        <div className="relative h-10 w-10 rounded-xl bg-amber-500/[0.10] border border-amber-500/20 flex items-center justify-center">
                          <svg
                            className="h-4 w-4 text-amber-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span className="absolute -inset-0.5 rounded-xl border border-amber-500/15 animate-ping" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-amber-400/80">
                            Pending
                          </div>
                          <h2 className="text-[15px] font-semibold text-white">
                            Application under review
                          </h2>
                          <p className="text-[11px] text-white/40 mt-0.5">
                            Submitted{" "}
                            {new Date(pendingApp.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="h-11 w-11 rounded-lg bg-white/[0.06] border border-white/[0.10] flex items-center justify-center font-semibold text-white/85 text-sm">
                              {pendingApp.guildName?.[0]}
                            </div>
                            <div>
                              <p className="text-[14px] font-semibold text-white">
                                {pendingApp.guildName}
                              </p>
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/[0.08] text-amber-400/90 border border-amber-500/15 mt-1">
                                <LiveDot tone="amber" size={5} />
                                Awaiting decision
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <Magnetic strength={4}>
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={handleCheckStatus}
                              >
                                Check status
                              </Button>
                            </Magnetic>
                            <Magnetic strength={4}>
                              <Button
                                variant="danger"
                                size="xs"
                                onClick={handleCancelApplication}
                              >
                                Cancel
                              </Button>
                            </Magnetic>
                          </div>
                        </div>

                        <StaggerReveal
                          baseDelay={80}
                          stagger={70}
                          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                        >
                          <MiniStat label="IGN" value={pendingApp.ign} />
                          <MiniStat
                            label="CP"
                            value={pendingApp.cp.toLocaleString()}
                            accent
                          />
                          <MiniStat label="Class" value={pendingApp.class} />
                          <MiniStat label="Weapon" value={pendingApp.weapon} />
                        </StaggerReveal>
                      </div>
                    </div>
                  </Reveal>
                ) : (
                  <Reveal delay={120}>
                    <div className="relative glass-strong rounded-2xl p-6 md:p-7 border border-white/[0.08]">
                      <span
                        aria-hidden
                        className="absolute inset-x-6 top-0 h-px"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.20), transparent)",
                        }}
                      />
                      <div className="flex items-center gap-2 mb-5">
                        <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
                          Step 01 · Verify
                        </span>
                        <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                      </div>
                      <h2 className="text-[18px] font-semibold text-white mb-4 tracking-tight">
                        Join a guild
                      </h2>

                      {!verifiedGuild ? (
                        <div className="space-y-4 max-w-md">
                          <p className="text-[12px] text-white/50 leading-relaxed">
                            Enter the unique Guild Invite Code provided by your
                            leader.
                          </p>
                          <div className="flex gap-2">
                            <div className="relative flex-1 group">
                              <span
                                aria-hidden
                                className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"
                                style={{
                                  background:
                                    "linear-gradient(90deg, oklch(0.62 0.035 234 / 0.0), oklch(0.62 0.035 234 / 0.18), oklch(0.78 0.024 78 / 0.12))",
                                  filter: "blur(10px)",
                                }}
                              />
                              <input
                                type="text"
                                placeholder="e.g. DK-JOIN-9A21"
                                value={inviteCode}
                                onChange={(e) => {
                                  setInviteCode(e.target.value.toUpperCase());
                                  setVerifyError("");
                                }}
                                className="relative w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors uppercase font-mono tracking-wider"
                              />
                            </div>
                            <Magnetic strength={4}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleVerifyCode}
                                disabled={isVerifyingCode}
                                isLoading={isVerifyingCode}
                                className="border border-white/[0.10]"
                              >
                                {!isVerifyingCode && "Verify"}
                              </Button>
                            </Magnetic>
                          </div>
                          {verifyError && (
                            <p className="text-[11px] text-red-400/90 font-medium animate-slide-down flex items-center gap-1.5">
                              <svg
                                className="h-3 w-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              {verifyError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <form
                          onSubmit={handleSubmitApplication}
                          className="space-y-4 animate-scale-in"
                        >
                          <div className="p-3.5 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-white/[0.06] border border-white/[0.10] flex items-center justify-center font-semibold text-white/85 text-[12px]">
                                {verifiedGuild.name[0]}
                              </div>
                              <div>
                                <p className="text-[9px] text-emerald-400 font-semibold uppercase tracking-[0.2em] flex items-center gap-1.5">
                                  <LiveDot tone="emerald" size={5} />
                                  Verified · Applying to
                                </p>
                                <p className="text-[13px] font-medium text-white mt-0.5">
                                  {verifiedGuild.name}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => setVerifiedGuild(null)}
                              type="button"
                              className="text-[10px] uppercase tracking-wider text-white/40 hover:text-white/80 font-medium cursor-pointer transition-colors"
                            >
                              Change
                            </button>
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
                              Step 02 · Character
                            </span>
                            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormField
                              label="IGN"
                              placeholder="e.g. DragonSlayer"
                              value={ign}
                              onChange={setIgn}
                            />
                            <FormField
                              label="Combat Power"
                              placeholder="e.g. 75,000"
                              value={cp}
                              onChange={(v) => {
                                const clean = v.replace(/[^0-9]/g, "");
                                setCp(
                                  clean ? Number(clean).toLocaleString() : "",
                                );
                              }}
                            />
                            <FormSelect
                              label="Class"
                              value={classType}
                              onChange={setClassType}
                              options={CLASS_OPTIONS}
                            />
                            <FormField
                              label="Weapon"
                              placeholder="e.g. Divine Axe"
                              value={weapon}
                              onChange={setWeapon}
                            />
                          </div>

                          <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              onClick={() => setVerifiedGuild(null)}
                            >
                              Back
                            </Button>
                            <Magnetic strength={4}>
                              <Button
                                variant="primary"
                                size="sm"
                                type="submit"
                                isLoading={isSubmittingApp}
                              >
                                Submit application
                              </Button>
                            </Magnetic>
                          </div>
                        </form>
                      )}
                    </div>
                  </Reveal>
                )}
              </div>

              {/* How it works */}
              <Reveal delay={240} from="right">
                <div className="relative glass rounded-2xl p-5 border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
                      Guide
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                  </div>
                  <h3 className="text-[13px] font-semibold text-white mb-4">
                    How it works
                  </h3>
                  <ol className="space-y-3.5">
                    {[
                      "Enter the invite code from your Guild Leader",
                      "Fill in your character details for review",
                      "Wait for the Guild Leader to approve your application",
                    ].map((step, i) => (
                      <li
                        key={i}
                        className="group flex items-start gap-3 text-[12px] text-white/55 leading-relaxed transition-colors hover:text-white/80"
                      >
                        <span className="relative shrink-0 mt-0.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold text-white/60 transition-all duration-300 group-hover:border-white/25 group-hover:text-white">
                            0{i + 1}
                          </span>
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center gap-1.5 text-[10px] text-white/35 uppercase tracking-[0.18em]">
                    <LiveDot tone="emerald" size={5} />
                    Decisions usually within 24h
                  </div>
                </div>
              </Reveal>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // GUILD MEMBER VIEW
  // ═══════════════════════════════════════════════════
  return (
    <div className="relative max-w-7xl mx-auto w-full">
      <DashboardDecor />

      <div className="relative z-10 space-y-7 text-white/85">
        {/* Welcome Header */}
        <Reveal>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
                  Overview
                </span>
                <span className="h-px w-12 bg-gradient-to-r from-white/15 to-transparent" />
              </div>
              <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-white tracking-tight">
                Welcome back, {user.displayName}
                <span className="text-white/40">.</span>
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                {" · "}
                <span className="inline-flex items-center gap-1.5">
                  <LiveDot tone="emerald" size={5} />
                  All systems operational
                </span>
              </p>
            </div>
            {activeGuild && (
              <div className="flex items-center gap-2.5">
                <div className="text-right">
                  <p className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
                    Active guild
                  </p>
                  <p className="text-[13px] text-white font-medium">
                    {activeGuild.guildName}
                  </p>
                </div>
                <Badge role={activeGuild.role} size="md" />
              </div>
            )}
          </div>
        </Reveal>

        {/* Stats Grid */}
        {isLoadingStats || !stats ? (
          <StaggerReveal
            baseDelay={80}
            stagger={90}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </StaggerReveal>
        ) : (
          <StaggerReveal
            baseDelay={80}
            stagger={90}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <StatCard
              label="Balance"
              value={stats.balance.raw}
              prefix={stats.balance.currencySymbol}
              decimals={2}
              sub={stats.balance.sub}
              tone="positive"
              data={[
                stats.balance.raw * 0.8,
                stats.balance.raw * 0.9,
                stats.balance.raw * 0.85,
                stats.balance.raw * 0.95,
                stats.balance.raw,
              ]}
            />
            <StatCard
              label="Guild Points"
              value={stats.guildPoints.raw}
              sub={stats.guildPoints.sub}
              tone="neutral"
              data={[
                stats.guildPoints.raw * 0.8,
                stats.guildPoints.raw * 0.85,
                stats.guildPoints.raw * 0.9,
                stats.guildPoints.raw * 0.95,
                stats.guildPoints.raw,
              ]}
            />
            <StatCard
              label="Members"
              value={stats.members.raw}
              sub={`${stats.members.online} online now`}
              tone="neutral"
              data={[
                stats.members.raw > 4 ? stats.members.raw - 4 : 0,
                stats.members.raw > 2 ? stats.members.raw - 2 : 0,
                stats.members.raw > 3 ? stats.members.raw - 3 : 0,
                stats.members.raw > 1 ? stats.members.raw - 1 : 0,
                stats.members.raw,
              ]}
            />
            <StatCard
              label="Boss Today"
              value={stats.bossToday.raw}
              sub={stats.bossToday.sub}
              tone="warning"
              data={[
                stats.bossToday.raw > 2 ? stats.bossToday.raw - 2 : 0,
                stats.bossToday.raw > 1 ? stats.bossToday.raw - 1 : 0,
                stats.bossToday.raw,
                stats.bossToday.raw,
                stats.bossToday.raw,
              ]}
            />
          </StaggerReveal>
        )}

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Boss Spawns */}
            <Reveal>
              <section className="relative glass rounded-2xl p-6 border border-white/[0.06]">
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.14), transparent)",
                  }}
                />
                <SectionHeader
                  eyebrow="Upcoming bosses"
                  title="Next spawns"
                  meta={`${bossSchedules.length} active`}
                />

                {isLoadingBosses ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : bossSchedules.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="inline-flex h-12 w-12 rounded-full border border-white/[0.06] bg-white/[0.02] items-center justify-center mb-3">
                      <svg
                        className="h-5 w-5 text-white/30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <p className="text-[13px] text-white/50">
                      No upcoming spawns
                    </p>
                    <p className="text-[11px] text-white/30 mt-1">
                      You&apos;re all caught up
                    </p>
                  </div>
                ) : (
                  <StaggerReveal
                    baseDelay={60}
                    stagger={90}
                    className="space-y-3"
                  >
                    {bossSchedules.map((boss) => (
                      <BossRow
                        key={boss.id}
                        boss={boss}
                        tick={getTickingCountdown(boss.spawnTime)}
                        canLogKill={!!isOfficer}
                        onLogKill={() => {
                          setShowKillModal(boss);
                          setKillTimeInput(
                            new Date()
                              .toLocaleTimeString("en-US", { hour12: false })
                              .substring(0, 5),
                          );
                        }}
                      />
                    ))}
                  </StaggerReveal>
                )}
              </section>
            </Reveal>

            {/* Your Guilds */}
            <Reveal>
              <section className="relative glass rounded-2xl p-6 border border-white/[0.06]">
                <span
                  aria-hidden
                  className="absolute inset-x-6 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.14), transparent)",
                  }}
                />
                <SectionHeader
                  eyebrow="Affiliations"
                  title="Your guilds"
                  meta={`${user.guilds.length} active`}
                />
                <StaggerReveal
                  baseDelay={60}
                  stagger={80}
                  className="space-y-3"
                >
                  {user.guilds.map((guild) => (
                    <div
                      key={guild.guildId}
                      className="group relative flex items-center justify-between px-5 py-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300 cursor-pointer overflow-hidden"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.04), transparent)",
                        }}
                      />
                      <div className="flex items-center gap-3.5 min-w-0 relative">
                        <div className="h-11 w-11 rounded-lg bg-white/[0.06] border border-white/[0.10] flex items-center justify-center font-semibold text-white/85 text-sm transition-transform duration-300 group-hover:scale-[1.04]">
                          {guild.guildName[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h3 className="font-semibold text-white text-[14px] truncate">
                              {guild.guildName}
                            </h3>
                            <Badge role={guild.role} />
                          </div>
                          <p className="text-[11px] text-white/40 mt-1">
                            {guild.rankName} · Joined{" "}
                            {new Date(guild.joinedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <svg
                        className="h-4 w-4 text-white/30 shrink-0 relative transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white/80"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  ))}
                </StaggerReveal>
              </section>
            </Reveal>
          </div>

          {/* Right Column — Activity Feed */}
          <Reveal from="right">
            <section className="relative glass rounded-2xl p-6 border border-white/[0.06]">
              <span
                aria-hidden
                className="absolute inset-x-6 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.14), transparent)",
                }}
              />
              <SectionHeader
                eyebrow="Recent"
                title="Activity"
                meta={
                  <span className="inline-flex items-center gap-1.5">
                    <LiveDot tone="emerald" size={5} />
                    Live
                  </span>
                }
              />
              {isLoadingStats || !stats ? (
                <StaggerReveal
                  baseDelay={120}
                  stagger={75}
                  className="space-y-1"
                >
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                  <ActivityItemSkeleton />
                </StaggerReveal>
              ) : (
                <StaggerReveal
                  baseDelay={120}
                  stagger={75}
                  className="space-y-1"
                >
                  {stats.recentActivity.map((activity, index) => {
                    let icon = <InfoIcon />;
                    if (activity.type === "CREDIT") icon = <CreditIcon />;
                    else if (activity.type === "DEBIT") icon = <DebitIcon />;
                    else if (activity.type === "POINTS") icon = <PointsIcon />;
                    else if (activity.type === "CONFIG") icon = <ConfigIcon />;

                    const tone = (activity.type === "CREDIT" || activity.type === "POINTS") ? "positive" : "neutral";

                    return (
                      <ActivityItem
                        key={index}
                        icon={icon}
                        action={activity.action}
                        detail={activity.detail}
                        time={activity.time}
                        tone={tone}
                      />
                    );
                  })}
                </StaggerReveal>
              )}

              <div className="mt-5 pt-4 border-t border-white/[0.06] text-center">
                <button className="group inline-flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white transition-colors uppercase tracking-[0.18em] font-medium">
                  View all
                  <svg
                    className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </section>
          </Reveal>
        </div>
      </div>

      {/* LOG BOSS KILL MODAL */}
      {showKillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={() => !isLoggingKill && setShowKillModal(null)}
          />
          <div
            className="relative glass-strong border border-white/[0.10] rounded-2xl p-6 max-w-sm w-full shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)] z-50 animate-scale-in"
            style={{ animationDuration: "320ms" }}
          >
            <span
              aria-hidden
              className="absolute inset-x-6 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.24), transparent)",
              }}
            />
            <div className="flex items-center gap-3 mb-4">
              <div className="relative h-10 w-10 rounded-xl bg-red-500/[0.10] border border-red-500/20 flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="absolute -inset-0.5 rounded-xl border border-red-500/15 animate-ping" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-red-400/80">
                  Record death
                </div>
                <h3 className="text-[15px] font-semibold text-white">
                  Log boss kill
                </h3>
              </div>
            </div>
            <p className="text-[12px] text-white/50 mb-5 leading-relaxed">
              Record the time of death for{" "}
              <span className="text-white font-medium">
                {showKillModal.bossName}
              </span>
              .
            </p>

            <form onSubmit={handleLogKill} className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-2">
                  Time of death
                </label>
                <input
                  type="time"
                  value={killTimeInput}
                  onChange={(e) => setKillTimeInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25 font-mono text-center tracking-[0.18em]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-white/[0.06]">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setShowKillModal(null)}
                >
                  Cancel
                </Button>
                <Magnetic strength={4}>
                  <Button
                    variant="danger"
                    size="sm"
                    type="submit"
                    isLoading={isLoggingKill}
                  >
                    Record death
                  </Button>
                </Magnetic>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STAT CARD — TiltCard + animated sparkline + count-up
// ═══════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  sub,
  tone,
  data,
  prefix = "",
  decimals = 0,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "neutral" | "positive" | "warning" | "negative";
  data: number[];
  prefix?: string;
  decimals?: number;
}) {
  const { ref, visible } = useReveal(0.2);
  const animated = useCountUp(value, visible);

  const display =
    decimals > 0
      ? animated.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(animated).toLocaleString();

  const dotColor = {
    neutral: "bg-white/60",
    positive: "bg-emerald-400",
    warning: "bg-amber-400",
    negative: "bg-red-400",
  }[tone];

  return (
    <div ref={ref}>
      <TiltCard intensity={4}>
        <div className="relative glass rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.14] transition-colors duration-500 overflow-hidden">
          <span
            aria-hidden
            className="absolute inset-x-5 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.18), transparent)",
            }}
          />

          <div className="flex items-center gap-2 mb-3">
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            <p className="text-[10px] font-medium text-white/50 uppercase tracking-[0.22em]">
              {label}
            </p>
          </div>

          <h3 className="text-[26px] lg:text-[28px] font-semibold tracking-tight text-white font-mono leading-none">
            {prefix}
            {display}
          </h3>
          <p className="text-[11px] text-white/40 mt-1.5">{sub}</p>

          <div className="mt-4">
            <Sparkline data={data} tone={tone} height={28} />
          </div>
        </div>
      </TiltCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BOSS ROW — live ticking, neon pulse when warning/live
// ═══════════════════════════════════════════════════════════

function BossRow({
  boss,
  tick,
  canLogKill,
  onLogKill,
}: {
  boss: BossScheduleData;
  tick: { expired: boolean; text: string; warning: boolean };
  canLogKill: boolean;
  onLogKill: () => void;
}) {
  const borderTone = tick.expired
    ? "border-red-500/20 bg-red-500/[0.04]"
    : tick.warning
      ? "border-amber-500/20 bg-amber-500/[0.03]"
      : "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]";

  const dotTone: "emerald" | "amber" | "red" | "neutral" = tick.expired
    ? "red"
    : tick.warning
      ? "amber"
      : "neutral";

  const valueColor = tick.expired
    ? "text-red-300"
    : tick.warning
      ? "text-amber-300"
      : "text-white/85";

  return (
    <div
      className={`group relative px-5 py-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-all duration-300 overflow-hidden ${borderTone}`}
    >
      {/* Live pulse halo for warning/expired */}
      {(tick.warning || tick.expired) && (
        <span
          aria-hidden
          className="absolute -inset-px rounded-xl pointer-events-none opacity-50"
          style={{
            background: tick.expired
              ? "radial-gradient(ellipse 40% 100% at 0% 50%, oklch(0.62 0.18 22 / 0.15), transparent 70%)"
              : "radial-gradient(ellipse 40% 100% at 0% 50%, oklch(0.78 0.13 80 / 0.15), transparent 70%)",
            animation: "pulse-soft 2.4s ease-in-out infinite",
          }}
        />
      )}

      <div className="min-w-0 flex items-center gap-3.5 relative">
        <LiveDot tone={dotTone} size={8} className="shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="text-[14px] font-semibold text-white truncate">
              {boss.bossName}
            </p>
            {boss.guildId === null && (
              <span className="px-2 py-0.5 rounded text-[9px] text-white/70 font-medium bg-white/[0.05] border border-white/[0.08] shrink-0 uppercase tracking-[0.18em]">
                Faction
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/40 truncate mt-1">
            {boss.location}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3.5 justify-between sm:justify-end shrink-0 relative">
        <div className="text-right">
          <p
            className={`text-[15px] font-mono font-semibold tracking-tight tabular-nums ${valueColor}`}
          >
            {tick.text}
          </p>
          {boss.guildTurn && (
            <p className="text-[10px] text-white/40 mt-1 truncate max-w-[110px]">
              Turn: {boss.guildTurn}
            </p>
          )}
        </div>

        {canLogKill && (tick.expired || tick.warning) && (
          <Magnetic strength={4}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogKill}
              className="text-red-400/80 hover:text-red-300 border border-red-500/[0.15] hover:border-red-500/30 hover:bg-red-500/[0.04]"
            >
              Log kill
            </Button>
          </Magnetic>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MINI STAT — 4-up character detail readout
// ═══════════════════════════════════════════════════════════

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.12] transition-colors duration-300 text-center">
      <p className="text-[10px] font-medium text-white/40 uppercase tracking-[0.18em]">
        {label}
      </p>
      <p
        className={`text-[13px] font-semibold mt-1.5 truncate font-mono tracking-tight ${
          accent ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FORM FIELD / SELECT
// ═══════════════════════════════════════════════════════════

function FormField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-1.5">
        {label}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/25 transition-colors"
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-white/50 uppercase tracking-[0.18em] mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none focus:border-white/25 transition-colors appearance-none cursor-pointer"
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY ITEM
// ═══════════════════════════════════════════════════════════

function ActivityItem({
  icon,
  action,
  detail,
  time,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  action: string;
  detail: string;
  time: string;
  tone?: "neutral" | "positive";
}) {
  const iconBorder =
    tone === "positive"
      ? "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-300"
      : "border-white/[0.08] bg-white/[0.04] text-white/70";

  return (
    <div className="group flex items-start gap-3.5 px-2 py-2.5 rounded-lg transition-colors duration-300 hover:bg-white/[0.03] -mx-2">
      <div
        className={`mt-0.5 shrink-0 h-8 w-8 rounded-lg border flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.06] ${iconBorder}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-white truncate">
            {action}
          </p>
          <span className="text-[10px] text-white/35 shrink-0 font-mono uppercase tracking-wider">
            {time}
          </span>
        </div>
        <p className="text-[11px] text-white/45 truncate mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

// ─── Inline Icons ────────────────────────────────
function CreditIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function DebitIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function PointsIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function ConfigIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function StatCardSkeleton() {
  return (
    <TiltCard intensity={4}>
      <div className="relative glass rounded-2xl p-5 border border-white/[0.06] overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
        />
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-white/20 animate-pulse" />
          <div className="h-3 w-16 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="h-7 w-28 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-20 bg-white/5 rounded mt-3 animate-pulse" />
        <div className="mt-4 h-[28px] bg-white/[0.02] rounded animate-pulse" />
      </div>
    </TiltCard>
  );
}

function ActivityItemSkeleton() {
  return (
    <div className="flex items-start gap-3.5">
      <div className="mt-0.5 shrink-0 h-8 w-8 rounded-lg bg-white/[0.04] animate-pulse" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-3.5 w-24 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-10 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
      </div>
    </div>
  );
}
