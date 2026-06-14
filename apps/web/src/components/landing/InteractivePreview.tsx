"use client";

import { useState, useEffect, useRef } from "react";
import { getBossImageUrl } from "@guild/shared";
import Badge from "@/components/ui/Badge";
import { Reveal, SectionLabel, Scroll3D } from "./LandingHelpers";

// --- Tab Configuration ---
const PREVIEW_TABS = [
  "Dashboard",
  "Boss Tracker",
  "Boss Schedule",
  "Raid Attendance",
  "Guild Market",
] as const;
type PreviewTab = (typeof PREVIEW_TABS)[number];

// --- Custom Mock Types ---
interface MockBoss {
  id: string;
  name: string;
  level: number;
  location: string;
  status: "AVAILABLE" | "CLAIMED" | "DEAD";
  initialRemainingSeconds: number; // static starting offset
  cooldownHours: number;
  rotationQueue: string[];
}

interface MockSchedule {
  id: string;
  bossName: string;
  spawnTimeStr: string;
  location: string;
  guildTurn: string;
  status: "UPCOMING" | "SPAWNED" | "KILLED";
}

interface MockAuction {
  id: string;
  itemName: string;
  category: string;
  currentBid: number;
  highBidder: string;
  startingBid: number;
  endsIn: string;
  imageUrl: string;
}

interface ToastMessage {
  id: string;
  type: "success" | "info" | "error";
  text: string;
}

export default function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>("Dashboard");

  // --- Stable Ticker State (Fixes Hydration Mismatch & Eliminates Placeholder Flicker) ---
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Global Simulated State Machine ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [userBidPoints, setUserBidPoints] = useState(500);

  // 1. Boss Tracker State (using initialRemainingSeconds for hydration safety)
  const [bosses, setBosses] = useState<MockBoss[]>([
    {
      id: "b-1",
      name: "Catena",
      level: 100,
      location: "Deadman's Land 3F",
      status: "AVAILABLE",
      initialRemainingSeconds: 0, // ready immediately
      cooldownHours: 35,
      rotationQueue: ["VALHALLA", "SAUSAGE", "BZDK"],
    },
    {
      id: "b-2",
      name: "Ego",
      level: 70,
      location: "Ulan Canyon",
      status: "CLAIMED",
      initialRemainingSeconds: 2700, // 45 minutes
      cooldownHours: 21,
      rotationQueue: ["SAUSAGE", "BZDK", "VALHALLA"],
    },
    {
      id: "b-3",
      name: "Titore",
      level: 98,
      location: "Deadman's Land 2F",
      status: "DEAD",
      initialRemainingSeconds: 8100, // 2h 15m
      cooldownHours: 37,
      rotationQueue: ["BZDK", "VALHALLA", "SAUSAGE"],
    },
    {
      id: "b-4",
      name: "Livera",
      level: 75,
      location: "Protector's Ruins",
      status: "DEAD",
      initialRemainingSeconds: 20400, // 5h 40m
      cooldownHours: 24,
      rotationQueue: ["VALHALLA", "BZDK", "SAUSAGE"],
    },
  ]);

  // 2. Boss Schedule State
  const [schedules, setSchedules] = useState<MockSchedule[]>([
    {
      id: "s-1",
      bossName: "Titore",
      spawnTimeStr: "19:30",
      location: "Deadman's Land 2F",
      guildTurn: "SAUSAGE",
      status: "KILLED",
    },
    {
      id: "s-2",
      bossName: "Catena",
      spawnTimeStr: "21:00",
      location: "Deadman's Land 3F",
      guildTurn: "VALHALLA",
      status: "SPAWNED",
    },
    {
      id: "s-3",
      bossName: "Ego",
      spawnTimeStr: "22:15",
      location: "Ulan Canyon",
      guildTurn: "BZDK",
      status: "UPCOMING",
    },
    {
      id: "s-4",
      bossName: "Livera",
      spawnTimeStr: "23:45",
      location: "Protector's Ruins",
      guildTurn: "VALHALLA",
      status: "UPCOMING",
    },
  ]);

  // 3. Attendance State
  const [attendanceCode, setAttendanceCode] = useState("");
  const [checkInStatus, setCheckInStatus] = useState<"NONE" | "PENDING" | "CONFIRMED">("NONE");
  const [presenceRate, setPresenceRate] = useState(92);
  const [streak, setStreak] = useState(5);
  const [totalPoints, setTotalPoints] = useState(8450);
  const [attendanceRemainingSeconds] = useState(600); // 10 minutes

  // 4. Guild Market / Auctions State
  const [treasuryFund] = useState(25450);
  const [treasuryTax] = useState(2545);
  const [auctions, setAuctions] = useState<MockAuction[]>([
    {
      id: "a-1",
      itemName: "Serus Greatsword",
      category: "WEAPON",
      currentBid: 350,
      highBidder: "Wiz",
      startingBid: 200,
      endsIn: "2h 14m",
      imageUrl: "https://images.unsplash.com/photo-1615147342761-9238e15d8b96?w=200&auto=format&fit=crop&q=60",
    },
    {
      id: "a-2",
      itemName: "Terrenos Hood",
      category: "ARMOR",
      currentBid: 150,
      highBidder: "Dragz",
      startingBid: 100,
      endsIn: "5h 40m",
      imageUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=200&auto=format&fit=crop&q=60",
    },
  ]);

  // Recent Activity state
  const [recentLogs, setRecentLogs] = useState<Array<{ label: string; detail: string; time: string; type: "credit" | "debit" | "points" | "info" }>>([
    { label: "Raid Attendance", detail: "Verified present in Titore Battle", time: "1h ago", type: "points" },
    { label: "Loot Split", detail: "Received +₱1,080.00 dividend for Catena Ring", time: "2h ago", type: "credit" },
    { label: "Treasury Tax Collect", detail: "Deducted ₱120.00 for guild fund", time: "2h ago", type: "debit" },
    { label: "Auction Completed", detail: "Wiz won Archmage Robes for 410 pts", time: "1d ago", type: "info" },
  ]);

  // --- Helper: Simulated Toast Alerts ---
  const toastIdRef = useRef(0);
  const addToast = (type: "success" | "info" | "error", text: string) => {
    toastIdRef.current += 1;
    const id = String(toastIdRef.current);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // --- Interactive Handlers ---
  // A. Cycle rotation queue
  const handleShiftTurn = (bossId: string) => {
    const boss = bosses.find((b) => b.id === bossId);
    if (!boss) return;

    const nextQueue = [...boss.rotationQueue.slice(1), boss.rotationQueue[0]];
    const nextOwner = nextQueue[0];

    // Trigger side effects outside state updater callbacks
    addToast("success", `Turn shifted! ${nextOwner} now has the claim for ${boss.name}.`);

    // Add to recent logs
    const logTime = "Just now";
    setRecentLogs((logs) => [
      { label: `${boss.name} Rotation Shift`, detail: `Turn moved to ${nextOwner}`, time: logTime, type: "info" },
      ...logs,
    ]);

    // Update state
    setBosses((prev) =>
      prev.map((b) => {
        if (b.id === bossId) {
          return {
            ...b,
            status: "CLAIMED",
            rotationQueue: nextQueue,
          };
        }
        return b;
      })
    );
  };

  // B. Log Kill
  const handleLogKill = (scheduleId: string) => {
    const sched = schedules.find((s) => s.id === scheduleId);
    if (!sched) return;

    // Trigger side effects outside state updater callbacks
    addToast("success", `${sched.bossName} kill logged. expected respawn timer updated!`);

    // Find matching boss in tracker and mark as DEAD (respawning from full cooldown offset)
    setBosses((bossesPrev) =>
      bossesPrev.map((b) => {
        if (b.name === sched.bossName) {
          return {
            ...b,
            status: "DEAD",
            initialRemainingSeconds: elapsedSeconds + b.cooldownHours * 3600,
          };
        }
        return b;
      })
    );

    // Add to recent logs
    setRecentLogs((logs) => [
      { label: `${sched.bossName} Defeated`, detail: `Kill logged by Own. Respawn cycle started.`, time: "Just now", type: "info" },
      ...logs,
    ]);

    // Update schedules state
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.id === scheduleId) {
          return { ...s, status: "KILLED" };
        }
        return s;
      })
    );
  };

  // C. Code Submission for attendance
  const handleCheckInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = attendanceCode.trim().toUpperCase();
    if (formatted !== "ATT-3B82") {
      addToast("error", "Invalid check-in code. Try entering 'ATT-3B82'.");
      return;
    }

    setCheckInStatus("PENDING");
    addToast("info", "Submitting code ATT-3B82...");

    setTimeout(() => {
      setCheckInStatus("CONFIRMED");
      setPresenceRate(95);
      setStreak(6);
      setTotalPoints((prev) => prev + 10);
      addToast("success", "Raid presence verified! +10 DKP credited to your wallet.");
      
      // Update ledger log
      setRecentLogs((logs) => [
        { label: "Attendance Verification", detail: "Checked present (+10 DKP / ATT-3B82)", time: "Just now", type: "points" },
        ...logs,
      ]);
    }, 1500);
  };

  // D. Placing simulated bid
  const handlePlaceBid = (auctionId: string, inputBid: string) => {
    const amount = parseInt(inputBid, 10);
    const auction = auctions.find((a) => a.id === auctionId);
    if (!auction) return;

    if (isNaN(amount) || amount <= auction.currentBid) {
      addToast("error", `Bid must be higher than current bid of ${auction.currentBid} pts.`);
      return;
    }

    if (amount > userBidPoints) {
      addToast("error", `Insufficient bid points. You have ${userBidPoints} but need ${amount}.`);
      return;
    }

    setUserBidPoints((prev) => prev - amount);
    setAuctions((prev) =>
      prev.map((a) => {
        if (a.id === auctionId) {
          return {
            ...a,
            currentBid: amount,
            highBidder: "Own (You)",
          };
        }
        return a;
      })
    );

    addToast("success", `Bid placed successfully! You are now highest bidder for ${auction.itemName}.`);
    
    // Add to activity logs
    setRecentLogs((logs) => [
      { label: "Bid Placed", detail: `Bid ${amount} pts on ${auction.itemName}`, time: "Just now", type: "debit" },
      ...logs,
    ]);
  };

  // --- Ticker countdown calculation helper ---
  const formatCountdown = (initialRemainingSeconds: number) => {
    const remaining = initialRemainingSeconds - elapsedSeconds;
    if (remaining <= 0) return "READY / ALIVE";
    const hrs = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    const secs = remaining % 60;
    return `${hrs > 0 ? `${hrs}h ` : ""}${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  };

  const formatAttendanceCountdown = (initialRemainingSeconds: number) => {
    const remaining = initialRemainingSeconds - elapsedSeconds;
    if (remaining <= 0) return "00:00";
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // --- Subcomponents ---

  // TAB 1: Dashboard Hub
  const renderDashboard = () => {
    const nextSpawn = bosses.find((b) => {
      const rem = b.initialRemainingSeconds - elapsedSeconds;
      return rem > 0;
    }) || bosses.find((b) => b.status === "CLAIMED");

    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">Welcome back, Own</h3>
            <p className="text-xs text-white/50 mt-0.5">Here&apos;s a live overview of your guild activities today.</p>
          </div>
          <Badge role="GUILD_LEADER" size="md" />
        </div>

        {/* 4-up Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Guild wallet balance", value: `₱ ${(treasuryFund).toLocaleString()}`, sub: "+₱ 1,080.00 today" },
            { label: "Raid Attendance rate", value: `${presenceRate}%`, sub: `${streak} active streak` },
            { label: "Treasury Tax Collected", value: `₱ ${(treasuryTax).toLocaleString()}`, sub: "10% base tax rate" },
            { label: "My Bid points", value: `${userBidPoints} DKP`, sub: "Used for live auctions" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.02] relative overflow-hidden group hover:border-amber-500/20 transition-all duration-300">
              <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <p className="text-[9px] font-medium text-white/40 uppercase tracking-[0.18em] truncate">{s.label}</p>
              <p className="text-lg font-semibold text-white mt-1.5 tabular-nums tracking-tight">{s.value}</p>
              <p className="text-[10px] text-white/40 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Mini Layout Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Next raid block */}
          <div className="lg:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">Raid Operations Preview</h4>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            {nextSpawn ? (
              <div className="flex items-center justify-between bg-white/[0.01] border border-white/[0.04] p-3 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded overflow-hidden bg-zinc-950 flex items-center justify-center font-bold text-white text-xs border border-white/[0.08] shrink-0">
                    <img
                      src={getBossImageUrl(nextSpawn.name)}
                      alt={nextSpawn.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100";
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{nextSpawn.name} (Lvl {nextSpawn.level})</p>
                    <p className="text-[10px] text-white/40">{nextSpawn.location}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono font-bold text-amber-400">{formatCountdown(nextSpawn.initialRemainingSeconds)}</p>
                  <p className="text-[9px] text-white/35">Turn: {nextSpawn.rotationQueue[0]}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-white/40">No boss schedules tracked.</p>
            )}
            
            {/* Quick check in snippet */}
            {checkInStatus !== "CONFIRMED" && (
              <div className="p-3.5 rounded-lg bg-amber-500/[0.03] border border-amber-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">Active Check-in Portal Running</h5>
                  <p className="text-[10px] text-white/50 mt-0.5">Enter code shared by officer to claim DKP.</p>
                </div>
                <button
                  onClick={() => setActiveTab("Raid Attendance")}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 rounded-md transition-all cursor-pointer"
                >
                  Check In
                </button>
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="lg:col-span-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.05] pb-2 mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">Recent Logs</h4>
                <span className="text-[9px] text-zinc-650">Live feed</span>
              </div>
              <div className="space-y-3">
                {recentLogs.slice(0, 3).map((log, idx) => (
                  <div key={idx} className="flex gap-2.5 items-start text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20 mt-1.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white/80 truncate leading-none">{log.label}</p>
                      <p className="text-[10px] text-white/40 mt-1 truncate">{log.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => addToast("info", "Live feed displays real-time ledger & audit occurrences.")}
              className="w-full text-center text-[9px] uppercase tracking-wider text-white/35 hover:text-white/60 font-semibold pt-4 mt-2 border-t border-white/[0.03]"
            >
              Auditable Timeline
            </button>
          </div>
        </div>
      </div>
    );
  };

  // TAB 2: Boss Tracker
  const renderBossTracker = () => {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Real-Time Boss Tracker</h3>
          <p className="text-xs text-white/50 mt-0.5">Track current rotation turns, claim sequences, and ticking cooldowns.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bosses.map((boss) => {
            const timeText = formatCountdown(boss.initialRemainingSeconds);
            const isAlive = boss.status === "AVAILABLE" || timeText === "READY / ALIVE";
            return (
              <div
                key={boss.id}
                className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-300 ${
                  isAlive
                    ? "bg-white/[0.03] border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                    : "bg-white/[0.025] border-white/[0.06] hover:border-amber-500/20"
                }`}
              >
                {/* Visual Image container with Supabase images */}
                <div className="relative aspect-[4/3] bg-zinc-950 rounded-lg overflow-hidden border border-white/5 mb-3 select-none">
                  <img
                    src={getBossImageUrl(boss.name)}
                    alt={boss.name}
                    className="h-full w-full object-cover transform scale-100 group-hover:scale-110 transition-transform duration-700"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

                  {/* Status Capsule Overlay */}
                  <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isAlive
                          ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                          : boss.status === "CLAIMED"
                            ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                            : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                      }`}
                    />
                    <span className="text-[8px] font-bold uppercase tracking-wider text-white/90">
                      {isAlive ? "ALIVE" : boss.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="flex items-baseline justify-between">
                    <h4 className="font-bold text-white text-[13px]">{boss.name}</h4>
                    <span className="text-[9px] text-white/40">lvl {boss.level}</span>
                  </div>
                  <p className="text-[10px] text-white/35 font-mono">{boss.location}</p>

                  <div className="pt-2">
                    <span className="block text-[8px] text-zinc-550 uppercase tracking-widest leading-none">Timer</span>
                    <span className={`block text-xs font-mono font-bold mt-1 ${isAlive ? "text-emerald-400" : "text-white/80"}`}>
                      {isAlive ? "READY" : timeText}
                    </span>
                  </div>
                </div>

                {/* Queue list */}
                <div className="border-t border-white/[0.04] pt-2 mb-3.5 space-y-1 text-[10.5px]">
                  <span className="block text-[8px] text-amber-500 font-bold uppercase tracking-wider mb-1">Rotation turns</span>
                  {boss.rotationQueue.slice(0, 3).map((q, idx) => (
                    <div key={q} className={`flex items-center justify-between px-1.5 py-1 rounded ${idx === 0 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-white/40"}`}>
                      <span>{idx + 1}. {q}</span>
                      {idx === 0 && <span className="text-[7px] uppercase font-bold tracking-wider">Turn</span>}
                    </div>
                  ))}
                </div>

                {/* Action button */}
                <button
                  type="button"
                  onClick={() => handleShiftTurn(boss.id)}
                  className="w-full py-1 rounded bg-white/[0.04] hover:bg-amber-500/10 border border-white/[0.06] hover:border-amber-500/30 text-[9px] uppercase tracking-wider text-white/80 hover:text-amber-400 font-bold transition-all cursor-pointer"
                >
                  Cycle next turn
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // TAB 3: Boss Schedule w/ Turns
  const renderBossSchedule = () => {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">Today&apos;s Boss Schedule</h3>
            <p className="text-xs text-white/50 mt-0.5">Chronological timeline of scheduled spawns with integrated guild turns.</p>
          </div>
          <button
            onClick={() => addToast("info", "Mock schedule calendar refreshed.")}
            className="px-2.5 py-1 text-[10px] uppercase tracking-wider font-semibold border border-white/[0.08] hover:bg-white/[0.02] rounded-lg transition-all text-white/70"
          >
            Calendar
          </button>
        </div>

        {/* Schedule Timeline layout */}
        <div className="relative border-l border-white/[0.06] ml-4 pl-6 space-y-6">
          {schedules.map((item) => {
            const isLive = item.status === "SPAWNED";
            const isKilled = item.status === "KILLED";
            return (
              <div key={item.id} className="relative group">
                {/* Timeline Dot */}
                <div
                  className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 bg-black flex items-center justify-center transition-all ${
                    isLive
                      ? "border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] scale-110"
                      : isKilled
                        ? "border-zinc-700"
                        : "border-amber-400"
                  }`}
                >
                  {isLive && <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] group-hover:border-white/[0.10] group-hover:bg-white/[0.02] transition-all duration-300">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-white/35 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.04]">{item.spawnTimeStr}</span>
                      <h4 className="font-bold text-[14px] text-white">{item.bossName}</h4>
                      {isLive && (
                        <span className="px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                          Live now
                        </span>
                      )}
                      {isKilled && (
                        <span className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest bg-white/[0.04] text-white/35 border border-white/5 rounded">
                          Killed
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-white/40">{item.location}</p>
                  </div>

                  {/* Guild turn allocation badge */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[8px] text-zinc-550 block uppercase tracking-widest leading-none">Guild Claim</span>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold mt-1 uppercase tracking-wider">
                        {item.guildTurn}
                      </div>
                    </div>
                    
                    {/* Log Kill button */}
                    {!isKilled && (
                      <button
                        type="button"
                        onClick={() => handleLogKill(item.id)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          isLive
                            ? "bg-red-500/10 border border-red-500/35 hover:bg-red-500/20 text-red-400"
                            : "bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white/80"
                        }`}
                      >
                        Log Kill
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // TAB 4: Field Boss Attendance
  const renderAttendance = () => {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Raid Attendance Portal</h3>
          <p className="text-xs text-white/50 mt-0.5">Check in for active raids and track DKP contributions.</p>
        </div>

        {/* Personal stats dashboard */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
            <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Attendance Rate</p>
            <p className="text-2xl font-bold text-emerald-400 mt-2 font-mono">{presenceRate}%</p>
            <p className="text-[9px] text-white/35 mt-1">Target is &gt;80%</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
            <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Attendance Streak</p>
            <p className="text-2xl font-bold text-amber-400 mt-2 font-mono">{streak}</p>
            <p className="text-[9px] text-white/35 mt-1">Concurred raids</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
            <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Activity Points</p>
            <p className="text-2xl font-bold text-cyan-400 mt-2 font-mono">{totalPoints} DKP</p>
            <p className="text-[9px] text-white/35 mt-1">Ledger Wallet</p>
          </div>
        </div>

        {/* Interactive check in session */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-amber-500/[0.08] border border-amber-500/25 flex items-center justify-center text-amber-400 text-lg">
              ✦
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-amber-500 font-extrabold uppercase tracking-wider">
                  Raid Active (Closes in {formatAttendanceCountdown(attendanceRemainingSeconds)})
                </span>
                <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
              </div>
              <h4 className="font-bold text-white text-sm mt-0.5">Catena Fight Attendance Code is Open</h4>
              <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
                Raid battle is ongoing. Input the 8-character verification code shared in discord voice channel to check present.
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-white/40">
                <span>Verification Code:</span>
                <code className="text-amber-300 font-bold bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08]">ATT-3B82</code>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.05] pt-4 flex items-center justify-between gap-6">
            <div className="text-[10px] text-white/35">
              Status:{" "}
              <span className={`font-bold uppercase tracking-wider ${
                checkInStatus === "CONFIRMED" ? "text-emerald-400" : checkInStatus === "PENDING" ? "text-amber-400 animate-pulse" : "text-white/45"
              }`}>
                {checkInStatus === "CONFIRMED" ? "Checked In" : checkInStatus === "PENDING" ? "Awaiting Review" : "Unverified"}
              </span>
            </div>

            {checkInStatus === "NONE" ? (
              <form onSubmit={handleCheckInSubmit} className="flex gap-2 w-full max-w-xs bg-white/[0.02] border border-white/[0.06] p-1 rounded-lg">
                <input
                  type="text"
                  placeholder="e.g. ATT-3B82"
                  value={attendanceCode}
                  onChange={(e) => setAttendanceCode(e.target.value)}
                  className="flex-1 px-3 py-1 text-xs font-mono font-bold text-center text-white bg-transparent border-0 focus:outline-none placeholder:text-zinc-700 tracking-wider uppercase"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-white text-black hover:bg-white/90 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer"
                >
                  Verify
                </button>
              </form>
            ) : checkInStatus === "PENDING" ? (
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span className="h-3 w-3 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                <span>Simulating officer approval...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">
                ✓ Confirmed Present
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // TAB 5: Guild Market & Auctions
  const renderGuildMarket = () => {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">Guild Treasury & Market</h3>
            <p className="text-xs text-white/50 mt-0.5">Audit fund ledger and participate in active DKP auctions.</p>
          </div>
          <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Ledger Active</span>
        </div>

        {/* Treasury Split Balance Sheets */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="text-[8px] text-zinc-550 block uppercase tracking-widest">Treasury Fund (PHP)</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold text-white font-mono">₱ {treasuryFund.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400 font-bold">+90% Dividends Split</span>
            </div>
            <p className="text-[9px] text-white/35 mt-1">Sum from 12 items sold this month</p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="text-[8px] text-zinc-550 block uppercase tracking-widest">Tax Collected (PHP)</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold text-white font-mono">₱ {treasuryTax.toLocaleString()}</span>
              <span className="text-[10px] text-amber-500 font-bold">10% Tax rate</span>
            </div>
            <p className="text-[9px] text-white/35 mt-1">Retained for guild events and castle bids</p>
          </div>
        </div>

        {/* Live Auctions */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">Live DKP Auctions</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {auctions.map((auc) => {
              return (
                <AuctionCard
                  key={auc.id}
                  auc={auc}
                  onBidPlaced={(bidVal) => handlePlaceBid(auc.id, bidVal)}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // --- Main Interactive Preview Layout ---
  return (
    <section id="preview" className="py-24 relative overflow-hidden bg-[#08080a]">
      {/* Ambient background glows */}
      <div
        aria-hidden
        className="absolute top-1/4 left-1/4 h-[400px] w-[400px] rounded-full bg-amber-500/[0.02] pointer-events-none filter blur-[80px]"
      />
      <div
        aria-hidden
        className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-amber-500/[0.015] pointer-events-none filter blur-[100px]"
      />

      {/* Simulated Toasts Stack */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none select-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg border text-xs font-medium shadow-lg backdrop-blur-md animate-scale-in flex items-center gap-2 pointer-events-auto select-text ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : toast.type === "info"
                  ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                  : "bg-red-500/10 border-red-500/25 text-red-300"
            }`}
          >
            <span>{toast.type === "success" ? "✓" : toast.type === "info" ? "✦" : "⨯"}</span>
            <span className="flex-1">{toast.text}</span>
          </div>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-12">
          <SectionLabel>Interactive live preview</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-bold text-white tracking-tight leading-none">
            Interact with the Sandbox.
          </h2>
          <p className="mt-3 text-sm text-white/50 max-w-xl mx-auto leading-relaxed">
            Click on tabs, place bids, shift rotations, or check-in to see how ForgeKeep coordinates live operations.
          </p>
        </Reveal>

        {/* Tab selector pills */}
        <Reveal className="flex justify-center mb-8">
          <div className="inline-flex p-1 rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur gap-1 flex-wrap justify-center">
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                  activeTab === tab
                    ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.06)]"
                    : "text-white/40 hover:text-white/70 border border-transparent hover:bg-white/[0.02]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Window Shell Frame */}
        <Reveal delay={120}>
          <Scroll3D rotateX={4} rotateY={0} scaleFrom={0.97} liftFrom={20}>
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0b0b0d] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.7)]">
              {/* Chrome Window Header */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05] bg-black/40">
                <div className="flex gap-1.5 shrink-0">
                  <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
                <div className="flex-1 mx-6 h-6 rounded-lg bg-white/[0.01] border border-white/[0.03] flex items-center justify-center text-[10px] text-white/30 font-mono tracking-wide">
                  app.forgekeep.io/{activeTab.toLowerCase().replace(" ", "-")}
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
              </div>

              {/* Main Content Area */}
              <div className="p-6 lg:p-8 min-h-[620px] text-white/85 transition-all duration-300">
                <div className={activeTab === "Dashboard" ? "block" : "hidden"}>
                  {renderDashboard()}
                </div>
                <div className={activeTab === "Boss Tracker" ? "block" : "hidden"}>
                  {renderBossTracker()}
                </div>
                <div className={activeTab === "Boss Schedule" ? "block" : "hidden"}>
                  {renderBossSchedule()}
                </div>
                <div className={activeTab === "Raid Attendance" ? "block" : "hidden"}>
                  {renderAttendance()}
                </div>
                <div className={activeTab === "Guild Market" ? "block" : "hidden"}>
                  {renderGuildMarket()}
                </div>
              </div>
            </div>
          </Scroll3D>
        </Reveal>
      </div>
    </section>
  );
}

// Helper co-located card component for local bid state inputs
interface AuctionCardProps {
  auc: MockAuction;
  onBidPlaced: (bidValue: string) => void;
}

function AuctionCard({ auc, onBidPlaced }: AuctionCardProps) {
  const [bidValueInput, setBidValueInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onBidPlaced(bidValueInput);
    setBidValueInput("");
  };

  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-3.5 flex items-start gap-3.5 group hover:border-white/[0.10] hover:bg-white/[0.02] transition-all duration-300">
      <div className="h-16 w-16 bg-zinc-950 rounded-lg overflow-hidden border border-white/5 shrink-0 relative flex items-center justify-center">
        <img
          src={auc.imageUrl}
          alt={auc.itemName}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1615147342761-9238e15d8b96?w=100";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-40" />
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        <div>
          <span className="text-[8px] font-bold text-amber-500 uppercase tracking-widest">{auc.category}</span>
          <h5 className="font-bold text-white text-xs truncate leading-snug">{auc.itemName}</h5>
        </div>

        <div className="flex justify-between items-baseline gap-2">
          <div>
            <span className="text-[8.5px] text-zinc-550 block uppercase tracking-wider">High Bid</span>
            <span className="text-xs font-mono font-bold text-white">{auc.currentBid} DKP</span>
          </div>
          <div className="text-right">
            <span className="text-[8.5px] text-zinc-550 block uppercase tracking-wider">Bidder</span>
            <span className="text-[11.5px] font-semibold text-white/80 truncate block max-w-[80px]">{auc.highBidder}</span>
          </div>
          <div className="text-right">
            <span className="text-[8.5px] text-zinc-550 block uppercase tracking-wider">Remaining</span>
            <span className="text-[10px] font-mono font-semibold text-amber-400">{auc.endsIn}</span>
          </div>
        </div>

        {/* Bid Form */}
        <form onSubmit={handleSubmit} className="flex gap-1.5 pt-1.5 border-t border-white/[0.04]">
          <input
            type="number"
            placeholder={`Min ${auc.currentBid + 1}`}
            value={bidValueInput}
            onChange={(e) => setBidValueInput(e.target.value)}
            className="flex-1 px-2.5 py-1 text-[11px] rounded bg-white/[0.02] border border-white/[0.08] focus:outline-none focus:border-white/20 text-white font-mono tracking-wider"
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-white text-black hover:bg-white/90 text-[9px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer"
          >
            Bid
          </button>
        </form>
      </div>
    </div>
  );
}
