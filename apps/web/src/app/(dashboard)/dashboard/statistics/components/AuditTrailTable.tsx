import Card from "@/components/ui/Card";

interface AuditActivity {
  action: string;
  detail: string;
  time: string;
  type: string;
}

interface AuditTrailTableProps {
  recentActivity?: AuditActivity[];
}

export default function AuditTrailTable({
  recentActivity,
}: AuditTrailTableProps) {
  const activityList = recentActivity || [];

  return (
    <Card>
      <h3 className="font-bold text-white text-xs mb-3 border-b border-white/[0.05] pb-2">
        🔱 Guild Event Log
      </h3>

      <div className="overflow-x-auto pr-1">
        <table className="w-full text-left font-mono text-[11px]">
          <thead>
            <tr className="text-zinc-500 border-b border-white/[0.05] pb-2">
              <th className="py-2.5">Action Event</th>
              <th className="py-2.5">Claim Details</th>
              <th className="py-2.5 text-right">Server Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02] text-zinc-300">
            {activityList.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-zinc-500 italic">
                  No operations recorded yet.
                </td>
              </tr>
            ) : (
              activityList.slice(0, 4).map((activity, i) => (
                <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                  <td className="py-3 flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        activity.type === "CREDIT" || activity.type === "POINTS"
                          ? "bg-emerald-400"
                          : activity.type === "DEBIT"
                            ? "bg-red-400"
                            : "bg-amber-400"
                      }`}
                    />
                    <span className="font-bold text-white">{activity.action}</span>
                  </td>
                  <td className="py-3 text-zinc-400">{activity.detail}</td>
                  <td className="py-3 text-right text-zinc-500">{activity.time}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
