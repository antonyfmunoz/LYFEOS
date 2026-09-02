import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Check, ShieldCheck, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/hooks/use-page-title";

type Report = { id: number; brand: string; barcode: string | null; reportType: string; note: string | null; evidenceUrl: string | null; status: string; createdAt: string };
type Queue = { reports: Report[]; disclosure: string };
type OwnershipStatus = "corporate_owned" | "public_company" | "family_owned_claim" | "employee_owned_claim" | "farmer_owned_cooperative_claim" | "nonprofit_owned_claim" | "private_independent_claim";
const labels: Record<OwnershipStatus, string> = {
  corporate_owned: "Corporate-owned", public_company: "Public company", family_owned_claim: "Family-owned (company statement)", employee_owned_claim: "Employee-owned (company statement)", farmer_owned_cooperative_claim: "Farmer-owned cooperative (company statement)", nonprofit_owned_claim: "Nonprofit-owned (foundation statement)", private_independent_claim: "Private independent (company statement)",
};

export default function OwnershipReviewPage() {
  usePageTitle("Ownership review");
  const access = useQuery<{ authorized: true; authorityBoundary: string }>({ queryKey: ["/api/ownership-review/status"], queryFn: () => apiRequest("/api/ownership-review/status"), retry: false });
  const queue = useQuery<Queue>({ queryKey: ["/api/ownership-review/reports"], queryFn: () => apiRequest("/api/ownership-review/reports"), enabled: Boolean(access.data?.authorized), retry: false });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(() => queue.data?.reports.find((report) => report.id === selectedId) || null, [queue.data?.reports, selectedId]);
  const [aliases, setAliases] = useState("");
  const [ownershipStatus, setOwnershipStatus] = useState<OwnershipStatus>("corporate_owned");
  const [parentName, setParentName] = useState("");
  const [parentRole, setParentRole] = useState<"operating_company" | "parent_company" | "ultimate_parent" | "cooperative" | "nonprofit_owner">("ultimate_parent");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourcePublisher, setSourcePublisher] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<"company_portfolio" | "company_statement" | "acquisition_announcement" | "regulatory_filing">("company_portfolio");
  const [claim, setClaim] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!selected) return;
    setAliases(""); setParentName(""); setSourceTitle(""); setSourcePublisher(""); setSourceUrl(selected.evidenceUrl || ""); setClaim(""); setReason("");
  }, [selected?.id]);

  const resolve = useMutation({
    mutationFn: (decision: "publish" | "reject") => {
      if (!selected) throw new Error("Select a report first.");
      const profile = decision === "publish" ? {
        brand: selected.brand,
        aliases: aliases.split(",").map((value) => value.trim()).filter(Boolean),
        status: ownershipStatus,
        statusLabel: labels[ownershipStatus],
        ownershipChain: [{ name: selected.brand, role: "brand" }, { name: parentName.trim(), role: parentRole }],
        acquisition: null,
        verifiedAsOf: new Date().toISOString().slice(0, 10),
        evidence: [{ title: sourceTitle.trim(), publisher: sourcePublisher.trim(), sourceType, sourceUrl: sourceUrl.trim(), publishedAt: null, accessedAt: new Date().toISOString().slice(0, 10), claim: claim.trim() }],
      } : undefined;
      return apiRequest(`/api/ownership-review/reports/${selected.id}/resolve`, { method: "POST", body: JSON.stringify({ decision, reason: reason.trim(), profile }) });
    },
    onSuccess: () => { setSelectedId(null); void queryClient.invalidateQueries({ queryKey: ["/api/ownership-review/reports"] }); },
  });

  if (access.isLoading) return <main className="p-6 text-sm text-muted-foreground">Checking review authority…</main>;
  if (!access.data?.authorized) return <main className="mx-auto max-w-3xl p-6"><section className="glassmorphic rounded-2xl border border-primary/20 p-6"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="mt-3 font-orbitron text-xl text-primary">Ownership review</h1><p className="mt-2 text-sm text-muted-foreground">This area is available only to the narrowly authorized ownership-review role. It does not grant access to personal LyfeOS records.</p></section></main>;

  return <main className="mx-auto max-w-5xl p-4 sm:p-6"><section className="glassmorphic rounded-2xl border border-primary/20 p-5 sm:p-6"><div className="flex items-start gap-3"><Building2 className="mt-0.5 h-6 w-6 text-primary" /><div><h1 className="font-orbitron text-xl text-primary">Ownership review</h1><p className="mt-1 text-sm text-muted-foreground">Publish only a cited, exact brand profile. This console exposes submitted intake fields only—not pantry, health, or account data.</p></div></div><p className="mt-4 text-xs text-muted-foreground">{queue.data?.disclosure}</p>
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><div className="space-y-2"><h2 className="text-sm font-semibold">Submitted reports</h2>{queue.isLoading ? <p className="text-sm text-muted-foreground">Loading reports…</p> : !queue.data?.reports.length ? <p className="text-sm text-muted-foreground">No reports need review.</p> : queue.data.reports.map((report) => <button type="button" key={report.id} onClick={() => setSelectedId(report.id)} className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${selectedId === report.id ? "border-primary/60 bg-primary/10" : "border-primary/15 hover:border-primary/35"}`}><span className="font-medium">{report.brand}</span><span className="block text-xs text-muted-foreground">{report.reportType.replaceAll("_", " ")} · {new Date(report.createdAt).toLocaleDateString()}</span>{report.note ? <span className="mt-1 block text-xs text-muted-foreground">{report.note}</span> : null}</button>)}</div>
      <div className="rounded-xl border border-primary/15 bg-background/20 p-4">{!selected ? <p className="text-sm text-muted-foreground">Choose a report to review.</p> : <><h2 className="text-sm font-semibold">Review {selected.brand}</h2>{selected.evidenceUrl ? <a className="mt-1 inline-block text-xs text-primary underline" href={selected.evidenceUrl} target="_blank" rel="noreferrer">Open submitted lead</a> : <p className="mt-1 text-xs text-muted-foreground">No source was submitted. Find and cite an authoritative source before publishing.</p>}<div className="mt-4 grid gap-2 sm:grid-cols-2"><Input aria-label="Ownership aliases" placeholder="Aliases, comma-separated" value={aliases} onChange={(event) => setAliases(event.target.value)} /><select aria-label="Ownership status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ownershipStatus} onChange={(event) => setOwnershipStatus(event.target.value as OwnershipStatus)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input aria-label="Ownership parent name" placeholder="Owner or parent name" value={parentName} onChange={(event) => setParentName(event.target.value)} /><select aria-label="Ownership parent role" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={parentRole} onChange={(event) => setParentRole(event.target.value as typeof parentRole)}><option value="ultimate_parent">Ultimate parent</option><option value="parent_company">Parent company</option><option value="operating_company">Operating company</option><option value="cooperative">Cooperative</option><option value="nonprofit_owner">Nonprofit owner</option></select></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><Input aria-label="Evidence title" placeholder="Evidence title" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} /><Input aria-label="Evidence publisher" placeholder="Publisher" value={sourcePublisher} onChange={(event) => setSourcePublisher(event.target.value)} /><Input aria-label="Evidence URL" className="sm:col-span-2" placeholder="https:// authoritative source" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /><select aria-label="Evidence source type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)}><option value="company_portfolio">Company portfolio</option><option value="company_statement">Company statement</option><option value="acquisition_announcement">Acquisition announcement</option><option value="regulatory_filing">Regulatory filing</option></select></div><Textarea className="mt-2" aria-label="Evidence claim" placeholder="Precisely state what this source establishes" value={claim} onChange={(event) => setClaim(event.target.value)} /><Textarea className="mt-2" aria-label="Review reason" placeholder="Required review reason" value={reason} onChange={(event) => setReason(event.target.value)} />{resolve.error ? <p className="mt-2 text-xs text-destructive">The review could not be completed. Check all fields and that no other registry entry uses an alias.</p> : null}<div className="mt-3 flex flex-wrap gap-2"><Button type="button" disabled={resolve.isPending || !parentName.trim() || !sourceTitle.trim() || !sourcePublisher.trim() || !sourceUrl.trim() || !claim.trim() || reason.trim().length < 3} onClick={() => resolve.mutate("publish")}><Check />{resolve.isPending ? "Saving…" : "Publish cited profile"}</Button><Button type="button" variant="outline" disabled={resolve.isPending || reason.trim().length < 3} onClick={() => resolve.mutate("reject")}><X />Reject report</Button></div></>}</div></div>
  </section></main>;
}
