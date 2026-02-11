import { toast } from "@/hooks/use-toast";

export function xpToast(amount: number) {
  toast({
    title: `+${amount} XP`,
    description: "Experience gained!",
    className: "gamified-toast gamified-toast-xp border-amber-500/60 bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-yellow-950/90 text-amber-100",
    duration: 2000,
  });
}

export function levelUpToast(newLevel: number, rankName?: string) {
  toast({
    title: `LEVEL UP! Level ${newLevel}`,
    description: rankName ? `New Rank: ${rankName}` : "Keep up the great work!",
    className: "gamified-toast gamified-toast-levelup border-purple-500/60 bg-gradient-to-r from-purple-950/90 via-indigo-900/80 to-violet-950/90 text-purple-100",
    duration: 4000,
  });
}

export function streakToast(days: number) {
  toast({
    title: `${days}-Day Streak!`,
    description: "You're on fire! Keep the momentum going!",
    className: "gamified-toast gamified-toast-streak border-orange-500/60 bg-gradient-to-r from-orange-950/90 via-red-900/80 to-orange-950/90 text-orange-100",
    duration: 2500,
  });
}

export function missionCompleteToast(title: string, xp: number) {
  toast({
    title: "Mission Complete!",
    description: `${title} -- +${xp} XP`,
    className: "gamified-toast gamified-toast-mission border-emerald-500/60 bg-gradient-to-r from-emerald-950/90 via-green-900/80 to-teal-950/90 text-emerald-100",
    duration: 2000,
  });
}

export function milestoneToast(title: string, rewardText?: string | null, bonusXp?: number) {
  const parts = [title];
  if (bonusXp && bonusXp > 0) parts.push(`+${bonusXp} Bonus XP`);
  if (rewardText) parts.push(`Reward: ${rewardText}`);
  toast({
    title: "Milestone Achieved!",
    description: parts.join(" -- "),
    className: "gamified-toast gamified-toast-milestone border-yellow-500/60 bg-gradient-to-r from-yellow-950/90 via-amber-900/80 to-yellow-950/90 text-yellow-100",
    duration: 3000,
  });
}

export function achievementToast(title: string, description?: string) {
  toast({
    title: title,
    description: description || "Achievement unlocked!",
    className: "gamified-toast gamified-toast-achievement border-cyan-500/60 bg-gradient-to-r from-cyan-950/90 via-blue-900/80 to-cyan-950/90 text-cyan-100",
    duration: 2500,
  });
}
