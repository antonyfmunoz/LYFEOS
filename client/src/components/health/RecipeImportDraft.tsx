import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export type ImportedRecipeDraft = { sourceUrl: string; name: string; yieldText: string | null; ingredients: string[]; extractionMethod: "structured_recipe_json_ld" };
type RecipeImportPreview = { draft: ImportedRecipeDraft; disclosure: string };

export default function RecipeImportDraft({ onDraftReady }: { onDraftReady: (draft: ImportedRecipeDraft) => void }) {
  const [url, setUrl] = useState("");
  const [disclosure, setDisclosure] = useState("");
  const preview = useMutation({
    mutationFn: () => apiRequest<RecipeImportPreview>("/api/nutrition/recipes/import-preview", { method: "POST", body: JSON.stringify({ url }) }),
    onSuccess: ({ draft, disclosure: nextDisclosure }) => {
      onDraftReady(draft);
      setDisclosure(`${nextDisclosure} Source: ${draft.sourceUrl}${draft.yieldText ? ` · Publisher yield: ${draft.yieldText}` : ""}`);
      toast({ title: "Recipe draft ready", description: "Match each publisher line to one of your saved foods and enter its measured grams before saving." });
    },
    onError: (error: Error) => toast({ title: "Recipe was not imported", description: error.message, variant: "destructive" }),
  });
  return <details className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3">
    <summary className="cursor-pointer text-xs font-medium">Start from a recipe URL</summary>
    <p className="mt-1 text-xs text-muted-foreground">LyfeOS reads only publisher-provided structured recipe lines. It never estimates portions or imports nutrition. You still choose the exact saved food and measured grams for every ingredient.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label="Recipe webpage URL" type="url" inputMode="url" placeholder="https://example.com/recipe" value={url} onChange={(event) => setUrl(event.target.value)} /><Button variant="outline" disabled={!url.trim() || preview.isPending} onClick={() => preview.mutate()}>{preview.isPending ? "Reading recipe…" : "Use recipe draft"}</Button></div>
    {disclosure ? <p className="mt-2 break-words text-[11px] text-muted-foreground">{disclosure}</p> : null}
  </details>;
}
