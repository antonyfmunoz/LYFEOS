type Node = {
  id: number;
  name: string;
  kind: "primary" | "supporting" | "capacity" | "application";
  experience: number;
  level: number;
  status: "locked" | "unlocked" | "mastered";
};

type Edge = { sourceSkillId: number; targetSkillId: number; relationship: string; influenceWeight?: number };

const positionFor = (index: number, total: number, isPrimary: boolean) => {
  if (isPrimary) return { x: 50, y: 50 };
  const satelliteCount = Math.max(1, total - 1);
  const angle = ((index - 1) / satelliteCount) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + Math.cos(angle) * 37, y: 50 + Math.sin(angle) * 33 };
};

/** A compact visual map of the private, evidence-gated capability graph. */
export function CapabilityConstellation({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const ordered = [...nodes].sort((a, b) => Number(b.kind === "primary") - Number(a.kind === "primary"));
  const positions = new Map(ordered.map((node, index) => [node.id, positionFor(index, ordered.length, node.kind === "primary")]));
  if (!ordered.length) return null;
  return (
    <div className="relative mt-3 min-h-60 overflow-hidden rounded-lg border border-primary/15 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.1),transparent_62%)]" aria-label="Capability constellation">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {edges.map((edge) => {
          const source = positions.get(edge.sourceSkillId);
          const target = positions.get(edge.targetSkillId);
          if (!source || !target) return null;
          const influenceWeight = Math.min(3, Math.max(1, edge.influenceWeight || 1));
          return <line key={`${edge.sourceSkillId}-${edge.targetSkillId}-${edge.relationship}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="currentColor" className="text-primary/35" strokeWidth={0.2 + influenceWeight * 0.18} strokeDasharray={edge.relationship === "unlocks" ? undefined : "1 1"} />;
        })}
      </svg>
      {ordered.map((node) => {
        const position = positions.get(node.id)!;
        const tone = node.status === "locked" ? "border-primary/15 bg-card/75 text-muted-foreground" : node.status === "mastered" ? "border-emerald-400/55 bg-emerald-400/10 text-emerald-200" : node.kind === "primary" ? "border-primary/70 bg-primary/20 text-foreground shadow-[0_0_26px_rgba(var(--primary-rgb),0.22)]" : "border-primary/35 bg-card/90 text-foreground";
        return (
          <div key={node.id} title={`${node.name}: level ${node.level}, ${node.experience} reviewed practice XP`} className={`absolute w-24 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1.5 text-center backdrop-blur ${tone}`} style={{ left: `${position.x}%`, top: `${position.y}%` }}>
            <p className="truncate text-[10px] font-mono uppercase tracking-[0.08em]">{node.status === "mastered" ? "Evidence met" : node.status}</p>
            <p className="mt-0.5 truncate text-xs font-medium">{node.name}</p>
            <p className="mt-0.5 text-[10px] opacity-75">Lv {node.level} · {node.experience} XP</p>
          </div>
        );
      })}
      <p className="absolute bottom-2 left-3 text-[10px] text-muted-foreground">Line strength shows your stated connection; XP follows reviewed evidence.</p>
    </div>
  );
}
