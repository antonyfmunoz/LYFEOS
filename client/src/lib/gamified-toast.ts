import { toast } from "@/hooks/use-toast";
import { hapticTap, hapticMissionComplete, hapticLevelUp, hapticNotification } from "@/lib/haptics";
import { playXpGain, playLevelUp, playStreak, playMissionComplete, playAchievement } from "@/lib/sounds";

export function xpToast(amount: number) {
  hapticTap();
  playXpGain();
  toast({
    title: `+${amount} XP`,
    description: "Experience gained!",
    variant: "default",
    duration: 2000,
  });
}

export function levelUpToast(newLevel: number, rankName?: string) {
  hapticLevelUp();
  playLevelUp();
  toast({
    title: `LEVEL UP — Level ${newLevel}`,
    description: rankName ? `New Rank: ${rankName}` : "Keep up the great work!",
    variant: "default",
    duration: 4000,
  });
}

export function streakToast(days: number) {
  hapticNotification();
  playStreak();
  toast({
    title: `${days}-Day Streak`,
    description: "Keep the momentum going.",
    variant: "default",
    duration: 2500,
  });
}

export function missionCompleteToast(title: string, xp: number) {
  hapticMissionComplete();
  playMissionComplete();
  toast({
    title: "Mission Complete",
    description: `${title} — +${xp} XP`,
    variant: "default",
    duration: 2000,
  });
}

export function objectiveToast(title: string, rewardText?: string | null, bonusXp?: number) {
  hapticMissionComplete();
  playMissionComplete();
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
  hapticNotification();
  playAchievement();
  toast({
    title: title,
    description: description || "Achievement unlocked!",
    variant: "default",
    duration: 2500,
  });
}
