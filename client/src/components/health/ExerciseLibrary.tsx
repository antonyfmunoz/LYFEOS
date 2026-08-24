import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExerciseDefinition = {
  id: number;
  userId: number | null;
  name: string;
  category: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string | null;
  source: string;
  sourceVersion: string | null;
  archivedAt: string | null;
};

type ExerciseResponse = { exercises: ExerciseDefinition[]; disclosure: string };
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export default function ExerciseLibrary() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [equipment, setEquipment] = useState("");
  const [primaryMuscles, setPrimaryMuscles] = useState("");
  const [secondaryMuscles, setSecondaryMuscles] = useState("");
  const [instructions, setInstructions] = useState("");
  const library = useQuery<ExerciseResponse>({ queryKey: ["/api/exercises", { includeArchived: true }], queryFn: () => apiRequest("/api/exercises?includeArchived=true") });
  const visible = useMemo(() => (library.data?.exercises || []).filter((exercise) => {
    if (!showArchived && exercise.archivedAt) return false;
    const haystack = [exercise.name, exercise.category, exercise.equipment, ...exercise.primaryMuscles, ...exercise.secondaryMuscles].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [library.data?.exercises, search, showArchived]);
  const reset = () => { setEditingId(null); setName(""); setCategory(""); setEquipment(""); setPrimaryMuscles(""); setSecondaryMuscles(""); setInstructions(""); };
  const save = useMutation({
    mutationFn: () => apiRequest(editingId ? `/api/exercises/${editingId}` : "/api/exercises", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify({ name, category: category.trim() || null, equipment: equipment.trim() || null, primaryMuscles: list(primaryMuscles), secondaryMuscles: list(secondaryMuscles), instructions: instructions.trim() || null }),
    }),
    onSuccess: () => { reset(); void queryClient.invalidateQueries({ queryKey: ["/api/exercises"] }); },
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => apiRequest(`/api/exercises/${id}/archive`, { method: "PATCH", body: JSON.stringify({ archived }) }),
    onSuccess: () => { reset(); void queryClient.invalidateQueries({ queryKey: ["/api/exercises"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/exercises/${id}`, { method: "DELETE" }),
    onSuccess: () => { reset(); void queryClient.invalidateQueries({ queryKey: ["/api/exercises"] }); },
  });
  const edit = (exercise: ExerciseDefinition) => {
    setEditingId(exercise.id); setName(exercise.name); setCategory(exercise.category || ""); setEquipment(exercise.equipment || "");
    setPrimaryMuscles(exercise.primaryMuscles.join(", ")); setSecondaryMuscles(exercise.secondaryMuscles.join(", ")); setInstructions(exercise.instructions || "");
  };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="exercise-library-heading">
    <div><h2 id="exercise-library-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><BookOpen className="h-5 w-5" />Exercise library</h2><p className="mt-1 text-sm text-muted-foreground">Create private movements for workout autocomplete. These descriptions are user-authored records, not prescriptions.</p></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3"><Input aria-label="Custom exercise name" placeholder="Exercise name" value={name} onChange={(event) => setName(event.target.value)} /><Input aria-label="Exercise category" placeholder="Category (strength, cardio, mobility…)" value={category} onChange={(event) => setCategory(event.target.value)} /><Input aria-label="Exercise equipment" placeholder="Equipment" value={equipment} onChange={(event) => setEquipment(event.target.value)} /></div>
    <div className="mt-2 grid gap-2 sm:grid-cols-2"><Input aria-label="Primary muscles" placeholder="Primary muscles, comma separated" value={primaryMuscles} onChange={(event) => setPrimaryMuscles(event.target.value)} /><Input aria-label="Secondary muscles" placeholder="Secondary muscles, comma separated" value={secondaryMuscles} onChange={(event) => setSecondaryMuscles(event.target.value)} /></div>
    <textarea aria-label="Exercise instructions" maxLength={2000} className="mt-2 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Optional personal setup or technique notes" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
    <div className="mt-2 flex gap-2"><Button size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>{editingId ? <Pencil /> : <Plus />}{editingId ? "Update exercise" : "Add exercise"}</Button>{editingId ? <Button variant="ghost" size="sm" onClick={reset}>Cancel edit</Button> : null}</div>
    {save.error ? <p className="mt-2 text-xs text-destructive">Could not save that exercise. Check for a duplicate name and try again.</p> : null}
    <div className="mt-5 flex flex-wrap items-center gap-2"><Input className="max-w-sm" aria-label="Search exercise library" placeholder="Search name, muscle, category, or equipment" value={search} onChange={(event) => setSearch(event.target.value)} /><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Show archived</label></div>
    {visible.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{visible.map((exercise) => <div key={exercise.id} className={`rounded-lg border border-muted/20 bg-background/20 p-3 text-xs ${exercise.archivedAt ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{exercise.name}</p><p className="mt-1 text-muted-foreground">{[exercise.category, exercise.equipment].filter(Boolean).join(" · ") || "No category or equipment"}</p></div><span className="font-mono text-[10px] uppercase text-muted-foreground">{exercise.source}{exercise.sourceVersion ? ` · ${exercise.sourceVersion}` : ""}</span></div>{exercise.primaryMuscles.length ? <p className="mt-2 text-muted-foreground">Primary: {exercise.primaryMuscles.join(", ")}</p> : null}{exercise.instructions ? <p className="mt-2 text-muted-foreground">{exercise.instructions}</p> : null}{exercise.userId !== null ? <div className="mt-2 flex gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${exercise.name}`} onClick={() => edit(exercise)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`${exercise.archivedAt ? "Restore" : "Archive"} ${exercise.name}`} disabled={archive.isPending} onClick={() => archive.mutate({ id: exercise.id, archived: !exercise.archivedAt })}>{exercise.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" aria-label={`Delete ${exercise.name}`} disabled={remove.isPending} onClick={() => remove.mutate(exercise.id)}><Trash2 className="h-4 w-4" /></Button></div> : null}</div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">No matching exercises.</p>}
    <p className="mt-4 text-[11px] text-muted-foreground">{library.data?.disclosure || "Private custom exercises remain separate from any future reviewed shared catalog."}</p>
  </section>;
}
