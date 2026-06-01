"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { dashboardApi, guildApi, type BossScheduleData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";
import LootStatsGrid from "./components/LootStatsGrid";
import SoldItemsTable from "./components/SoldItemsTable";
import AccountingTab from "./components/AccountingTab";
import RecordSaleModal from "./components/RecordSaleModal";
import TreasuryAdjModal from "./components/TreasuryAdjModal";

export default function GuildMarketPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState<"loot" | "accounting">("loot");
  const [isLoading, setIsLoading] = useState(true);

  // Guild configuration settings
  const [settings, setSettings] = useState<any>(null);

  // Loot & Accounting data
  const [sales, setSales] = useState<any[]>([]);
  const [accounting, setAccounting] = useState<any>(null);
  const [schedules, setSchedules] = useState<BossScheduleData[]>([]);

  // Search & Filter state
  const [lootSearch, setLootSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  // Pagination page state for ledger transaction history
  const [ledgerPage, setLedgerPage] = useState(1);

  // Record Loot Sale Modal states
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [saleItemName, setSaleItemName] = useState("");
  const [saleCategory, setSaleCategory] = useState<string>("WEAPON");
  const [saleBossScheduleId, setSaleBossScheduleId] = useState<string>("");
  const [saleValue, setSaleValue] = useState("");
  const [saleCurrency, setSaleCurrency] = useState("PHP");

  // Treasury Adjustment Modal states
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);
  const [adjAccountId, setAdjAccountId] = useState("");
  const [adjAccountType, setAdjAccountType] = useState<"MEMBER" | "GUILD_FUND" | "TAX">("GUILD_FUND");
  const [adjEntryType, setAdjEntryType] = useState<"CREDIT" | "DEBIT">("DEBIT");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjCurrency, setAdjCurrency] = useState("PHP");
  const [adjDescription, setAdjDescription] = useState("");

  // Active attendees for selected boss fight preview
  const [previewAttendees, setPreviewAttendees] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const activeGuild = user?.guilds?.[0];
  const isGuildLeader = activeGuild?.role === "GUILD_LEADER";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader;

  // Blazing-fast parallel concurrent queries using Promise.all!
  const loadData = useCallback(async () => {
    if (!activeGuild) return;
    setIsLoading(true);
    try {
      const [settingsRes, salesRes, accRes, schedRes] = await Promise.all([
        guildApi.getSettings(activeGuild.guildId),
        dashboardApi.getLootSales(activeGuild.guildId),
        dashboardApi.getAccountingDashboard(activeGuild.guildId, ledgerPage, 15),
        dashboardApi.getBossSchedules(activeGuild.guildId),
      ]);

      if (settingsRes.success) {
        setSettings(settingsRes.data);
        setSaleCurrency(settingsRes.data.currencyCode);
        setAdjCurrency(settingsRes.data.currencyCode);
      }

      if (salesRes.success && salesRes.data?.sales) {
        setSales(salesRes.data.sales);
      }

      if (accRes.success && accRes.data) {
        setAccounting(accRes.data);
      }

      if (schedRes.success && schedRes.data?.schedules) {
        setSchedules(schedRes.data.schedules);
      }
    } catch {
      addToast("error", "Failed to load Guild Market statistics");
    } finally {
      setIsLoading(false);
    }
  }, [activeGuild, ledgerPage, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen to real-time events to refresh Guild Market and Ledger history instantly
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleMarketUpdate = () => {
      console.log("[Market Socket]: Loot sale or treasury adjusted. Refreshing statistics...");
      loadData();
    };

    socket.on("loot_sale_recorded", handleMarketUpdate);
    socket.on("treasury_adjusted", handleMarketUpdate);

    return () => {
      socket.off("loot_sale_recorded", handleMarketUpdate);
      socket.off("treasury_adjusted", handleMarketUpdate);
    };
  }, [socket, activeGuild, loadData]);

  // Load preview attendees when boss fight changes in sale modal
  useEffect(() => {
    if (!activeGuild || !saleBossScheduleId) {
      setPreviewAttendees([]);
      return;
    }

    async function loadPreview() {
      setIsLoadingPreview(true);
      try {
        const result = await dashboardApi.getBossSchedules(activeGuild!.guildId);
        if (result.success && result.data?.schedules) {
          const selected = result.data.schedules.find((s: any) => s.id === saleBossScheduleId);
          if (selected && selected.attendanceSessions?.[0]?.records) {
            const confirmed = selected.attendanceSessions[0].records.filter(
              (r: any) => r.status === "CONFIRMED"
            );
            setPreviewAttendees(confirmed);
          } else {
            setPreviewAttendees([]);
          }
        }
      } catch {
        setPreviewAttendees([]);
      } finally {
        setIsLoadingPreview(false);
      }
    }
    loadPreview();
  }, [saleBossScheduleId, activeGuild]);

  // Submit sale handler
  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuild || !saleItemName.trim() || !saleValue) {
      addToast("error", "Please fill in all transaction details");
      return;
    }

    const valueNum = parseFloat(saleValue);
    if (isNaN(valueNum) || valueNum <= 0) {
      addToast("error", "Loot sale value must be a positive number");
      return;
    }

    setIsSubmittingSale(true);
    try {
      const result = await dashboardApi.addLootSale(activeGuild.guildId, {
        itemName: saleItemName.trim(),
        category: saleCategory,
        bossScheduleId: saleBossScheduleId || null,
        saleValue: valueNum,
        currency: saleCurrency,
      });
      if (result.success) {
        addToast("success", `Recorded sold item: ${saleItemName}! Proceeds split and taxes resolved.`);
        setShowSaleModal(false);
        setSaleItemName("");
        setSaleBossScheduleId("");
        setSaleValue("");
        setLedgerPage(1);
        await loadData();
      } else {
        addToast("error", result.error?.message || "Failed to record loot sale");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Submit Treasury adjustment handler
  const handleRecordAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuild || !adjAmount || !adjDescription.trim()) {
      addToast("error", "Please fill in all details");
      return;
    }

    const amountNum = parseFloat(adjAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      addToast("error", "Amount must be positive");
      return;
    }

    let targetAccountId = adjAccountId;
    if (adjAccountType === "GUILD_FUND" || adjAccountType === "TAX") {
      targetAccountId = activeGuild.guildId;
    } else if (!targetAccountId) {
      addToast("error", "Please select a target guild member");
      return;
    }

    setIsSubmittingAdj(true);
    try {
      const result = await dashboardApi.addTreasuryAdjustment(activeGuild.guildId, {
        accountId: targetAccountId,
        accountType: adjAccountType,
        entryType: adjEntryType,
        amount: amountNum,
        currency: adjCurrency,
        description: adjDescription.trim(),
      });
      if (result.success) {
        addToast("success", `Treasury ledger updated: ${adjEntryType} recorded successfully.`);
        setShowAdjModal(false);
        setAdjAccountId("");
        setAdjAmount("");
        setAdjDescription("");
        setLedgerPage(1);
        await loadData();
      } else {
        addToast("error", result.error?.message || "Failed to perform adjustment");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  // Filter sold items list
  const filteredSales = useMemo(() => {
    if (!lootSearch.trim()) return sales;
    const s = lootSearch.toLowerCase();
    return sales.filter(
      (item) =>
        item.itemName.toLowerCase().includes(s) ||
        item.category.toLowerCase().includes(s) ||
        item.bossSchedule?.bossName?.toLowerCase().includes(s)
    );
  }, [sales, lootSearch]);

  // Filter Member Balance board list
  const filteredMembers = useMemo(() => {
    if (!accounting?.memberBalances) return [];
    if (!memberSearch.trim()) return accounting.memberBalances;
    const s = memberSearch.toLowerCase();
    return accounting.memberBalances.filter(
      (m: any) =>
        m.ign.toLowerCase().includes(s) ||
        m.class.toLowerCase().includes(s) ||
        m.role.toLowerCase().includes(s)
    );
  }, [accounting, memberSearch]);

  // Summary Metrics calculations
  const totalLootSoldVal = useMemo(() => {
    return sales.reduce((acc, curr) => acc + Number(curr.saleValue) / 100, 0);
  }, [sales]);

  const totalTaxVal = useMemo(() => {
    return sales.reduce((acc, curr) => acc + Number(curr.taxAmount) / 100, 0);
  }, [sales]);

  const totalDividendsVal = useMemo(() => {
    return sales.reduce((acc, curr) => acc + Number(curr.netProfit) / 100, 0);
  }, [sales]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
      </div>
    );
  }

  if (isLoading && sales.length === 0) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto w-full px-2 md:px-4">
        <Skeleton className="h-10 w-96 animate-pulse" />
        <Skeleton className="h-40 w-full animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative max-w-7xl mx-auto w-full px-2 md:px-4 pb-12">
      <DashboardDecor />

      <div className="relative z-10 space-y-6 text-white/85">
        <ModuleHeader
          eyebrow="Market"
          title="Guild Market"
          description="Record loot drops, track sold items history, split dividends to attendees, and audit the guild treasury ledger."
          right={
            <div className="flex items-center gap-2">
              {isOfficer && (
                <>
                  <Magnetic strength={4}>
                    <Button variant="primary" size="sm" onClick={() => setShowSaleModal(true)}>
                      Record drop sale
                    </Button>
                  </Magnetic>
                  <Magnetic strength={4}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAdjModal(true)}
                      className="border border-white/[0.08]"
                    >
                      Treasury action
                    </Button>
                  </Magnetic>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={loadData} isLoading={isLoading}>
                Refresh
              </Button>
            </div>
          }
        />

        {/* Tab Headers */}
        <div className="flex border-b border-white/[0.06] gap-4 mb-4">
          <button
            onClick={() => setActiveTab("loot")}
            className={`py-3 text-sm font-semibold tracking-wider transition-all relative cursor-pointer ${
              activeTab === "loot" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            📊 Loot Sales & History
            {activeTab === "loot" && (
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-white rounded-t-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("accounting")}
            className={`py-3 text-sm font-semibold tracking-wider transition-all relative cursor-pointer ${
              activeTab === "accounting" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            💰 Accounting & Ledger
            {activeTab === "accounting" && (
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-white rounded-t-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            )}
          </button>
        </div>

        {/* Tab Content 1: LOOT SALES & HISTORY */}
        {activeTab === "loot" && (
          <div className="space-y-6">
            <LootStatsGrid
              currencySymbol={settings?.currencySymbol || "₱"}
              totalLootSoldVal={totalLootSoldVal}
              totalTaxVal={totalTaxVal}
              totalDividendsVal={totalDividendsVal}
              taxRatePercent={settings?.taxRatePercent ?? 10}
            />
            <SoldItemsTable
              sales={filteredSales}
              lootSearch={lootSearch}
              onSearchChange={setLootSearch}
              currencySymbol={settings?.currencySymbol || "₱"}
              secondaryCurrencySymbol={settings?.secondaryCurrencySymbol || "💎"}
            />
          </div>
        )}

        {/* Tab Content 2: ACCOUNTING & LEDGER */}
        {activeTab === "accounting" && (
          <AccountingTab
            accounting={accounting}
            settings={settings}
            filteredMembers={filteredMembers}
            memberSearch={memberSearch}
            onSearchChange={setMemberSearch}
            ledgerPage={ledgerPage}
            onPageChange={setLedgerPage}
          />
        )}

        {/* Modal: Record Drop Loot Sale */}
        {showSaleModal && (
          <RecordSaleModal
            settings={settings}
            schedules={schedules}
            saleItemName={saleItemName}
            saleCategory={saleCategory}
            saleBossScheduleId={saleBossScheduleId}
            saleValue={saleValue}
            saleCurrency={saleCurrency}
            previewAttendees={previewAttendees}
            isLoadingPreview={isLoadingPreview}
            isSubmitting={isSubmittingSale}
            onClose={() => setShowSaleModal(false)}
            onSubmit={handleRecordSale}
            onItemNameChange={setSaleItemName}
            onCategoryChange={setSaleCategory}
            onBossScheduleChange={setSaleBossScheduleId}
            onValueChange={setSaleValue}
            onCurrencyChange={setSaleCurrency}
          />
        )}

        {/* Modal: Treasury Manual Payout Action */}
        {showAdjModal && (
          <TreasuryAdjModal
            settings={settings}
            accounting={accounting}
            adjAccountType={adjAccountType}
            adjEntryType={adjEntryType}
            adjAccountId={adjAccountId}
            adjAmount={adjAmount}
            adjCurrency={adjCurrency}
            adjDescription={adjDescription}
            isSubmitting={isSubmittingAdj}
            onClose={() => setShowAdjModal(false)}
            onSubmit={handleRecordAdjustment}
            onAccountTypeChange={setAdjAccountType}
            onEntryTypeChange={setAdjEntryType}
            onAccountIdChange={setAdjAccountId}
            onAmountChange={setAdjAmount}
            onCurrencyChange={setAdjCurrency}
            onDescriptionChange={setAdjDescription}
          />
        )}
      </div>
    </div>
  );
}
