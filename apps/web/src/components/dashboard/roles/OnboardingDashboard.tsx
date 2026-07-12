"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { guildApi, type JoinRequestData, type ConfirmEquipmentItem } from "@/lib/api";
import GearScanField from "@/app/(dashboard)/dashboard/equipment/components/GearScanField";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { useQuery, queryClient } from "@/lib/query";
import {
  Reveal,
  StaggerReveal,
  Magnetic,
  LiveDot,
} from "@/components/dashboard/DashboardHelpers";

export default function OnboardingDashboard() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();

  // Onboarding paths: join an existing guild, create your own guild, or create
  // a faction (a group of guilds) + its first guild. Replaces the old
  // registration-time "account type" choice.
  const [mode, setMode] = useState<"join" | "create-guild" | "create-faction">("join");

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
  const [gear, setGear] = useState<ConfirmEquipmentItem[]>([]);
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);

  // Create-guild / create-faction form state
  const [orgGuildName, setOrgGuildName] = useState("");
  const [orgFactionName, setOrgFactionName] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState("");

  useEffect(() => {
    if (user) {
      if (user.ign) setIgn(user.ign);
      if (user.cp) setCp(user.cp.toLocaleString());
      if (user.class) setClassType(user.class);
      if (user.weapon) setWeapon(user.weapon);
    }
  }, [user]);

  // 1. Pending Application Query (SWR Cache + Local Storage Persistence)
  const {
    data: pendingApp,
    isLoading: isLoadingPending,
  } = useQuery<JoinRequestData | null>(
    `pending_application:${user?.id || "anon"}`,
    async () => {
      if (!user) return null;
      const result = await guildApi.getUserPendingRequest();
      return result.success && result.data?.request ? result.data.request : null;
    },
    { persist: true, staleTime: 30000 }
  );

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
        gear: gear.length > 0 ? gear : undefined,
      });

      if (result.success) {
        addToast("success", `Applied to ${result.data?.guildName}`);
        queryClient.invalidateQueries(`pending_application:${user?.id || "anon"}`);
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

  async function handleCancelApplication() {
    if (!pendingApp) return;
    try {
      const result = await guildApi.cancelRequest(pendingApp.id);
      if (result.success) {
        addToast("info", "Application cancelled");
        queryClient.invalidateQueries(`pending_application:${user?.id || "anon"}`);
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

  async function handleCheckStatus() {
    addToast("info", "Checking application status...");
    try {
      await refreshUser();
      queryClient.invalidateQueries(`pending_application:${user?.id || "anon"}`);
      if (user && user.guilds.length > 0) {
        addToast("success", "Welcome to the guild!");
      } else {
        addToast("info", "Application checked.");
      }
    } catch {
      addToast("error", "Error checking application status");
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgError("");

    const guildName = orgGuildName.trim();
    if (guildName.length < 2) {
      setOrgError("Guild name must be at least 2 characters");
      return;
    }
    if (mode === "create-faction" && orgFactionName.trim().length < 2) {
      setOrgError("Faction name must be at least 2 characters");
      return;
    }

    setIsCreatingOrg(true);
    try {
      const result =
        mode === "create-faction"
          ? await guildApi.createFaction(orgFactionName.trim(), guildName)
          : await guildApi.createGuild(guildName);

      if (result.success) {
        addToast(
          "success",
          mode === "create-faction"
            ? `Faction "${orgFactionName.trim()}" created!`
            : `Guild "${guildName}" created!`,
        );
        // Pull the freshly created membership so the dashboard leaves onboarding.
        await refreshUser();
      } else {
        setOrgError(result.error?.message || "Failed to create. Please try again.");
      }
    } catch (err: any) {
      setOrgError(err?.message || "Failed to create. Please try again.");
    } finally {
      setIsCreatingOrg(false);
    }
  }

  if (!user) return null;

  return (
    <div className="relative max-w-7xl mx-auto w-full">
      <DashboardDecor />

      <div className="relative z-10 space-y-7 text-white/85">
        <Reveal>
          <div className="pb-6 border-b border-white/[0.06]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-amber-500/70 uppercase tracking-[0.24em]">
                Onboarding
              </span>
              <span className="h-px w-12 bg-gradient-to-r from-amber-500/20 to-transparent" />
            </div>
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold text-white tracking-tight">
              Welcome, {user.displayName}
              <span className="text-white/40">.</span>
            </h1>
            <p className="text-sm text-white/50 mt-2 leading-relaxed max-w-xl">
              Get started by creating your own guild, founding a faction, or
              joining an existing guild with an invite code.
            </p>
          </div>
        </Reveal>

        {/* Path selector — hidden while an application is pending review */}
        {!isLoadingPending && !pendingApp && (
          <Reveal delay={80}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ModeCard
                active={mode === "create-guild"}
                onClick={() => {
                  setMode("create-guild");
                  setOrgError("");
                }}
                title="Create a Guild"
                desc="Start and lead your own guild."
                icon={
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                }
              />
              <ModeCard
                active={mode === "create-faction"}
                onClick={() => {
                  setMode("create-faction");
                  setOrgError("");
                }}
                title="Create a Faction"
                desc="Run a faction spanning multiple guilds."
                icon={
                  <>
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </>
                }
              />
              <ModeCard
                active={mode === "join"}
                onClick={() => {
                  setMode("join");
                  setOrgError("");
                }}
                title="Join a Guild"
                desc="Apply with an invite code from a leader."
                icon={
                  <>
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </>
                }
              />
            </div>
          </Reveal>
        )}

        {isLoadingPending ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Skeleton className="h-64 rounded-2xl animate-pulse" />
            </div>
            <Skeleton className="h-64 rounded-2xl animate-pulse" />
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
              ) : mode === "join" ? (
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
                           <FormField
                            label="Class"
                            placeholder="e.g. Hunter"
                            value={classType}
                            onChange={setClassType}
                          />
                          <FormField
                            label="Weapon"
                            placeholder="e.g. Dual Dagger"
                            value={weapon}
                            onChange={setWeapon}
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <span className="text-[10px] text-white/40 uppercase tracking-[0.22em]">
                            Step 03 · Current Gear
                          </span>
                          <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                          <span className="text-[10px] text-white/30 uppercase tracking-wider">
                            Optional
                          </span>
                        </div>
                        <p className="text-[12px] text-white/50 leading-relaxed -mt-1">
                          Upload an equipment screenshot — we&apos;ll detect each slot and match it
                          to the guild icon library so leaders can review your gear.
                          {gear.length > 0 && (
                            <span className="ml-1 text-emerald-300">
                              {gear.length} item{gear.length === 1 ? "" : "s"} attached.
                            </span>
                          )}
                        </p>
                        <GearScanField onChange={setGear} />

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
                        {mode === "create-faction" ? "Found a faction" : "Found a guild"}
                      </span>
                      <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                    </div>
                    <h2 className="text-[18px] font-semibold text-white mb-2 tracking-tight">
                      {mode === "create-faction" ? "Create a faction" : "Create a guild"}
                    </h2>
                    <p className="text-[12px] text-white/50 leading-relaxed mb-5 max-w-md">
                      {mode === "create-faction"
                        ? "A faction groups multiple guilds under your command. Name your faction and its first guild — you'll lead both."
                        : "Name your guild and you'll be set up as its leader, ready to invite members."}
                    </p>

                    <form onSubmit={handleCreateOrg} className="space-y-4 max-w-md">
                      {mode === "create-faction" && (
                        <FormField
                          label="Faction name"
                          placeholder="e.g. Kurakortz"
                          value={orgFactionName}
                          onChange={(v) => {
                            setOrgFactionName(v);
                            setOrgError("");
                          }}
                        />
                      )}
                      <FormField
                        label={mode === "create-faction" ? "First guild name" : "Guild name"}
                        placeholder="e.g. KuraCORP"
                        value={orgGuildName}
                        onChange={(v) => {
                          setOrgGuildName(v);
                          setOrgError("");
                        }}
                      />

                      {orgError && (
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
                          {orgError}
                        </p>
                      )}

                      <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-4">
                        <Magnetic strength={4}>
                          <Button
                            variant="primary"
                            size="sm"
                            type="submit"
                            isLoading={isCreatingOrg}
                          >
                            {mode === "create-faction" ? "Create faction" : "Create guild"}
                          </Button>
                        </Magnetic>
                      </div>
                    </form>
                  </div>
                </Reveal>
              )}
            </div>

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
                  {(mode === "join"
                    ? [
                        "Enter the invite code from your Guild Leader",
                        "Fill in your character details for review",
                        "Wait for the Guild Leader to approve your application",
                      ]
                    : mode === "create-faction"
                      ? [
                          "Name your faction and its first guild",
                          "You're set up as the Faction Leader",
                          "Invite more guilds and members to grow",
                        ]
                      : [
                          "Name your guild",
                          "You're set up as the Guild Leader",
                          "Share your invite code to recruit members",
                        ]
                  ).map((step, i) => (
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
                  {mode === "join" ? "Decisions usually within 24h" : "Set up in seconds"}
                </div>
              </div>
            </Reveal>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Local Components ────────────────────────────────
function ModeCard({
  active,
  onClick,
  title,
  desc,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative text-left rounded-2xl border p-4 transition-all duration-200 ${
        active
          ? "border-amber-500/50 bg-amber-500/[0.07] shadow-[0_0_0_1px_rgba(245,184,65,0.12)]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${
            active
              ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-300"
              : "border-white/[0.08] bg-white/[0.03] text-white/50 group-hover:text-white/80"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {icon}
          </svg>
        </span>
        <div className="min-w-0">
          <p className={`text-[13px] font-semibold ${active ? "text-white" : "text-white/85"}`}>
            {title}
          </p>
          <p className="text-[11px] text-white/45 leading-snug mt-0.5">{desc}</p>
        </div>
      </div>
    </button>
  );
}

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
    <div className="text-left">
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
