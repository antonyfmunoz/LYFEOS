export type HealthPracticeCandidate = {
  key: string; ruleKey: string; evidenceDate: string; xp: number; evidence: { recordCount: number };
};

export const healthPracticeRules = {
  hydration_day: { label: "Hydration recorded", xp: 1 },
  nutrition_day: { label: "Nutrition recorded", xp: 4 },
  workout_day: { label: "Training recorded", xp: 10 },
  recovery_day: { label: "Recovery practice recorded", xp: 3 },
  body_measurement_day: { label: "Body measurement recorded", xp: 2 },
  metric_observation_day: { label: "Health or performance metric recorded", xp: 3 },
  sleep_record_day: { label: "Sleep record completed", xp: 2 },
  practice_review_week: { label: "Practice review completed", xp: 6 },
} as const;

export const healthBadgeDefinitions = {
  first_health_record: { name: "First health record", description: "Recorded after the first factual or self-reported Health entry." },
  seven_practice_days: { name: "Seven practice days", description: "Recorded after Health evidence exists on seven distinct calendar days." },
  multi_domain_practice: { name: "Multi-domain practice", description: "Recorded after at least three Health record domains appear across seven days." },
  training_rhythm: { name: "Training rhythm", description: "Recorded after training entries on ten distinct days." },
  recovery_rhythm: { name: "Recovery rhythm", description: "Recorded after recovery-practice entries on seven distinct days." },
  reflective_practice: { name: "Reflective practice", description: "Recorded after user-authored Health practice reviews in four distinct calendar weeks." },
} as const;

export function groupedHealthPracticeCandidates(ruleKey: keyof typeof healthPracticeRules, dates: string[]): HealthPracticeCandidate[] {
  const counts = new Map<string, number>();
  for (const date of dates) if (/^\d{4}-\d{2}-\d{2}$/.test(date)) counts.set(date, (counts.get(date) || 0) + 1);
  return Array.from(counts, ([evidenceDate, recordCount]) => ({ key: `${ruleKey}:${evidenceDate}`, ruleKey, evidenceDate, xp: healthPracticeRules[ruleKey].xp, evidence: { recordCount } }));
}

export function weeklyHealthReviewCandidates(dates: string[]): HealthPracticeCandidate[] {
  const weekStarts = dates.flatMap((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return [];
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return [];
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
    return [date.toISOString().slice(0, 10)];
  });
  return groupedHealthPracticeCandidates("practice_review_week", weekStarts);
}

export const healthPracticeRanks = [
  { level: 1, name: "Observer", minimumXp: 0 }, { level: 2, name: "Recorder", minimumXp: 25 },
  { level: 3, name: "Practitioner", minimumXp: 75 }, { level: 4, name: "Consistent practitioner", minimumXp: 150 },
  { level: 5, name: "Seasoned recorder", minimumXp: 300 },
];

export function healthPracticeRank(xp: number) { return [...healthPracticeRanks].reverse().find((rank) => xp >= rank.minimumXp) || healthPracticeRanks[0]; }

export function healthBadgeCandidates(candidates: HealthPracticeCandidate[]) {
  const dates = new Set(candidates.map((candidate) => candidate.evidenceDate));
  const rules = new Set(candidates.filter((candidate) => candidate.ruleKey !== "practice_review_week").map((candidate) => candidate.ruleKey));
  const workoutDays = new Set(candidates.filter((candidate) => candidate.ruleKey === "workout_day").map((candidate) => candidate.evidenceDate));
  const recoveryDays = new Set(candidates.filter((candidate) => candidate.ruleKey === "recovery_day").map((candidate) => candidate.evidenceDate));
  const reviewWeeks = new Set(candidates.filter((candidate) => candidate.ruleKey === "practice_review_week").map((candidate) => candidate.evidenceDate));
  const badges: Array<{ key: keyof typeof healthBadgeDefinitions; evidence: Record<string, number> }> = [];
  if (candidates.length >= 1) badges.push({ key: "first_health_record", evidence: { activeEvidenceDays: dates.size } });
  if (dates.size >= 7) badges.push({ key: "seven_practice_days", evidence: { activeEvidenceDays: dates.size } });
  if (dates.size >= 7 && rules.size >= 3) badges.push({ key: "multi_domain_practice", evidence: { activeEvidenceDays: dates.size, activeDomains: rules.size } });
  if (workoutDays.size >= 10) badges.push({ key: "training_rhythm", evidence: { activeTrainingDays: workoutDays.size } });
  if (recoveryDays.size >= 7) badges.push({ key: "recovery_rhythm", evidence: { activeRecoveryDays: recoveryDays.size } });
  if (reviewWeeks.size >= 4) badges.push({ key: "reflective_practice", evidence: { activeReviewWeeks: reviewWeeks.size } });
  return badges;
}

export function isHealthEvidenceMutation(method: string, path: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  if (path.startsWith("/api/nutrition/diary")) return true;
  if (path === "/api/workouts" || /^\/api\/workouts\/\d+/.test(path) || path.includes("/api/workouts/deletions/")) return true;
  if (path.startsWith("/api/recovery-activities")) return true;
  if (/^\/api\/recovery-routines\/\d+\/log$/.test(path)) return true;
  if (path.startsWith("/api/health-observations")) return true;
  if (path.startsWith("/api/health-practice-reviews")) return true;
  return path.startsWith("/api/health-fitness/hydration") || path.startsWith("/api/health-fitness/measurements") || path.startsWith("/api/health-fitness/sleep");
}
