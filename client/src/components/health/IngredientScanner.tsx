import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Camera, Database, Pencil, ScanLine, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeDetectedLabelText } from "@/lib/on-device-label-ocr";
import { inspectKosherPackageText, type KosherPackageCheck } from "@/lib/kosher-package-check";

type IngredientPreference = { id: number; displayName: string; preferenceType: "avoid" | "limit" | "watch"; note: string | null };
type ScanItem = { id: number; rawName: string; classification: string; reason: string | null; evidenceTitle: string | null; evidenceUrl: string | null; evidenceStrength: string; preference: IngredientPreference | null };
type IngredientScan = { id: number; captureMethod: "manual_label" | "photo_ocr" | "barcode"; productName: string | null; barcode: string | null; rawIngredientsText: string; revision: number; createdAt: string; items: ScanItem[]; catalogProviderId: string | null; catalogDatasetVersion: string | null; catalogAttributionText: string | null; catalogAttributionUrl: string | null; catalogSourceModified: boolean };
type CatalogStatus = { available: boolean; reason: string | null; providers?: Array<{ id: string; name: string }>; defaultProviderId?: string | null };
type CatalogCertification = { kind: "kosher"; status: "catalog_label_reported"; label: string };
type CatalogEvidence = { sourceKind: "community_catalog" | "government_branded_database" | "government_reference_database" | "provider_classification_unavailable"; measurementBasis: "catalog_or_label_reported" | "government_reference" | "provider_basis_unavailable"; recordUpdatedAt: string | null; reportedNutrientCount: number; reportedCoreNutrientKeys: string[] };
type CatalogLookup = { provider: { id: string; name: string; datasetVersion: string; attributionText: string; attributionUrl?: string | null }; item: { externalId: string; itemVersion: string; territory: string; name: string; brand?: string | null; barcode?: string | null; ingredientsText?: string | null; certifications: CatalogCertification[]; nutrients: Array<{ nutrientKey: string; amountPer100g: number; unit: string }>; evidence: CatalogEvidence; lookupToken: string } | null; found: boolean; disclosure: string };
type CatalogImportCandidate = { name: string; hasEnergy: boolean; nutrientCount: number; certifications: CatalogCertification[]; evidence: CatalogEvidence };
type CatalogIdentity = { providerId: string; externalId: string; itemVersion: string; barcode: string };
type FoodPackageConfirmation = { id: number; barcode: string; productName: string; catalogProviderId: string; catalogExternalId: string; catalogItemVersion: string; markKey: string; markLabel: string; confirmationMethod: string; confirmedAt: string };
type FoodRecallLookup = { provider: { name: string; attributionUrl: string }; query: { productName: string; brand: string | null; packageCode: string | null }; checkedAt: string; matches: Array<{ recallNumber: string; classification: string | null; status: string | null; productDescription: string; reasonForRecall: string | null; recallingFirm: string | null; distributionPattern: string | null; codeInfo: string | null; packageCodeTextMatch: boolean; recallInitiationDate: string | null; reportDate: string | null; terminationDate: string | null; sourceUrl: string }>; disclosure: string };
type BrandOwnershipLookup = { provider: { name: string; datasetVersion: string }; requestedBrand: string; matched: boolean; profile: { brand: string; statusLabel: string; ownershipChain: Array<{ name: string; role: string }>; acquisition: { announcedOn: string | null; summary: string } | null; verifiedAsOf: string; evidence: Array<{ title: string; publisher: string; sourceType: string; sourceUrl: string; publishedAt: string | null; accessedAt: string; claim: string }> } | null; checkedAt: string; disclosure: string };
type FoodReviewPreferences = { kosherPackageConfirmation: boolean };

function recallDate(value: string | null): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  return `${value.slice(4, 6)}/${value.slice(6, 8)}/${value.slice(0, 4)}`;
}

function catalogEvidenceLabel(evidence: CatalogEvidence): string {
  if (evidence.sourceKind === "community_catalog") return "Community catalog record";
  if (evidence.sourceKind === "government_branded_database") return "Government branded-food record";
  if (evidence.sourceKind === "government_reference_database") return "Government reference-food record";
  return "Provider classification unavailable";
}

function ingredientClassificationLabel(classification: string): string {
  const labels: Record<string, string> = {
    declared_color_additive: "declared color additive",
    declared_sulfiting_agent: "declared sulfiting agent",
    declared_non_nutritive_sweetener: "declared non-nutritive sweetener",
    declared_caffeine_source: "declared caffeine source",
    declared_partially_hydrogenated_oil: "declared partially hydrogenated oil",
  };
  return labels[classification] || "unclassified";
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
  const [catalogIdentity, setCatalogIdentity] = useState<CatalogIdentity | null>(null);
  const [recallResult, setRecallResult] = useState<FoodRecallLookup | null>(null);
  const [recallPackageCode, setRecallPackageCode] = useState("");
  const [ownershipResult, setOwnershipResult] = useState<BrandOwnershipLookup | null>(null);
  const [kosherPackageCheck, setKosherPackageCheck] = useState<KosherPackageCheck | null>(null);
  const [captureMethod, setCaptureMethod] = useState<"manual_label" | "photo_ocr">("manual_label");
  const cameraInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const kosherPackageInput = useRef<HTMLInputElement>(null);
  const scans = useQuery<{ scans: IngredientScan[]; disclosure: string }>({
    queryKey: ["/api/ingredient-scans"], queryFn: () => apiRequest("/api/ingredient-scans"),
  });
  const preferences = useQuery<{ preferences: IngredientPreference[]; disclosure: string }>({
    queryKey: ["/api/ingredient-preferences"], queryFn: () => apiRequest("/api/ingredient-preferences"),
  });
  const foodReviewPreferences = useQuery<{ preferences: FoodReviewPreferences; disclosure: string }>({
    queryKey: ["/api/food-review-preferences"], queryFn: () => apiRequest("/api/food-review-preferences"),
  });
  const packageConfirmations = useQuery<{ confirmations: FoodPackageConfirmation[]; disclosure: string }>({
    queryKey: ["/api/food-package-confirmations", barcode],
    queryFn: () => apiRequest(`/api/food-package-confirmations?barcode=${encodeURIComponent(barcode)}`),
    enabled: /^\d{8,14}$/.test(barcode.trim()),
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
      setProductName(""); setBarcode(""); setIngredients(""); setEditingScanId(null); setEditingRevision(null); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); setCaptureMethod("manual_label");
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
      if (!item) { setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); setCameraStatus(disclosure); return; }
      setProductName(item.name); setBarcode(item.barcode || barcode); setIngredients(item.ingredientsText || ""); setCatalogLookupToken(item.lookupToken); setCatalogBrand(item.brand || null); setRecallResult(null); setOwnershipResult(null);
      setCatalogIdentity(item.barcode ? { providerId: provider.id, externalId: item.externalId, itemVersion: item.itemVersion, barcode: item.barcode } : null);
      setCatalogImportCandidate({ name: item.name, hasEnergy: item.nutrients.some((nutrient) => nutrient.nutrientKey === "energy_kcal"), nutrientCount: item.nutrients.length, certifications: item.certifications, evidence: item.evidence });
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
      setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogIdentity(null);
      onCatalogFoodImported?.(food.id);
      setCameraStatus(replayed ? "That catalog food was already saved privately and is ready in Nutrition Diary." : "Saved a private food copy and opened it in Nutrition Diary.");
    },
  });
  const recallLookup = useMutation({
    mutationFn: () => apiRequest<FoodRecallLookup>("/api/food-recalls/lookup", { method: "POST", body: JSON.stringify({ productName, brand: catalogBrand, packageCode: recallPackageCode.trim().length >= 3 ? recallPackageCode.trim() : null }) }),
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
  const saveFoodReviewPreferences = useMutation({
    mutationFn: (kosherPackageConfirmation: boolean) => apiRequest<{ preferences: FoodReviewPreferences }>("/api/food-review-preferences", { method: "PUT", body: JSON.stringify({ kosherPackageConfirmation }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/food-review-preferences"] }),
  });
  const savePackageConfirmation = useMutation({
    mutationFn: ({ markKey, markLabel, confirmationMethod }: { markKey: "ou" | "star_k" | "kof_k" | "generic_kosher" | "other_printed_mark"; markLabel: string; confirmationMethod: "visual_package_review" | "ocr_hint_then_visual_review" }) => {
      if (!catalogLookupToken) throw new Error("Look up the product again before confirming the current package.");
      return apiRequest<{ confirmation: FoodPackageConfirmation }>("/api/food-package-confirmations", { method: "POST", body: JSON.stringify({ catalogLookupToken, kind: "kosher_package_mark", markKey, markLabel, confirmationMethod }) });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/food-package-confirmations"] }),
  });
  const removePackageConfirmation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/food-package-confirmations/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/food-package-confirmations"] }),
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
        if (value) { setBarcode(value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); setCameraStatus(`Barcode ${value} read. Search the configured catalog or your saved private labels.`); }
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
        setIngredients(detected.text); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogIdentity(null); setCaptureMethod("photo_ocr");
        setCameraStatus(`Label text was read on-device${detected.truncated ? " and limited to 20,000 characters" : ""}. Review and correct it before saving; LyfeOS has not treated it as accurate yet.`);
      } finally { bitmap.close(); }
    } catch {
      setCameraStatus("That label photo could not be read on this device. Try again or enter the ingredient list manually.");
    } finally {
      if (labelInput.current) labelInput.current.value = "";
    }
  };
  const readKosherPackageImage = async (file: File | undefined) => {
    if (!file) return;
    setCameraStatus("Reading the package mark on this device…");
    const TextDetectorApi = (globalThis as unknown as { TextDetector?: new () => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string; boundingBox?: { x: number; y: number } }>> } }).TextDetector;
    if (!TextDetectorApi || typeof createImageBitmap !== "function") {
      setCameraStatus("On-device package-mark reading is not available in this browser. Check the printed package mark directly; the photo was not uploaded.");
      if (kosherPackageInput.current) kosherPackageInput.current.value = "";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const detected = normalizeDetectedLabelText(await new TextDetectorApi().detect(bitmap));
        setKosherPackageCheck(inspectKosherPackageText(detected.text));
        setCameraStatus(detected.text ? "Package text was read on-device. Review the possible mark below against the actual package." : "No readable package text was found. Check the printed certification mark directly.");
      } finally { bitmap.close(); }
    } catch {
      setCameraStatus("That package image could not be read on this device. Check the printed certification mark directly.");
    } finally { if (kosherPackageInput.current) kosherPackageInput.current.value = ""; }
  };
  const editScan = (scan: IngredientScan) => { setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); setEditingScanId(scan.id); setEditingRevision(scan.revision); setCaptureMethod(scan.captureMethod === "photo_ocr" ? "photo_ocr" : "manual_label"); setProductName(scan.productName || ""); setBarcode(scan.barcode || ""); setIngredients(scan.rawIngredientsText); };
  const cancelEdit = () => { setEditingScanId(null); setEditingRevision(null); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); setCaptureMethod("manual_label"); setProductName(""); setBarcode(""); setIngredients(""); };
  const kosherPackageMarkOptions = kosherPackageCheck?.matches?.length
    ? kosherPackageCheck.matches.map((match) => ({ key: match.key, label: match.label, method: "ocr_hint_then_visual_review" as const }))
    : [{ key: "other_printed_mark" as const, label: "Other printed certification mark", method: "visual_package_review" as const }];

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="ingredient-review-heading">
    <div>
      <h2 id="ingredient-review-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><ScanLine className="h-5 w-5" />Ingredient review</h2>
      <p className="text-sm text-muted-foreground mt-1">Paste a package label to keep an exact, private ingredient record. Each item is shown as unclassified until LyfeOS has an evidence policy or a preference rule to apply.</p>
    </div>
    <div className="grid gap-2 mt-4 sm:grid-cols-2">
      <Input aria-label="Product name" placeholder="Product name (optional)" value={productName} onChange={(event) => { setProductName(event.target.value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); }} />
      <Input aria-label="Product barcode" placeholder="Barcode (optional)" value={barcode} onChange={(event) => { setBarcode(event.target.value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogBrand(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); }} />
    </div>
    <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take a barcode photo" onChange={(event) => void decodeBarcodeImage(event.target.files?.[0])} />
    <input ref={labelInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take an ingredient label photo" onChange={(event) => void readLabelImage(event.target.files?.[0])} />
    <input ref={kosherPackageInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take a photo of a kosher certification mark" onChange={(event) => void readKosherPackageImage(event.target.files?.[0])} />
    <div className="mt-2 flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="outline" onClick={() => cameraInput.current?.click()}><Camera />Scan barcode with camera</Button><Button type="button" size="sm" variant="outline" onClick={() => labelInput.current?.click()}><ScanLine />Read label text on-device</Button><Button type="button" size="sm" variant="outline" disabled={!barcode.trim() || lookup.isPending} onClick={() => lookup.mutate()}><Search />Search my saved labels</Button><Button type="button" size="sm" variant="outline" disabled={!catalogStatus.data?.available || !/^\d{8,14}$/.test(barcode.trim()) || catalogLookup.isPending} onClick={() => catalogLookup.mutate()}><Database />Search product catalog</Button>{catalogImportCandidate ? <Button type="button" size="sm" disabled={!catalogImportCandidate.hasEnergy || importCatalogFood.isPending} onClick={() => importCatalogFood.mutate()}><Database />Save scanned food as private copy</Button> : null}{onManualFoodRequested ? <Button type="button" size="sm" variant="outline" onClick={() => onManualFoodRequested(productName.trim())}><Plus />Create nutrition food manually</Button> : null}{(catalogStatus.data?.providers?.length || 0) > 1 ? <label className="flex items-center gap-1 text-xs text-muted-foreground">Source<select aria-label="Ingredient scanner catalog source" className="h-8 rounded-md border border-input bg-background px-2 text-foreground" value={catalogProviderId || catalogStatus.data?.defaultProviderId || ""} onChange={(event) => { setCatalogProviderId(event.target.value); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogIdentity(null); setRecallResult(null); setOwnershipResult(null); }}><option value="">Default source</option>{catalogStatus.data?.providers?.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label> : null}{cameraStatus ? <p className="text-xs text-muted-foreground" role="status">{cameraStatus}</p> : null}</div>
    {catalogImportCandidate ? <div className="mt-2 space-y-1 text-xs text-muted-foreground"><p>{catalogImportCandidate.name} has {catalogImportCandidate.nutrientCount} source-attributed nutrient value{catalogImportCandidate.nutrientCount === 1 ? "" : "s"}. {catalogImportCandidate.hasEnergy ? "Save only if you want a private Nutrition Diary food copy." : "It cannot be saved as a diary food because the source did not provide energy."}</p><p><span className="font-medium text-foreground">Evidence:</span> {catalogEvidenceLabel(catalogImportCandidate.evidence)} · {catalogImportCandidate.evidence.measurementBasis === "government_reference" ? "government reference basis" : catalogImportCandidate.evidence.measurementBasis === "catalog_or_label_reported" ? "catalog or label-reported basis" : "measurement basis unavailable"} · {catalogImportCandidate.evidence.reportedCoreNutrientKeys.length}/8 core nutrients reported{catalogImportCandidate.evidence.recordUpdatedAt ? ` · record updated ${new Date(catalogImportCandidate.evidence.recordUpdatedAt).toLocaleDateString()}` : " · record update date unavailable"}. Coverage and provenance are not proof that this package or every nutrient value is accurate.</p>{catalogImportCandidate.certifications.some((certification) => certification.kind === "kosher") ? <p className="font-medium text-primary">Kosher: {catalogImportCandidate.certifications.find((certification) => certification.kind === "kosher")?.label}. {foodReviewPreferences.data?.preferences.kosherPackageConfirmation ? "Your standard requires confirmation of the current printed package mark." : "Confirm the current package certification mark if this matters for your observance."}</p> : <p>Kosher: not verified by the selected catalog. This is not a determination that the product is non-kosher.</p>}</div> : null}
    {!catalogStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{catalogStatus.data?.reason || "Checking catalog availability…"}</p> : null}
    {catalogLookupToken && catalogIdentity ? <div className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3"><h3 className="text-sm font-semibold">Save a package-review record</h3><p className="mt-1 text-xs text-muted-foreground">After visually checking the mark on this exact package, save what you confirmed. The image and OCR text stay on your device; LyfeOS stores only your private confirmation, product identity, catalog version, and date.</p><div className="mt-3 flex flex-wrap gap-2">{kosherPackageMarkOptions.map((option) => <Button key={option.key} type="button" size="sm" variant="outline" disabled={savePackageConfirmation.isPending} onClick={() => savePackageConfirmation.mutate({ markKey: option.key, markLabel: option.label, confirmationMethod: option.method })}>{savePackageConfirmation.isPending ? "Saving…" : `I visually confirmed: ${option.label.replace(/^Possible /, "")}`}</Button>)}</div>{savePackageConfirmation.error ? <p className="mt-2 text-xs text-destructive">Could not save this package-review record. Search the catalog again and make sure the barcode is from the package you reviewed.</p> : null}{packageConfirmations.data?.confirmations.length ? <div className="mt-3 space-y-1"><p className="text-[11px] text-muted-foreground">Your confirmations for barcode {catalogIdentity.barcode}:</p>{packageConfirmations.data.confirmations.map((confirmation) => { const sameCatalogProduct = confirmation.catalogProviderId === catalogIdentity.providerId && confirmation.catalogExternalId === catalogIdentity.externalId; const currentVersion = sameCatalogProduct && confirmation.catalogItemVersion === catalogIdentity.itemVersion; return <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-muted/20 px-2 py-2 text-xs" key={confirmation.id}><span>{confirmation.markLabel} · visually confirmed {new Date(confirmation.confirmedAt).toLocaleDateString()} · {currentVersion ? "catalog version still matches" : sameCatalogProduct ? "catalog version changed—review again" : "different catalog product—review identity"}</span><Button type="button" size="sm" variant="ghost" disabled={removePackageConfirmation.isPending} onClick={() => removePackageConfirmation.mutate(confirmation.id)}><Trash2 />Remove</Button></div>; })}</div> : null}<p className="mt-3 text-[11px] text-muted-foreground">This is not a kosher certification or a substitute for your observance authority. A catalog change, reformulation, or different package means review again.</p></div> : <p className="mt-3 text-xs text-muted-foreground">To save a durable package review, search the configured catalog using the printed barcode first. LyfeOS will not attach a confirmation to an unverified product identity.</p>}
    <div className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Confirm a kosher mark on the package</h3><p className="mt-1 text-xs text-muted-foreground">Look for a certification mark printed on this exact package, not a shelf tag or an old online listing. A plain OU is a common example; OU-D and OU-P carry different qualifiers.</p></div><Button type="button" size="sm" variant="outline" onClick={() => kosherPackageInput.current?.click()}><Camera />Read package mark on-device</Button></div><label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-primary/15 p-2 text-xs text-muted-foreground"><Checkbox aria-label="Require package confirmation for kosher review" checked={foodReviewPreferences.data?.preferences.kosherPackageConfirmation ?? false} disabled={foodReviewPreferences.isLoading || saveFoodReviewPreferences.isPending} onCheckedChange={(checked) => saveFoodReviewPreferences.mutate(checked === true)} className="mt-0.5" /><span><span className="font-medium text-foreground">My kosher standard requires package confirmation.</span> LyfeOS will carry this requirement into catalog and replacement results; a source-reported label remains a lead until you confirm the printed mark.</span></label>{saveFoodReviewPreferences.error ? <p className="mt-2 text-xs text-destructive">Could not save your food-review standard.</p> : null}{kosherPackageCheck ? <div className="mt-3 text-xs text-muted-foreground">{kosherPackageCheck.matches.length ? <div className="flex flex-wrap gap-1.5">{kosherPackageCheck.matches.map((match) => <span key={match.key} className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-primary">{match.label}</span>)}</div> : null}<p className="mt-2">{kosherPackageCheck.disclosure}</p></div> : null}<a className="mt-3 inline-block text-xs text-primary underline" href="https://oukosher.org/blog/consumer-kosher/eight-points-to-remember-when-looking-for-the-kosher-symbol/" target="_blank" rel="noreferrer">How to verify an OU mark on a package</a></div>
    <div className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-primary" />FDA food recall check</h3><p className="mt-1 text-xs text-muted-foreground">Checks the official FDA Food Enforcement Reports feed against product-description text. It does not save the search or make a safety determination.</p></div><Button type="button" size="sm" variant="outline" disabled={!recallStatus.data?.available || productName.trim().length < 2 || recallLookup.isPending} onClick={() => recallLookup.mutate()}><ShieldAlert />{recallLookup.isPending ? "Checking…" : "Check FDA recalls"}</Button></div><Input aria-label="Package or lot code for FDA recall check" className="mt-3" value={recallPackageCode} onChange={(event) => { setRecallPackageCode(event.target.value); setRecallResult(null); }} placeholder="Package or lot code (optional—compare against FDA result)" />
      {!recallStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{recallStatus.data?.reason || "Checking recall availability…"}</p> : null}
      {recallLookup.error ? <p className="mt-2 text-xs text-destructive">The FDA recall check could not be completed. Try again shortly.</p> : null}
      {recallResult ? <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">Checked {new Date(recallResult.checkedAt).toLocaleString()} · <a className="text-primary underline" href={recallResult.provider.attributionUrl} target="_blank" rel="noreferrer">{recallResult.provider.name}</a></p>{recallResult.matches.length === 0 ? <p className="text-sm text-muted-foreground">No possible product-description matches returned.</p> : recallResult.matches.map((match) => <article key={match.recallNumber} className="rounded-md border border-destructive/25 bg-background/25 p-3"><div className="flex flex-wrap items-center gap-2"><a className="text-sm font-medium text-primary underline" href={match.sourceUrl} target="_blank" rel="noreferrer">FDA recall {match.recallNumber}</a>{match.classification ? <span className="rounded border border-destructive/30 px-1.5 py-0.5 text-[11px]">{match.classification}</span> : null}{match.status ? <span className="text-[11px] text-muted-foreground">{match.status}</span> : null}{recallResult.query.packageCode ? <span className={`rounded border px-1.5 py-0.5 text-[11px] ${match.packageCodeTextMatch ? "border-primary/30 bg-primary/10 text-primary" : "border-muted/30 text-muted-foreground"}`}>{match.packageCodeTextMatch ? "entered code appears in FDA record" : "product description only"}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{match.productDescription}</p>{match.reasonForRecall ? <p className="mt-2 text-xs"><span className="font-medium">Reason:</span> {match.reasonForRecall}</p> : null}{match.codeInfo ? <p className="mt-1 text-xs"><span className="font-medium">Package / lot:</span> {match.codeInfo}</p> : null}<p className="mt-1 text-[11px] text-muted-foreground">{[match.recallingFirm, match.distributionPattern, recallDate(match.recallInitiationDate) ? `initiated ${recallDate(match.recallInitiationDate)}` : null].filter(Boolean).join(" · ")}</p></article>)}<p className="text-xs text-muted-foreground">{recallResult.disclosure}</p></div> : null}
    </div>
    <div className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-primary" />Brand ownership</h3><p className="mt-1 text-xs text-muted-foreground">Shows a source-linked ownership chain only for an exact registered brand. No match is intentionally shown as unknown.</p></div><Button type="button" size="sm" variant="outline" disabled={!ownershipStatus.data?.available || !catalogBrand?.trim() || ownershipLookup.isPending} onClick={() => ownershipLookup.mutate()}><Building2 />{ownershipLookup.isPending ? "Checking…" : "Check brand ownership"}</Button></div>
      <Input className="mt-3" aria-label="Brand ownership lookup" placeholder="Brand name (catalog fills this when available)" value={catalogBrand || ""} onChange={(event) => { setCatalogBrand(event.target.value || null); setOwnershipResult(null); }} />
      {!ownershipStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{ownershipStatus.data?.reason || "Checking ownership availability…"}</p> : null}
      {ownershipLookup.error ? <p className="mt-2 text-xs text-destructive">The ownership lookup could not be completed. Check the brand name and try again.</p> : null}
      {ownershipResult ? <div className="mt-3 space-y-2">{ownershipResult.profile ? <><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{ownershipResult.profile.brand}</p><span className="rounded border border-primary/25 px-1.5 py-0.5 text-[11px] text-primary">{ownershipResult.profile.statusLabel}</span></div><p className="text-xs text-muted-foreground">{ownershipResult.profile.ownershipChain.map((entry) => entry.name).join(" → ")} · verified {ownershipResult.profile.verifiedAsOf}</p>{ownershipResult.profile.acquisition ? <p className="text-xs"><span className="font-medium">Ownership history:</span> {ownershipResult.profile.acquisition.summary}</p> : null}<div className="space-y-1">{ownershipResult.profile.evidence.map((evidence) => <p key={evidence.sourceUrl} className="text-xs text-muted-foreground"><a className="text-primary underline" href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.title}</a> · {evidence.publisher} · {evidence.claim}</p>)}</div></> : <p className="text-sm text-muted-foreground">No verified ownership profile is registered for “{ownershipResult.requestedBrand}.”</p>}<p className="text-xs text-muted-foreground">{ownershipResult.disclosure}</p></div> : null}
    </div>
    <Textarea aria-label="Ingredient label" className="mt-2" placeholder="Ingredients: water, oats, cane sugar, natural flavor (vanilla extract, salt)" value={ingredients} onChange={(event) => { setIngredients(event.target.value); if (catalogLookupToken) setCaptureMethod("manual_label"); setCatalogLookupToken(null); setCatalogImportCandidate(null); setCatalogIdentity(null); }} />
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
        <div className="mt-3 flex flex-wrap gap-1.5">{scan.items.map((item) => <span key={item.id} title={item.preference ? `Matches your ${item.preference.preferenceType} preference${item.preference.note ? `: ${item.preference.note}` : ""}` : item.reason || "No universal harmfulness or safety conclusion has been assigned"} className="rounded-md border border-muted/30 px-2 py-1 text-xs text-muted-foreground">{item.rawName} <span className="text-primary/80">· {item.preference ? `your ${item.preference.preferenceType} rule` : ingredientClassificationLabel(item.classification)}</span>{item.preference?.note ? <span> · {item.preference.note}</span> : null}{!item.preference && item.evidenceUrl && item.evidenceTitle ? <a className="ml-1 text-primary underline" href={item.evidenceUrl} target="_blank" rel="noreferrer">source</a> : null}</span>)}</div>
      </article>)}
    </div> : null}
    {scans.data?.disclosure && <p className="mt-4 text-xs text-muted-foreground">{scans.data.disclosure}</p>}
  </section>;
}
