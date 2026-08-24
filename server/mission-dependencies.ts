export type MissionDependencyEdge = {
  dependentQuestId: number;
  prerequisiteQuestId: number;
};

/** A dependency edge points from the mission being sequenced to the mission
 * that must come first. Adding dependent -> prerequisite is invalid when the
 * prerequisite already reaches the dependent through existing edges. */
export function wouldCreateMissionDependencyCycle(
  edges: MissionDependencyEdge[],
  dependentQuestId: number,
  prerequisiteQuestId: number,
): boolean {
  if (dependentQuestId === prerequisiteQuestId) return true;
  const dependenciesByMission = new Map<number, number[]>();
  for (const edge of edges) {
    dependenciesByMission.set(edge.dependentQuestId, [
      ...(dependenciesByMission.get(edge.dependentQuestId) || []),
      edge.prerequisiteQuestId,
    ]);
  }
  const seen = new Set<number>();
  const pending = [prerequisiteQuestId];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === dependentQuestId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(dependenciesByMission.get(current) || []));
  }
  return false;
}
