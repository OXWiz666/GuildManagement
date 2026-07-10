"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";

const money = (minor: number, ccy = "PHP") => `${ccy} ${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

type Tab = "plans" | "subscriptions" | "payments" | "coupons";

export default function AdminBillingPage() {
  const [tab, setTab] = useState<Tab>("plans");

  const { data: overview } = useQuery<any>(
    "admin_billing_overview",
    async () => {
      const res = await adminApi.getBillingOverview();
      return res.success ? res.data : null;
    },
    { staleTime: 15000 },
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--forge-gold-bright)]">Platform</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Billing</h1>
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Total Revenue" value={money(overview.totalRevenue)} />
          <Metric label="This Month" value={money(overview.monthlyRevenue)} />
          <Metric label="Active Subs" value={String(overview.activeSubscriptions)} />
          <Metric label="Premium / Free" value={`${overview.premiumGuilds} / ${overview.freeGuilds}`} />
        </div>
      )}

      <div className="flex gap-1.5 rounded-xl border border-white/[0.06] bg-[#0c0d12]/50 p-1.5">
        {(["plans", "subscriptions", "payments", "coupons"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${tab === t ? "bg-white/[0.07] text-white" : "text-white/45 hover:text-white/80"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "plans" && <PlansTab />}
      {tab === "subscriptions" && <SubscriptionsTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "coupons" && <CouponsTab />}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className="mt-1.5 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function useToastAct() {
  const { addToast } = useToast();
  return async (fn: () => Promise<any>, msg: string, after?: () => void) => {
    try {
      const res = await fn();
      if (res.success) {
        addToast("success", msg);
        after?.();
        return res;
      }
      addToast("error", res.error?.message || "Action failed");
    } catch (e: any) {
      addToast("error", e?.message || "An error occurred");
    }
  };
}

// ─── Plans ────────────────────────────────────────────────────────────
function PlansTab() {
  const act = useToastAct();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery<any>("admin_plans", async () => {
    const res = await adminApi.listPlans();
    return res.success && res.data ? res.data.plans : [];
  });
  const refresh = () => queryClient.invalidateQueries("admin_plans");
  const plans = data || [];

  const [form, setForm] = useState({ name: "", monthly: "", yearly: "", currency: "PHP" });
  async function create() {
    await act(
      () =>
        adminApi.createPlan({
          name: form.name.trim(),
          monthlyPrice: Math.round(parseFloat(form.monthly || "0") * 100),
          yearlyPrice: Math.round(parseFloat(form.yearly || "0") * 100),
          currency: form.currency,
        }),
      "Plan created",
      () => {
        setShowNew(false);
        setForm({ name: "", monthly: "", yearly: "", currency: "PHP" });
        refresh();
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>New plan</Button>
      </div>
      {isLoading ? <Skeleton className="h-40 w-full rounded-2xl animate-pulse" /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p: any) => (
            <div key={p.id} className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">{p.name}</h3>
                {!p.isActive && <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] uppercase text-white/40">inactive</span>}
              </div>
              <p className="mt-1 text-lg font-black text-white">{money(p.monthlyPrice, p.currency)}<span className="text-xs font-normal text-white/40">/mo</span></p>
              <p className="text-[11px] text-white/45">{money(p.yearlyPrice, p.currency)}/yr · {p.subscriberCount} subscribers</p>
              {p.isActive && (
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => act(() => adminApi.deactivatePlan(p.id), "Plan deactivated", refresh)}>Deactivate</Button>
                </div>
              )}
            </div>
          ))}
          {plans.length === 0 && <p className="text-sm text-white/35">No plans yet.</p>}
        </div>
      )}

      {showNew && (
        <Modal title="New subscription plan" onClose={() => setShowNew(false)}>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <Input label="Monthly" type="number" value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} />
            <Input label="Yearly" type="number" value={form.yearly} onChange={(e) => setForm({ ...form, yearly: e.target.value })} />
            <Input label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!form.name.trim()} onClick={create}>Create</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Subscriptions ────────────────────────────────────────────────────
function SubscriptionsTab() {
  const act = useToastAct();
  const [showNew, setShowNew] = useState(false);
  const { data } = useQuery<any>("admin_subs", async () => {
    const res = await adminApi.listSubscriptions();
    return res.success ? res.data : null;
  });
  const { data: plans } = useQuery<any>("admin_plans", async () => {
    const res = await adminApi.listPlans();
    return res.success && res.data ? res.data.plans : [];
  });
  const refresh = () => queryClient.invalidateQueries("admin_subs");
  const subs = data?.subscriptions || [];

  const [form, setForm] = useState({ guildId: "", planId: "", interval: "MONTHLY" });
  async function create() {
    await act(() => adminApi.createSubscription(form), "Subscription created", () => { setShowNew(false); refresh(); });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button variant="primary" size="sm" onClick={() => setShowNew(true)}>New subscription</Button></div>
      <div className="overflow-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead><tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wider text-white/45">
            <th className="px-4 py-3">Guild</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Renews</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-white/[0.04] text-white/70">
            {subs.map((s: any) => (
              <tr key={s.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-white">{s.guild?.name}</td>
                <td className="px-4 py-3">{s.planName}</td>
                <td className="px-4 py-3"><span className="text-[10px] uppercase text-white/60">{s.status}</span></td>
                <td className="px-4 py-3 text-white/50">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {s.status === "PAUSED" ? (
                      <Button variant="ghost" size="xs" onClick={() => act(() => adminApi.subscriptionAction(s.id, "resume"), "Resumed", refresh)}>Resume</Button>
                    ) : s.status !== "CANCELLED" ? (
                      <Button variant="ghost" size="xs" onClick={() => act(() => adminApi.subscriptionAction(s.id, "pause"), "Paused", refresh)}>Pause</Button>
                    ) : null}
                    {s.status !== "CANCELLED" && <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => act(() => adminApi.subscriptionAction(s.id, "cancel"), "Cancelled", refresh)}>Cancel</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {subs.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-white/35">No subscriptions.</td></tr>}
          </tbody>
        </table>
      </div>

      {showNew && (
        <Modal title="New subscription" onClose={() => setShowNew(false)}>
          <Input label="Guild ID" value={form.guildId} onChange={(e) => setForm({ ...form, guildId: e.target.value })} />
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">Plan</label>
            <select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-xs text-white">
              <option value="">Select a plan…</option>
              {(plans || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!form.guildId || !form.planId} onClick={create}>Create</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Payments ─────────────────────────────────────────────────────────
function PaymentsTab() {
  const act = useToastAct();
  const [showNew, setShowNew] = useState(false);
  const { data } = useQuery<any>("admin_payments", async () => {
    const res = await adminApi.listPayments();
    return res.success ? res.data : null;
  });
  const refresh = () => queryClient.invalidateQueries("admin_payments");
  const payments = data?.payments || [];

  const [form, setForm] = useState({ guildId: "", amount: "", status: "SUCCEEDED" });
  async function create() {
    await act(
      () => adminApi.recordPayment({ guildId: form.guildId, amount: Math.round(parseFloat(form.amount || "0") * 100), status: form.status }),
      "Payment recorded",
      () => { setShowNew(false); refresh(); },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button variant="primary" size="sm" onClick={() => setShowNew(true)}>Record payment</Button></div>
      <div className="overflow-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead><tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wider text-white/45">
            <th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Gateway</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-white/[0.04] text-white/70">
            {payments.map((p: any) => (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-white">{money(p.amount, p.currency)}</td>
                <td className="px-4 py-3"><span className="text-[10px] uppercase text-white/60">{p.status}</span></td>
                <td className="px-4 py-3 text-white/50">{p.gateway}</td>
                <td className="px-4 py-3 text-white/50">{new Date(p.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  {p.status === "SUCCEEDED" && <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => act(() => adminApi.refundPayment(p.id), "Refunded", refresh)}>Refund</Button>}
                </td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-white/35">No payments.</td></tr>}
          </tbody>
        </table>
      </div>

      {showNew && (
        <Modal title="Record manual payment" onClose={() => setShowNew(false)}>
          <Input label="Guild ID" value={form.guildId} onChange={(e) => setForm({ ...form, guildId: e.target.value })} />
          <Input label="Amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!form.guildId || !form.amount} onClick={create}>Record</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Coupons ──────────────────────────────────────────────────────────
function CouponsTab() {
  const act = useToastAct();
  const [showNew, setShowNew] = useState(false);
  const { data } = useQuery<any>("admin_coupons", async () => {
    const res = await adminApi.listCoupons();
    return res.success && res.data ? res.data.coupons : [];
  });
  const refresh = () => queryClient.invalidateQueries("admin_coupons");
  const coupons = data || [];

  const [form, setForm] = useState({ code: "", type: "PERCENT", amount: "" });
  async function create() {
    await act(
      () => adminApi.createCoupon({ code: form.code, type: form.type, amount: parseInt(form.amount || "0", 10) }),
      "Coupon created",
      () => { setShowNew(false); refresh(); },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button variant="primary" size="sm" onClick={() => setShowNew(true)}>New coupon</Button></div>
      <div className="overflow-auto rounded-2xl border border-white/[0.06] bg-[#0c0d12]/50">
        <table className="w-full min-w-[560px] text-[12px]">
          <thead><tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wider text-white/45">
            <th className="px-4 py-3">Code</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Uses</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-white/[0.04] text-white/70">
            {coupons.map((c: any) => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-white">{c.code}{!c.isActive && <span className="ml-1 text-[9px] uppercase text-white/30">inactive</span>}</td>
                <td className="px-4 py-3 text-white/50">{c.type}</td>
                <td className="px-4 py-3">{c.type === "PERCENT" ? `${c.amount}%` : c.amount}</td>
                <td className="px-4 py-3 font-mono">{c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""}</td>
                <td className="px-4 py-3 text-right">
                  {c.isActive && <Button variant="ghost" size="xs" className="text-rose-300" onClick={() => act(() => adminApi.deactivateCoupon(c.id), "Deactivated", refresh)}>Deactivate</Button>}
                </td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-white/35">No coupons.</td></tr>}
          </tbody>
        </table>
      </div>

      {showNew && (
        <Modal title="New coupon" onClose={() => setShowNew(false)}>
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-xs text-white">
                <option value="PERCENT">Percent</option>
                <option value="FIXED">Fixed</option>
                <option value="FREE_TRIAL">Free trial</option>
              </select>
            </div>
            <Input label={form.type === "PERCENT" ? "Percent (0-100)" : "Amount"} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!form.code.trim()} onClick={create}>Create</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Shared modal ─────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#0c0d12] p-6 space-y-3">
        <h3 className="text-lg font-black text-white">{title}</h3>
        {children}
      </div>
    </div>
  );
}
