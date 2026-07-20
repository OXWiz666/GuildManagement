"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";

interface AttendanceRecord {
  sessionId: string;
  title: string;
  type: "GUILD" | "FACTION";
  createdAt: string;
  expiresAt: string;
  status: "CONFIRMED" | "PENDING" | "MISSED" | "UNCHECKED";
  joinedAt: string | null;
}

interface AttendanceHistoryTableProps {
  history?: AttendanceRecord[];
}

const PAGE_SIZE = 12;

export default function AttendanceHistoryTable({
  history,
}: AttendanceHistoryTableProps) {
  const records = useMemo(() => history ?? [], [history]);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleRecords = useMemo(
    () => records.slice(startIndex, startIndex + PAGE_SIZE),
    [records, startIndex],
  );
  const rangeStart = records.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(records.length, startIndex + visibleRecords.length);

  return (
    <Card>
      <div className="mb-3 flex flex-col gap-2 border-b border-white/[0.05] pb-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-bold text-white text-xs">
          Guild Attendance History
        </h3>
        <span className="font-mono text-[10px] text-zinc-500">
          {rangeStart}-{rangeEnd} of {records.length}
        </span>
      </div>

      <div className="overflow-x-auto scroll-fade-x pr-1">
        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className="text-zinc-500 border-b border-white/[0.05] pb-2">
              <th className="py-2.5">Check-In Event</th>
              <th className="py-2.5">Scope</th>
              <th className="py-2.5">Check-in Timestamp</th>
              <th className="py-2.5 text-right">Operation Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02] text-zinc-300">
            {records.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-zinc-500 italic">
                  No attendance operations logged yet.
                </td>
              </tr>
            ) : (
              visibleRecords.map((rec) => {
                const checkInTime = rec.joinedAt
                  ? new Date(rec.joinedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                let statusBadge = (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                    UNCHECKED
                  </span>
                );

                if (rec.status === "CONFIRMED") {
                  statusBadge = (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                      CONFIRMED
                    </span>
                  );
                } else if (rec.status === "PENDING") {
                  statusBadge = (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      PENDING REVIEW
                    </span>
                  );
                } else if (rec.status === "MISSED") {
                  statusBadge = (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      MISSED
                    </span>
                  );
                }

                return (
                  <tr key={rec.sessionId} className="hover:bg-white/[0.01] transition-colors">
                    <td className="py-3 font-semibold text-white">{rec.title}</td>
                    <td className="py-3 text-zinc-400">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          rec.type === "FACTION"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        }`}
                      >
                        {rec.type}
                      </span>
                    </td>
                    <td className="py-3 text-zinc-500">{checkInTime}</td>
                    <td className="py-3 text-right">{statusBadge}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {records.length > PAGE_SIZE && (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.05] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] text-zinc-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={currentPage === 1}
              className="h-7 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="h-7 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Prev
            </button>
            <span className="min-w-12 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-center font-mono text-[10px] font-bold text-white/70">
              {currentPage}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={currentPage === totalPages}
              className="h-7 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-7 rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 text-[10px] font-bold text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
