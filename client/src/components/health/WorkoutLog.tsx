import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Dumbbell, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { apiRequest, queryClient, timeContextHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString, localNoonIso } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";

type LoadUnit = "kg" | "lb";
type SetDraft = { reps: string; load: string; loadUnit: LoadUnit; distance: string; duration: string; rpe: string; rir: string; note: string; completed: boolean };
type ExerciseDraft = { name: string; sets: SetDraft[] };
type Workout = {
  id: number;
  currentRevision: number;
  occurredAt: string;
  activityType: string;
  durationMinutes: number | null;
  perceivedExertion: number | null;
  movingTimeSeconds: number | null;
  elevationGainMeters: number | null;
  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
  heartRateSource: string | null;
  exercises: Array<{ id: number; name: string; setRecords: Array<{ id: number; reps: number | null; loadValue: number | null; loadUnit: string | null; distanceMeters: number | null; durationSeconds: number | null; perceivedExertion: number | null; repsInReserve: number | null; completed: boolean; note: string | null }> }>;
};
type WorkoutTemplate = { id: number; name: string; activityType: string; folder: string | null; note: string | null; exerciseBlueprint: Array<{ name: string; setRecords?: Array<{ reps?: number | null; loadValue?: number | null; loadUnit?: string | null; distanceMeters?: number | null; durationSeconds?: number | null; perceivedExertion?: number | null; repsInReserve?: number | null }> }> };
type WorkoutTemplateRevision = Omit<WorkoutTemplate, "id"> & { id: number; revisionNumber: number; createdAt: string };
type ExerciseProgress = { exerciseName: string; loadUnit: string; totalVolume: number; estimatedOneRepMax: number | null; bestObservedLoad: number | null; performedSets: number; lastPerformedAt: string };
type WorkoutProgressResponse = { progress: ExerciseProgress[]; method: { estimatedOneRepMax: string; personalRecord: string }; disclosure: string };
type WorkoutHistoryItem = { id: number; occurredAt: string; activityType: string; durationMinutes: number | null; perceivedExertion: number | null; source: string; heartRateSource: string | null; programLink: { sessionId: number; programId: number } | null; exerciseNames: string[]; recordedSets: number; performedSets: number };
type CardioSession = { occurredAt: string; distanceMeters: number; durationSeconds: number; recordedSets: number; paceSecondsPerKilometer: number | null; speedKilometersPerHour: number | null; movingTimeSeconds: number | null; elevationGainMeters: number | null; averageHeartRateBpm: number | null; averageHeartRateZone: string | null; maxHeartRateBpm: number | null; heartRateSource: string | null };
type ExerciseDefinition = { id: number; name: string; category: string | null; equipment: string | null };
type ExerciseRecord = { exerciseName: string; loadUnit: string; bestObservedLoad: number; observedLoadAt: string; observedLoadWorkoutId: number; observedLoadSetId: number; bestEstimatedOneRepMax: number | null; estimatedOneRepMaxAt: string | null; estimatedWorkoutId: number | null; estimatedSetId: number | null };
type ExerciseRecordResponse = { records: ExerciseRecord[]; calculations: { observedLoadRecord: { id: string; definition: string }; estimatedOneRepMax: { id: string; definition: string } }; disclosure: string };

const blankSet = (loadUnit: LoadUnit = "kg"): SetDraft => ({ reps: "", load: "", loadUnit, distance: "", duration: "", rpe: "", rir: "", note: "", completed: true });
const blankExercise = (loadUnit: LoadUnit = "kg"): ExerciseDraft => ({ name: "", sets: [blankSet(loadUnit)] });
function today() { return getLocalDateString(); }
function localDateOffset(days: number) {
  const value = new Date(`${today()}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function formatSet(set: Workout["exercises"][number]["setRecords"][number]): string {
  const parts = [
    set.reps ? String(set.reps) : "",
    set.loadValue ? `${set.reps ? "×" : ""}${set.loadValue}${set.loadUnit || ""}` : "",
    set.distanceMeters ? `${set.distanceMeters}m` : "",
    set.durationSeconds ? `${Math.round(set.durationSeconds / 60)}m` : "",
  ].filter(Boolean);
  return parts.join(" ") || "recorded";
}

export default function WorkoutLog() {
  const { user } = useAuth();
  const workoutDraftKey = user?.id ? `lyfeos:workout-draft:${user.id}` : null;
  const [preferredLoadUnit, setPreferredLoadUnit] = useState<LoadUnit>(() => typeof window !== "undefined" && window.localStorage.getItem("lyfeos:workout-load-unit") === "lb" ? "lb" : "kg");
  const [date, setDate] = useState(today());
  const [activityType, setActivityType] = useState("Strength training");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [rpe, setRpe] = useState("");
  const [movingTimeMinutes, setMovingTimeMinutes] = useState("");
  const [elevationGainMeters, setElevationGainMeters] = useState("");
  const [averageHeartRateBpm, setAverageHeartRateBpm] = useState("");
  const [maxHeartRateBpm, setMaxHeartRateBpm] = useState("");
  const [heartRateSource, setHeartRateSource] = useState<"manual" | "device" | "imported">("manual");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blankExercise(preferredLoadUnit)]);
  const [templateName, setTemplateName] = useState("");
  const [templateFolder, setTemplateFolder] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedRevisionNumber, setSelectedRevisionNumber] = useState("");
  const [editingWorkoutId, setEditingWorkoutId] = useState<number | null>(null);
  const [editingWorkoutRevision, setEditingWorkoutRevision] = useState<number | null>(null);
  const [workoutEditConflict, setWorkoutEditConflict] = useState(false);
  const [restSeconds, setRestSeconds] = useState(90);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [sessionState, setSessionState] = useState<"not_started" | "active" | "paused">("not_started");
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [sessionAccumulatedSeconds, setSessionAccumulatedSeconds] = useState(0);
  const [sessionActiveSince, setSessionActiveSince] = useState<number | null>(null);
  const [sessionClock, setSessionClock] = useState(Date.now());
  const [historyDays, setHistoryDays] = useState(30);
  const [historyStartDate, setHistoryStartDate] = useState(() => localDateOffset(-29));
  const [historyEndDate, setHistoryEndDate] = useState(today());
  const [historyActivity, setHistoryActivity] = useState("");
  const [historyExercise, setHistoryExercise] = useState("");
  const [historySource, setHistorySource] = useState("");
  const [historyHeartRateSource, setHistoryHeartRateSource] = useState("");
  const [historySetState, setHistorySetState] = useState("any");
  const [historyProgramLink, setHistoryProgramLink] = useState("any");
  const [historyRpeMin, setHistoryRpeMin] = useState("");
  const [historyRpeMax, setHistoryRpeMax] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyExportError, setHistoryExportError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [deletedWorkout, setDeletedWorkout] = useState<{ receiptId: string; expiresAt: string } | null>(null);
  const customHistoryPeriod = historyDays === 0;
  const customHistoryDays = /^\d{4}-\d{2}-\d{2}$/.test(historyStartDate) && /^\d{4}-\d{2}-\d{2}$/.test(historyEndDate) ? Math.round((new Date(`${historyEndDate}T00:00:00.000Z`).getTime() - new Date(`${historyStartDate}T00:00:00.000Z`).getTime()) / 86_400_000) + 1 : 0;
  const validHistoryPeriod = !customHistoryPeriod || (customHistoryDays >= 1 && customHistoryDays <= 3650 && historyEndDate <= today());
  const historyPeriodQuery = customHistoryPeriod ? `startDate=${historyStartDate}&endDate=${historyEndDate}` : `days=${historyDays}`;
  const historyFilterQuery = new URLSearchParams({ activity: historyActivity, exercise: historyExercise, setState: historySetState, programLink: historyProgramLink });
  if (historySource) historyFilterQuery.set("source", historySource);
  if (historyHeartRateSource) historyFilterQuery.set("heartRateSource", historyHeartRateSource);
  if (historyRpeMin) historyFilterQuery.set("rpeMin", historyRpeMin);
  if (historyRpeMax) historyFilterQuery.set("rpeMax", historyRpeMax);
  const workouts = useQuery<{ workouts: Workout[] }>({ queryKey: ["/api/workouts", { date }], queryFn: () => apiRequest(`/api/workouts?date=${date}`) });
  const templates = useQuery<{ templates: WorkoutTemplate[] }>({ queryKey: ["/api/workout-templates"], queryFn: () => apiRequest("/api/workout-templates") });
  const templateRevisions = useQuery<{ revisions: WorkoutTemplateRevision[] }>({ queryKey: ["/api/workout-templates", selectedTemplateId, "revisions"], queryFn: () => apiRequest(`/api/workout-templates/${selectedTemplateId}/revisions`), enabled: Boolean(selectedTemplateId) });
  const progress = useQuery<WorkoutProgressResponse>({ queryKey: ["/api/workouts/progress", { days: 90 }], queryFn: () => apiRequest("/api/workouts/progress?days=90") });
  const history = useQuery<{ workouts: WorkoutHistoryItem[]; period: { startDate: string; endDate: string; days: number; custom: boolean; timeZone: string }; page: number; hasMore: boolean; disclosure: string }>({ queryKey: ["/api/workouts/history", { days: historyDays, startDate: historyStartDate, endDate: historyEndDate, activity: historyActivity, exercise: historyExercise, source: historySource, heartRateSource: historyHeartRateSource, setState: historySetState, programLink: historyProgramLink, rpeMin: historyRpeMin, rpeMax: historyRpeMax, page: historyPage }], queryFn: () => apiRequest(`/api/workouts/history?${historyPeriodQuery}&${historyFilterQuery.toString()}&page=${historyPage}&limit=20`), enabled: validHistoryPeriod });
  const cardio = useQuery<{ sessions: CardioSession[]; disclosure: string }>({ queryKey: ["/api/workouts/cardio", { days: 90 }], queryFn: () => apiRequest("/api/workouts/cardio?days=90") });
  const exerciseLibrary = useQuery<{ exercises: ExerciseDefinition[] }>({ queryKey: ["/api/exercises"], queryFn: () => apiRequest("/api/exercises") });
  const records = useQuery<ExerciseRecordResponse>({ queryKey: ["/api/workouts/records"], queryFn: () => apiRequest("/api/workouts/records") });
  const workoutRevisions = useQuery<{ revisions: Array<{ id: number; revisionNumber: number; createdAt: string }>; disclosure: string }>({ queryKey: ["/api/workouts", editingWorkoutId, "revisions"], queryFn: () => apiRequest(`/api/workouts/${editingWorkoutId}/revisions`), enabled: editingWorkoutId != null });

  useEffect(() => {
    window.localStorage.setItem("lyfeos:workout-load-unit", preferredLoadUnit);
  }, [preferredLoadUnit]);

  useEffect(() => {
    if (restUntil == null) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
      setRestSeconds(remaining);
      if (remaining === 0) setRestUntil(null);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [restUntil]);

  useEffect(() => {
    if (sessionState !== "active") return;
    const timer = window.setInterval(() => setSessionClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionState]);

  useEffect(() => {
    if (!workoutDraftKey) return;
    try {
      const raw = window.sessionStorage.getItem(workoutDraftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<{ savedAt: string; date: string; activityType: string; durationMinutes: string; rpe: string; movingTimeMinutes: string; elevationGainMeters: string; averageHeartRateBpm: string; maxHeartRateBpm: string; heartRateSource: "manual" | "device" | "imported"; exercises: ExerciseDraft[]; sessionState: "not_started" | "active" | "paused"; sessionStartedAt: string | null; sessionAccumulatedSeconds: number; sessionActiveSince: number | null }>;
      if (draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date)) setDate(draft.date);
      if (draft.activityType) setActivityType(draft.activityType);
      setDurationMinutes(draft.durationMinutes || ""); setRpe(draft.rpe || ""); setMovingTimeMinutes(draft.movingTimeMinutes || ""); setElevationGainMeters(draft.elevationGainMeters || "");
      setAverageHeartRateBpm(draft.averageHeartRateBpm || ""); setMaxHeartRateBpm(draft.maxHeartRateBpm || "");
      if (draft.heartRateSource === "device" || draft.heartRateSource === "imported" || draft.heartRateSource === "manual") setHeartRateSource(draft.heartRateSource);
      if (Array.isArray(draft.exercises) && draft.exercises.length) setExercises(draft.exercises);
      if (draft.sessionState === "active" || draft.sessionState === "paused") {
        setSessionState(draft.sessionState); setSessionStartedAt(draft.sessionStartedAt || null);
        setSessionAccumulatedSeconds(Number.isFinite(draft.sessionAccumulatedSeconds) ? Math.max(0, draft.sessionAccumulatedSeconds || 0) : 0);
        setSessionActiveSince(draft.sessionState === "active" && Number.isFinite(draft.sessionActiveSince) ? draft.sessionActiveSince || Date.now() : null);
      }
      setDraftSavedAt(draft.savedAt || null);
    } catch {
      window.sessionStorage.removeItem(workoutDraftKey);
    }
  }, [workoutDraftKey]);

  useEffect(() => {
    if (!workoutDraftKey) return;
    const meaningful = sessionState !== "not_started" || !!durationMinutes || !!rpe || !!movingTimeMinutes || !!elevationGainMeters || !!averageHeartRateBpm || !!maxHeartRateBpm || exercises.some((exercise) => exercise.name.trim() || exercise.sets.some((set) => set.reps || set.load || set.distance || set.duration || set.rpe || set.rir || set.note));
    const timer = window.setTimeout(() => {
      if (!meaningful) {
        window.sessionStorage.removeItem(workoutDraftKey);
        setDraftSavedAt(null);
        return;
      }
      const savedAt = new Date().toISOString();
      window.sessionStorage.setItem(workoutDraftKey, JSON.stringify({ version: 2, savedAt, date, activityType, durationMinutes, rpe, movingTimeMinutes, elevationGainMeters, averageHeartRateBpm, maxHeartRateBpm, heartRateSource, exercises, sessionState, sessionStartedAt, sessionAccumulatedSeconds, sessionActiveSince }));
      setDraftSavedAt(savedAt);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [workoutDraftKey, date, activityType, durationMinutes, rpe, movingTimeMinutes, elevationGainMeters, averageHeartRateBpm, maxHeartRateBpm, heartRateSource, exercises, sessionState, sessionStartedAt, sessionAccumulatedSeconds, sessionActiveSince]);

  const sessionElapsedSeconds = sessionAccumulatedSeconds + (sessionState === "active" && sessionActiveSince ? Math.max(0, Math.floor((sessionClock - sessionActiveSince) / 1000)) : 0);
  const startSession = () => { const now = Date.now(); setSessionState("active"); setSessionStartedAt(new Date(now).toISOString()); setSessionAccumulatedSeconds(0); setSessionActiveSince(now); setSessionClock(now); };
  const pauseSession = () => { if (sessionState !== "active" || !sessionActiveSince) return; setSessionAccumulatedSeconds((seconds) => seconds + Math.max(0, Math.floor((Date.now() - sessionActiveSince) / 1000))); setSessionActiveSince(null); setSessionState("paused"); };
  const resumeSession = () => { const now = Date.now(); setSessionActiveSince(now); setSessionClock(now); setSessionState("active"); };
  const resetSession = () => { setSessionState("not_started"); setSessionStartedAt(null); setSessionAccumulatedSeconds(0); setSessionActiveSince(null); };

  const editExercise = (exerciseIndex: number, update: (exercise: ExerciseDraft) => ExerciseDraft) => setExercises((items) => items.map((item, index) => index === exerciseIndex ? update(item) : item));
  const editSet = (exerciseIndex: number, setIndex: number, key: keyof SetDraft, value: string) => editExercise(exerciseIndex, (exercise) => ({ ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, [key]: value } : set) }));
  const workoutPayload = () => ({
    activityType,
    durationMinutes: durationMinutes ? Number(durationMinutes) : sessionStartedAt ? Math.max(1, Math.round(sessionElapsedSeconds / 60)) : null,
    perceivedExertion: rpe ? Number(rpe) : null,
    movingTimeSeconds: movingTimeMinutes ? Math.round(Number(movingTimeMinutes) * 60) : null,
    elevationGainMeters: elevationGainMeters ? Number(elevationGainMeters) : null,
    averageHeartRateBpm: averageHeartRateBpm ? Number(averageHeartRateBpm) : null,
    maxHeartRateBpm: maxHeartRateBpm ? Number(maxHeartRateBpm) : null,
    heartRateSource: averageHeartRateBpm || maxHeartRateBpm ? heartRateSource : null,
    occurredAt: localNoonIso(date),
    exercises: exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({
      name: exercise.name.trim(),
      setRecords: exercise.sets.map((set) => ({
        reps: set.reps ? Number(set.reps) : null,
        loadValue: set.load ? Number(set.load) : null,
        loadUnit: set.load ? set.loadUnit : null,
        distanceMeters: set.distance ? Number(set.distance) : null,
        durationSeconds: set.duration ? Number(set.duration) * 60 : null,
        perceivedExertion: set.rpe ? Number(set.rpe) : null,
        repsInReserve: set.rir ? Number(set.rir) : null,
        note: set.note || null,
        completed: set.completed,
      })),
    })),
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload = workoutPayload();
      if (editingWorkoutId) {
        if (!editingWorkoutRevision) throw new Error("Reload this workout before saving a correction.");
        return apiRequest(`/api/workouts/${editingWorkoutId}`, { method: "PUT", headers: { "x-lyfeos-expected-revision": String(editingWorkoutRevision) }, body: JSON.stringify(payload) });
      }
      if (!user?.id) throw new Error("Sign in before recording a workout.");
      return submitHealthMutation({ userId: user.id, url: "/api/workouts", body: payload });
    },
    onSuccess: (result) => { if (workoutDraftKey) window.sessionStorage.removeItem(workoutDraftKey); setDraftSavedAt(null); setDurationMinutes(""); setRpe(""); setMovingTimeMinutes(""); setElevationGainMeters(""); setAverageHeartRateBpm(""); setMaxHeartRateBpm(""); setHeartRateSource("manual"); setExercises([blankExercise(preferredLoadUnit)]); setEditingWorkoutId(null); setEditingWorkoutRevision(null); setWorkoutEditConflict(false); if (result && typeof result === "object" && "queued" in result && result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Workout saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else { void queryClient.invalidateQueries({ queryKey: ["/api/workouts"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/progress"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/records"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/history"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/cardio"] }); } },
    onError: (error: Error) => { const conflict = error.message.startsWith("409:"); if (conflict) setWorkoutEditConflict(true); toast({ title: conflict ? "A newer workout correction exists" : "Workout was not saved", description: conflict ? "Your unsaved fields are still here. Reload the latest version only when you are ready to compare and reapply them." : error.message, variant: "destructive" }); },
  });
  useEffect(() => { if (save.isSuccess) resetSession(); }, [save.isSuccess]);
  const removeWorkout = useMutation({
    mutationFn: async (id: number) => { const { workout } = await apiRequest<{ workout: Workout }>(`/api/workouts/${id}`); return apiRequest<{ receiptId: string; expiresAt: string }>(`/api/workouts/${id}`, { method: "DELETE", headers: { "x-lyfeos-expected-revision": String(workout.currentRevision) } }); },
    onSuccess: (receipt) => { setDeletedWorkout(receipt); void queryClient.invalidateQueries({ queryKey: ["/api/workouts"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/progress"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/records"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/history"] }); },
  });
  const restoreWorkout = useMutation({
    mutationFn: (receiptId: string) => apiRequest(`/api/workouts/deletions/${receiptId}/restore`, { method: "POST" }),
    onSuccess: () => { setDeletedWorkout(null); void queryClient.invalidateQueries({ queryKey: ["/api/workouts"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/progress"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/records"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/history"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workouts/cardio"] }); },
    onError: () => { setDeletedWorkout(null); toast({ title: "Undo is no longer available", variant: "destructive" }); },
  });
  const loadHistoricalWorkout = useMutation({
    mutationFn: (id: number) => apiRequest<{ workout: Workout }>(`/api/workouts/${id}`),
    onSuccess: ({ workout }) => { setWorkoutEditConflict(false); setDate(getLocalDateString(new Date(workout.occurredAt))); editWorkout(workout); },
  });
  const saveTemplate = useMutation({
    mutationFn: () => { const currentRevision = templateRevisions.data?.revisions[0]?.revisionNumber; if (selectedTemplateId && !currentRevision) throw new Error("Reload this template before saving changes."); return apiRequest(selectedTemplateId ? `/api/workout-templates/${selectedTemplateId}` : "/api/workout-templates", { method: selectedTemplateId ? "PATCH" : "POST", headers: selectedTemplateId ? { "x-lyfeos-expected-revision": String(currentRevision) } : undefined, body: JSON.stringify({ name: templateName, folder: templateFolder.trim() || null, note: templateNote.trim() || null, activityType, exercises: exercises.filter((exercise) => exercise.name.trim()).map((exercise) => ({ name: exercise.name.trim(), setRecords: exercise.sets.map((set) => ({ reps: set.reps ? Number(set.reps) : null, loadValue: set.load ? Number(set.load) : null, loadUnit: set.load ? set.loadUnit : null, distanceMeters: set.distance ? Number(set.distance) : null, durationSeconds: set.duration ? Number(set.duration) * 60 : null, perceivedExertion: set.rpe ? Number(set.rpe) : null, repsInReserve: set.rir ? Number(set.rir) : null })) })) }) }); },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workout-templates", selectedTemplateId, "revisions"] }); },
    onError: (error: Error) => toast({ title: error.message.startsWith("409:") ? "A newer template version exists" : "Template was not saved", description: error.message.startsWith("409:") ? "Your planned fields remain here. Reload the template before trying again." : error.message, variant: "destructive" }),
  });
  const duplicateTemplate = useMutation({
    mutationFn: () => apiRequest<{ template: WorkoutTemplate }>(`/api/workout-templates/${selectedTemplateId}/duplicate`, { method: "POST" }),
    onSuccess: ({ template }) => { void queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); setSelectedTemplateId(String(template.id)); setSelectedRevisionNumber(""); setTemplateName(template.name); setTemplateFolder(template.folder || ""); setTemplateNote(template.note || ""); },
    onError: (error: Error) => toast({ title: "Template was not duplicated", description: error.message, variant: "destructive" }),
  });
  const restoreTemplateRevision = useMutation({
    mutationFn: () => { const currentRevision = templateRevisions.data?.revisions[0]?.revisionNumber; if (!currentRevision) throw new Error("Reload this template before restoring a version."); return apiRequest<{ template: WorkoutTemplate }>(`/api/workout-templates/${selectedTemplateId}/revisions/${selectedRevisionNumber}/restore`, { method: "POST", headers: { "x-lyfeos-expected-revision": String(currentRevision) } }); },
    onSuccess: ({ template }) => { void queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); void queryClient.invalidateQueries({ queryKey: ["/api/workout-templates", selectedTemplateId, "revisions"] }); setSelectedRevisionNumber(""); setTemplateName(template.name); setTemplateFolder(template.folder || ""); setTemplateNote(template.note || ""); setActivityType(template.activityType); setExercises(template.exerciseBlueprint.map((exercise) => ({ name: exercise.name, sets: (exercise.setRecords?.length ? exercise.setRecords : [{}]).map((set) => ({ reps: set.reps ? String(set.reps) : "", load: set.loadValue ? String(set.loadValue) : "", loadUnit: set.loadUnit === "lb" ? "lb" : "kg", distance: set.distanceMeters ? String(set.distanceMeters) : "", duration: set.durationSeconds ? String(set.durationSeconds / 60) : "", rpe: set.perceivedExertion ? String(set.perceivedExertion) : "", rir: set.repsInReserve != null ? String(set.repsInReserve) : "", note: "", completed: true })) }))); },
    onError: (error: Error) => toast({ title: "Revision was not restored", description: error.message, variant: "destructive" }),
  });
  const draftTemplateMission = useMutation({
    mutationFn: () => apiRequest(`/api/workout-templates/${selectedTemplateId}/planning-draft`, { method: "POST" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["/api/health-insights/planning-drafts"] }); toast({ title: "Private mission draft created", description: "Review and confirm it in Health planning. No Mission or workout was created yet." }); },
    onError: (error: Error) => toast({ title: "Mission draft was not created", description: error.message, variant: "destructive" }),
  });
  const removeTemplate = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/workout-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelectedTemplateId(""); void queryClient.invalidateQueries({ queryKey: ["/api/workout-templates"] }); },
  });
  const loadTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setSelectedRevisionNumber("");
    const template = templates.data?.templates.find((item) => item.id === Number(id));
    if (!template) {
      setTemplateName("");
      setTemplateFolder("");
      setTemplateNote("");
      return;
    }
    setTemplateName(template.name);
    setTemplateFolder(template.folder || "");
    setTemplateNote(template.note || "");
    setActivityType(template.activityType);
    setExercises(template.exerciseBlueprint.map((exercise) => ({ name: exercise.name, sets: (exercise.setRecords?.length ? exercise.setRecords : [{}]).map((set) => ({ reps: set.reps ? String(set.reps) : "", load: set.loadValue ? String(set.loadValue) : "", loadUnit: set.loadUnit === "lb" ? "lb" : "kg", distance: set.distanceMeters ? String(set.distanceMeters) : "", duration: set.durationSeconds ? String(set.durationSeconds / 60) : "", rpe: set.perceivedExertion ? String(set.perceivedExertion) : "", rir: set.repsInReserve != null ? String(set.repsInReserve) : "", note: "", completed: true })) })));
  };
  const editWorkout = (workout: Workout) => {
    setEditingWorkoutId(workout.id);
    setEditingWorkoutRevision(workout.currentRevision);
    setWorkoutEditConflict(false);
    setActivityType(workout.activityType);
    setDurationMinutes(workout.durationMinutes ? String(workout.durationMinutes) : "");
    setRpe(workout.perceivedExertion ? String(workout.perceivedExertion) : "");
    setMovingTimeMinutes(workout.movingTimeSeconds ? String(workout.movingTimeSeconds / 60) : "");
    setElevationGainMeters(workout.elevationGainMeters != null ? String(workout.elevationGainMeters) : "");
    setAverageHeartRateBpm(workout.averageHeartRateBpm ? String(workout.averageHeartRateBpm) : "");
    setMaxHeartRateBpm(workout.maxHeartRateBpm ? String(workout.maxHeartRateBpm) : "");
    setHeartRateSource(workout.heartRateSource === "device" || workout.heartRateSource === "imported" ? workout.heartRateSource : "manual");
    setExercises(workout.exercises.length ? workout.exercises.map((exercise) => ({ name: exercise.name, sets: exercise.setRecords.length ? exercise.setRecords.map((set) => ({ reps: set.reps ? String(set.reps) : "", load: set.loadValue ? String(set.loadValue) : "", loadUnit: set.loadUnit === "lb" ? "lb" : "kg", distance: set.distanceMeters ? String(set.distanceMeters) : "", duration: set.durationSeconds ? String(set.durationSeconds / 60) : "", rpe: set.perceivedExertion ? String(set.perceivedExertion) : "", rir: set.repsInReserve != null ? String(set.repsInReserve) : "", note: set.note || "", completed: set.completed })) : [blankSet(preferredLoadUnit)] })) : [blankExercise(preferredLoadUnit)]);
  };
  const downloadWorkoutHistory = async () => {
    setHistoryExportError(null);
    if (!validHistoryPeriod) { setHistoryExportError("Choose a complete custom range of no more than 3,650 days that does not end in the future."); return; }
    try {
      const response = await fetch(`/api/workouts/history.csv?${historyPeriodQuery}&${historyFilterQuery.toString()}`, { credentials: "include", headers: timeContextHeaders() });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Workout export failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lyfeos-workouts-${customHistoryPeriod ? `${historyStartDate}-to-${historyEndDate}` : `${historyDays}d`}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setHistoryExportError(error instanceof Error ? error.message : "Workout export failed.");
    }
  };

  return <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="training-heading">
    <div className="flex items-start justify-between gap-4"><div><h2 id="training-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Dumbbell className="h-5 w-5" />Training log</h2><p className="text-sm text-muted-foreground mt-1">Record performed sets, not a prescription. Training is separate from mission completion and XP.</p></div><div className="text-right"><Input aria-label="Workout log date" className="h-8 w-36 text-xs" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><span className="block font-mono text-xs text-muted-foreground mt-1">{workouts.data?.workouts.length || 0} logged</span></div></div>
    <div className="grid gap-2 mt-4 sm:grid-cols-3"><Input aria-label="Activity type" value={activityType} onChange={(event) => setActivityType(event.target.value)} /><Input aria-label="Workout duration minutes" type="number" min="1" placeholder="Minutes" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /><Input aria-label="Workout perceived exertion 1 to 10" type="number" min="1" max="10" placeholder="Workout RPE 1–10" value={rpe} onChange={(event) => setRpe(event.target.value)} /></div>
    <div className="grid gap-2 mt-2 sm:grid-cols-5"><Input aria-label="Moving time minutes" type="number" min="0.1" step="0.1" placeholder="Moving min" value={movingTimeMinutes} onChange={(event) => setMovingTimeMinutes(event.target.value)} /><Input aria-label="Elevation gain meters" type="number" min="0" step="0.1" placeholder="Elevation m" value={elevationGainMeters} onChange={(event) => setElevationGainMeters(event.target.value)} /><Input aria-label="Average heart rate beats per minute" type="number" min="20" max="260" placeholder="Avg HR" value={averageHeartRateBpm} onChange={(event) => setAverageHeartRateBpm(event.target.value)} /><Input aria-label="Maximum heart rate beats per minute" type="number" min="20" max="260" placeholder="Max HR" value={maxHeartRateBpm} onChange={(event) => setMaxHeartRateBpm(event.target.value)} /><select aria-label="Heart rate source" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={heartRateSource} onChange={(event) => setHeartRateSource(event.target.value as "manual" | "device" | "imported")}><option value="manual">HR: manual</option><option value="device">HR: device</option><option value="imported">HR: imported</option></select></div>
    {!editingWorkoutId ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2" aria-label="Live workout session timer"><span className="text-xs font-medium">Live session</span><span className="min-w-16 font-mono text-sm text-primary" aria-live="polite">{String(Math.floor(sessionElapsedSeconds / 3600)).padStart(2, "0")}:{String(Math.floor(sessionElapsedSeconds % 3600 / 60)).padStart(2, "0")}:{String(sessionElapsedSeconds % 60).padStart(2, "0")}</span>{sessionState === "not_started" ? <Button variant="outline" size="sm" onClick={startSession}>Start</Button> : sessionState === "active" ? <Button variant="outline" size="sm" onClick={pauseSession}>Pause</Button> : <Button variant="outline" size="sm" onClick={resumeSession}>Resume</Button>}{sessionState !== "not_started" ? <Button variant="ghost" size="sm" onClick={resetSession}>Reset timer</Button> : null}<span className="text-[10px] text-muted-foreground">{sessionStartedAt ? `Started ${new Date(sessionStartedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. ` : ""}If duration is blank, finishing uses this elapsed time. No workout record exists until you finish and log.</span></div> : null}
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-muted/20 bg-background/20 px-3 py-2" aria-label="Workout rest timer">
      <Timer className="h-4 w-4 text-primary" />
      <span className="text-xs text-muted-foreground">Rest timer</span>
      <span className="min-w-12 font-mono text-sm" aria-live="polite">{String(Math.floor(restSeconds / 60)).padStart(2, "0")}:{String(restSeconds % 60).padStart(2, "0")}</span>
      <Button variant="outline" size="sm" onClick={() => restUntil == null ? setRestUntil(Date.now() + Math.max(restSeconds, 1) * 1000) : setRestUntil(null)}>{restUntil == null ? "Start" : "Pause"}</Button>
      <Button variant="ghost" size="sm" onClick={() => { setRestUntil(null); setRestSeconds(90); }}>Reset 90s</Button>
      <Button variant="ghost" size="sm" onClick={() => { setRestSeconds((seconds) => seconds + 30); if (restUntil != null) setRestUntil((until) => (until || Date.now()) + 30_000); }}>+30s</Button>
      <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Load unit<select aria-label="Default workout load unit" className="h-8 rounded-md border border-input bg-background px-2 text-foreground" value={preferredLoadUnit} onChange={(event) => { const unit = event.target.value as LoadUnit; setPreferredLoadUnit(unit); setExercises((items) => items.map((exercise) => ({ ...exercise, sets: exercise.sets.map((set) => ({ ...set, loadUnit: unit })) }))); }}><option value="kg">kg</option><option value="lb">lb</option></select></label>
    </div>
    <div className="grid gap-2 mt-2 sm:grid-cols-[1fr_1fr_auto_auto]"><select aria-label="Load workout template" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedTemplateId} onChange={(event) => loadTemplate(event.target.value)}><option value="">Load a template</option>{templates.data?.templates.map((template) => <option key={template.id} value={template.id}>{template.folder ? `${template.folder} / ` : ""}{template.name}</option>)}</select><Input aria-label="Workout template name" placeholder="Save current as template" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /><Button variant="outline" disabled={!templateName.trim() || !exercises.some((exercise) => exercise.name.trim()) || saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>{selectedTemplateId ? <Pencil /> : <Plus />}{selectedTemplateId ? "Update template" : "Save template"}</Button><Button variant="ghost" size="sm" aria-label="Delete selected workout template" disabled={!selectedTemplateId || removeTemplate.isPending} onClick={() => removeTemplate.mutate(Number(selectedTemplateId))}><Trash2 className="h-4 w-4" />Delete</Button></div>
    <div className="mt-2 grid gap-2 sm:grid-cols-2"><Input aria-label="Workout template folder" placeholder="Optional template folder" value={templateFolder} onChange={(event) => setTemplateFolder(event.target.value)} /><Input aria-label="Workout template note" placeholder="Optional planned-session note" value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} /></div>{selectedTemplateId ? <div className="mt-2 rounded-lg border border-muted/20 bg-background/20 p-3"><div className="flex flex-wrap items-center gap-2"><p className="mr-auto text-[11px] text-muted-foreground">{templateRevisions.data?.revisions.length || 0} immutable template revision(s). Restoring creates a new revision; it never rewrites history.</p><Button variant="outline" size="sm" disabled={duplicateTemplate.isPending} onClick={() => duplicateTemplate.mutate()}>Duplicate plan</Button><Button variant="outline" size="sm" disabled={draftTemplateMission.isPending} onClick={() => draftTemplateMission.mutate()}>Draft mission</Button><select aria-label="Workout template revision" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={selectedRevisionNumber} onChange={(event) => setSelectedRevisionNumber(event.target.value)}><option value="">Compare a revision</option>{templateRevisions.data?.revisions.map((revision) => <option key={revision.id} value={revision.revisionNumber}>v{revision.revisionNumber} · {new Date(revision.createdAt).toLocaleDateString()}</option>)}</select><Button variant="outline" size="sm" disabled={!selectedRevisionNumber || restoreTemplateRevision.isPending} onClick={() => restoreTemplateRevision.mutate()}>Restore as new version</Button></div>{selectedRevisionNumber ? (() => { const revision = templateRevisions.data?.revisions.find((item) => item.revisionNumber === Number(selectedRevisionNumber)); const current = templates.data?.templates.find((item) => item.id === Number(selectedTemplateId)); if (!revision || !current) return null; const revisionSets = revision.exerciseBlueprint.reduce((sum, exercise) => sum + (exercise.setRecords?.length || 0), 0); const currentSets = current.exerciseBlueprint.reduce((sum, exercise) => sum + (exercise.setRecords?.length || 0), 0); return <p className="mt-2 text-[11px] text-muted-foreground">v{revision.revisionNumber}: {revision.name} · {revision.activityType} · {revision.exerciseBlueprint.length} exercises / {revisionSets} planned sets. Current: {current.exerciseBlueprint.length} exercises / {currentSets} planned sets.</p>; })() : null}</div> : null}
    <datalist id="lyfeos-exercise-library">{exerciseLibrary.data?.exercises.map((exercise) => <option key={exercise.id} value={exercise.name}>{[exercise.category, exercise.equipment].filter(Boolean).join(" · ")}</option>)}</datalist>
    <div className="space-y-4 mt-4">{exercises.map((exercise, exerciseIndex) => <div key={exerciseIndex} className="rounded-lg border border-muted/20 bg-background/20 p-3">
      <div className="flex gap-2"><Input list="lyfeos-exercise-library" aria-label={`Exercise ${exerciseIndex + 1} name`} placeholder="Exercise or custom library search" value={exercise.name} onChange={(event) => editExercise(exerciseIndex, (item) => ({ ...item, name: event.target.value }))} /><Button variant="ghost" size="sm" disabled={exercises.length === 1} onClick={() => setExercises((items) => items.filter((_, index) => index !== exerciseIndex))}>Remove</Button></div>
      <div className="space-y-2 mt-2">{exercise.sets.map((set, setIndex) => <div key={setIndex} className="grid gap-2 sm:grid-cols-[4rem_6rem_6rem_6rem_5rem_5rem_1fr_auto_auto_auto]">
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} repetitions`} type="number" min="1" placeholder="Reps" value={set.reps} onChange={(event) => editSet(exerciseIndex, setIndex, "reps", event.target.value)} />
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} load ${set.loadUnit}`} type="number" min="0" step="0.5" placeholder={`Load ${set.loadUnit}`} value={set.load} onChange={(event) => editSet(exerciseIndex, setIndex, "load", event.target.value)} />
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} distance meters`} type="number" min="1" placeholder="Meters" value={set.distance} onChange={(event) => editSet(exerciseIndex, setIndex, "distance", event.target.value)} />
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} duration minutes`} type="number" min="1" placeholder="Minutes" value={set.duration} onChange={(event) => editSet(exerciseIndex, setIndex, "duration", event.target.value)} />
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} perceived exertion`} type="number" min="1" max="10" placeholder="RPE" value={set.rpe} onChange={(event) => editSet(exerciseIndex, setIndex, "rpe", event.target.value)} />
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} repetitions in reserve`} type="number" min="0" max="20" placeholder="RIR" value={set.rir} onChange={(event) => editSet(exerciseIndex, setIndex, "rir", event.target.value)} />
        <Input aria-label={`Exercise ${exerciseIndex + 1} set ${setIndex + 1} note`} placeholder="Set note" value={set.note} onChange={(event) => editSet(exerciseIndex, setIndex, "note", event.target.value)} />
        <Button variant={set.completed ? "outline" : "secondary"} size="sm" onClick={() => editExercise(exerciseIndex, (item) => ({ ...item, sets: item.sets.map((candidate, index) => index === setIndex ? { ...candidate, completed: !candidate.completed } : candidate) }))}>{set.completed ? "Done" : "Skipped"}</Button>
        <Button variant="ghost" size="sm" onClick={() => editExercise(exerciseIndex, (item) => ({ ...item, sets: [...item.sets, { ...set }] }))}>Repeat</Button>
        <Button variant="ghost" size="sm" disabled={exercise.sets.length === 1} onClick={() => editExercise(exerciseIndex, (item) => ({ ...item, sets: item.sets.filter((_, index) => index !== setIndex) }))}>Remove</Button>
      </div>)}</div>
      <Button className="mt-2" variant="outline" size="sm" onClick={() => editExercise(exerciseIndex, (item) => ({ ...item, sets: [...item.sets, blankSet(preferredLoadUnit)] }))}><Plus />Set</Button>
    </div>)}</div>
    <Button className="mt-2" variant="outline" size="sm" onClick={() => setExercises((items) => [...items, blankExercise(preferredLoadUnit)])}><Plus />Exercise</Button>
    <Button className="mt-2 ml-2" disabled={!activityType.trim() || save.isPending || (editingWorkoutId != null && editingWorkoutRevision == null)} onClick={() => save.mutate()}>{editingWorkoutId ? <Pencil /> : <Plus />}{editingWorkoutId ? "Update workout" : sessionState === "not_started" ? "Log workout" : "Finish & log workout"}</Button>
    {draftSavedAt && !editingWorkoutId ? <span className="ml-2 text-[10px] font-mono text-muted-foreground">Draft saved in this account session · {new Date(draftSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
    {editingWorkoutId ? <><Button className="mt-2 ml-2" variant="ghost" onClick={() => { setEditingWorkoutId(null); setEditingWorkoutRevision(null); setWorkoutEditConflict(false); setDurationMinutes(""); setRpe(""); setMovingTimeMinutes(""); setElevationGainMeters(""); setAverageHeartRateBpm(""); setMaxHeartRateBpm(""); setHeartRateSource("manual"); setExercises([blankExercise(preferredLoadUnit)]); }}>Cancel edit</Button><p className="mt-2 text-[11px] text-muted-foreground">Editing revision v{editingWorkoutRevision ?? "…"} · {workoutRevisions.data?.revisions.length || 0} immutable submitted-workout revision(s). Saving adds a snapshot and refuses to overwrite a newer correction.</p>{workoutEditConflict ? <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs" role="alert"><span>A newer correction was saved. Your unsaved fields remain above.</span><Button size="sm" variant="outline" disabled={loadHistoricalWorkout.isPending} onClick={() => loadHistoricalWorkout.mutate(editingWorkoutId)}>Reload latest version</Button></div> : null}</> : null}
    {save.error && <p className="text-xs text-destructive mt-2">Could not save that workout. Check the values and try again.</p>}
    {deletedWorkout ? <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs" role="status"><span>Workout deleted. Undo is available for 10 minutes.</span><Button size="sm" variant="outline" disabled={restoreWorkout.isPending} onClick={() => restoreWorkout.mutate(deletedWorkout.receiptId)}>Undo</Button></div> : null}
    {workouts.data?.workouts.length ? <div className="mt-4 space-y-2">{workouts.data.workouts.map((workout) => <div key={workout.id} className="flex items-center justify-between gap-2 rounded-lg border border-muted/20 bg-background/20 px-3 py-2 text-sm"><span>{workout.activityType}{workout.exercises.length ? ` · ${workout.exercises.map((exercise) => `${exercise.name} ${exercise.setRecords.map(formatSet).join(" / ")}`).join(", ")}` : ""}</span><div className="flex items-center gap-1"><span className="font-mono text-muted-foreground">{workout.durationMinutes ? `${workout.durationMinutes}m` : "duration not logged"}{workout.perceivedExertion ? ` · RPE ${workout.perceivedExertion}` : ""}</span><Button variant="ghost" size="icon" aria-label={`Edit ${workout.activityType} workout`} disabled={loadHistoricalWorkout.isPending} onClick={() => loadHistoricalWorkout.mutate(workout.id)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${workout.activityType} workout`} disabled={removeWorkout.isPending} onClick={() => removeWorkout.mutate(workout.id)}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div> : null}
    {progress.data?.progress.length ? <div className="mt-5 rounded-xl border border-primary/15 bg-background/20 p-3"><p className="text-sm font-semibold">Last 90 days</p><p className="text-[11px] text-muted-foreground mt-1">{progress.data.method.estimatedOneRepMax}</p><p className="text-[11px] text-muted-foreground">{progress.data.method.personalRecord}</p><div className="grid gap-2 mt-3 sm:grid-cols-2">{progress.data.progress.slice(0, 6).map((item) => <div key={`${item.exerciseName}-${item.loadUnit}`} className="rounded-lg border border-muted/20 px-3 py-2 text-xs"><p className="font-medium">{item.exerciseName} <span className="text-muted-foreground">· {item.loadUnit}</span></p><p className="font-mono text-primary mt-1">{item.totalVolume.toLocaleString()} volume · {item.performedSets} sets</p><p className="text-muted-foreground mt-1">Personal record: {item.bestObservedLoad ?? "—"}{item.estimatedOneRepMax ? ` · est. 1RM ${item.estimatedOneRepMax}` : ""}</p></div>)}</div><p className="text-[11px] text-muted-foreground mt-3">{progress.data.disclosure}</p></div> : null}
    {records.data?.records.length ? <div className="mt-5 rounded-xl border border-primary/15 bg-background/20 p-3"><p className="text-sm font-semibold">All-time submitted-workout records</p><p className="mt-1 text-[11px] text-muted-foreground">{records.data.calculations.observedLoadRecord.id}: {records.data.calculations.observedLoadRecord.definition}</p><p className="text-[11px] text-muted-foreground">{records.data.calculations.estimatedOneRepMax.id}: {records.data.calculations.estimatedOneRepMax.definition}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{records.data.records.slice(0, 12).map((record) => <div key={`${record.exerciseName}-${record.loadUnit}`} className="rounded-lg border border-muted/20 px-3 py-2 text-xs"><p className="font-medium">{record.exerciseName} · {record.loadUnit}</p><p className="mt-1 font-mono text-primary">Observed load {record.bestObservedLoad} · {new Date(record.observedLoadAt).toLocaleDateString()}</p><p className="mt-1 text-muted-foreground">Source workout #{record.observedLoadWorkoutId}, set #{record.observedLoadSetId}</p>{record.bestEstimatedOneRepMax ? <p className="mt-1 text-muted-foreground">Estimated 1RM {record.bestEstimatedOneRepMax} · source set #{record.estimatedSetId}</p> : null}</div>)}</div><p className="mt-3 text-[11px] text-muted-foreground">{records.data.disclosure}</p></div> : null}
    <div className="mt-5 rounded-xl border border-primary/15 bg-background/20 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Training history</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!validHistoryPeriod} onClick={downloadWorkoutHistory}><Download />Export ledger CSV</Button><select aria-label="Workout history period" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={historyDays} onChange={(event) => { setHistoryDays(Number(event.target.value)); setHistoryPage(0); setHistoryExportError(null); }}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="1095">3 years</option><option value="1825">5 years</option><option value="3650">10 years</option><option value="0">Custom dates</option></select><Input className="h-8 w-44 text-xs" aria-label="Filter workout history by activity" placeholder="Filter activity" value={historyActivity} onChange={(event) => { setHistoryActivity(event.target.value); setHistoryPage(0); setHistoryExportError(null); }} /><Input className="h-8 w-44 text-xs" aria-label="Filter workout history by exercise" placeholder="Filter exercise" value={historyExercise} onChange={(event) => { setHistoryExercise(event.target.value); setHistoryPage(0); setHistoryExportError(null); }} /></div></div><div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6"><select aria-label="Filter workout history by record source" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={historySource} onChange={(event) => { setHistorySource(event.target.value); setHistoryPage(0); }}><option value="">Any record source</option><option value="manual">Manual</option><option value="device">Device</option><option value="imported">Imported</option></select><select aria-label="Filter workout history by heart rate source" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={historyHeartRateSource} onChange={(event) => { setHistoryHeartRateSource(event.target.value); setHistoryPage(0); }}><option value="">Any HR source</option><option value="manual">Manual HR</option><option value="device">Device HR</option><option value="imported">Imported HR</option></select><select aria-label="Filter workout history by set evidence" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={historySetState} onChange={(event) => { setHistorySetState(event.target.value); setHistoryPage(0); }}><option value="any">Any set evidence</option><option value="performed">Has performed sets</option><option value="skipped_only">Skipped sets only</option><option value="no_sets">No atomic sets</option></select><select aria-label="Filter workout history by program link" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={historyProgramLink} onChange={(event) => { setHistoryProgramLink(event.target.value); setHistoryPage(0); }}><option value="any">Any program link</option><option value="linked">Linked to program</option><option value="unlinked">Not linked</option></select><Input aria-label="Minimum workout RPE filter" className="h-8 text-xs" type="number" min="1" max="10" placeholder="Min RPE" value={historyRpeMin} onChange={(event) => { setHistoryRpeMin(event.target.value); setHistoryPage(0); }} /><Input aria-label="Maximum workout RPE filter" className="h-8 text-xs" type="number" min="1" max="10" placeholder="Max RPE" value={historyRpeMax} onChange={(event) => { setHistoryRpeMax(event.target.value); setHistoryPage(0); }} /></div>{customHistoryPeriod ? <div className="mt-2 flex flex-wrap items-center gap-2"><Input className="h-8 w-40 text-xs" aria-label="Workout history start date" type="date" max={historyEndDate || today()} value={historyStartDate} onChange={(event) => { setHistoryStartDate(event.target.value); setHistoryPage(0); setHistoryExportError(null); }} /><span className="text-xs text-muted-foreground">through</span><Input className="h-8 w-40 text-xs" aria-label="Workout history end date" type="date" min={historyStartDate} max={today()} value={historyEndDate} onChange={(event) => { setHistoryEndDate(event.target.value); setHistoryPage(0); setHistoryExportError(null); }} />{!validHistoryPeriod ? <span className="text-xs text-destructive" role="alert">Choose a complete range that does not end in the future.</span> : null}</div> : null}{history.data?.period && validHistoryPeriod ? <p className="mt-2 text-[10px] text-muted-foreground">Showing {history.data.period.startDate} through {history.data.period.endDate} in {history.data.period.timeZone}.</p> : null}{history.data?.workouts.length ? <div className="mt-3 space-y-2">{history.data.workouts.map((workout) => <div key={workout.id} className="flex items-start justify-between gap-3 rounded-lg border border-muted/20 px-3 py-2 text-xs"><div><p className="font-medium">{new Date(workout.occurredAt).toLocaleDateString()} · {workout.activityType}</p><p className="mt-1 text-muted-foreground">{workout.exerciseNames.join(", ") || "No exercises recorded"}</p><p className="mt-1 text-[10px] text-muted-foreground">{workout.source} record{workout.heartRateSource ? ` · ${workout.heartRateSource} HR` : ""}{workout.perceivedExertion ? ` · RPE ${workout.perceivedExertion}` : ""}{workout.programLink ? ` · program ${workout.programLink.programId}` : " · no program link"}</p></div><div className="flex shrink-0 items-center gap-1"><span className="font-mono text-primary">{workout.performedSets} performed{workout.recordedSets !== workout.performedSets ? ` / ${workout.recordedSets} recorded` : ""} sets{workout.durationMinutes ? ` · ${workout.durationMinutes}m` : ""}</span><Button variant="ghost" size="icon" aria-label={`Edit ${workout.activityType} workout from ${new Date(workout.occurredAt).toLocaleDateString()}`} disabled={loadHistoricalWorkout.isPending} onClick={() => loadHistoricalWorkout.mutate(workout.id)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${workout.activityType} workout from history`} disabled={removeWorkout.isPending} onClick={() => removeWorkout.mutate(workout.id)}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">No workouts match the selected period and structured filters.</p>}<div className="mt-3 flex items-center justify-between"><Button variant="ghost" size="sm" disabled={historyPage === 0 || !validHistoryPeriod} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>Previous</Button><span className="font-mono text-[10px] text-muted-foreground">Page {historyPage + 1}</span><Button variant="ghost" size="sm" disabled={!history.data?.hasMore || !validHistoryPeriod} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button></div><p className="mt-3 text-[11px] text-muted-foreground">{history.data?.disclosure || "History lists only your recorded workouts, not a fitness or readiness score."}</p>{historyExportError ? <p className="mt-2 text-xs text-destructive" role="alert">{historyExportError}</p> : null}</div>
    {cardio.data?.sessions.length ? <div className="mt-5 rounded-xl border border-primary/15 bg-background/20 p-3"><p className="text-sm font-semibold">Recorded cardio</p><div className="mt-3 space-y-2">{cardio.data.sessions.slice(0, 5).map((session, index) => <div key={`${session.occurredAt}-${index}`} className="flex justify-between gap-3 rounded-lg border border-muted/20 px-3 py-2 text-xs"><span>{new Date(session.occurredAt).toLocaleDateString()} · {(session.distanceMeters / 1000).toFixed(2)} km · {Math.round((session.movingTimeSeconds || session.durationSeconds) / 60)}m{session.elevationGainMeters != null ? ` · +${session.elevationGainMeters}m` : ""}{session.averageHeartRateBpm ? ` · avg ${session.averageHeartRateBpm} bpm${session.averageHeartRateZone ? ` (${session.averageHeartRateZone})` : ""}` : ""}{session.maxHeartRateBpm ? ` · max ${session.maxHeartRateBpm} bpm` : ""}{session.heartRateSource ? ` · ${session.heartRateSource}` : ""}</span><span className="text-right font-mono text-primary">{session.paceSecondsPerKilometer == null ? "Pace unavailable" : <>{Math.floor(session.paceSecondsPerKilometer / 60)}:{String(Math.round(session.paceSecondsPerKilometer % 60)).padStart(2, "0")}/km{session.speedKilometersPerHour != null ? <span className="block text-[10px] text-muted-foreground">{session.speedKilometersPerHour.toFixed(2)} km/h</span> : null}</>}</span></div>)}</div><p className="mt-3 text-[11px] text-muted-foreground">{cardio.data.disclosure}</p></div> : null}
  </section>;
}
