import { Suspense } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeferredFeatureChunkBoundary, useDeferredFeature } from "@/components/DeferredFeature";

const loadNutritionTrendChart = () => import("./NutritionTrendChart");

type NutritionTrendDay = {
  date: string;
  entries: number;
  energyKcal: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
};

type NutritionPeriodMetric = {
  recordedDays: number;
  totalRecorded: number | null;
  averagePerRecordedDay: number | null;
};

type NutritionPeriodSummary = {
  days: number;
  diaryDays: number;
  diaryEntries: number;
  energyKcal: NutritionPeriodMetric;
  proteinGrams: NutritionPeriodMetric;
  carbohydrateGrams: NutritionPeriodMetric;
  fatGrams: NutritionPeriodMetric;
};

type NutritionComparison = {
  periods: {
    current: { startDate: string; endDate: string };
    previous: { startDate: string; endDate: string };
  };
  current: NutritionPeriodSummary;
  previous: NutritionPeriodSummary;
};

type NutritionContribution = {
  nutrientKey: string;
  label: string;
  unit: string;
  total: number | null;
  recordedEntries: number;
  totalEntries: number;
  contributions: Array<{ foodId: number; foodName: string; amount: number; entryCount: number }>;
};

type Props = {
  trendDays: number;
  trends?: { trend: NutritionTrendDay[]; comparison: NutritionComparison; disclosure: string };
  contributions?: { totalEntries: number; nutrients: NutritionContribution[]; disclosure: string };
  contributionNutrient: string;
  reportDownloadError: boolean;
  onTrendDaysChange: (days: number) => void;
  onContributionNutrientChange: (nutrientKey: string) => void;
  onDownload: () => void;
};

function trendValueLabel(value: number | null, entries: number): number | string {
  return value === null ? (entries ? "Unknown" : "No diary records") : value;
}

export default function NutritionReportsPanel({
  trendDays,
  trends,
  contributions,
  contributionNutrient,
  reportDownloadError,
  onTrendDaysChange,
  onContributionNutrientChange,
  onDownload,
}: Props) {
  const { attempt: nutritionChartAttempt, Component: NutritionTrendChart, retry: retryNutritionChart } = useDeferredFeature(loadNutritionTrendChart);
  const selectedContribution = contributions?.nutrients.find((nutrient) => nutrient.nutrientKey === contributionNutrient);

  return (
    <>
      {trends ? <div className="mt-5 rounded-lg border border-primary/15 bg-background/20 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold">Recorded nutrition history</h3><p className="mt-1 text-xs text-muted-foreground">Gaps mean no recorded value, not zero intake.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Nutrition history period" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={trendDays} onChange={(event) => onTrendDaysChange(Number(event.target.value))}>{[7, 14, 30, 90, 365].map((days) => <option key={days} value={days}>{days === 365 ? "1 year" : `${days} days`}</option>)}</select>
            <Button size="sm" variant="outline" onClick={onDownload}><Download />Export CSV</Button>
          </div>
        </div>
        {trends.trend.some((day) => day.entries > 0) ? (
          <div className="mt-3 h-40" role="img" aria-label={`Recorded daily energy over ${trendDays} days`}>
            <DeferredFeatureChunkBoundary key={nutritionChartAttempt} fallback={<div className="flex h-full flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 p-3 text-center text-xs" role="alert"><p>Nutrition chart could not load. The accessible history table remains available below.</p><div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" onClick={retryNutritionChart}>Try chart again</Button><Button size="sm" variant="ghost" onClick={() => window.location.reload()}>Reload LyfeOS</Button></div></div>}><Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground" role="status">Loading nutrition chart…</div>}><NutritionTrendChart data={trends.trend} /></Suspense></DeferredFeatureChunkBoundary>
          </div>
        ) : <p className="mt-3 text-xs text-muted-foreground">No diary entries are recorded in this period.</p>}
        <details className="mt-3 rounded-md border border-muted/20 p-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">Compare with the immediately preceding period</summary>
          <p className="mt-2 text-[11px] text-muted-foreground">Side-by-side recorded evidence only. Averages divide by days with a recorded nutrient value, never by missing days.</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-xs"><caption className="sr-only">Current and preceding nutrition recording periods</caption><thead><tr><th className="p-2" scope="col">Measure</th><th className="p-2" scope="col">Current {trends.comparison.periods.current.startDate}–{trends.comparison.periods.current.endDate}</th><th className="p-2" scope="col">Previous {trends.comparison.periods.previous.startDate}–{trends.comparison.periods.previous.endDate}</th></tr></thead><tbody><tr className="border-t border-muted/10"><th className="p-2 font-normal" scope="row">Days with diary records</th><td className="p-2">{trends.comparison.current.diaryDays} of {trends.comparison.current.days}</td><td className="p-2">{trends.comparison.previous.diaryDays} of {trends.comparison.previous.days}</td></tr><tr className="border-t border-muted/10"><th className="p-2 font-normal" scope="row">Diary entries</th><td className="p-2">{trends.comparison.current.diaryEntries}</td><td className="p-2">{trends.comparison.previous.diaryEntries}</td></tr>{([['Energy', 'energyKcal', 'kcal'], ['Protein', 'proteinGrams', 'g'], ['Carbohydrate', 'carbohydrateGrams', 'g'], ['Fat', 'fatGrams', 'g']] as const).map(([label, key, unit]) => <tr className="border-t border-muted/10" key={key}><th className="p-2 font-normal" scope="row">{label} average per recorded day</th>{([trends.comparison.current[key], trends.comparison.previous[key]] as NutritionPeriodMetric[]).map((metric, index) => <td className="p-2" key={index}>{metric.averagePerRecordedDay === null ? "Unknown" : `${metric.averagePerRecordedDay} ${unit}`} <span className="text-muted-foreground">· {metric.recordedDays}/{trendDays} days covered</span></td>)}</tr>)}</tbody></table></div>
        </details>
        <details className="mt-3 rounded-md border border-muted/20 p-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">View accessible nutrition history table</summary>
          <div className="mt-2 max-h-64 overflow-auto"><table className="w-full min-w-[38rem] text-left text-xs"><caption className="sr-only">Recorded nutrition values by local calendar date</caption><thead><tr className="border-b border-muted/20"><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Diary entries</th><th scope="col" className="p-2">Energy (kcal)</th><th scope="col" className="p-2">Protein (g)</th><th scope="col" className="p-2">Carbohydrate (g)</th><th scope="col" className="p-2">Fat (g)</th></tr></thead><tbody>{trends.trend.map((day) => <tr key={day.date} className="border-b border-muted/10"><th scope="row" className="p-2 font-normal">{day.date}</th><td className="p-2">{day.entries}</td><td className="p-2">{trendValueLabel(day.energyKcal, day.entries)}</td><td className="p-2">{trendValueLabel(day.proteinGrams, day.entries)}</td><td className="p-2">{trendValueLabel(day.carbohydrateGrams, day.entries)}</td><td className="p-2">{trendValueLabel(day.fatGrams, day.entries)}</td></tr>)}</tbody></table></div>
        </details>
        <p className="mt-2 text-xs text-muted-foreground">{trends.disclosure}</p>
        {reportDownloadError ? <p className="mt-2 text-xs text-destructive" role="alert">Could not download the nutrition report.</p> : null}
      </div> : null}
      {contributions ? (
        <div className="mt-5 rounded-lg border border-primary/15 bg-background/20 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">Food contribution report</h3><p className="text-xs text-muted-foreground mt-1">Which logged foods supplied each recorded nutrient value.</p></div><select aria-label="Contribution nutrient" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={contributionNutrient} onChange={(event) => onContributionNutrientChange(event.target.value)}>{contributions.nutrients.map((nutrient) => <option key={nutrient.nutrientKey} value={nutrient.nutrientKey}>{nutrient.label}</option>)}</select></div>
          {selectedContribution ? <div className="mt-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-mono text-sm text-primary">{selectedContribution.total === null ? "Not recorded" : `${selectedContribution.total} ${selectedContribution.unit}`}</p><p className="text-xs text-muted-foreground">Coverage: {selectedContribution.recordedEntries} of {selectedContribution.totalEntries} diary entries</p></div>{selectedContribution.contributions.length ? <div className="mt-2 space-y-1">{selectedContribution.contributions.slice(0, 8).map((food) => <div key={food.foodId} className="flex items-center justify-between gap-3 rounded-md border border-muted/20 px-2 py-1.5 text-xs"><span>{food.foodName} <span className="text-muted-foreground">· {food.entryCount} {food.entryCount === 1 ? "entry" : "entries"}</span></span><span className="font-mono">{food.amount} {selectedContribution.unit}</span></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">{contributions.totalEntries ? "No recorded value for this nutrient in the selected period." : "No diary entries are recorded in this period."}</p>}</div> : null}
          <p className="mt-2 text-xs text-muted-foreground">{contributions.disclosure}</p>
        </div>
      ) : null}
    </>
  );
}
