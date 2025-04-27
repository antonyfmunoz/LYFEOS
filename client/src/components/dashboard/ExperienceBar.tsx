import { useContext, useEffect, useState } from "react";
import { StatsContext } from "@/lib/context";
import { motion, AnimatePresence } from "framer-motion";
import { Award } from "lucide-react";
import confetti from "canvas-confetti";

interface ExperienceBarProps {
  current: number;
  max: number;
  level: number;
  totalXP?: number;
  showLevelUp?: boolean;
}

export default function ExperienceBar({ 
  current, 
  max, 
  level, 
  totalXP,
  showLevelUp = false
}: ExperienceBarProps) {
  const { stats } = useContext(StatsContext);
  const primaryColor = stats?.primaryColor || "#00e0ff";
  
  // Calculate percentage for progress bar
  const percentage = (current / max) * 100;
  
  // State for animation
  const [animate, setAnimate] = useState(false);
  const [showConfetti, setShowConfetti] = useState(showLevelUp);
  
  // Trigger animation when component mounts or when showLevelUp changes
  useEffect(() => {
    if (showLevelUp) {
      setAnimate(true);
      setShowConfetti(true);
      
      // Launch confetti effect
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      
      // Reset animation state after a delay
      const timer = setTimeout(() => {
        setAnimate(false);
        setShowConfetti(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [showLevelUp]);
  
  return (
    <div className="mb-6 relative">
      {/* Level Up Animation Overlay */}
      <AnimatePresence>
        {animate && (
          <motion.div 
            className="absolute inset-0 flex items-center justify-center z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div 
              className="text-center"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-2xl font-orbitron" style={{ color: primaryColor }}>
                LEVEL UP!
              </div>
              <div className="text-4xl font-orbitron font-bold" style={{ color: primaryColor }}>
                {level}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Award className="h-5 w-5 mr-2" style={{ color: primaryColor }} />
          <h3 className="font-orbitron text-[#D6F4FF]">LEVEL PROGRESS</h3>
        </div>
        <div className="text-right">
          <motion.span 
            className="px-2 py-1 rounded-md text-xs font-orbitron"
            style={{ 
              backgroundColor: `${primaryColor}20`, 
              color: primaryColor 
            }}
            animate={animate ? { 
              scale: [1, 1.2, 1], 
              backgroundColor: animate ? [`${primaryColor}20`, `${primaryColor}40`, `${primaryColor}20`] : `${primaryColor}20` 
            } : {}}
            transition={{ duration: 1 }}
          >
            LEVEL {level}
          </motion.span>
        </div>
      </div>
      
      <motion.div 
        className="progress-bar progress-xp mb-2 overflow-hidden"
        style={{ boxShadow: animate ? `0 0 10px ${primaryColor}` : 'none' }}
        animate={animate ? { boxShadow: [`0 0 5px ${primaryColor}`, `0 0 15px ${primaryColor}`, `0 0 5px ${primaryColor}`] } : {}}
        transition={{ duration: 1 }}
      >
        <motion.div 
          className="progress-fill"
          style={{ 
            width: `${percentage}%`,
            background: `linear-gradient(to right, ${primaryColor}70, ${primaryColor})` 
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </motion.div>
      
      <div className="flex justify-between text-xs">
        <span className="text-[#7DAAB2]">{current.toLocaleString()} XP</span>
        <span className="text-[#7DAAB2]">{max.toLocaleString()} XP</span>
      </div>
      
      {totalXP !== undefined && (
        <div className="text-xs text-right mt-1 text-[#7DAAB2]">
          Total: {totalXP.toLocaleString()} XP
        </div>
      )}
    </div>
  );
}
