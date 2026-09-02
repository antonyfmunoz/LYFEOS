import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Camera, Database, Pencil, ScanLine, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeDetectedLabelText } from "@/lib/on-device-label-ocr";

type IngredientPreference = { id: number; displayName: string; preferenceType: "avoid" | "limit" | "watch"; note: string | null };
type ScanItem = { id: number; rawName: string; classification: string; evidenceStrength: string; preference: IngredientPreference | null };
type IngredientScan = { id: number; captureMethod: "manual_label" | "photo_ocr" | "barcode"; productName: string | null; barcode: string | null; rawIngredientsText: string; revision: number; createdAt: string; items: ScanItem[]; catalogProviderId: string | null; catalogDatasetVersion: string | null; catalogAttributionText: string | null; catalogAttributionUrl: string | null; catalogSourceModified: boolean };
type CatalogStatus = { available: boolean; reason: string | null; providers?: Array<{ id: string; name: string }>; defaultProviderId?: string | null };
type CatalogCertification = { kind: "kosher"; status: "catalog_label_reported"; label: string };
type CatalogLookup = { provider: { name: string; datasetVersion: string; attributionText: string; attributionUrl?: string | null }; item: { name: string; brand?: string | null; barcode?: string | null; ingredientsText?: string | null; certifications: CatalogCertification[]; nutrients: Array<{ nutrientKey: string; amountPer100g: number; unit: string }>; lookupToken: string } | null; found: boolean; disclosure: string };
type CatalogImportCandidate = { name: string; hasEnergy: boolean; nutrientCount: number; certifications: CatalogCertification[] };
type FoodRecallLookup = { provider: { name: string; attributionUrl: string }; query: { productName: string; brand: string | null }; checkedAt: string; matches: Array<{ recallNumber: string; classification: string | null; status: string | null; productDescription: string; reasonForRecall: string | null; recallingFirm: string | null; distributionPattern: string | null; codeInfo: string | null; recallInitiationDate: string | null; reportDate: string | null; terminationDate: string | null; sourceUrl: string }>; disclosure: string };
type BrandOwnershipLookup = { provider: { name: string; datasetVersion: string }; requestedBrand: string; matched: boolean; profile: { brand: string; statusLabel: string; ownershipChain: Array<{ name: string; role: string }>; acquisition: { announcedOn: string | null; summary: string } | null; verifiedAsOf: string; evidence: Array<{ title: string; publisher: string; sourceType: string; sourceUrl: string; publishedAt: string | null; accessedAt: string; claim: string }> } | null; checkedAt: string; disclosure: string };

function recallDate(value: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(4, 6)}/${value.slice(6, 8)}/${value.slice(0, 4)}`;
}

export default function IngredientScanner({ onCatalogFoodImported, onManualFoodRequested }: { onCatalogFoodImported?: (foodId: number) => void; onManualFoodRequested?: (name: string) => void }) {
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [preferenceName, setPreferenceName] = useState("");
  const [preferenceType, setPreferenceType] = useState<IngredientPreference["preferenceType"]>("avoid");
  const [preferenceNote, setPreferenceNote] = useState("");
  const [cameraStatus, setCameraStatus] = useState("");
  const [editingScanId, setEditingScanId] = useState<number | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [catalogLookupToken, setCatalogLookupToken] = useState<string | null>(null);
  const [catalogImportCandidate, setCatalogImportCandidate] = useState<CatalogImportCandidate | null>(null);
  const [catalogProviderId, setCatalogProviderId] = useState("");
  const [catalogBrand, setCatalogBrand] = useState<string | null>(null);
  const [recallResult, setRecallResult] = useState<FoodRecallLookup | null>(null);
  const [ownershipResult, setOwnershipResult] = useState<BrandOwnershipLookup | null>(null);
  const [captureMethod, setCaptureMethod] = useState<"manual_label" | "photo_ocr">("manual_label");
  const cameraInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const scans = useQuery<{ scans: IngredientScan[]; disclosure: string }>({
    queryKey: ["/api/ingredient-scans"], queryFn: () => apiRequest("/api/ingredient-scans"),
  });
  const preferences = useQuery<{ preferences: IngredientPreference[]; disclosure: string }>({
    queryKey: ["/api/ingredient-preferences"], queryFn: () => apiRequest("/api/ingredient-preferences"),
  });
  const catalogStatus = useQuery<CatalogStatus>({ queryKey: ["/api/food-catalog/status"], queryFn: () => apiRequest("/api/food-catalog/status") });
  const recallStatus = useQuery<{ available: boolean; reason: string | null }>({ queryKey: ["/api/food-recalls/status"], queryFn: () => apiRequest("/api/food-recalls/status") });
  const ownershipStatus = useQuery<{ available: boolean; reason?: string | null }>({ queryKey: ["/api/brand-ownership/status"], queryFn: () => apiRequest("/api/brand-ownership/status") });
  const create = useMutation({
    mutationFn: () => apiRequest(editingScanId ? `/api/ingredient-scans/${editingScanId}` : "/api/ingredient-scans", {
      method: editingScanId ? "PATCH" : "POST", headers: editingScanId && editingRevision ? { "x-lyfeos-expected-revision": String(editingRevision) } : undefined,
      body: JSON.stringify({ captureMethod, productName: productName || null, barcode: barcode || null, rawIngredientsText: ingredients, catalogLookupToken: editingScanId ? undefined : catalogLookupToken || undefined }),
    }),
    onSuccess: () => {
      setProductName(""); setBarcode(""); setIngredients(""); setEditingScanId(null); setEditingRevision(null); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); setCaptureMethod("manual_label");
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] });
    },
  });
  const lookup = useMutation({
    mutationFn: () => apiRequest<{ scan: IngredientScan | null; source: string }>(`/api/ingredient-scans/lookup?barcode=${encodeURIComponent(barcode)}`),
    onSuccess: ({ scan }) => { if (scan) { setProductName(scan.productName || ""); setIngredients(scan.rawIngredientsText); setCaptureMethod(scan.captureMethod === "photo_ocr" ? "photo_ocr" : "manual_label"); setEditingScanId(scan.id); setEditingRevision(scan.revision); setCameraStatus("Loaded your most recently saved label for this barcode. Review it before using or correcting it."); } else setCameraStatus("This barcode is not in your private saved-label history."); },
  });
  const catalogLookup = useMutation({
    mutationFn: () => apiRequest<CatalogLookup>(`/api/food-catalog/barcodes/${encodeURIComponent(barcode)}${catalogProviderId || catalogStatus.data?.defaultProviderId ? `?providerId=${encodeURIComponent(catalogProviderId || catalogStatus.data?.defaultProviderId || "")}` : ""}`),
    onSuccess: ({ item, provider, disclosure }) => {
      if (!item) { setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); setCameraStatus(disclosure); return; }
      setProductName(item.name); setBarcode(item.barcode || barcode); setIngredients(item.ingredientsText || ""); setCatalogLookupToken(item.lookupToken); setCatalogBrand(item.brand || null); setRecallResult(null); setOwnershipResult(null);
      setCatalogImportCandidate({ name: item.name, hasEnergy: item.nutrients.some((nutrient) => nutrient.nutrientKey === "energy_kcal"), nutrientCount: item.nutrients.length, certifications: item.certifications });
      setEditingScanId(null); setEditingRevision(null);
      setCameraStatus(`${provider.name} dataset ${provider.datasetVersion}: ${disclosure}${item.ingredientsText ? "" : " The product has no ingredient label, so enter it manually."}`);
    },
  });
  const importCatalogFood = useMutation({
    mutationFn: () => {
      if (!catalogLookupToken) throw new Error("Search the catalog again before saving a private food.");
      return apiRequest<{ food: { id: number }; replayed: boolean }>("/api/nutrition/foods/catalog-import", { method: "POST", body: JSON.stringify({ lookupToken: catalogLookupToken }) });
    },
    onSuccess: ({ food, replayed }) => {
      setCatalogLookupToken(null); setCatalogImportCandidate(null);
      onCatalogFoodImported?.(food.id);
      setCameraStatus(replayed ? "That catalog food was already saved privately and is ready in Nutrition Diary." : "Saved a private food copy and opened it in Nutrition Diary.");
    },
  });
  const recallLookup = useMutation({
    mutationFn: () => apiRequest<FoodRecallLookup>("/api/food-recalls/lookup", { method: "POST", body: JSON.stringify({ productName, brand: catalogBrand }) }),
    onSuccess: (result) => setRecallResult(result),
  });
  const ownershipLookup = useMutation({
    mutationFn: () => apiRequest<BrandOwnershipLookup>("/api/brand-ownership/lookup", { method: "POST", body: JSON.stringify({ brand: catalogBrand }) }),
    onSuccess: (result) => setOwnershipResult(result),
  });
  const remove = useMutation({
    mutationFn: (id: number) => { const scan = scans.data?.scans.find((candidate) => candidate.id === id); if (!scan) throw new Error("Reload this saved label before deleting it."); return apiRequest(`/api/ingredient-scans/${id}`, { method: "DELETE", headers: { "x-lyfeos-expected-revision": String(scan.revision) } }); },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] }),
  });
  const savePreference = useMutation({
    mutationFn: () => apiRequest("/api/ingredient-preferences", { method: "POST", body: JSON.stringify({ displayName: preferenceName, preferenceType, note: preferenceNote.trim() || undefined }) }),
    onSuccess: () => {
      setPreferenceName("");
      setPreferenceNote("");
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-preferences"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] });
    },
  });
  const removePreference = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/ingredient-preferences/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-preferences"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] });
    },
  });
  const decodeBarcodeImage = async (file: File | undefined) => {
    if (!file) return;
    setCameraStatus("Reading barcode on this device…");
    const BarcodeDetectorApi = (globalThis as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorApi || typeof createImageBitmap !== "function") {
      setCameraStatus("Barcode reading is not supported by this browser. You can still enter the number manually.");
      if (cameraInput.current) cameraInput.current.value = "";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const detector = new BarcodeDetectorApi({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const results = await detector.detect(bitmap);
        const value = results[0]?.rawValue?.trim();
        if (value) { setBarcode(value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); setCameraStatus(`Barcode ${value} read. Search the configured catalog or your saved private labels.`); }
        else setCameraStatus("No barcode was found in that image. Try again in good light or enter the number manually.");
      } finally { bitmap.close(); }
    } catch {
      setCameraStatus("That image could not be read. Try again or enter the barcode manually.");
    } finally {
      if (cameraInput.current) cameraInput.current.value = "";
    }
  };
  const readLabelImage = async (file: File | undefined) => {
    if (!file) return;
    setCameraStatus("Reading label text on this device…");
    const TextDetectorApi = (globalThis as unknown as { TextDetector?: new () => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string; boundingBox?: { x: number; y: number } }>> } }).TextDetector;
    if (!TextDetectorApi || typeof createImageBitmap !== "function") {
      setCameraStatus("On-device label text reading is not supported by this browser. Paste or type the ingredient list manually; the photo was not uploaded.");
      if (labelInput.current) labelInput.current.value = "";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const detected = normalizeDetectedLabelText(await new TextDetectorApi().detect(bitmap));
        if (!detected.text) { setCameraStatus("No readable label text was found. Try a close, well-lit photo of the ingredient panel or enter it manually."); return; }
        setIngredients(detected.text); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCaptureMethod("photo_ocr");
        setCameraStatus(`Label text was read on-device${detected.truncated ? " and limited to 20,000 characters" : ""}. Review and correct it before saving; LyfeOS has not treated it as accurate yet.`);
      } finally { bitmap.close(); }
    } catch {
      setCameraStatus("That label photo could not be read on this device. Try again or enter the ingredient list manually.");
    } finally {
      if (labelInput.current) labelInput.current.value = "";
    }
  };
  const editScan = (scan: IngredientScan) => { setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); setEditingScanId(scan.id); setEditingRevision(scan.revision); setCaptureMethod(scan.captureMethod === "photo_ocr" ? "photo_ocr" : "manual_label"); setProductName(scan.productName || ""); setBarcode(scan.barcode || ""); setIngredients(scan.rawIngredientsText); };
  const cancelEdit = () => { setEditingScanId(null); setEditingRevision(null); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); setCaptureMethod("manual_label"); setProductName(""); setBarcode(""); setIngredients(""); };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="ingredient-review-heading">
    <div>
      <h2 id="ingredient-review-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><ScanLine className="h-5 w-5" />Ingredient review</h2>
      <p className="text-sm text-muted-foreground mt-1">Paste a package label to keep an exact, private ingredient record. Each item is shown as unclassified until LyfeOS has an evidence policy or a preference rule to apply.</p>
    </div>
    <div className="grid gap-2 mt-4 sm:grid-cols-2">
      <Input aria-label="Product name" placeholder="Product name (optional)" value={productName} onChange={(event) => { setProductName(event.target.value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); }} />
      <Input aria-label="Product barcode" placeholder="Barcode (optional)" value={barcode} onChange={(event) => { setBarcode(event.target.value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setRecallResult(null); setOwnershipResult(null); }} />
    </div>
    <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take a barcode photo" onChange={(event) => void decodeBarcodeImage(event.target.files?.[0])} />
    <input ref={labelInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take an ingredient label photo" onChange={(event) => void readLabelImage(event.target.files?.[0])} />
    <div className="mt-2 flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="outline" onClick={() => cameraInput.current?.click()}><Camera />Scan barcode with camera</Button><Button type="button" size="sm" variant="outline" onClick={() => labelInput.current?.click()}><ScanLine />Read label text on-device</Button><Button type="button" size="sm" variant="outline" disabled={!barcode.trim() || lookup.isPending} onClick={() => lookup.mutate()}><Search />Search my saved labels</Button><Button type="button" size="sm" variant="outline" disabled={!catalogStatus.data?.available || !/^\d{8,14}$/.test(barcode.trim()) || catalogLookup.isPending} onClick={() => catalogLookup.mutate()}><Database />Search product catalog</Button>{catalogImportCandidate ? <Button type="button" size="sm" disabled={!catalogImportCandidate.hasEnergy || importCatalogFood.isPending} onClick={() => importCatalogFood.mutate()}><Database />Save scanned food as private copy</Button> : null}{onManualFoodRequested ? <Button type="button" size="sm" variant="outline" onClick={() => onManualFoodRequested(productName.trim())}><Plus />Create nutrition food manually</Button> : null}{(catalogStatus.data?.providers?.length || 0) > 1 ? <label className="flex items-center gap-1 text-xs text-muted-foreground">Source<select aria-label="Ingredient scanner catalog source" className="h-8 rounded-md border border-input bg-background px-2 text-foreground" value={catalogProviderId || catalogStatus.data?.defaultProviderId || ""} onChange={(event) => { setCatalogProviderId(event.target.value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setRecallResult(null); setOwnershipResult(null); }}><option value="">Default source</option>{catalogStatus.data?.providers?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label> : null}{cameraStatus ? <p className="text-xs text-muted-foreground" role="status">{cameraStatus}</p> : null}</div>
    {catalogImportCandidate ? <div className="mt-2 space-y-1 text-xs text-muted-foreground"><p>{catalogImportCandidate.name} has {catalogImportCandidate.nutrientCount} source-attributed nutrient value{catalogImportCandidate.nutrientCount === 1 ? "" : "s"}. {catalogImportCandidate.hasEnergy ? "Save only if you want a private Nutrition Diary food copy." : "It cannot be saved as a diary food because the source did not provide energy."}</p>{catalogImportCandidate.certifications.some((certification) => certification.kind === "kosher") ? <p className="font-medium text-primary">Kosher: {catalogImportCandidate.certifications.find((certification) => certification.kind === "kosher")?.label}. Confirm the current package certification mark if this matters for your observance.</p> : <p>Kosher: not verified by the selected catalog. This is not a determination that the product is non-kosher.</p>}</div> : null}
    {!catalogStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{catalogStatus.data?.reason || "Checking catalog availability…"}</p> : null}
    <div className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-primary" />FDA food recall check</h3><p className="mt-1 text-xs text-muted-foreground">Checks the official FDA Food Enforcement Reports feed against product-description text. It does not save the search or make a safety determination.</p></div><Button type="button" size="sm" variant="outline" disabled={!recallStatus.data?.available || productName.trim().length < 2 || recallLookup.isPending} onClick={() => recallLookup.mutate()}><ShieldAlert />{recallLookup.isPending ? "Checking…" : "Check FDA recalls"}</Button></div>
      {!recallStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{recallStatus.data?.reason || "Checking recall availability…"}</p> : null}
      {recallLookup.error ? <p className="mt-2 text-xs text-destructive">The FDA recall check could not be completed. Try again shortly.</p> : null}
      {recallResult ? <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">Checked {new Date(recallResult.checkedAt).toLocaleString()} · <a className="text-primary underline" href={recallResult.provider.attributionUrl} target="_blank" rel="noreferrer">{recallResult.provider.name}</a></p>{recallResult.matches.length === 0 ? <p className="text-sm text-muted-foreground">No possible product-description matches returned.</p> : recallResult.matches.map((match) => <article key={match.recallNumber} className="rounded-md border border-destructive/25 bg-background/25 p-3"><div className="flex flex-wrap items-center gap-2"><a className="text-sm font-medium text-primary underline" href={match.sourceUrl} target="_blank" rel="noreferrer">FDA recall {match.recallNumber}</a>{match.classification ? <span className="rounded border border-destructive/30 px-1.5 py-0.5 text-[11px]">{match.classification}</span> : null}{match.status ? <span className="text-[11px] text-muted-foreground">{match.status}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{match.productDescription}</p>{match.reasonForRecall ? <p className="mt-2 text-xs"><span className="font-medium">Reason:</span> {match.reasonForRecall}</p> : null}{match.codeInfo ? <p className="mt-1 text-xs"><span className="font-medium">Package / lot:</span> {match.codeInfo}</p> : null}<p className="mt-1 text-[11px] text-muted-foreground">{[match.recallingFirm, match.distributionPattern, recallDate(match.recallInitiationDate) ? `initiated ${recallDate(match.recallInitiationDate)}` : null].filter(Boolean).join(" · ")}</p></article>)}<p className="text-xs text-muted-foreground">{recallResult.disclosure}</p></div> : null}
    </div>
    <div className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" />Brand ownership</h3><p className="mt-1 text-xs text-muted-foreground">Shows a source-linked ownership chain only for an exact registered brand. No match is intentionally shown as unknown.</p></div><Button type="button" size="sm" variant="outline" disabled={!ownershipStatus.data?.available || !catalogBrand?.trim() || ownershipLookup.isPending} onClick={() => ownershipLookup.mutate()}><Building2 />{ownershipLookup.isPending ? "Checking…" : "Check brand ownership"}</Button></div>
      <Input className="mt-3" aria-label="Brand ownership lookup" placeholder="Brand name (catalog fills this when available)" value={catalogBrand || ""} onChange={(event) => { setCatalogBrand(event.target.value || null); setOwnershipResult(null); }} />
      {!ownershipStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{ownershipStatus.data?.reason || "Checking ownership availability…"}</p> : null}
      {ownershipLookup.error ? <p className="mt-2 text-xs text-destructive">The ownership lookup could not be completed. Check the brand name and try again.</p> : null}
      {ownershipResult ? <div className="mt-3 space-y-2">{ownershipResult.profile ? <><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{ownershipResult.profile.brand}</p><span className="rounded border border-primary/25 px-1.5 py-0.5 text-[11px] text-primary">{ownershipResult.profile.statusLabel}</span></div><p className="text-xs text-muted-foreground">{ownershipResult.profile.ownershipChain.map((entry) => entry.name).join(" → ")} · verified {ownershipResult.profile.verifiedAsOf}</p>{ownershipResult.profile.acquisition ? <p className="text-xs"><span className="font-medium">Ownership history:</span> {ownershipResult.profile.acquisition.summary}</p> : null}<div className="space-y-1">{ownershipResult.profile.evidence.map((evidence) => <p key={evidence.sourceUrl} className="text-xs text-muted-foreground"><a className="text-primary underline" href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.title}</a> · {evidence.publisher} · {evidence.claim}</p>)}</div></> : <p className="text-sm text-muted-foreground">No verified ownership profile is registered for “{ownershipResult.requestedBrand}.”</p>}<p className="text-xs text-muted-foreground">{ownershipResult.disclosure}</p></div> : null}
    </div>
    <Textarea aria-label="Ingredient label" className="mt-2" placeholder="Ingredients: water, oats, cane sugar, natural flavor (vanilla extract, salt)" value={ingredients} onChange={(event) => { setIngredients(event.target.value); if (catalogLookupToken) setCaptureMethod("manual_label"); setCatalogLookupToken(null); setCatalogImportCandidate(null); }} />
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!ingredients.trim() || create.isPending} onClick={() => create.mutate()}>{editingScanId ? <Pencil /> : <Plus />}{editingScanId ? "Save label correction" : "Review label"}</Button>{editingScanId ? <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel correction</Button> : null}
      <p className="text-xs text-muted-foreground">Barcode and supported-browser text detection run on-device; photos are not uploaded. OCR text is only an editable draft until you review and save it. Catalog labels stay external until explicit save.</p>
    </div>
    {create.error && <p className="text-xs text-destructive mt-2">Could not review that label. Check the label text and barcode, then try again.</p>}
    <div className="mt-5 rounded-lg border border-primary/15 bg-background/20 p-3">
      <h3 className="text-sm font-semibold">Your ingredient preferences</h3>
      <p className="mt-1 text-xs text-muted-foreground">Choose what you personally want to avoid, limit, or watch, and optionally preserve why. Matches label terms only; it is not allergy or medical guidance.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem_auto]"><Input aria-label="Ingredient preference" placeholder="e.g. artificial color" value={preferenceName} onChange={(event) => setPreferenceName(event.target.value)} /><select aria-label="Ingredient preference type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={preferenceType} onChange={(event) => setPreferenceType(event.target.value as IngredientPreference["preferenceType"])}><option value="avoid">Avoid</option><option value="limit">Limit</option><option value="watch">Watch</option></select><Button size="sm" disabled={!preferenceName.trim() || savePreference.isPending} onClick={() => savePreference.mutate()}><Plus />Save rule</Button></div>
      <Input className="mt-2" aria-label="Ingredient preference note" placeholder="Optional reason or context for this personal rule" maxLength={500} value={preferenceNote} onChange={(event) => setPreferenceNote(event.target.value)} />
      {savePreference.error && <p className="text-xs text-destructive mt-2">Could not save that preference.</p>}
      {preferences.data?.preferences.length ? <div className="mt-3 flex flex-wrap gap-2">{preferences.data.preferences.map((preference) => <span key={preference.id} className="inline-flex items-center gap-1 rounded-md border border-muted/30 px-2 py-1 text-xs"><span className="text-primary">{preference.preferenceType}</span> {preference.displayName}{preference.note ? <span className="text-muted-foreground"> · {preference.note}</span> : null}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${preference.displayName} preference`} disabled={removePreference.isPending} onClick={() => removePreference.mutate(preference.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}
    </div>
    {scans.data?.scans.length ? <div className="mt-5 space-y-3">
      {scans.data.scans.map((scan) => <article key={scan.id} className="rounded-lg border border-muted/30 bg-background/20 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{scan.productName || "Unnamed product"}</p><p className="text-xs text-muted-foreground">{new Date(scan.createdAt).toLocaleDateString()}{scan.barcode ? ` · barcode ${scan.barcode}` : ""} · {scan.items.length} parsed ingredients · revision {scan.revision}</p>{scan.catalogProviderId ? <p className="mt-1 text-[11px] text-muted-foreground">Source: {scan.catalogProviderId} dataset {scan.catalogDatasetVersion}{scan.catalogSourceModified ? " · privately corrected after import" : ""}{scan.catalogAttributionUrl ? <> · <a className="text-primary underline" href={scan.catalogAttributionUrl} target="_blank" rel="noreferrer">attribution</a></> : scan.catalogAttributionText ? ` · ${scan.catalogAttributionText}` : ""}</p> : null}</div><div className="flex"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Correct ingredient review for ${scan.productName || "unnamed product"}`} onClick={() => editScan(scan)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ingredient review for ${scan.productName || "unnamed product"}`} disabled={remove.isPending} onClick={() => remove.mutate(scan.id)}><Trash2 className="h-4 w-4" /></Button></div></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{scan.items.map((item) => <span key={item.id} title={item.preference ? `Matches your ${item.preference.preferenceType} preference${item.preference.note ? `: ${item.preference.note}` : ""}` : "No universal harmfulness or safety conclusion has been assigned"} className="rounded-md border border-muted/30 px-2 py-1 text-xs text-muted-foreground">{item.rawName} <span className="text-primary/80">· {item.preference ? `your ${item.preference.preferenceType} rule` : "unclassified"}</span>{item.preference?.note ? <span> · {item.preference.note}</span> : null}</span>)}</div>
      </article>)}
    </div> : null}
    {scans.data?.disclosure && <p className="mt-4 text-xs text-muted-foreground">{scans.data.disclosure}</p>}
  </section>;
}
