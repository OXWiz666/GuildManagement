"use client";

import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { Reveal, SectionLabel, Scroll3D } from "./LandingHelpers";

const PREVIEW_TABS = ["Dashboard", "Members", "Ledger"] as const;
type PreviewTab = (typeof PREVIEW_TABS)[number];

function PreviewDashboard() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white tracking-tight">Welcome back, Own</h3>
          <p className="text-sm text-white/50 mt-0.5">Here&apos;s what&apos;s happening in your guild today.</p>
        </div>
        <Badge role="GUILD_LEADER" size="md" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Guild balance",  value: "₱ 1,240",  sub: "+₱ 450 this week" },
          { label: "Activity points",value: "8,450",    sub: "+180 this week"   },
          { label: "Guild members",  value: "24",       sub: "3 online now"     },
          { label: "Boss kills",     value: "7",        sub: "This season"      },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02]">
            <p className="text-[10px] font-medium text-white/40 uppercase tracking-[0.18em]">{s.label}</p>
            <p className="text-xl font-semibold text-white mt-2 tabular-nums tracking-tight">{s.value}</p>
            <p className="text-xs text-white/40 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewMembers() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white tracking-tight">Guild roster</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">24 members</span>
          <button className="px-3 py-1.5 rounded-md text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors cursor-pointer">
            + Invite
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {[
          { name: "Own",   role: "GUILD_LEADER", pts: "8,450", online: true  },
          { name: "Wiz",   role: "OFFICER",      pts: "6,200", online: true  },
          { name: "Hou13", role: "CORE_MEMBER",  pts: "4,100", online: false },
          { name: "Dragz", role: "ELITE_MEMBER", pts: "3,750", online: true  },
          { name: "Daylili",role: "MEMBER",      pts: "2,100", online: false },
        ].map((m, i) => (
          <div
            key={m.name}
            className={`flex items-center gap-4 px-4 py-3 ${
              i > 0 ? "border-t border-white/[0.04]" : ""
            } hover:bg-white/[0.02] transition-colors`}
          >
            <Avatar name={m.name} size="sm" showStatus isOnline={m.online} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{m.name}</p>
              <p className="text-xs text-white/40 tabular-nums">{m.pts} pts</p>
            </div>
            <Badge role={m.role} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewLedger() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white tracking-tight">Transaction ledger</h3>
        <span className="text-[10px] text-white/40 uppercase tracking-[0.18em]">Immutable · Auditable</span>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="grid grid-cols-4 px-4 py-2.5 text-[10px] font-medium text-white/35 uppercase tracking-[0.16em] border-b border-white/[0.05]">
          <span>Type</span><span>Description</span><span className="text-right">Amount</span><span className="text-right">Date</span>
        </div>
        {[
          { type: "credit", label: "Field Boss · Titore",     amount: "+100 DKP", date: "May 23", color: "text-emerald-400" },
          { type: "debit",  label: "Bid won · Greatsword",    amount: "-450 DKP", date: "May 22", color: "text-red-300"     },
          { type: "credit", label: "Weekly attendance",       amount: "+50 DKP",  date: "May 22", color: "text-white/80"    },
          { type: "credit", label: "Field Boss · Catena",     amount: "+100 DKP", date: "May 21", color: "text-emerald-400" },
          { type: "debit",  label: "Guild bid fee (10%)",     amount: "-45 DKP",  date: "May 21", color: "text-amber-300"   },
        ].map((t, i) => (
          <div key={i} className={`grid grid-cols-4 items-center px-4 py-3 text-sm ${i > 0 ? "border-t border-white/[0.04]" : ""}`}>
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${t.type === "credit" ? "bg-emerald-400" : "bg-red-400/80"}`} />
              <span className="text-[10px] text-white/45 uppercase tracking-wider">{t.type}</span>
            </div>
            <span className="text-xs text-white/75 truncate pr-4">{t.label}</span>
            <span className={`text-xs font-medium text-right tabular-nums ${t.color}`}>{t.amount}</span>
            <span className="text-xs text-white/35 text-right tabular-nums">{t.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>("Dashboard");

  return (
    <section id="preview" className="py-32 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center mb-14">
          <SectionLabel>Live preview</SectionLabel>
          <h2 className="mt-6 text-4xl sm:text-5xl font-semibold text-white tracking-[-0.022em]">
            See it in motion.
          </h2>
          <p className="mt-4 text-base text-white/50 max-w-xl mx-auto">
            Switch between views to explore different areas of the platform.
          </p>
        </Reveal>

        {/* Tabs */}
        <Reveal className="flex justify-center mb-8">
          <div className="inline-flex p-1 rounded-full border border-white/[0.08] bg-white/[0.02] backdrop-blur">
            {PREVIEW_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab
                    ? "bg-white text-black"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </Reveal>

        {/* Window */}
        <Reveal delay={120}>
          <Scroll3D rotateX={8} rotateY={0} scaleFrom={0.94} liftFrom={40}>
          <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0b0b0d] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            {/* Chrome */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.05] bg-black/30">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
              </div>
              <div className="flex-1 mx-6 h-6 rounded-md flex items-center justify-center text-xs text-white/35 font-mono">
                app.guildmaster.gg/{activeTab.toLowerCase()}
              </div>
            </div>

            {/* Body */}
            <div className="p-6 lg:p-8 min-h-[440px]" key={activeTab}>
              {activeTab === "Dashboard" && <PreviewDashboard />}
              {activeTab === "Members"   && <PreviewMembers />}
              {activeTab === "Ledger"    && <PreviewLedger />}
            </div>
          </div>
          </Scroll3D>
        </Reveal>
      </div>
    </section>
  );
}
