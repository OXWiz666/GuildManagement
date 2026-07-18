"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { useSocket } from "@/components/providers/socket-provider";
import { dashboardApi, guildApi, type BossScheduleData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import DashboardDecor from "@/components/dashboard/DashboardDecor";
import { ModuleHeader, Magnetic } from "@/components/dashboard/DashboardHelpers";
import MarketNav, { type MarketTab } from "./components/MarketNav";

// Only one tab is ever visible at a time, and the two modals only mount on
// user action — code-split each so the initial route chunk only ships
// MarketNav plus whichever tab is active first.
const LootStatsGrid = dynamic(() => import("./components/LootStatsGrid"));
const SoldItemsTable = dynamic(() => import("./components/SoldItemsTable"));
const AccountingTab = dynamic(() => import("./components/AccountingTab"));
const RankingsTab = dynamic(() => import("./components/RankingsTab"));
const RecordSaleModal = dynamic(() => import("./components/RecordSaleModal"));
const TreasuryAdjModal = dynamic(() => import("./components/TreasuryAdjModal"));
const GuildStorageTab = dynamic(() => import("./components/GuildStorageTab"));
const AuctionHallTab = dynamic(() => import("./components/AuctionHallTab"));
import { useQuery, queryClient } from "@/lib/query";

const TREASURY_LEDGER_PAGE_SIZE = 10;

export default function GuildMarketPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { socket } = useSocket();

  const [activeTab, setActiveTab] = useState<MarketTab>("loot");

  // Loot & Accounting inputs
  const [saleCurrency, setSaleCurrency] = useState("PHP");
  const [adjCurrency, setAdjCurrency] = useState("PHP");

  // Search & Filter state
  const [lootSearch, setLootSearch] = useState("");
  const [lootCategory, setLootCategory] = useState("ALL");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState("ALL");
  const [rankingSearch, setRankingSearch] = useState("");

  // Pagination page state for ledger transaction history
  const [ledgerPage, setLedgerPage] = useState(1);

  // Record Loot Sale Modal states (batch: many loots per activity)
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [saleCategory, setSaleCategory] = useState<string>("LOW_BOSS");
  const [saleBossScheduleId, setSaleBossScheduleId] = useState<string>("");
  const [saleSoldDate, setSaleSoldDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [saleItems, setSaleItems] = useState<Array<{ itemName: string; saleValue: string }>>([
    { itemName: "", saleValue: "" },
  ]);

  // Treasury Adjustment Modal states
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);
  const [adjAccountId, setAdjAccountId] = useState("");
  const [adjAccountType, setAdjAccountType] = useState<"MEMBER" | "GUILD_FUND" | "TAX">("GUILD_FUND");
  const [adjEntryType, setAdjEntryType] = useState<"CREDIT" | "DEBIT">("DEBIT");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDescription, setAdjDescription] = useState("");

  // Active attendees for selected boss fight preview
  const [previewAttendees, setPreviewAttendees] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const activeGuild = user?.guilds?.[0];
  // ADMIN and FACTION_LEADER sit above GUILD_LEADER in the role hierarchy
  const isGuildLeader =
    activeGuild?.role === "GUILD_LEADER" ||
    activeGuild?.role === "FACTION_LEADER" ||
    activeGuild?.role === "ADMIN";
  const isOfficer = activeGuild?.role === "OFFICER" || isGuildLeader;

  // ─── Persistent Queries ────────────────────────────────

  // 1. Settings Query
  const {
    data: settings,
  } = useQuery<any | null>(
    activeGuild ? `guild_settings:${activeGuild.guildId}` : "guild_settings_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await guildApi.getSettings(activeGuild.guildId);
      return result.success ? result.data : null;
    },
    { persist: true, staleTime: 300000 }
  );

  // Sync default currency from settings
  useEffect(() => {
    if (settings) {
      setSaleCurrency(settings.currencyCode);
      setAdjCurrency(settings.currencyCode);
    }
  }, [settings]);

  // 2. Loot Sales Query
  const {
    data: salesRaw,
    isLoading: isLoadingSales,
  } = useQuery<any[]>(
    activeGuild ? `loot_sales:${activeGuild.guildId}` : "loot_sales_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getLootSales(activeGuild.guildId);
      return result.success && result.data?.sales ? result.data.sales : [];
    },
    { persist: true, staleTime: 30000, enabled: !!activeGuild }
  );
  const sales = useMemo(() => salesRaw || [], [salesRaw]);

  // 3. Accounting Dashboard Query
  const {
    data: accounting,
    isLoading: isLoadingAccounting,
  } = useQuery<any | null>(
    activeGuild
      ? `accounting_dashboard:${activeGuild.guildId}:${ledgerPage}:${TREASURY_LEDGER_PAGE_SIZE}`
      : "accounting_dashboard_empty",
    async () => {
      if (!activeGuild) return null;
      const result = await dashboardApi.getAccountingDashboard(activeGuild.guildId, ledgerPage, TREASURY_LEDGER_PAGE_SIZE);
      return result.success && result.data ? result.data : null;
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild }
  );

  // 4. Boss Schedules Query (shares cache key!)
  const {
    data: schedulesRaw,
    isLoading: isLoadingSchedules,
  } = useQuery<BossScheduleData[]>(
    activeGuild ? `boss_schedules:${activeGuild.guildId}` : "boss_schedules_empty",
    async () => {
      if (!activeGuild) return [];
      const result = await dashboardApi.getBossSchedules(activeGuild.guildId);
      return result.success && result.data?.schedules ? result.data.schedules : [];
    },
    { persist: true, staleTime: 15000, enabled: !!activeGuild }
  );
  const schedules = useMemo(() => schedulesRaw || [], [schedulesRaw]);

  const isLoading = isLoadingSales || isLoadingAccounting || isLoadingSchedules;

  const invalidateAll = () => {
    if (!activeGuild) return;
    queryClient.invalidateQueries(`loot_sales:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`accounting_dashboard:${activeGuild.guildId}`);
    queryClient.invalidateQueries(`boss_schedules:${activeGuild.guildId}`);
  };

  // Listen to real-time events to refresh Guild Market and Ledger history instantly
  useEffect(() => {
    if (!socket || !activeGuild) return;

    const handleMarketUpdate = () => {
      console.log("[Market Socket]: Loot sale or treasury adjusted. Refreshing caches...");
      invalidateAll();
    };

    const gid = activeGuild.guildId;
    const handleStorage = () => queryClient.invalidateQueries(`market_storage:${gid}`);
    const handleAuction = () => {
      queryClient.invalidateQueries(`market_auctions:${gid}`);
      queryClient.invalidateQueries(`market_auction_history:${gid}`);
    };

    socket.on("loot_sale_recorded", handleMarketUpdate);
    socket.on("treasury_adjusted", handleMarketUpdate);
    socket.on("storage_updated", handleStorage);
    socket.on("auction_updated", handleAuction);

    return () => {
      socket.off("loot_sale_recorded", handleMarketUpdate);
      socket.off("treasury_adjusted", handleMarketUpdate);
      socket.off("storage_updated", handleStorage);
      socket.off("auction_updated", handleAuction);
    };
  }, [socket, activeGuild]);

  // Load named, confirmed attendees for the selected activity in the sale modal
  useEffect(() => {
    if (!activeGuild || !saleBossScheduleId) {
      setPreviewAttendees([]);
      return;
    }

    let cancelled = false;
    async function loadPreview() {
      setIsLoadingPreview(true);
      try {
        const result = await dashboardApi.getBossAttendees(activeGuild!.guildId, saleBossScheduleId);
        if (cancelled) return;
        setPreviewAttendees(result.success && result.data?.attendees ? result.data.attendees : []);
      } catch {
        if (!cancelled) setPreviewAttendees([]);
      } finally {
        if (!cancelled) setIsLoadingPreview(false);
      }
    }
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [saleBossScheduleId, activeGuild]);

  // Item row helpers for the batch modal
  const addSaleItem = () => setSaleItems((prev) => [...prev, { itemName: "", saleValue: "" }]);
  const removeSaleItem = (index: number) =>
    setSaleItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  const updateSaleItem = (index: number, field: "itemName" | "saleValue", value: string) =>
    setSaleItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const resetSaleModal = () => {
    setSaleBossScheduleId("");
    setSaleSoldDate(new Date().toISOString().slice(0, 10));
    setSaleItems([{ itemName: "", saleValue: "" }]);
  };

  // Submit batch of sold loot items handler
  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGuild) return;

    const cleanedItems = saleItems
      .map((item) => ({ itemName: item.itemName.trim(), saleValue: parseFloat(item.saleValue) }))
      .filter((item) => item.itemName && !isNaN(item.saleValue) && item.saleValue > 0);

    if (cleanedItems.length === 0) {
      addToast("error", "Add at least one loot item with a name and positive sale value");
      return;
    }

    setIsSubmittingSale(true);
    try {
      const result = await dashboardApi.addLootSaleBatch(activeGuild.guildId, {
        category: saleCategory,
        bossScheduleId: saleBossScheduleId || null,
        currency: saleCurrency,
        soldDate: saleSoldDate || undefined,
        items: cleanedItems,
      });
      if (result.success) {
        addToast(
          "success",
          `Logged ${cleanedItems.length} sold item${cleanedItems.length > 1 ? "s" : ""}! Proceeds split and taxes resolved.`,
        );
        setShowSaleModal(false);
        resetSaleModal();
        setLedgerPage(1);
        invalidateAll();
      } else {
        addToast("error", result.error?.message || "Failed to log sold items");
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
        invalidateAll();
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
    const byCategory = lootCategory === "ALL" ? sales : sales.filter((item) => item.category === lootCategory);
    if (!lootSearch.trim()) return byCategory;
    const s = lootSearch.toLowerCase();
    return byCategory.filter(
      (item) =>
        item.itemName.toLowerCase().includes(s) ||
        item.category.toLowerCase().includes(s) ||
        item.bossSchedule?.bossName?.toLowerCase().includes(s)
    );
  }, [sales, lootSearch, lootCategory]);

  // Filter Member Balance board list
  const filteredMembers = useMemo(() => {
    if (!accounting?.memberBalances) return [];
    const byRole =
      memberRoleFilter === "ALL"
        ? accounting.memberBalances
        : accounting.memberBalances.filter((m: any) => m.role === memberRoleFilter);
    if (!memberSearch.trim()) return byRole;
    const s = memberSearch.toLowerCase();
    return byRole.filter(
      (m: any) =>
        m.ign.toLowerCase().includes(s) ||
        m.class.toLowerCase().includes(s) ||
        m.role.toLowerCase().includes(s)
    );
  }, [accounting, memberSearch, memberRoleFilter]);

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

  // Tab count badges (only the counts already loaded at page level)
  const tabCounts = useMemo<Partial<Record<MarketTab, number>>>(() => {
    const memberCount = accounting?.memberBalances?.length ?? 0;
    return {
      loot: sales.length,
      accounting: memberCount,
      rankings: memberCount,
    };
  }, [sales.length, accounting]);

  if (!user || !activeGuild) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40">No active guild selected</p>
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
                      Log sold items
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
              <Button variant="ghost" size="sm" onClick={invalidateAll} isLoading={isLoading}>
                Refresh
              </Button>
            </div>
          }
        />

        {/* Grouped, animated navigation */}
        <MarketNav active={activeTab} onChange={setActiveTab} counts={tabCounts} />

        {/* Animated tab content — re-runs the reveal on each tab switch */}
        <div key={activeTab} className="market-tab-panel">

        {/* Tab Content 1: LOOT SALES & HISTORY */}
        {activeTab === "loot" && (
          <div className="space-y-6">
            {isLoadingSales && sales.length === 0 ? (
              <div className="space-y-4">
                <Skeleton className="h-28 w-full rounded-2xl animate-pulse" />
                <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
              </div>
            ) : (
              <>
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
                  lootCategory={lootCategory}
                  onCategoryChange={setLootCategory}
                  currencySymbol={settings?.currencySymbol || "₱"}
                  secondaryCurrencySymbol={settings?.secondaryCurrencySymbol || "💎"}
                />
              </>
            )}
          </div>
        )}

        {/* Tab Content 2: ACCOUNTING & LEDGER */}
        {activeTab === "accounting" && (
          <>
            {isLoadingAccounting && !accounting ? (
              <div className="space-y-4">
                <Skeleton className="h-28 w-full rounded-2xl animate-pulse" />
                <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
              </div>
            ) : (
              <AccountingTab
                accounting={accounting}
                settings={settings}
                filteredMembers={filteredMembers}
                memberSearch={memberSearch}
                onSearchChange={setMemberSearch}
                memberRoleFilter={memberRoleFilter}
                onRoleFilterChange={setMemberRoleFilter}
                ledgerPage={ledgerPage}
                ledgerLimit={TREASURY_LEDGER_PAGE_SIZE}
                onPageChange={setLedgerPage}
              />
            )}
          </>
        )}

        {/* Tab Content 3: GUILD POINTS RANKING */}
        {activeTab === "rankings" && (
          <>
            {isLoadingAccounting && !accounting ? (
              <div className="space-y-4">
                <Skeleton className="h-64 w-full rounded-2xl animate-pulse" />
              </div>
            ) : (
              <RankingsTab
                accounting={accounting}
                rankingSearch={rankingSearch}
                onSearchChange={setRankingSearch}
              />
            )}
          </>
        )}

        {/* Tab Content 4: GUILD STORAGE */}
        {activeTab === "storage" && <GuildStorageTab guildId={activeGuild.guildId} />}

        {/* Tab Content 5: AUCTION HALL (DKP) */}
        {activeTab === "auctions" && <AuctionHallTab guildId={activeGuild.guildId} />}

        </div>

        {/* Modal: Record Drop Loot Sale */}
        {showSaleModal && (
          <RecordSaleModal
            guildId={activeGuild.guildId}
            settings={settings}
            schedules={schedules}
            category={saleCategory}
            bossScheduleId={saleBossScheduleId}
            soldDate={saleSoldDate}
            currency={saleCurrency}
            items={saleItems}
            attendees={previewAttendees}
            isLoadingAttendees={isLoadingPreview}
            isSubmitting={isSubmittingSale}
            onClose={() => setShowSaleModal(false)}
            onSubmit={handleRecordSale}
            onCategoryChange={setSaleCategory}
            onBossScheduleChange={setSaleBossScheduleId}
            onSoldDateChange={setSaleSoldDate}
            onCurrencyChange={setSaleCurrency}
            onAddItem={addSaleItem}
            onRemoveItem={removeSaleItem}
            onItemChange={updateSaleItem}
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
