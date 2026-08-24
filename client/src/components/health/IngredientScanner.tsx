import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Pencil, ScanLine, Plus, Search, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type IngredientPreference = { id: number; displayName: string; preferenceType: "avoid" | "limit" | "watch"; note: string | null };
type ScanItem = { id: number; rawName: string; classification: string; evidenceStrength: string; preference: IngredientPreference | null };
type IngredientScan = { id: number; productName: string | null; barcode: string | null; rawIngredientsText: string; revision: number; createdAt: string; items: ScanItem[] };

export default function IngredientScanner() {
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [preferenceName, setPreferenceName] = useState("");
  const [preferenceType, setPreferenceType] = useState<IngredientPreference["preferenceType"]>("avoid");
  const [cameraStatus, setCameraStatus] = useState("");
  const [editingScanId, setEditingScanId] = useState<number | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const scans = useQuery<{ scans: IngredientScan[]; disclosure: string }>({
    queryKey: ["/api/ingredient-scans"], queryFn: () => apiRequest("/api/ingredient-scans"),
  });
  const preferences = useQuery<{ preferences: IngredientPreference[]; disclosure: string }>({
    queryKey: ["/api/ingredient-preferences"], queryFn: () => apiRequest("/api/ingredient-preferences"),
  });
  const create = useMutation({
    mutationFn: () => apiRequest(editingScanId ? `/api/ingredient-scans/${editingScanId}` : "/api/ingredient-scans", {
      method: editingScanId ? "PATCH" : "POST", headers: editingScanId && editingRevision ? { "x-lyfeos-expected-revision": String(editingRevision) } : undefined,
      body: JSON.stringify({ productName: productName || null, barcode: barcode || null, rawIngredientsText: ingredients }),
    }),
    onSuccess: () => {
      setProductName(""); setBarcode(""); setIngredients(""); setEditingScanId(null); setEditingRevision(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/ingredient-scans"] });
    },
  });
  const lookup = useMutation({
    mutationFn: () => apiRequest<{ scan: IngredientScan | null; source: string }>(`/api/ingredient-scans/lookup?barcode=${encodeURIComponent(barcode)}`),
    onSuccess: ({ scan }) => { if (scan) { setProductName(scan.productName || ""); setIngredients(scan.rawIngredientsText); setEditingScanId(scan.id); setEditingRevision(scan.revision); setCameraStatus("Loaded your most recently saved label for this barcode. Review it before using or correcting it."); } else setCameraStatus("This barcode is not in your private saved-label history."); },
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
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const detector = new BarcodeDetectorApi({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const results = await detector.detect(bitmap);
        const value = results[0]?.rawValue?.trim();
        if (value) { setBarcode(value); setCameraStatus(`Barcode ${value} read. Product lookup is not connected, so review the label text before saving.`); }
        else setCameraStatus("No barcode was found in that image. Try again in good light or enter the number manually.");
      } finally { bitmap.close(); }
    } catch {
      setCameraStatus("That image could not be read. Try again or enter the barcode manually.");
    } finally {
      if (cameraInput.current) cameraInput.current.value = "";
    }
  };
  const editScan = (scan: IngredientScan) => { setEditingScanId(scan.id); setEditingRevision(scan.revision); setProductName(scan.productName || ""); setBarcode(scan.barcode || ""); setIngredients(scan.rawIngredientsText); };
  const cancelEdit = () => { setEditingScanId(null); setEditingRevision(null); setProductName(""); setBarcode(""); setIngredients(""); };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="ingredient-review-heading">
    <div>
      <h2 id="ingredient-review-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><ScanLine className="h-5 w-5" />Ingredient review</h2>
      <p className="text-sm text-muted-foreground mt-1">Paste a package label to keep an exact, private ingredient record. Each item is shown as unclassified until LyfeOS has an evidence policy or a preference rule to apply.</p>
    </div>
    <div className="grid gap-2 mt-4 sm:grid-cols-2">
      <Input aria-label="Product name" placeholder="Product name (optional)" value={productName} onChange={(event) => setProductName(event.target.value)} />
      <Input aria-label="Product barcode" placeholder="Barcode (optional)" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
    </div>
    <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Take a barcode photo" onChange={(event) => void decodeBarcodeImage(event.target.files?.[0])} />
    <div className="mt-2 flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="outline" onClick={() => cameraInput.current?.click()}><Camera />Scan barcode with camera</Button><Button type="button" size="sm" variant="outline" disabled={!barcode.trim() || lookup.isPending} onClick={() => lookup.mutate()}><Search />Search my saved labels</Button>{cameraStatus ? <p className="text-xs text-muted-foreground" role="status">{cameraStatus}</p> : null}</div>
    <Textarea aria-label="Ingredient label" className="mt-2" placeholder="Ingredients: water, oats, cane sugar, natural flavor (vanilla extract, salt)" value={ingredients} onChange={(event) => setIngredients(event.target.value)} />
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button size="sm" disabled={!ingredients.trim() || create.isPending} onClick={() => create.mutate()}>{editingScanId ? <Pencil /> : <Plus />}{editingScanId ? "Save label correction" : "Review label"}</Button>{editingScanId ? <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel correction</Button> : null}
      <p className="text-xs text-muted-foreground">Supported browsers can read a barcode from a camera image. OCR and product-catalog lookup are not connected; the photo is processed on-device and is not uploaded.</p>
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
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{scan.productName || "Unnamed product"}</p><p className="text-xs text-muted-foreground">{new Date(scan.createdAt).toLocaleDateString()}{scan.barcode ? ` · barcode ${scan.barcode}` : ""} · {scan.items.length} parsed ingredients · revision {scan.revision}</p></div><div className="flex"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Correct ingredient review for ${scan.productName || "unnamed product"}`} onClick={() => editScan(scan)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ingredient review for ${scan.productName || "unnamed product"}`} disabled={remove.isPending} onClick={() => remove.mutate(scan.id)}><Trash2 className="h-4 w-4" /></Button></div></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{scan.items.map((item) => <span key={item.id} title={item.preference ? `Matches your ${item.preference.preferenceType} preference` : "No universal harmfulness or safety conclusion has been assigned"} className="rounded-md border border-muted/30 px-2 py-1 text-xs text-muted-foreground">{item.rawName} <span className="text-primary/80">· {item.preference ? `your ${item.preference.preferenceType} rule` : "unclassified"}</span></span>)}</div>
      </article>)}
    </div> : null}
    {scans.data?.disclosure && <p className="mt-4 text-xs text-muted-foreground">{scans.data.disclosure}</p>}
  </section>;
}
