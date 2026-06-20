"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface TreasuryAdjModalProps {
  settings: any;
  accounting: any;
  adjAccountType: "MEMBER" | "GUILD_FUND" | "TAX";
  adjEntryType: "CREDIT" | "DEBIT";
  adjAccountId: string;
  adjAmount: string;
  adjCurrency: string;
  adjDescription: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onAccountTypeChange: (v: "MEMBER" | "GUILD_FUND" | "TAX") => void;
  onEntryTypeChange: (v: "CREDIT" | "DEBIT") => void;
  onAccountIdChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onCurrencyChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}

export default function TreasuryAdjModal({
  settings,
  accounting,
  adjAccountType,
  adjEntryType,
  adjAccountId,
  adjAmount,
  adjCurrency,
  adjDescription,
  isSubmitting,
  onClose,
  onSubmit,
  onAccountTypeChange,
  onEntryTypeChange,
  onAccountIdChange,
  onAmountChange,
  onCurrencyChange,
  onDescriptionChange,
}: TreasuryAdjModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Card className="w-full max-w-lg p-6 bg-[#0c0d12] border border-white/[0.10] rounded-3xl space-y-4 animate-scale-in relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors cursor-pointer"
        >
          ✕
        </button>
        <h3 className="text-[16px] font-bold text-white tracking-tight">💰 Treasury transaction log</h3>
        <p className="text-[11px] text-white/40">Record manual payouts, expense invoices, or member balance adjustments.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Account Type</label>
              <select
                value={adjAccountType}
                onChange={(e: any) => {
                  onAccountTypeChange(e.target.value);
                  if (e.target.value !== "MEMBER") onAccountIdChange("");
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value="GUILD_FUND">Guild Fund Treasury</option>
                <option className="bg-[#0c0d12]" value="TAX">Guild Tax Reserve</option>
                <option className="bg-[#0c0d12]" value="MEMBER">Member Ledger Account</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Entry Type</label>
              <select
                value={adjEntryType}
                onChange={(e: any) => onEntryTypeChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value="DEBIT">DEBIT (Expense/Payout Withdrawal)</option>
                <option className="bg-[#0c0d12]" value="CREDIT">CREDIT (Proceeds Deposit)</option>
              </select>
            </div>
          </div>

          {adjAccountType === "MEMBER" && (
            <div className="flex flex-col gap-1.5 animate-slide-down">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Select Member</label>
              <select
                value={adjAccountId}
                onChange={(e) => onAccountIdChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value="">-- Choose Member --</option>
                {accounting?.memberBalances?.map((m: any) => (
                  <option className="bg-[#0c0d12]" key={m.userId} value={m.userId}>
                    {m.ign} ({m.rankName})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Transaction Amount"
              type="number"
              step="0.01"
              placeholder="e.g. 1000"
              value={adjAmount}
              onChange={(e) => onAmountChange(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Currency</label>
              <select
                value={adjCurrency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white focus:outline-none"
              >
                <option className="bg-[#0c0d12]" value={settings?.currencyCode || "PHP"}>
                  {settings?.currencyCode || "PHP"}
                </option>
                {settings?.secondaryCurrencyCode && (
                  <option className="bg-[#0c0d12]" value={settings.secondaryCurrencyCode}>
                    {settings.secondaryCurrencyCode}
                  </option>
                )}
              </select>
            </div>
          </div>

          <Input
            label="Description / Memo"
            placeholder="e.g. Web server expense, GCash cash-out, attendance correction payout"
            value={adjDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Record transaction
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
