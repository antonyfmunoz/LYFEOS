import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Database, Pencil, ScanLine, Plus, Search, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeDetectedLabelText } from "@/lib/on-device-label-ocr";

type IngredientPreference = { id: number; displayName: string; preferenceType: "avoid" | "limit" | "watch"; note: string | null };
type ScanItem = { id: number; rawName: string; classification: string; evidenceStrength: string; preference: IngredientPreference | null };
type IngredientScan = { id: number; captureMethod: "manual_label" | "photo_ocr" | "barcode"; productName: string | null; barcode: string | null; rawIngredientsText: string; revision: number; createdAt: string; items: ScanItem[]; catalogProviderId: string | null; catalogDatasetVersion: string | null; catalogAttributionText: string | null; catalogAttributionUrl: string | null; catalogSourceModified: boolean };
type CatalogStatus = { available: boolean; reason: string | null };
type CatalogLookup = { provider: { name: string; datasetVersion: string; attributionText: string; attributionUrl?: string | null }; item: { name: string; barcode?: string | null; ingredientsText?: string | null; lookupToken: string } | null; found: boolean; disclosure: string };

export default function IngredientScanner() {
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [preferenceName, setPreferenceName] = useState("");
  const [preferenceType, setPreferenceType] = useState<IngredientPreference["preferenceType"]>("avoid");
  const [cameraStatus, setCameraStatus] = useState("");
  const [editingScanId, setEditingScanId] = useState<number | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [catalogLookupToken, setCatalogLookupToken] = useState<string | null>(null);
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
  const create = useMutation({
    mutationFn: () => apiRequest(editingScanId ? `/api/ingredient-scans/${editingScanId}` : "/api/ingredient-scans", {
      method: editingScanId ? "PATCH" : "POST", headers: editingScanId && editingRevision ? { "x-lyfeos-expected-revision": String(editingRevision) } : undefined,
      body: JSON.stringify({ captureMethod, productName: productName || null, barcode: barcode || null, rawIngredientsText: ingredients, catalogLookupToken: editingScanId ? undefined : catalogLookupToken || undefined }),
    }),
    onSuccess: () => {
      setProductName(""); setBarcode(""); setIngredients(""); setEditingScanId(null); setEditingRevision(null); setCatalogLookupToken(null); setCaptureMethod("manual_label");
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] });
    },
  });
  const lookup = useMutation({
    mutationFn: () => apiRequest<{ scan: IngredientScan | null; source: string }>(`/api/ingredient-scans/lookup?barcode=${encodeURIComponent(barcode)}`),
    onSuccess: ({ scan }) => { if (scan) { setProductName(scan.productName || ""); setIngredients(scan.rawIngredientsText); setCaptureMethod(scan.captureMethod === "photo_ocr" ? "photo_ocr" : "manual_label"); setEditingScanId(scan.id); setEditingRevision(scan.revision); setCameraStatus("Loaded your most recently saved label for this barcode. Review it before using or correcting it."); } else setCameraStatus("This barcode is not in your private saved-label history."); },
  });
  const catalogLookup = useMutation({
    mutationFn: () => apiRequest<CatalogLookup>(`/api/food-catalog/barcodes/${encodeURIComponent(barcode)}`),
    onSuccess: ({ item, provider, disclosure }) => {
      if (!item) { setCatalogLookupToken(null); setCameraStatus(disclosure); return; }
      setProductName(item.name); setBarcode(item.barcode || barcode); setIngredients(item.ingredientsText || ""); setCatalogLookupToken(item.lookupToken);
      setEditingScanId(null); setEditingRevision(null);
      setCameraStatus(`${provider.name} dataset ${provider.datasetVersion}: ${disclosure}${item.ingredientsText ? "" : " The product has no ingredient label, so enter it manually."}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => { const scan = scans.data?.scans.find((candidate) => candidate.id === id); if (!scan) throw new Error("Reload this saved label before deleting it."); return apiRequest(`/api/ingredient-scans/${id}`, { method: "DELETE", headers: { "x-lyfeos-expected-revision": String(scan.revision) } }); },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] }),
  });
  const savePreference = useMutation({
    mutationFn: () => apiRequest("/api/ingredient-preferences", { method: "POST", body: JSON.stringify({ displayName: preferenceName, preferenceType }) }),
    onSuccess: () => {
      setPreferenceName("");
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
        if (value) { setBarcode(value); setCatalogLookupToken(null); setCameraStatus(`Barcode ${value} read. Search the configured catalog or your saved private labels.`); }
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
        setIngredients(detected.text); setCatalogLookupToken(null); setCaptureMethod("photo_ocr");
        setCameraStatus(`Label text was read on-device${detected.truncated ? " and limited to 20,000 characters" : ""}. Review and correct it before saving; LyfeOS has not treated it as accurate yet.`);
      } finally { bitmap.close(); }
    } catch {
      setCameraStatus("That label photo could not be read on this device. Try again or enter the ingredient list manually.");
    } finally {
      if (labelInput.current) labelInput.current.value = "";
    }
  };
  const editScan = (scan: IngredientScan) => { setCatalogLookupToken(null); setEditingScanId(scan.id); setEditingRevision(scan.revision); setCaptureMethod(scan.captureMethod === "photo_ocr" ? "photo_ocr" : "manual_label"); setProductName(scan.productName || ""); setBarcode(scan.barcode || ""); setIngredients(scan.rawIngredientsText); };
  const cancelEdit = () => { setEditingScanId(null); setEditingRevision(null); setCatalogLookupToken(null); setCaptureMethod("manual_label"); setProductName(""); setBarcode(""); setIngredients(""); };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="ingredient-review-heading">
    <div>
      <h2 id="ingredient-review-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><ScanLine className="h-5 w-5" />Ingredient review</h2>
      <p className="text-sm text-muted-foreground mt-1">Paste a package label to keep an exact, private ingredient record. Each item is shown as unclassified until LyfeOS has an evidence policy or a preference rule to apply.</p>
    </div>
    <div className="grid gap-2 mt-4 sm:grid-cols-2">
      <Input aria-label="Product name" placeholder="Product name (optional)" value={productName} onChange={(event) => { setProductName(event.target.value); setCatalogLookupToken(null); }} />
      <Input aria-label="Product barcode" placeholder="Barcode (optional)" value={barcode} onChange={(event) => { setBarcode(event.target.value); setCatalogLookupToken(null); }} />
    </div>
    <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take a barcode photo" onChange={(event) => void decodeBarcodeImage(event.target.files?.[0])} />
    <input ref={labelInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take an ingredient label photo" onChange={(event) => void readLabelImage(event.target.files?.[0])} />
    <div className="mt-2 flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="outline" onClick={() => cameraInput.current?.click()}><Camera />Scan barcode with camera</Button><Button type="button" size="sm" variant="outline" onClick={() => labelInput.current?.click()}><ScanLine />Read label text on-device</Button><Button type="button" size="sm" variant="outline" disabled={!barcode.trim() || lookup.isPending} onClick={() => lookup.mutate()}><Search />Search my saved labels</Button><Button type="button" size="sm" variant="outline" disabled={!catalogStatus.data?.available || !/^\d{8,14}$/.test(barcode.trim()) || catalogLookup.isPending} onClick={() => catalogLookup.mutate()}><Database />Search product catalog</Button>{cameraStatus ? <p className="text-xs text-muted-foreground" role="status">{cameraStatus}</p> : null}</div>
    {!catalogStatus.data?.available ? <p className="mt-2 text-xs text-muted-foreground">{catalogStatus.data?.reason || "Checking catalog availability…"}</p> : null}
    <Textarea aria-label="Ingredient label" className="mt-2" placeholder="Ingredients: water, oats, cane sugar, natural flavor (vanilla extract, salt)" value={ingredients} onChange={(event) => { setIngredients(event.target.value); if (catalogLookupToken) setCaptureMethod("manual_label"); setCatalogLookupToken(null); }} />
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!ingredients.trim() || create.isPending} onClick={() => create.mutate()}>{editingScanId ? <Pencil /> : <Plus />}{editingScanId ? "Save label correction" : "Review label"}</Button>{editingScanId ? <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel correction</Button> : null}
      <p className="text-xs text-muted-foreground">Barcode and supported-browser text detection run on-device; photos are not uploaded. OCR text is only an editable draft until you review and save it. Catalog labels stay external until explicit save.</p>
    </div>
    {create.error && <p className="text-xs text-destructive mt-2">Could not review that label. Check the label text and barcode, then try again.</p>}
    <div className="mt-5 rounded-lg border border-primary/15 bg-background/20 p-3">
      <h3 className="text-sm font-semibold">Your ingredient preferences</h3>
      <p className="mt-1 text-xs text-muted-foreground">Choose what you personally want to avoid, limit, or watch. Matches label terms only; it is not allergy or medical guidance.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem_auto]"><Input aria-label="Ingredient preference" placeholder="e.g. artificial color" value={preferenceName} onChange={(event) => setPreferenceName(event.target.value)} /><select aria-label="Ingredient preference type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={preferenceType} onChange={(event) => setPreferenceType(event.target.value as IngredientPreference["preferenceType"])}><option value="avoid">Avoid</option><option value="limit">Limit</option><option value="watch">Watch</option></select><Button size="sm" disabled={!preferenceName.trim() || savePreference.isPending} onClick={() => savePreference.mutate()}><Plus />Save rule</Button></div>
      {savePreference.error && <p className="text-xs text-destructive mt-2">Could not save that preference.</p>}
      {preferences.data?.preferences.length ? <div className="mt-3 flex flex-wrap gap-2">{preferences.data.preferences.map((preference) => <span key={preference.id} className="inline-flex items-center gap-1 rounded-md border border-muted/30 px-2 py-1 text-xs"><span className="text-primary">{preference.preferenceType}</span> {preference.displayName}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${preference.displayName} preference`} disabled={removePreference.isPending} onClick={() => removePreference.mutate(preference.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}
    </div>
    {scans.data?.scans.length ? <div className="mt-5 space-y-3">
      {scans.data.scans.map((scan) => <article key={scan.id} className="rounded-lg border border-muted/30 bg-background/20 p-3">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{scan.productName || "Unnamed product"}</p><p className="text-xs text-muted-foreground">{new Date(scan.createdAt).toLocaleDateString()}{scan.barcode ? ` · barcode ${scan.barcode}` : ""} · {scan.items.length} parsed ingredients · revision {scan.revision}</p>{scan.catalogProviderId ? <p className="mt-1 text-[11px] text-muted-foreground">Source: {scan.catalogProviderId} dataset {scan.catalogDatasetVersion}{scan.catalogSourceModified ? " · privately corrected after import" : ""}{scan.catalogAttributionUrl ? <> · <a className="text-primary underline" href={scan.catalogAttributionUrl} target="_blank" rel="noreferrer">attribution</a></> : scan.catalogAttributionText ? ` · ${scan.catalogAttributionText}` : ""}</p> : null}</div><div className="flex"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Correct ingredient review for ${scan.productName || "unnamed product"}`} onClick={() => editScan(scan)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ingredient review for ${scan.productName || "unnamed product"}`} disabled={remove.isPending} onClick={() => remove.mutate(scan.id)}><Trash2 className="h-4 w-4" /></Button></div></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{scan.items.map((item) => <span key={item.id} title={item.preference ? `Matches your ${item.preference.preferenceType} preference` : "No universal harmfulness or safety conclusion has been assigned"} className="rounded-md border border-muted/30 px-2 py-1 text-xs text-muted-foreground">{item.rawName} <span className="text-primary/80">· {item.preference ? `your ${item.preference.preferenceType} rule` : "unclassified"}</span></span>)}</div>
      </article>)}
    </div> : null}
    {scans.data?.disclosure && <p className="mt-4 text-xs text-muted-foreground">{scans.data.disclosure}</p>}
  </section>;
}
