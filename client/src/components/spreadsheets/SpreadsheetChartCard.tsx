import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Trash2 } from "lucide-react";
import type { SpreadsheetChart, SpreadsheetChartKind, SpreadsheetDocument } from "@shared/spreadsheets";
import { buildSpreadsheetChartData, buildSpreadsheetPieData, buildSpreadsheetScatterData } from "@/lib/spreadsheetChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const seriesColors = ["#38bdf8", "#34d399", "#f59e0b", "#a78bfa", "#fb7185"];

export function SpreadsheetChartCard({ document, chart, onUpdate, onRemove }: {
  document: SpreadsheetDocument;
  chart: SpreadsheetChart;
  onUpdate: (patch: { title?: string; kind?: SpreadsheetChartKind }) => void;
  onRemove: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(chart.title);
  useEffect(() => setTitleDraft(chart.title), [chart.title]);
  const data = useMemo(() => buildSpreadsheetChartData(document, chart), [chart, document]);
  const plottedSeries = data.series.filter((series) => series.validCount > 0);
  const chartRows = data.rows.map((row) => ({ label: row.label, ...row.values }));
  const pieRows = buildSpreadsheetPieData(data).map((row, index) => ({ ...row, fill: seriesColors[index % seriesColors.length] }));
  const scatterSeries = data.series.slice(0, 2);
  const scatterRows = buildSpreadsheetScatterData(data);
  const comboBarSeries = data.series[0];
  const comboLineSeries = data.series.slice(1);
  const commitTitle = () => {
    const title = titleDraft.trim();
    if (!title) setTitleDraft(chart.title);
    else if (title !== chart.title) onUpdate({ title });
  };
  const common = <>
    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
    <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={18} />
    <YAxis width={56} />
    <Tooltip />
    <Legend />
  </>;
  const visual = chart.kind === "stacked_bar"
    ? <BarChart data={chartRows}>{common}{plottedSeries.map((series, index) => <Bar key={series.key} dataKey={series.key} name={series.name} fill={seriesColors[index % seriesColors.length]} stackId="source-series" />)}</BarChart>
    : chart.kind === "bar"
    ? <BarChart data={chartRows}>{common}{plottedSeries.map((series, index) => <Bar key={series.key} dataKey={series.key} name={series.name} fill={seriesColors[index % seriesColors.length]} />)}</BarChart>
    : chart.kind === "area"
      ? <AreaChart data={chartRows}>{common}{plottedSeries.map((series, index) => <Area key={series.key} type="monotone" dataKey={series.key} name={series.name} stroke={seriesColors[index % seriesColors.length]} fill={seriesColors[index % seriesColors.length]} fillOpacity={0.18} connectNulls={false} />)}</AreaChart>
      : chart.kind === "combo"
        ? <ComposedChart data={chartRows}>{common}{comboBarSeries?.validCount ? <Bar dataKey={comboBarSeries.key} name={`${comboBarSeries.name} (bar)`} fill={seriesColors[0]} /> : null}{comboLineSeries.filter((series) => series.validCount > 0).map((series, index) => <Line key={series.key} type="monotone" dataKey={series.key} name={`${series.name} (line)`} stroke={seriesColors[(index + 1) % seriesColors.length]} strokeWidth={2} connectNulls={false} dot={{ r: 3 }} />)}</ComposedChart>
      : chart.kind === "pie"
        ? <PieChart><Tooltip /><Legend /><Pie data={pieRows} dataKey="value" nameKey="label" outerRadius="80%" label>{pieRows.map((row) => <Cell key={row.key} fill={row.fill} />)}</Pie></PieChart>
        : chart.kind === "scatter"
          ? <ScatterChart><CartesianGrid strokeDasharray="3 3" opacity={0.25} /><XAxis type="number" dataKey="x" name={scatterSeries[0]?.name || "X"} /><YAxis type="number" dataKey="y" name={scatterSeries[1]?.name || "Y"} width={56} /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Legend /><Scatter name={`${scatterSeries[0]?.name || "X"} × ${scatterSeries[1]?.name || "Y"}`} data={scatterRows} fill={seriesColors[0]} /></ScatterChart>
          : <LineChart data={chartRows}>{common}{plottedSeries.map((series, index) => <Line key={series.key} type="monotone" dataKey={series.key} name={series.name} stroke={seriesColors[index % seriesColors.length]} strokeWidth={2} connectNulls={false} dot={{ r: 3 }} />)}</LineChart>;
  const renderableValueCount = chart.kind === "scatter" ? scatterRows.length : chart.kind === "pie" ? pieRows.length : data.numericValueCount;
  const missingDisclosure = chart.kind === "scatter"
    ? `${data.rows.length - scatterRows.length} observation${data.rows.length - scatterRows.length === 1 ? "" : "s"} without a complete numeric pair not plotted`
    : `${data.missingValueCount} blank, text, or error value${data.missingValueCount === 1 ? "" : "s"} not plotted`;

  return <article data-testid={`sheet-chart-${chart.id}`} data-chart-kind={chart.kind} data-source-range={data.sourceRange} className="rounded-xl border border-primary/15 bg-card/30 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Chart title" value={titleDraft} maxLength={120} onChange={(event) => setTitleDraft(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="min-w-52 flex-1 font-medium" />
      <Select value={chart.kind} onValueChange={(kind) => onUpdate({ kind: kind as SpreadsheetChartKind })}>
        <SelectTrigger aria-label="Chart type" className="w-36"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="line">Line</SelectItem><SelectItem value="bar">Bar</SelectItem><SelectItem value="stacked_bar">Stacked bar</SelectItem><SelectItem value="area">Area</SelectItem><SelectItem value="combo">Combination</SelectItem><SelectItem value="pie">Pie</SelectItem><SelectItem value="scatter">Scatter</SelectItem></SelectContent>
      </Select>
      <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remove chart ${chart.title}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Live view of {data.sheetName}!{data.sourceRange}. The first row names series, the first column labels observations, and source cells remain authoritative.</p>
    {renderableValueCount ? <div className="mt-3 h-[300px] w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {visual}
      </ResponsiveContainer>
    </div> : <p role="status" className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">This source range has no finite numeric values to plot yet. Text, blanks, and formula errors are kept visible in the data table as not recorded.</p>}
    <p className="mt-2 text-xs text-muted-foreground">{chart.kind === "scatter" ? `${scatterRows.length} complete numeric pair${scatterRows.length === 1 ? "" : "s"}` : `${renderableValueCount} numeric value${renderableValueCount === 1 ? "" : "s"}`} plotted · {missingDisclosure}. Missing values are never converted to zero.</p>
    {(chart.kind === "pie" || chart.kind === "scatter" || chart.kind === "stacked_bar" || chart.kind === "combo") && <p className="mt-1 text-xs text-muted-foreground">{chart.kind === "pie" ? "Pie charts require one label column and one value column." : chart.kind === "scatter" ? "Scatter charts require one label column followed by exactly two numeric series columns; only complete pairs become points." : chart.kind === "stacked_bar" ? "Stacked bars preserve source-column order and stack every recorded series on the same scale; missing segments stay missing." : "Combination charts use the first source series as bars and each subsequent series as lines on the same scale; source-column order defines these roles."}</p>}
    <details className="mt-3 rounded border border-primary/10 p-2">
      <summary className="cursor-pointer text-xs font-medium">Accessible chart data</summary>
      <div className="mt-2 overflow-auto"><table className="w-full min-w-[480px] text-left text-xs">
        <caption className="sr-only">{chart.title}, source {data.sheetName} {data.sourceRange}</caption>
        <thead><tr><th scope="col" className="border-b border-primary/15 p-2">Observation</th>{data.series.map((series) => <th scope="col" className="border-b border-primary/15 p-2" key={series.key}>{series.name}</th>)}</tr></thead>
        <tbody>{data.rows.map((row, rowIndex) => <tr key={`${row.label}-${rowIndex}`}><th scope="row" className="border-b border-primary/10 p-2 font-medium">{row.label}</th>{data.series.map((series) => <td className="border-b border-primary/10 p-2 tabular-nums" key={series.key}>{row.values[series.key] ?? <span className="text-muted-foreground">Not recorded</span>}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  </article>;
}
