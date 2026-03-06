"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DataPoint {
  date: string;
  rate: number;
  onTime: number;
  late: number;
}

export default function PunctualityChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
        <p className="text-base font-semibold text-slate-700">
          Aucune donnée de ponctualité
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Les statistiques s&apos;afficheront après les premiers pointages.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
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
            formatter={(value: number) => [`${value}%`, "Ponctualité"]}
            labelFormatter={(label) => {
              const d = new Date(label);
              return d.toLocaleDateString("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
            }}
          />
          <Area
            type="monotone"
            dataKey="rate"
            stroke="#2563eb"
            strokeWidth={2.5}
            fill="url(#colorRate)"
            dot={false}
            activeDot={{ r: 5, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
