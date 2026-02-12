import { toast } from "@/hooks/use-toast";

export function xpToast(amount: number) {
  toast({
    title: `+${amount} XP`,
    description: "Experience gained!",
    variant: "default",
    duration: 2000,
  });
}

export function levelUpToast(newLevel: number, rankName?: string) {
  toast({
    title: `LEVEL UP — Level ${newLevel}`,
    description: rankName ? `New Rank: ${rankName}` : "Keep up the great work!",
    variant: "default",
    duration: 4000,
  });
}

export function streakToast(days: number) {
  toast({
    title: `${days}-Day Streak`,
    description: "Keep the momentum going.",
    variant: "default",
    duration: 2500,
  });
}

export function missionCompleteToast(title: string, xp: number) {
  toast({
    title: "Mission Complete",
    description: `${title} — +${xp} XP`,
    variant: "default",
    duration: 2000,
  });
}

export function objectiveToast(title: string, rewardText?: string | null, bonusXp?: number) {
  const parts = [title];
  if (bonusXp && bonusXp > 0) parts.push(`+${bonusXp} Bonus XP`);
  if (rewardText) parts.push(`Reward: ${rewardText}`);
  toast({
    title: "Mission Objective Achieved",
    description: parts.join(" — "),
    variant: "default",
    duration: 3000,
  });
}

export function achievementToast(title: string, description?: string) {
  toast({
    title: title,
    description: description || "Achievement unlocked!",
    variant: "default",
    duration: 2500,
  });
}
