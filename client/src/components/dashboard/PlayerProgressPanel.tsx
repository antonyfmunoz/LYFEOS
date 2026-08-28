import { Award, CheckCircle2, Flame, HeartPulse, LockKeyhole, Route, ShieldCheck, Sparkles } from "lucide-react";

type PlayerProgressPanelProps = {
  progression: any;
  compact?: boolean;
};

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Award }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-background/35 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="text-xl font-orbitron text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

export function PlayerProgressPanel({ progression, compact = false }: PlayerProgressPanelProps) {
  if (!progression) return null;
  const tracks = progression.tracks || {};
  const activity = tracks.activity || {};
  const consistency = tracks.consistency || {};
  const capability = tracks.capability || {};
  const health = tracks.healthPractice || {};
  const authority = tracks.authority || {};
  const recentEvents = activity.recentEvents || [];
  const badges = progression.badges || [];
  const badgeProgress = (progression.badgeProgress || []).filter((badge: any) => !badge.active).slice(0, compact ? 1 : 4);
  const missionActivityExperience = Number(activity.sourceTotals?.mission || 0);
  const goalActivityExperience = Number(activity.sourceTotals?.vision_goal || 0);

  return (
    <section className="glassmorphic rounded-2xl border border-primary/30 p-5 sm:p-6" aria-labelledby="player-progress-title">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="player-progress-title" className="flex items-center gap-2 font-orbitron text-lg text-primary">
            <Route className="h-5 w-5" /> Player Progress
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            One record, four different meanings: activity rewards action; consistency records practice; capability requires reviewed evidence; authority remains externally grounded.
          </p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-mono text-primary">{progression.version}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Activity"
          value={`Level ${activity.level || 1} · ${activity.rank?.name || "Initiate"}`}
          detail={`${Number(activity.totalExperience || 0).toLocaleString()} XP: ${missionActivityExperience.toLocaleString()} from completed missions and ${goalActivityExperience.toLocaleString()} from completed goals.`}
          icon={Sparkles}
        />
        <MetricCard
          label="Consistency"
          value={`${consistency.current || 0}-day practice streak`}
          detail={`${consistency.activeDays || 0} distinct practice days; opening the app alone never counts.`}
          icon={Flame}
        />
        <MetricCard
          label="Capability"
          value={`${capability.totalVerifiedExperience || 0} reviewed XP`}
          detail={`${capability.evidenceBackedSkills || 0} evidence-backed skill branches; activity XP cannot substitute.`}
          icon={ShieldCheck}
        />
        <MetricCard
          label="Health practice"
          value={`${health.totalExperience || health.totalXp || 0} practice XP`}
          detail="A separate, reversible record of logged health practice—not medical validation."
          icon={HeartPulse}
        />
      </div>

      <div className={`mt-5 grid gap-4 ${compact ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        <div className="rounded-xl border border-muted/20 bg-background/25 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Award className="h-4 w-4 text-primary" /> Badges</h3>
          {badges.length ? (
            <div className="space-y-2">
              {badges.slice(0, compact ? 3 : 6).map((badge: any) => (
                <div key={badge.key} className="rounded-lg border border-primary/15 bg-primary/5 p-2.5">
                  <p className="text-sm text-primary">{badge.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{badge.description}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No active badges yet. Badges appear only while their supporting record remains active.</p>}
        </div>

        <div className="rounded-xl border border-muted/20 bg-background/25 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> Next real unlock</h3>
          <div className="space-y-3">
            {(progression.nextUnlocks || []).slice(0, compact ? 2 : 4).map((unlock: any, index: number) => (
              <div key={`${unlock.type}-${index}`}>
                <p className="text-sm text-primary">{unlock.label}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{unlock.explanation}</p>
              </div>
            ))}
            {badgeProgress.map((badge: any) => (
              <div key={badge.key}>
                <p className="text-sm text-foreground">{badge.name}: {badge.current}/{badge.target} {badge.unit}</p>
                <p className="text-xs text-muted-foreground">{badge.nextAction}</p>
              </div>
            ))}
          </div>
        </div>

        {!compact && (
          <div className="rounded-xl border border-muted/20 bg-background/25 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><LockKeyhole className="h-4 w-4 text-primary" /> Certification & authority</h3>
            <p className="text-sm text-foreground">{authority.certifications?.length || 0} certifications · {authority.entrustedRoles?.length || 0} entrusted roles</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{authority.disclosure}</p>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-4 rounded-xl border border-muted/20 bg-background/25 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Why your activity progress changed</h3>
          {recentEvents.length ? (
            <div className="space-y-2">
              {recentEvents.slice(0, 8).map((event: any) => (
                <div key={event.id} className="flex items-start justify-between gap-4 border-b border-muted/10 pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-xs text-foreground">{event.reason}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(event.recordedAt || event.occurredAt).toLocaleString()}</p>
                  </div>
                  <span className={`shrink-0 font-mono text-xs ${event.experienceDelta >= 0 ? "text-primary" : "text-amber-400"}`}>
                    {event.experienceDelta >= 0 ? "+" : ""}{event.experienceDelta} XP
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">Complete a real mission or goal to begin the activity ledger.</p>}
        </div>
      )}
    </section>
  );
}
