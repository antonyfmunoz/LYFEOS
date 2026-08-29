import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type NutritionTrendPoint = {
  date: string;
  energyKcal: number | null;
};

export default function NutritionTrendChart({ data }: { data: NutritionTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={{ fontSize: 10 }} />
        <YAxis width={36} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Line type="monotone" dataKey="energyKcal" name="Energy (kcal)" stroke="hsl(var(--primary))" strokeWidth={2} connectNulls={false} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
