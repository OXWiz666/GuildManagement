"use client";

import { useState } from "react";
import { marketApi, type ItemRequestData } from "@/lib/api";
import { useQuery, queryClient } from "@/lib/query";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import { Magnetic } from "@/components/dashboard/DashboardHelpers";
import { MarketStatusBadge, ItemTypeLabel } from "./MarketBadges";
import RequestItemModal from "./RequestItemModal";

interface Props {
  guildId: string;
  isOfficer: boolean;
}

export default function RequestItemPanel({ guildId, isOfficer }: Props) {
  const { addToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Officers see the pending queue; members see their own requests.
  const officerKey = `market_requests:${guildId}`;
  const mineKey = `market_my_requests:${guildId}`;

  const { data: officerData, isLoading: loadingOfficer } = useQuery(
    isOfficer ? officerKey : `${officerKey}:disabled`,
    async () => {
      const res = await marketApi.getRequests(guildId, { type: "ITEM" });
      return res.success && res.data ? res.data.requests : [];
    },
    { staleTime: 15000, enabled: isOfficer },
  );

  const { data: mineData, isLoading: loadingMine } = useQuery(
    mineKey,
    async () => {
      const res = await marketApi.getMyRequests(guildId);
      return res.success && res.data ? res.data : { requests: [], quota: { used: 0, limit: 0, remaining: 0 }, pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    },
    { staleTime: 15000 },
  );

  const refresh = () => {
    queryClient.invalidateQueries(officerKey);
    queryClient.invalidateQueries(mineKey);
  };

  async function review(id: string, action: "APPROVED" | "DECLINED" | "FULFILLED") {
    setBusyId(id);
    try {
      const res = await marketApi.reviewRequest(guildId, id, action);
      if (res.success) {
        addToast("success", `Request ${action.toLowerCase()}.`);
        refresh();
      } else {
        addToast("error", res.error?.message || "Action failed");
      }
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  const officerRequests = (officerData || []) as ItemRequestData[];
  const pending = officerRequests.filter((r) => r.status === "PENDING");
  const myRequests = mineData?.requests || [];

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0c0d12]/40 backdrop-blur p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span aria-hidden>📦</span> Resource Requests
          </h3>
          <p className="text-[11px] text-white/45 mt-0.5">
            Request logs, materials, and temporal pieces. {isOfficer ? "Review and approve member requests below." : "Track your request status."}
          </p>
        </div>
        <Magnetic strength={4}>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
            Request Item
          </Button>
        </Magnetic>
      </div>

      {/* Officer pending queue */}
      {isOfficer ? (
        loadingOfficer && officerRequests.length === 0 ? (
          <p className="text-xs text-white/40 py-4 text-center">Loading requests…</p>
        ) : pending.length === 0 ? (
          <EmptyHint text="No pending requests to review." />
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">
                    {r.member?.ign || r.member?.user?.displayName || "Member"}
                    <span className="text-white/40 font-normal"> · {r.member?.rankName}</span>
                  </p>
                  <p className="text-[11px] text-white/55 mt-0.5 flex items-center gap-2">
                    <ItemTypeLabel type={r.itemCategory || ""} />
                    <span className="font-mono text-white/70">×{r.quantity}</span>
                    {r.note && <span className="text-white/35 truncate">— {r.note}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="xs" isLoading={busyId === r.id} onClick={() => review(r.id, "DECLINED")} className="text-rose-300/80 hover:text-rose-300">
                    Reject
                  </Button>
                  <Button variant="primary" size="xs" isLoading={busyId === r.id} onClick={() => review(r.id, "APPROVED")}>
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : loadingMine && myRequests.length === 0 ? (
        <p className="text-xs text-white/40 py-4 text-center">Loading your requests…</p>
      ) : myRequests.length === 0 ? (
        <EmptyHint text="You haven't requested anything yet." />
      ) : (
        <ul className="space-y-2">
          {myRequests.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-white/70 flex items-center gap-2">
                  <ItemTypeLabel type={r.itemCategory || ""} />
                  <span className="font-mono text-white/70">×{r.quantity}</span>
                </p>
                {r.reviewNote && <p className="text-[10px] text-white/35 mt-0.5 truncate">Note: {r.reviewNote}</p>}
              </div>
              <MarketStatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <RequestItemModal guildId={guildId} onClose={() => setShowModal(false)} onSubmitted={refresh} />
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-center py-6 text-xs text-white/35 border border-dashed border-white/[0.06] rounded-xl">
      {text}
    </div>
  );
}
