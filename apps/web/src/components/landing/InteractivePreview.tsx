"use client";

import { useState, useEffect, useRef } from "react";
import Badge from "@/components/ui/Badge";
import { Reveal, SectionLabel, Scroll3D } from "./LandingHelpers";

// --- Tab Configuration ---
const PREVIEW_TABS = [
  "Overview",
  "Members",
  "Boss Rotation",
  "Attendance",
  "Treasury",
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

interface MockAuction {
  id: string;
  itemName: string;
  category: string;
  currentBid: number;
  highBidder: string;
  endsIn: string;
}

interface ToastMessage {
  id: string;
  type: "success" | "info" | "error";
  text: string;
}

export default function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>("Overview");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Global Simulated State Machine ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [userBidPoints, setUserBidPoints] = useState(8450); // Synced with dashboard
  const [presenceRate, setPresenceRate] = useState(92);
  const [streak, setStreak] = useState(5);
  const [treasuryFund, setTreasuryFund] = useState(25450);

  // 1. Boss Tracker / Rotation state
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
      initialRemainingSeconds: 1800, // 30 minutes
      cooldownHours: 21,
      rotationQueue: ["BZDK", "VALHALLA", "SAUSAGE"],
    },
    {
      id: "b-3",
      name: "Titore",
      level: 98,
      location: "Deadman's Land 2F",
      status: "DEAD",
      initialRemainingSeconds: 8100, // 2h 15m
      cooldownHours: 37,
      rotationQueue: ["SAUSAGE", "BZDK", "VALHALLA"],
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

  // 2. Attendance State
  const [attendanceCode, setAttendanceCode] = useState("");
  const [checkInStatus, setCheckInStatus] = useState<"NONE" | "PENDING" | "CONFIRMED">("NONE");

  // 3. Treasury Auctions State
  const [auctions, setAuctions] = useState<MockAuction[]>([
    {
      id: "a-1",
      itemName: "Serus Greatsword",
      category: "WEAPON",
      currentBid: 350,
      highBidder: "Wiz",
      endsIn: "2h 14m",
    },
    {
      id: "a-2",
      itemName: "Terrenos Hood",
      category: "ARMOR",
      currentBid: 150,
      highBidder: "Dragz",
      endsIn: "5h 40m",
    },
  ]);

  // Recent logs
  const [recentLogs, setRecentLogs] = useState([
    { action: "Raid Attendance check in Titore", detail: "Verified present (+10 GP)", time: "5m ago", hash: "0x8f3a" },
    { action: "Boss Kill logged Catena", detail: "Raid killed by VALHALLA", time: "1h ago", hash: "0x7a2d" },
    { action: "Treasury GCash Split Dividend", detail: "₱1,080.00 distributed to Wiz", time: "2h ago", hash: "0x4b9c" },
  ]);

  // Toast notifier
  const toastIdRef = useRef(0);
  const addToast = (type: "success" | "info" | "error", text: string) => {
    toastIdRef.current += 1;
    const id = String(toastIdRef.current);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // --- Handlers ---
  const handleShiftTurn = (bossId: string) => {
    const boss = bosses.find((b) => b.id === bossId);
    if (!boss) return;

    const nextQueue = [...boss.rotationQueue.slice(1), boss.rotationQueue[0]];
    const nextOwner = nextQueue[0];

    addToast("success", `Rotation shifted! ${nextOwner} now has priority for ${boss.name}.`);

    setRecentLogs((logs) => [
      { action: `Cycle Priority: ${boss.name}`, detail: `Priority shifted to ${nextOwner}`, time: "Just now", hash: `0x${Math.random().toString(16).slice(2, 6)}` },
      ...logs,
    ]);

    setBosses((prev) =>
      prev.map((b) => (b.id === bossId ? { ...b, status: "CLAIMED", rotationQueue: nextQueue } : b))
    );
  };

  const handleLogKill = (bossId: string) => {
    const boss = bosses.find((b) => b.id === bossId);
    if (!boss) return;

    addToast("success", `${boss.name} defeated! Respawn cooldown sequence activated.`);

    setRecentLogs((logs) => [
      { action: `Kill Logged: ${boss.name}`, detail: `Logged by Own. Timer reset to ${boss.cooldownHours}h`, time: "Just now", hash: `0x${Math.random().toString(16).slice(2, 6)}` },
      ...logs,
    ]);

    setBosses((prev) =>
      prev.map((b) =>
        b.id === bossId
          ? { ...b, status: "DEAD", initialRemainingSeconds: elapsedSeconds + b.cooldownHours * 3600 }
          : b
      )
    );
  };

  const handleCheckInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (attendanceCode.trim().toUpperCase() !== "ATT-3B82") {
      addToast("error", "Invalid check-in code. Hint: Use 'ATT-3B82'");
      return;
    }

    setCheckInStatus("PENDING");
    addToast("info", "Authenticating check-in code ATT-3B82...");

    setTimeout(() => {
      setCheckInStatus("CONFIRMED");
      setPresenceRate(95);
      setStreak(6);
      setUserBidPoints((prev) => prev + 50); // add GP points
      addToast("success", "Raid presence verified! +50 GP points credited to your wallet.");

      setRecentLogs((logs) => [
        { action: "Raid Attendance Checked In", detail: "Present at Catena Fight (+50 GP)", time: "Just now", hash: "0x3e9f" },
        ...logs,
      ]);
    }, 1200);
  };

  const handlePlaceBid = (auctionId: string, bidVal: string) => {
    const amt = parseInt(bidVal, 10);
    const auction = auctions.find((a) => a.id === auctionId);
    if (!auction) return;

    if (isNaN(amt) || amt <= auction.currentBid) {
      addToast("error", `Your bid must exceed ${auction.currentBid} GP.`);
      return;
    }

    if (amt > userBidPoints) {
      addToast("error", `Insufficient GP points. Your balance: ${userBidPoints} GP.`);
      return;
    }

    setUserBidPoints((prev) => prev - amt);
    setAuctions((prev) =>
      prev.map((a) => (a.id === auctionId ? { ...a, currentBid: amt, highBidder: "Own (You)" } : a))
    );
    addToast("success", `Bid placed successfully! High bidder for ${auction.itemName}.`);

    setRecentLogs((logs) => [
      { action: `Bid Placed: ${auction.itemName}`, detail: `Placed bid of ${amt} GP`, time: "Just now", hash: `0x${Math.random().toString(16).slice(2, 6)}` },
      ...logs,
    ]);
  };

  const formatCountdown = (secondsRemaining: number) => {
    const rem = secondsRemaining - elapsedSeconds;
    if (rem <= 0) return "READY / ALIVE";
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const s = rem % 60;
    return `${h > 0 ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  };

  // --- RENDERS ---

  // 1. OVERVIEW
  const renderOverview = () => {
    const nextSpawn = bosses.find((b) => b.initialRemainingSeconds - elapsedSeconds > 0) || bosses[1];
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
          <div>
            <h3 className="text-base font-bold text-white tracking-wide uppercase">Guild Dashboard</h3>
            <p className="text-xs text-[#8B8F98] mt-0.5">Real-time indicators for active guild operations.</p>
          </div>
          <span className="px-2.5 py-0.5 rounded border border-[#10D99A]/30 bg-[#10D99A]/5 text-[9px] text-[#10D99A] font-extrabold uppercase tracking-wider">
            Live Feed Sync
          </span>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { l: "Guild Treasury Balance", v: `₱ ${treasuryFund.toLocaleString()}`, sub: "+₱ 1,080.00 Split", cls: "text-white" },
            { l: "Raid Attendance Rate", v: `${presenceRate}%`, sub: `${streak} Active Streak`, cls: "text-[#10D99A]" },
            { l: "GP Wallet Balance", v: `${userBidPoints} GP`, sub: "Used for GP auctions", cls: "text-[#f5c542]" },
            { l: "Active Spawn Cooldowns", v: "3 Monitored", sub: "1 ready, 2 waiting", cls: "text-[#8B8F98]" },
          ].map((m, idx) => (
            <div key={idx} className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3.5 relative overflow-hidden group hover:border-[#d4a853]/25 transition-all">
              <span className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-[#d4a853]/15 to-transparent" />
              <p className="text-[8px] font-bold text-white/35 uppercase tracking-widest">{m.l}</p>
              <p className={`text-lg font-bold mt-1.5 font-mono ${m.cls}`}>{m.v}</p>
              <p className="text-[9px] text-white/40 mt-1 leading-none">{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Secondary blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Active alerts card */}
          <div className="lg:col-span-2 rounded-xl border border-white/[0.05] bg-white/[0.01] p-4.5 space-y-4">
            <h4 className="text-xs font-bold text-[#f5c542] uppercase tracking-wider">Tactical Action Required</h4>
            
            {nextSpawn && (
              <div className="flex items-center justify-between p-3.5 rounded-lg border border-[#d4a853]/20 bg-[#d4a853]/5 relative overflow-hidden">
                <div>
                  <span className="text-[8px] text-[#f5c542] font-bold uppercase tracking-widest block">Raid Window Spawn Alert</span>
                  <span className="text-xs font-bold text-white block mt-0.5">{nextSpawn.name} (Lvl {nextSpawn.level})</span>
                  <span className="text-[9px] text-[#8B8F98] block font-mono mt-0.5">{nextSpawn.location}</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-sm font-bold text-[#f5c542] block">{formatCountdown(nextSpawn.initialRemainingSeconds)}</span>
                  <span className="text-[9px] text-white/40 block">QUEUE: {nextSpawn.rotationQueue[0]}</span>
                </div>
              </div>
            )}

            {checkInStatus === "NONE" && (
              <div className="flex items-center justify-between p-3.5 rounded-lg border border-white/[0.04] bg-[#0b0d10] text-xs">
                <div>
                  <span className="font-bold text-white block">Active check-in verification is open</span>
                  <p className="text-[10px] text-white/40 mt-0.5">Submit the code to claim +50 GP points.</p>
                </div>
                <button
                  onClick={() => setActiveTab("Attendance")}
                  className="px-3.5 py-1.5 rounded-md border border-[#d4a853]/30 bg-[#d4a853]/10 text-[#f5c542] hover:bg-[#d4a853]/20 font-bold uppercase tracking-wider text-[9px] transition-all cursor-pointer"
                >
                  Verify Now
                </button>
              </div>
            )}
          </div>

          {/* Activity log feed */}
          <div className="lg:col-span-1 rounded-xl border border-white/[0.05] bg-white/[0.01] p-4.5 flex flex-col justify-between">
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider border-b border-white/[0.04] pb-2">Verifiable Logs</h4>
              <div className="space-y-3">
                {recentLogs.slice(0, 3).map((log, i) => (
                  <div key={i} className="text-[10px] font-mono leading-tight">
                    <div className="flex items-center justify-between text-white/70">
                      <span className="font-bold truncate max-w-[120px]">{log.action}</span>
                      <span className="text-white/30 text-[8px]">{log.time}</span>
                    </div>
                    <p className="text-white/40 mt-1 truncate">{log.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => addToast("info", "Ledger feed is immutable and locked with SHA-256 signatures.")}
              className="text-center text-[9px] font-bold uppercase tracking-wider text-[#d4a853]/80 hover:text-[#f5c542] transition-colors border-t border-white/[0.03] pt-3 mt-3 cursor-pointer"
            >
              Auditable Timeline →
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 2. MEMBERS
  const renderMembers = () => {
    const roster = [
      { name: "Dragz", role: "GUILD_LEADER", class: "Greatsword", rate: "100%", wallet: "8,450 GP", status: "Online" },
      { name: "Wiz", role: "OFFICER", class: "Staff", rate: "96%", wallet: "6,200 GP", status: "Online" },
      { name: "Mavis08", role: "OFFICER", class: "Dual Dagger", rate: "94%", wallet: "5,900 GP", status: "Online" },
      { name: "Hou13", role: "CORE_MEMBER", class: "BattleStaff", rate: "90%", wallet: "4,100 GP", status: "Offline" },
      { name: "Daylili", role: "RECRUIT", class: "Bow", rate: "85%", wallet: "1,200 GP", status: "Online" },
    ];
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wide">Guild Roster</h3>
          <p className="text-xs text-[#8B8F98] mt-0.5">Ranks, online statuses, attendance ratios, and GP ledgers.</p>
        </div>

        <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.05] bg-black/40 text-[9px] text-white/40 uppercase tracking-widest font-mono">
                <th className="p-3">Member</th>
                <th className="p-3">Role Tier</th>
                <th className="p-3">Class Type</th>
                <th className="p-3">Attendance</th>
                <th className="p-3">GP Balance</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => (
                <tr key={m.name} className="border-b border-white/[0.03] hover:bg-white/[0.01] transition-all">
                  <td className="p-3 font-semibold text-white">{m.name}</td>
                  <td className="p-3"><Badge role={m.role} size="sm" /></td>
                  <td className="p-3 font-mono text-white/60">{m.class}</td>
                  <td className="p-3 font-mono font-medium text-emerald-400">{m.rate}</td>
                  <td className="p-3 font-mono font-bold text-[#f5c542]">{m.wallet}</td>
                  <td className="p-3 text-right font-bold">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase font-mono ${
                      m.status === "Online" ? "text-emerald-400" : "text-white/20"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${m.status === "Online" ? "bg-emerald-400 shadow-[0_0_6px_#10D99A]" : "bg-white/25"}`} />
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // 3. BOSS ROTATION
  const renderBossRotation = () => {
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wide">Boss Rotation Tracker</h3>
          <p className="text-xs text-[#8B8F98] mt-0.5">Boss kill priorities and reset boss timers on kill events.</p>
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
                    ? "bg-emerald-500/[0.02] border-emerald-500/25 shadow-[0_0_15px_rgba(16,217,154,0.06)]"
                    : "bg-white/[0.01] border-white/[0.04] hover:border-[#d4a853]/20"
                }`}
              >
                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded ${
                      isAlive ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.05] text-white/40"
                    }`}>
                      {isAlive ? "ALIVE" : boss.status}
                    </span>
                    <span className="text-[9px] text-white/35 font-mono">Lvl {boss.level}</span>
                  </div>
                  <h4 className="font-bold text-sm text-white tracking-wide">{boss.name}</h4>
                  <p className="text-[10px] text-[#8B8F98]/70 font-mono">{boss.location}</p>

                  <div className="pt-1">
                    <span className="block text-[8px] text-white/30 uppercase tracking-widest font-mono">Spawn Cooldown</span>
                    <span className={`block text-xs font-mono font-bold mt-0.5 ${isAlive ? "text-emerald-400 animate-pulse" : "text-white/80"}`}>
                      {isAlive ? "READY TO KILL" : timeText}
                    </span>
                  </div>
                </div>

                {/* Queue sequence list */}
                <div className="border-t border-white/[0.04] pt-2 mb-3 space-y-1 text-[10px] font-mono">
                  <span className="text-[8px] text-[#f5c542] font-bold uppercase tracking-wider block mb-1">Rotation Order</span>
                  {boss.rotationQueue.slice(0, 3).map((q, idx) => (
                    <div key={q} className={`flex items-center justify-between px-2 py-1 rounded ${idx === 0 ? "bg-[#d4a853]/15 border border-[#d4a853]/20 text-[#f5c542]" : "text-white/45"}`}>
                      <span>{idx + 1}. {q}</span>
                      {idx === 0 && <span className="text-[7px] uppercase font-bold tracking-widest">TURN</span>}
                    </div>
                  ))}
                </div>

                {/* Interactive commands */}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleShiftTurn(boss.id)}
                    className="w-full py-1 text-center bg-white/[0.02] border border-white/[0.06] hover:bg-[#d4a853]/10 hover:border-[#d4a853]/30 text-[9px] uppercase tracking-wider font-bold text-white/80 hover:text-[#f5c542] rounded-md transition-all cursor-pointer"
                  >
                    Cycle Priority
                  </button>
                  {!isAlive && (
                    <button
                      onClick={() => handleLogKill(boss.id)}
                      className="w-full py-1 text-center bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40 text-[9px] uppercase tracking-wider font-bold text-red-400 rounded-md transition-all cursor-pointer"
                    >
                      Log Kill
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 4. ATTENDANCE
  const renderAttendance = () => {
    const isConfirmed = checkInStatus === "CONFIRMED";
    return (
      <div className="animate-fade-in space-y-6">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wide">Attendance Code Verification</h3>
          <p className="text-xs text-[#8B8F98] mt-0.5">Submit the verified passcode generated by officers during boss raid.</p>
        </div>

        {/* Stats card */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4 text-center">
            <span className="text-[8px] text-white/35 block uppercase tracking-widest">Presence Rate</span>
            <span className="text-2xl font-bold font-mono text-[#10D99A] mt-2 block">{presenceRate}%</span>
            <span className="text-[9px] text-[#8B8F98] mt-1 block">Officer threshold 85%</span>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4 text-center">
            <span className="text-[8px] text-white/35 block uppercase tracking-widest">Active Streak</span>
            <span className="text-2xl font-bold font-mono text-[#f5c542] mt-2 block">{streak} Raids</span>
            <span className="text-[9px] text-[#8B8F98] mt-1 block">Streak multiplier: 1.2x</span>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4 text-center">
            <span className="text-[8px] text-white/35 block uppercase tracking-widest">Guild Wallet Balance</span>
            <span className="text-2xl font-bold font-mono text-cyan-400 mt-2 block">{userBidPoints} GP</span>
            <span className="text-[9px] text-[#8B8F98] mt-1 block">Spendable in live auctions</span>
          </div>
        </div>

        {/* Action check-in portal card */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-[#d4a853]/5 border border-[#d4a853]/25 flex items-center justify-center text-[#f5c542] text-lg font-bold shrink-0">
              ✦
            </div>
            <div className="flex-1">
              <span className="text-[8px] font-extrabold uppercase text-[#f5c542] tracking-wider block">Active Check-In Session Portal running</span>
              <h4 className="text-sm font-bold text-white mt-1">Verify Activities Attendance</h4>
              <p className="text-xs text-[#8B8F98] leading-relaxed mt-1">
                Enter the code generated by your officers in the voice channel to record your attendance.
              </p>
              <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-white/40">
                <span>Raid Voice Code:</span>
                <code className="text-[#f5c542] font-bold font-mono bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.06]">ATT-3B82</code>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.04] pt-4 flex items-center justify-between gap-6 flex-wrap">
            <div className="text-[10px] font-mono text-white/35">
              Verification State:{" "}
              <span className={`font-bold uppercase ${
                isConfirmed ? "text-[#10D99A]" : checkInStatus === "PENDING" ? "text-[#f5c542] animate-pulse" : "text-white/45"
              }`}>
                {isConfirmed ? "Checked In" : checkInStatus === "PENDING" ? "Authenticating..." : "Not Checked In"}
              </span>
            </div>

            {checkInStatus === "NONE" ? (
              <form onSubmit={handleCheckInSubmit} className="flex gap-2 w-full max-w-xs border border-white/[0.08] bg-white/[0.01] p-1 rounded-lg">
                <input
                  type="text"
                  placeholder="e.g. ATT-3B82"
                  value={attendanceCode}
                  onChange={(e) => setAttendanceCode(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs text-center font-bold font-mono text-white bg-transparent focus:outline-none placeholder:text-white/10 uppercase tracking-widest"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-gradient-to-r from-[#d4a853] to-[#f5c542] text-black hover:opacity-90 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer shrink-0"
                >
                  Verify
                </button>
              </form>
            ) : checkInStatus === "PENDING" ? (
              <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
                <span className="h-3.5 w-3.5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                <span>Simulating secure handshake...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-[#10D99A]/10 border border-[#10D99A]/20 px-3 py-1.5 rounded-lg select-none">
                ✓ Presence Confirmed & Wallet Credited
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 5. TREASURY
  const renderTreasury = () => {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wide">Guild Treasury & GP Auctions</h3>
            <p className="text-xs text-[#8B8F98] mt-0.5">Audit payouts ledger statements and bid on legendary raid items.</p>
          </div>
          <span className="px-2 py-0.5 rounded border border-[#d4a853]/30 bg-[#d4a853]/5 text-[9px] text-[#d4a853] font-bold uppercase tracking-wider">
            PHP Dividends Active
          </span>
        </div>

        {/* Treasury Dividends details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
            <span className="text-[8px] text-white/35 block uppercase tracking-widest font-mono">Guild Treasury Balance</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold font-mono text-white">₱ {treasuryFund.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400 font-bold font-mono">+90% Dividends Split</span>
            </div>
            <p className="text-[9px] text-white/35 mt-1 leading-none">Monthly Guild Dividends for All Members.</p>
          </div>
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
            <span className="text-[8px] text-white/35 block uppercase tracking-widest font-mono">Officer Operations Tax</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold font-mono text-white">₱ {(treasuryFund * 0.1).toLocaleString()}</span>
              <span className="text-[10px] text-[#f5c542] font-bold font-mono">10% Retention Rate</span>
            </div>
            <p className="text-[9px] text-white/35 mt-1 leading-none">Used for Barehands Account Funding.</p>
          </div>
        </div>

        {/* Auctions list */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[#f5c542] uppercase tracking-wider">Item Auctions</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {auctions.map((auc) => (
              <AuctionCard
                key={auc.id}
                auc={auc}
                onBidPlaced={(bidVal) => handlePlaceBid(auc.id, bidVal)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section id="preview" className="py-24 relative overflow-hidden bg-[#050608]">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/4 h-[350px] w-[350px] rounded-full bg-[#f5c542]/[0.02] filter blur-[80px] pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 h-[350px] w-[350px] rounded-full bg-[#10D99A]/[0.015] filter blur-[90px] pointer-events-none -z-10" />

      {/* simulated toasts */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none select-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3.5 rounded-xl border text-xs font-semibold shadow-2xl backdrop-blur-md animate-scale-in flex items-center gap-2 pointer-events-auto select-text ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : toast.type === "info"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                  : "bg-red-500/10 border-red-500/20 text-red-300"
            }`}
          >
            <span className="text-sm leading-none shrink-0">{toast.type === "success" ? "✓" : toast.type === "info" ? "✦" : "⨯"}</span>
            <span className="flex-1">{toast.text}</span>
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <Reveal className="text-center mb-12">
          <SectionLabel>Application Preview</SectionLabel>
          <h2 className="mt-5 text-3xl sm:text-4xl font-semibold text-white tracking-tight font-fantasy">
            Interact with the application.
          </h2>
          <p className="mt-3.5 text-sm text-[#8B8F98] max-w-xl mx-auto leading-relaxed">
            Click tabs, verify attendance codes, shift priority turns, or bid on equipment items to preview how the operations flow.
          </p>
        </Reveal>

        {/* Tabs picker */}
        <Reveal className="flex justify-center mb-8">
          <div className="inline-flex p-1 rounded-xl border border-white/[0.08] bg-[#0b0d10]/50 backdrop-blur-lg gap-1 flex-wrap justify-center">
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
                  activeTab === tab
                    ? "bg-[#d4a853]/10 border border-[#d4a853]/25 text-[#f5c542] shadow-[0_0_12px_rgba(212,168,83,0.06)]"
                    : "text-white/40 hover:text-white/70 border border-transparent hover:bg-white/[0.02]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Interactive Mock Window */}
        <Reveal delay={120}>
          <Scroll3D rotateX={4} rotateY={0} scaleFrom={0.97} liftFrom={20}>
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0b0d10] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.95)] card-obsidian">
              
              {/* Chrome Header bar */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.05] bg-black/40">
                <div className="flex gap-1.5 shrink-0">
                  <div className="h-2 w-2 rounded-full bg-red-500/25" />
                  <div className="h-2 w-2 rounded-full bg-amber-500/25" />
                  <div className="h-2 w-2 rounded-full bg-emerald-500/25" />
                </div>
                <div className="flex-1 mx-6 h-6 rounded-lg bg-white/[0.01] border border-white/[0.03] flex items-center justify-center text-[10px] text-white/30 font-mono tracking-wide">
                  app.forgekeep.io/iron-wolves/{activeTab.toLowerCase().replace(" ", "-")}
                </div>
                <div className="h-2 w-2 rounded-full bg-[#10D99A] shadow-[0_0_8px_#10D99A] animate-pulse" />
              </div>

              {/* Mock Content */}
              <div className="p-6 lg:p-8 min-h-[520px] text-white/85 transition-all duration-300">
                {activeTab === "Overview" && renderOverview()}
                {activeTab === "Members" && renderMembers()}
                {activeTab === "Boss Rotation" && renderBossRotation()}
                {activeTab === "Attendance" && renderAttendance()}
                {activeTab === "Treasury" && renderTreasury()}
              </div>

            </div>
          </Scroll3D>
        </Reveal>
      </div>
    </section>
  );
}

// Subcomponent: Auction Bid Card
interface AuctionCardProps {
  auc: MockAuction;
  onBidPlaced: (bidValue: string) => void;
}

function AuctionCard({ auc, onBidPlaced }: AuctionCardProps) {
  const [bidVal, setBidVal] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onBidPlaced(bidVal);
    setBidVal("");
  };

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4.5 flex items-start gap-4 transition-all duration-300 hover:border-white/[0.08] hover:bg-white/[0.02]">
      {/* Icon block placeholder */}
      <div className="h-14 w-14 rounded-lg bg-zinc-950 border border-white/5 flex flex-col items-center justify-center shrink-0 relative select-none">
        <span className="text-xs font-bold text-white/45 uppercase font-mono">{auc.itemName[0]}</span>
        <span className="absolute bottom-1 text-[7px] text-[#f5c542] font-extrabold uppercase tracking-wide">Loot</span>
      </div>

      <div className="flex-1 space-y-2.5 min-w-0">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[7.5px] font-bold text-[#f5c542] uppercase tracking-widest">{auc.category}</span>
            <h5 className="font-bold text-white text-xs truncate leading-snug">{auc.itemName}</h5>
          </div>
          <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-wide bg-white/[0.02] border border-white/5 px-2 py-0.5 rounded">{auc.endsIn}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10.5px]">
          <div>
            <span className="text-[8px] text-white/35 block uppercase tracking-wider">Highest Bid</span>
            <span className="font-mono font-bold text-white block mt-0.5">{auc.currentBid} GP</span>
          </div>
          <div>
            <span className="text-[8px] text-white/35 block uppercase tracking-wider">Bidder</span>
            <span className="font-bold text-white/80 block mt-0.5 truncate">{auc.highBidder}</span>
          </div>
        </div>

        {/* Bid Form */}
        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/[0.04] pt-2">
          <input
            type="number"
            placeholder={`Min ${auc.currentBid + 1}`}
            value={bidVal}
            onChange={(e) => setBidVal(e.target.value)}
            className="flex-1 px-3 py-1 text-[11px] rounded bg-white/[0.02] border border-white/[0.08] focus:outline-none focus:border-[#d4a853]/35 text-white font-mono tracking-wider"
          />
          <button
            type="submit"
            className="px-3.5 py-1 bg-white text-black hover:bg-white/90 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer font-mono shrink-0"
          >
            Place Bid
          </button>
        </form>
      </div>
    </div>
  );
}
