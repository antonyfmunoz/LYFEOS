import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Play, Plus, RotateCcw, Save, ShieldCheck, Trash2, Workflow } from "lucide-react";
import {
  defaultAutomationDefinition,
  type AutomationAction,
  type AutomationDefinition,
  type AutomationTriggerType,
} from "@shared/automations";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type AutomationRecord = {
  id: number; name: string; description: string | null; definition: AutomationDefinition;
  enabled: boolean; consecutiveFailures: number; pausedAt: string | null; pauseReason: string | null;
  scheduleNextRunAt: string | null; scheduleLastScheduledFor: string | null; scheduleOccurrencesRun: number;
  createdAt: string; updatedAt: string;
};
type AutomationRun = {
  id: number; status: string; triggerType: string; triggerQuestId: number | null;
  actionResults: Array<{ actionIndex: number; type: string; status: string; targetQuestId?: number; attemptCount: number; errorCode?: string }>;
  errorCode: string | null;
  triggerContext: { scheduledFor?: string; localDate?: string; timeZone?: string; delayed?: boolean; missedOccurrences?: number; consolidatedOccurrences?: number } | null;
  createdAt: string; completedAt: string | null;
};
type MissionOption = { id: number; title: string; category: string | null; completed: boolean };

const triggerLabels: Record<AutomationTriggerType, string> = {
  mission_created: "When a mission is created",
  mission_completed: "When a mission is completed",
  manual: "Only when I run it",
  schedule: "On a private schedule",
};

function browserLocalDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Please try again.";
  try {
    const body = error.message.slice(error.message.indexOf("{") || 0);
    return JSON.parse(body).error || error.message;
  } catch { return error.message; }
}

function readableToken(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionLabel(type: string): string {
  if (type === "set_mission_category") return "Set Mission category";
  if (type === "schedule_follow_up") return "Create follow-up Mission";
  return readableToken(type);
}

function receiptTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export default function AutomationsPage() {
  usePageTitle("Automations");
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<AutomationDefinition>(defaultAutomationDefinition);
  const [missionId, setMissionId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ matched: boolean; actions: Array<{ type: string; description: string }>; disclosure: string } | null>(null);

  const list = useQuery<{ automations: AutomationRecord[]; limits: { automations: number; actionsPerAutomation: number } }>({
    queryKey: ["/api/automations"], queryFn: () => apiRequest("/api/automations"),
  });
  const missions = useQuery<{ missions: MissionOption[] }>({ queryKey: ["/api/automations/missions"], queryFn: () => apiRequest("/api/automations/missions") });
  const detail = useQuery<{ automation: AutomationRecord; runs: AutomationRun[] }>({
    queryKey: ["/api/automations", selectedId],
    queryFn: () => apiRequest(`/api/automations/${selectedId}`),
    enabled: selectedId !== null,
  });

  useEffect(() => {
    if (!selectedId && list.data?.automations[0]) setSelectedId(list.data.automations[0].id);
  }, [list.data, selectedId]);
  useEffect(() => {
    if (!missionId && missions.data?.missions[0]) setMissionId(missions.data.missions[0].id);
  }, [missions.data, missionId]);
  useEffect(() => {
    if (!detail.data?.automation) return;
    setName(detail.data.automation.name);
    setDescription(detail.data.automation.description || "");
    setDefinition(detail.data.automation.definition);
    if (detail.data.automation.definition.trigger.type === "schedule") setMissionId(detail.data.automation.definition.trigger.questId);
    setPreview(null);
  }, [detail.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] }),
      selectedId ? queryClient.invalidateQueries({ queryKey: ["/api/automations", selectedId] }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ["/api/automations/missions"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () => apiRequest<{ automation: AutomationRecord }>("/api/automations", { method: "POST", body: JSON.stringify({ name: "New automation", description: "", definition: defaultAutomationDefinition }) }),
    onSuccess: async ({ automation }) => { await queryClient.invalidateQueries({ queryKey: ["/api/automations"] }); setSelectedId(automation.id); toast({ title: "Automation draft created", description: "It is disabled until you choose to enable it." }); },
    onError: (error) => toast({ title: "Could not create automation", description: errorMessage(error), variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: () => apiRequest(`/api/automations/${selectedId}`, { method: "PATCH", body: JSON.stringify({ name, description: description || null, definition }) }),
    onSuccess: async () => { await refresh(); toast({ title: "Automation saved" }); },
    onError: (error) => toast({ title: "Could not save automation", description: errorMessage(error), variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => apiRequest(`/api/automations/${selectedId}`, { method: "PATCH", body: JSON.stringify({ name, description: description || null, definition, enabled }) }),
    onSuccess: async (_data, enabled) => { await refresh(); toast({ title: enabled ? "Automation enabled" : "Automation paused" }); },
    onError: (error) => toast({ title: "Could not change automation", description: errorMessage(error), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiRequest(`/api/automations/${selectedId}`, { method: "DELETE" }),
    onSuccess: async () => { setSelectedId(null); await queryClient.invalidateQueries({ queryKey: ["/api/automations"] }); toast({ title: "Automation deleted", description: "Existing run receipts remain in your account export." }); },
  });
  const previewMutation = useMutation({
    mutationFn: () => apiRequest<{ preview: typeof preview }>(`/api/automations/${selectedId}/preview`, { method: "POST", body: JSON.stringify({ questId: missionId }) }),
    onSuccess: ({ preview: value }) => setPreview(value),
    onError: (error) => toast({ title: "Could not preview automation", description: errorMessage(error), variant: "destructive" }),
  });
  const run = useMutation({
    mutationFn: (mutationId: string) => apiRequest<{ result: { status: string } }>(`/api/automations/${selectedId}/run`, { method: "POST", body: JSON.stringify({ questId: missionId, mutationId }) }),
    onSuccess: async ({ result }) => { await refresh(); toast({ title: `Automation ${result.status}`, description: "Review the run receipt below and the affected mission records." }); },
    onError: (error) => toast({ title: "Automation did not run", description: errorMessage(error), variant: "destructive" }),
  });
  const repair = useMutation({
    mutationFn: (runId: number) => apiRequest<{ result: { status: string } }>(`/api/automations/${selectedId}/runs/${runId}/repair`, { method: "POST" }),
    onSuccess: async ({ result }) => { await refresh(); toast({ title: result.status === "succeeded" ? "Run repaired" : `Repair ${result.status}`, description: result.status === "succeeded" ? "Only unfinished actions were applied. Re-enable the rule when you are ready." : "The receipt remains available for another explicit review." }); },
    onError: (error) => toast({ title: "Could not repair run", description: errorMessage(error), variant: "destructive" }),
  });

  const setTrigger = (type: AutomationTriggerType) => setDefinition((current) => type === "schedule" ? ({
    ...current,
    version: 2,
    trigger: {
      type: "schedule",
      questId: missionId || missions.data?.missions[0]?.id || 0,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      localTime: "09:00",
      cadence: "daily",
      weekdays: [],
      startDate: browserLocalDate(),
      endDate: null,
      maxOccurrences: 30,
      missedRunPolicy: "run_once",
    },
  }) : ({ ...current, version: 1, trigger: { type } }));
  const updateAction = (index: number, action: AutomationAction) => setDefinition((current) => ({ ...current, actions: current.actions.map((item, itemIndex) => itemIndex === index ? action : item) }));
  const addAction = () => setDefinition((current) => current.actions.length >= 3 ? current : ({ ...current, actions: [...current.actions, { type: "set_mission_category", category: "general" }] }));
  const deleteAction = (index: number) => setDefinition((current) => current.actions.length === 1 ? current : ({ ...current, actions: current.actions.filter((_, itemIndex) => itemIndex !== index) }));
  const automation = detail.data?.automation;

  return <div data-testid="automations-page" className="container max-w-6xl space-y-5 py-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-mono uppercase tracking-[0.14em] text-primary">Private mission orchestration</p><h1 className="font-orbitron text-2xl">Automations</h1><p className="max-w-2xl text-sm text-muted-foreground">Turn explicit mission events into bounded, auditable actions. Automations cannot complete or delete missions, interpret health data, contact providers, or write to another product.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link href="/document-vault">Data Vault</Link></Button><Button data-testid="automation-create" onClick={() => create.mutate()} disabled={create.isPending || (list.data?.automations.length || 0) >= 25}><Plus className="mr-1 h-4 w-4" />New automation</Button></div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside aria-label="Automation rules" className="space-y-2 rounded-xl border border-primary/15 bg-card/35 p-3">
        <p className="px-2 text-xs text-muted-foreground">{list.data?.automations.length || 0} of {list.data?.limits.automations || 25} automations</p>
        {list.isLoading ? <p data-testid="automation-list-loading" role="status" aria-live="polite" className="p-5 text-center text-sm text-muted-foreground">Loading automations…</p> : list.isError ? <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm"><p>Automations could not be loaded.</p><Button size="sm" variant="outline" onClick={() => list.refetch()}>Try again</Button></div> : list.data?.automations.length ? list.data.automations.map((item) => <button key={item.id} data-testid={`automation-list-item-${item.id}`} type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedId === item.id ? "border-primary/45 bg-primary/10" : "border-transparent hover:bg-primary/5"}`}><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm font-medium">{item.name}</strong><span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.enabled ? "bg-emerald-400" : item.pauseReason ? "bg-amber-400" : "bg-muted-foreground/40"}`} /><span className="sr-only">{item.enabled ? "Enabled" : item.pauseReason ? "Paused with an issue" : "Paused"}</span></span><span className="mt-1 block text-xs text-muted-foreground">{triggerLabels[item.definition.trigger.type]}</span></button>) : <p className="p-5 text-center text-sm text-muted-foreground">No automations yet.</p>}
      </aside>

      {selectedId && detail.isLoading ? <div role="status" aria-live="polite" className="rounded-xl border border-primary/15 p-10 text-center text-sm text-muted-foreground">Loading automation details…</div> : selectedId && detail.isError ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-6 text-sm"><p>Automation details could not be loaded. Your saved rule was not changed.</p><Button size="sm" variant="outline" onClick={() => detail.refetch()}>Try again</Button></div> : automation ? <div data-testid={`automation-editor-${automation.id}`} aria-label="Selected automation editor" className="space-y-5">
        <section className="space-y-4 rounded-xl border border-primary/15 bg-card/35 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Workflow className="h-5 w-5 text-primary" /><strong>Rule</strong><span className={`rounded-full px-2 py-0.5 text-[11px] ${automation.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-muted text-muted-foreground"}`}>{automation.enabled ? "Enabled" : "Paused"}</span></div><div className="flex gap-2"><Button data-testid="automation-toggle" size="sm" variant="outline" onClick={() => toggle.mutate(!automation.enabled)} disabled={!name.trim() || toggle.isPending}>{automation.enabled ? "Save & pause" : "Save & enable"}</Button><Button data-testid="automation-save" size="sm" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}><Save className="mr-1 h-4 w-4" />Save</Button><Button data-testid="automation-delete" size="icon" variant="ghost" aria-label="Delete automation" onClick={() => { if (window.confirm(`Delete “${automation.name}”? Run receipts remain in your account history.`)) remove.mutate(); }}><Trash2 className="h-4 w-4" /></Button></div></div>
          <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-xs text-muted-foreground">Name<Input data-testid="automation-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label className="space-y-1 text-xs text-muted-foreground">Trigger<select data-testid="automation-trigger" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={definition.trigger.type} onChange={(event) => setTrigger(event.target.value as AutomationTriggerType)}>{Object.entries(triggerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          <label className="block space-y-1 text-xs text-muted-foreground">Description<Textarea data-testid="automation-description" value={description} maxLength={800} onChange={(event) => setDescription(event.target.value)} placeholder="Why this rule exists" /></label>
          {definition.trigger.type === "schedule" ? <div data-testid="automation-schedule-editor" className="space-y-3 rounded-lg border border-primary/10 p-4">
            <div><strong>Schedule</strong><p className="text-xs text-muted-foreground">Times use the saved IANA time zone. Recurrence is bounded; a missed window either skips safely or consolidates to one run.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">Anchor Mission<select data-testid="automation-schedule-anchor" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={definition.trigger.questId || ""} onChange={(event) => { const questId = Number(event.target.value); setMissionId(questId); setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, questId } }) : current); }}><option value="" disabled>Select a mission</option>{missions.data?.missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></label>
              <label className="space-y-1 text-xs text-muted-foreground">IANA time zone<Input data-testid="automation-schedule-time-zone" value={definition.trigger.timeZone} maxLength={100} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, timeZone: event.target.value } }) : current)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Local time<Input data-testid="automation-schedule-local-time" type="time" value={definition.trigger.localTime} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, localTime: event.target.value } }) : current)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Cadence<select data-testid="automation-schedule-cadence" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={definition.trigger.cadence} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, cadence: event.target.value as "daily" | "weekly", weekdays: event.target.value === "daily" ? [] : (current.trigger.weekdays.length ? current.trigger.weekdays : [new Date(`${current.trigger.startDate}T00:00:00.000Z`).getUTCDay()]) } }) : current)}><option value="daily">Daily</option><option value="weekly">Selected weekdays</option></select></label>
              {definition.trigger.cadence === "weekly" ? <fieldset className="md:col-span-2"><legend className="text-xs text-muted-foreground">Weekdays</legend><div className="mt-1 flex flex-wrap gap-1">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => <button data-testid={`automation-schedule-weekday-${day}`} key={label} type="button" aria-pressed={definition.trigger.type === "schedule" && definition.trigger.weekdays.includes(day)} onClick={() => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, weekdays: current.trigger.weekdays.includes(day) ? current.trigger.weekdays.filter((value) => value !== day) : [...current.trigger.weekdays, day].sort() } }) : current)} className={`rounded border px-2 py-1 text-xs ${definition.trigger.type === "schedule" && definition.trigger.weekdays.includes(day) ? "border-primary/50 bg-primary/10 text-primary" : "border-muted/25 text-muted-foreground"}`}>{label}</button>)}</div></fieldset> : null}
              <label className="space-y-1 text-xs text-muted-foreground">Starts<Input data-testid="automation-schedule-start-date" type="date" value={definition.trigger.startDate} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, startDate: event.target.value } }) : current)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Ends (optional)<Input data-testid="automation-schedule-end-date" type="date" value={definition.trigger.endDate || ""} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, endDate: event.target.value || null } }) : current)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Maximum occurrences<Input data-testid="automation-schedule-max-occurrences" type="number" min={1} max={365} value={definition.trigger.maxOccurrences} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, maxOccurrences: Math.min(365, Math.max(1, Number(event.target.value) || 1)) } }) : current)} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">If LyfeOS was unavailable<select data-testid="automation-schedule-missed-run-policy" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={definition.trigger.missedRunPolicy} onChange={(event) => setDefinition((current) => current.trigger.type === "schedule" ? ({ ...current, trigger: { ...current.trigger, missedRunPolicy: event.target.value as "skip" | "run_once" } }) : current)}><option value="run_once">Run once, then continue</option><option value="skip">Skip missed occurrences</option></select></label>
            </div>
            <p data-testid="automation-schedule-status" role="status" aria-live="polite" className="text-xs text-muted-foreground">Consumed {automation.scheduleOccurrencesRun} occurrence{automation.scheduleOccurrencesRun === 1 ? "" : "s"}{automation.scheduleNextRunAt ? ` · next ${new Date(automation.scheduleNextRunAt).toLocaleString()} (${definition.trigger.timeZone})` : " · no future occurrence"}{automation.scheduleLastScheduledFor ? ` · last scheduled ${new Date(automation.scheduleLastScheduledFor).toLocaleString()}` : ""}</p>
          </div> : null}
          {automation.pauseReason ? <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /><div><strong>{automation.pauseReason === "SCHEDULE_COMPLETE" ? "Bounded schedule complete" : automation.pauseReason === "SCHEDULE_ANCHOR_UNAVAILABLE" ? "Schedule anchor unavailable" : `Automation paused: ${automation.pauseReason.replaceAll("_", " ").toLowerCase()}`}</strong><p className="text-xs text-muted-foreground">{automation.pauseReason === "SCHEDULE_COMPLETE" ? "Revise the schedule before enabling it again." : automation.pauseReason === "SCHEDULE_ANCHOR_UNAVAILABLE" ? "Choose an existing Mission as the anchor, save, and explicitly enable the rule." : "Review and repair the receipts below. Enabling the rule explicitly resets the failure counter."}</p></div></div> : null}
        </section>

        <section className="space-y-4 rounded-xl border border-primary/15 bg-card/35 p-5"><div><strong>Only when</strong><p className="text-xs text-muted-foreground">Leave both blank to match every mission for this trigger.</p></div><div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-xs text-muted-foreground">Title contains<Input data-testid="automation-condition-title" value={definition.conditions.titleContains || ""} maxLength={120} onChange={(event) => setDefinition((current) => ({ ...current, conditions: { ...current.conditions, titleContains: event.target.value || null } }))} placeholder="e.g. outreach" /></label><label className="space-y-1 text-xs text-muted-foreground">Category equals<Input data-testid="automation-condition-category" value={definition.conditions.category || ""} maxLength={80} onChange={(event) => setDefinition((current) => ({ ...current, conditions: { ...current.conditions, category: event.target.value || null } }))} placeholder="e.g. business" /></label></div></section>

        <section className="space-y-4 rounded-xl border border-primary/15 bg-card/35 p-5"><div className="flex items-center justify-between"><div><strong>Then</strong><p className="text-xs text-muted-foreground">Actions run in order. Execution stops safely on the first failure.</p></div><Button size="sm" variant="outline" onClick={addAction} disabled={definition.actions.length >= 3}><Plus className="mr-1 h-4 w-4" />Action</Button></div>{definition.actions.map((action, index) => <div key={index} className="space-y-3 rounded-lg border border-primary/10 p-4"><div className="flex items-center justify-between gap-2"><select data-testid={`automation-action-type-${index}`} aria-label={`Action ${index + 1} type`} className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={action.type} onChange={(event) => updateAction(index, event.target.value === "set_mission_category" ? { type: "set_mission_category", category: "general" } : { type: "schedule_follow_up", title: "Follow up", description: "", category: "general", delayDays: 1 })}><option value="set_mission_category">Set mission category</option><option value="schedule_follow_up">Create follow-up mission</option></select><Button size="icon" variant="ghost" aria-label={`Remove action ${index + 1}`} disabled={definition.actions.length === 1} onClick={() => deleteAction(index)}><Trash2 className="h-4 w-4" /></Button></div>{action.type === "set_mission_category" ? <label className="block space-y-1 text-xs text-muted-foreground">Category<Input data-testid={`automation-action-category-${index}`} value={action.category} maxLength={80} onChange={(event) => updateAction(index, { ...action, category: event.target.value })} /></label> : <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-xs text-muted-foreground">Follow-up title<Input data-testid={`automation-action-title-${index}`} value={action.title} maxLength={160} onChange={(event) => updateAction(index, { ...action, title: event.target.value })} /></label><label className="space-y-1 text-xs text-muted-foreground">Due after days<Input data-testid={`automation-action-delay-${index}`} type="number" min={0} max={365} value={action.delayDays} onChange={(event) => updateAction(index, { ...action, delayDays: Math.min(365, Math.max(0, Number(event.target.value) || 0)) })} /></label><label className="space-y-1 text-xs text-muted-foreground">Category<Input data-testid={`automation-action-category-${index}`} value={action.category} maxLength={80} onChange={(event) => updateAction(index, { ...action, category: event.target.value })} /></label><label className="space-y-1 text-xs text-muted-foreground md:col-span-2">Description<Textarea data-testid={`automation-action-description-${index}`} value={action.description} maxLength={1000} onChange={(event) => updateAction(index, { ...action, description: event.target.value })} /></label></div>}</div>)}</section>

        <section className="space-y-4 rounded-xl border border-primary/15 bg-card/35 p-5"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><strong>Preview and controlled run</strong><p className="text-xs text-muted-foreground">Preview evaluates the last saved rule without writing. “Run now” is available only for an enabled, saved manual rule; schedules run only at their recorded due time.</p></div></div><div className="flex flex-wrap gap-2"><select data-testid="automation-preview-mission" aria-label="Preview mission" className="h-9 min-w-64 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={missionId || ""} onChange={(event) => setMissionId(Number(event.target.value))}><option value="" disabled>Select a mission</option>{missions.data?.missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.completed ? "✓ " : ""}{mission.title}</option>)}</select><Button data-testid="automation-preview" variant="outline" disabled={!missionId || previewMutation.isPending || save.isPending || toggle.isPending} onClick={() => previewMutation.mutate()}>Preview</Button><Button data-testid="automation-run-now" disabled={!missionId || automation.definition.trigger.type !== "manual" || !automation.enabled || run.isPending || save.isPending || toggle.isPending} onClick={() => run.mutate(crypto.randomUUID())}><Play className="mr-1 h-4 w-4" />Run now</Button></div>{preview ? <div data-testid="automation-preview-result" className={`rounded-lg border p-3 text-sm ${preview.matched ? "border-primary/25 bg-primary/5" : "border-amber-500/25 bg-amber-500/5"}`}><p>{preview.disclosure}</p>{preview.actions.map((action, index) => <p key={index} className="mt-1 text-xs text-muted-foreground">{index + 1}. {action.description}</p>)}</div> : null}</section>

        <section data-testid="automation-run-history" className="space-y-3 rounded-xl border border-primary/15 bg-card/35 p-5">
          <div><strong>Run history</strong><p className="text-xs text-muted-foreground">Receipts contain action types, outcomes, attempts, record IDs, and bounded schedule context—not copied mission descriptions. Repair retries only unfinished actions from the immutable saved rule and never replays an action that already succeeded.</p></div>
          {detail.data?.runs.length ? <div className="space-y-3">{detail.data.runs.map((receipt) => {
            const createdAt = receiptTime(receipt.createdAt);
            const completedAt = receiptTime(receipt.completedAt);
            const scheduledFor = receiptTime(receipt.triggerContext?.scheduledFor);
            const repairable = ["failed", "partial", "running"].includes(receipt.status) && receipt.errorCode !== "SCHEDULE_ANCHOR_UNAVAILABLE";
            return <article key={receipt.id} data-testid={`automation-run-${receipt.id}`} className="space-y-3 rounded-lg border border-primary/10 p-4 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p><strong className="font-medium">{readableToken(receipt.status)}</strong> · Run #{receipt.id} · {readableToken(receipt.triggerType)}</p>
                  <p data-testid={`automation-run-${receipt.id}-metadata`} className="text-muted-foreground">Started {createdAt || "at an unavailable time"}{completedAt ? ` · completed ${completedAt}` : " · not completed"}{receipt.triggerQuestId ? ` · trigger Mission #${receipt.triggerQuestId}` : ""}</p>
                  {receipt.errorCode ? <p data-testid={`automation-run-${receipt.id}-error`} className="text-amber-300">Run issue: {readableToken(receipt.errorCode)}</p> : null}
                </div>
                {repairable ? <Button data-testid={`automation-run-repair-${receipt.id}`} aria-label={`Retry unfinished actions for run ${receipt.id}`} size="sm" variant="outline" disabled={repair.isPending && repair.variables === receipt.id} onClick={() => repair.mutate(receipt.id)}><RotateCcw className="mr-1 h-3.5 w-3.5" />{repair.isPending && repair.variables === receipt.id ? "Repairing…" : "Repair"}</Button> : null}
              </div>
              {receipt.triggerContext ? <div data-testid={`automation-run-${receipt.id}-schedule`} className="rounded-md bg-primary/5 p-3 text-muted-foreground">
                <p><span className="text-foreground">Schedule context</span>{scheduledFor ? ` · due ${scheduledFor}` : ""}{receipt.triggerContext.localDate ? ` · local date ${receipt.triggerContext.localDate}` : ""}{receipt.triggerContext.timeZone ? ` · ${receipt.triggerContext.timeZone}` : ""}</p>
                {receipt.triggerContext.delayed || receipt.triggerContext.missedOccurrences || receipt.triggerContext.consolidatedOccurrences ? <p className="mt-1">{receipt.triggerContext.delayed ? "Delayed run" : "On-time run"}{receipt.triggerContext.missedOccurrences ? ` · ${receipt.triggerContext.missedOccurrences} missed occurrence${receipt.triggerContext.missedOccurrences === 1 ? "" : "s"}` : ""}{receipt.triggerContext.consolidatedOccurrences ? ` · ${receipt.triggerContext.consolidatedOccurrences} consolidated` : ""}</p> : null}
              </div> : null}
              {receipt.actionResults.length ? <ol aria-label={`Actions for run ${receipt.id}`} className="space-y-2">{[...receipt.actionResults].sort((left, right) => left.actionIndex - right.actionIndex).map((result) => <li key={result.actionIndex} data-testid={`automation-run-${receipt.id}-action-${result.actionIndex}`} className="flex flex-wrap justify-between gap-2 rounded-md border border-primary/10 px-3 py-2">
                <span><strong className="font-medium">Action {result.actionIndex + 1}: {actionLabel(result.type)}</strong>{result.targetQuestId ? ` · Mission #${result.targetQuestId}` : ""}</span>
                <span className="text-muted-foreground">{readableToken(result.status)} · {result.attemptCount} attempt{result.attemptCount === 1 ? "" : "s"}{result.errorCode ? ` · ${readableToken(result.errorCode)}` : ""}</span>
              </li>)}</ol> : <p className="text-muted-foreground">No action was applied for this run.</p>}
              {receipt.errorCode === "SCHEDULE_ANCHOR_UNAVAILABLE" ? <p role="note" className="text-muted-foreground">Repair is unavailable because the saved anchor Mission no longer exists. Choose an existing Mission, save the schedule, and explicitly enable it.</p> : null}
            </article>;
          })}</div> : <p data-testid="automation-run-history-empty" className="text-sm text-muted-foreground">No actual runs yet. Previews are intentionally not stored as executions.</p>}
        </section>
      </div> : <div className="rounded-xl border border-dashed border-primary/20 p-10 text-center text-sm text-muted-foreground">Create an automation to begin.</div>}
    </div>
  </div>;
}
