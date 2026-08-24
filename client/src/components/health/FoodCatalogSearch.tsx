import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CatalogStatus = { available: boolean; reason: string | null; behavior: string };
type CatalogProvider = { id: string; name: string; datasetVersion: string; territories: string[]; attributionText: string; attributionUrl?: string | null };
type CatalogItem = { externalId: string; itemVersion: string; name: string; brand?: string | null; barcode?: string | null; territory: string; servingSizeGrams?: number | null; nutrients: Array<{ nutrientKey: string; amountPer100g: number; unit: string }>; lookupToken: string };
type CatalogResults = { provider: CatalogProvider; items: CatalogItem[]; nextCursor?: string | null };
type SelectedFood = { name: string; catalogProviderId: string | null; catalogDatasetVersion: string | null; catalogItemVersion: string | null; catalogAttributionText: string | null; catalogAttributionUrl: string | null; catalogSourceModified: boolean };

export default function FoodCatalogSearch({ onImported, selectedFood }: { onImported: (foodId: number) => void; selectedFood?: SelectedFood }) {
  const [query, setQuery] = useState("");
  const [territory, setTerritory] = useState("US");
  const [results, setResults] = useState<CatalogResults | null>(null);
  const status = useQuery<CatalogStatus>({ queryKey: ["/api/food-catalog/status"], queryFn: () => apiRequest("/api/food-catalog/status") });
  const search = useMutation({
    mutationFn: () => apiRequest<CatalogResults>(`/api/food-catalog/search?query=${encodeURIComponent(query)}&territory=${encodeURIComponent(territory)}&locale=en-US&limit=10`),
    onSuccess: setResults,
  });
  const save = useMutation({
    mutationFn: (lookupToken: string) => apiRequest<{ food: { id: number }; replayed: boolean }>("/api/nutrition/foods/catalog-import", { method: "POST", body: JSON.stringify({ lookupToken }) }),
    onSuccess: ({ food }) => onImported(food.id),
  });

  return <div className="rounded-xl border border-primary/15 bg-background/25 p-4" aria-labelledby="food-catalog-heading">
    <h3 id="food-catalog-heading" className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-primary" />Source-attributed food catalog</h3>
    <p className="mt-1 text-xs text-muted-foreground">Search the configured licensed provider. Results remain external until you explicitly save a private copy; provider and dataset attribution stay attached.</p>
    {selectedFood?.catalogProviderId ? <p className="mt-2 rounded-md border border-primary/15 p-2 text-[11px] text-muted-foreground">Selected private food “{selectedFood.name}” came from {selectedFood.catalogProviderId} dataset {selectedFood.catalogDatasetVersion}, item {selectedFood.catalogItemVersion}{selectedFood.catalogSourceModified ? "; its values were privately corrected after import" : ""}. {selectedFood.catalogAttributionUrl ? <a className="text-primary underline" href={selectedFood.catalogAttributionUrl} target="_blank" rel="noreferrer">Provider attribution</a> : selectedFood.catalogAttributionText}</p> : null}
    {status.data?.available ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
      <Input aria-label="Catalog food search" placeholder="Search foods or brands" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Input aria-label="Catalog territory" maxLength={16} value={territory} onChange={(event) => setTerritory(event.target.value.toUpperCase())} />
      <Button size="sm" disabled={query.trim().length < 2 || search.isPending} onClick={() => search.mutate()}><Search />Search</Button>
    </div> : <p className="mt-3 rounded-md border border-muted/20 p-2 text-xs text-muted-foreground">{status.data?.reason || "Checking catalog availability…"} Manual foods remain available.</p>}
    {search.error ? <p className="mt-2 text-xs text-destructive" role="alert">The catalog search could not be completed. No food was saved.</p> : null}
    {results ? <div className="mt-3 space-y-2">
      <p className="text-[11px] text-muted-foreground">{results.provider.name} · dataset {results.provider.datasetVersion} · {results.provider.attributionText}</p>
      {results.items.length ? results.items.map((item) => {
        const energy = item.nutrients.find((nutrient) => nutrient.nutrientKey === "energy_kcal");
        return <div key={`${item.externalId}:${item.itemVersion}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-muted/20 p-3">
          <div><p className="text-sm text-white">{item.name}{item.brand ? ` — ${item.brand}` : ""}</p><p className="text-[11px] text-muted-foreground">{item.territory} · {item.nutrients.length} known nutrient values{energy ? ` · ${energy.amountPer100g} kcal/100g` : " · energy unavailable"}{item.barcode ? ` · ${item.barcode}` : ""}</p></div>
          <Button size="sm" variant="outline" disabled={!energy || save.isPending} onClick={() => save.mutate(item.lookupToken)}>Save private copy</Button>
        </div>;
      }) : <p className="text-xs text-muted-foreground">No catalog result matched. Create a private food manually instead.</p>}
      {results.provider.attributionUrl ? <a className="text-[11px] text-primary underline" href={results.provider.attributionUrl} target="_blank" rel="noreferrer">Provider attribution</a> : null}
    </div> : null}
    {save.error ? <p className="mt-2 text-xs text-destructive" role="alert">That lookup expired or did not contain a compatible nutrient set. Search again; no private food was created.</p> : null}
  </div>;
}
