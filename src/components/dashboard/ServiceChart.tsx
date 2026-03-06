"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ServiceData {
  service: string;
  present: number;
  absent: number;
  late: number;
}

export default function ServiceChart({ data }: { data: ServiceData[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
        <p className="text-base font-semibold text-slate-700">
          Aucune statistique par service
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Les données apparaîtront après les premiers pointages.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="service"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "none",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "13px",
              padding: "10px 14px",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          />
          <Bar dataKey="present" name="Présents" fill="#10b981" radius={[6, 6, 0, 0]} barSize={28} />
          <Bar dataKey="absent" name="Absents" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={28} />
          <Bar dataKey="late" name="Retards" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
