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

export default function AttendanceHistoryTable({
  history,
}: AttendanceHistoryTableProps) {
  const records = history || [];

  return (
    <Card>
      <h3 className="font-bold text-white text-xs mb-3 border-b border-white/[0.05] pb-2">
        Guild Attendance History
      </h3>

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
              records.map((rec) => {
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
    </Card>
  );
}
