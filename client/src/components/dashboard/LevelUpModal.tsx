import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Sparkles, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { getRank } from "@/lib/ranks";

interface LevelUpModalProps {
  level: number;
  primaryColor?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function LevelUpModal({ level, primaryColor = "#00e0ff", isOpen, onClose }: LevelUpModalProps) {
  const [step, setStep] = useState(0);
  
  // Determine milestone level celebrations
  const isMilestone = level % 5 === 0 || level % 10 === 0;
  const isMajorMilestone = level % 10 === 0;
  
  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      
      // Launch confetti effect
      setTimeout(() => {
        confetti({
          particleCount: isMajorMilestone ? 150 : 100,
          spread: 70,
          origin: { y: 0.5 },
          colors: [primaryColor, '#ffffff', '#D6F4FF'],
        });
      }, 500);
    }
  }, [isOpen, isMajorMilestone, primaryColor]);
  
  // Determine benefits based on level
  const getLevelBenefits = () => {
    if (level < 5) {
      return ["Core features unlocked", "Basic customization options"];
    } else if (level < 10) {
      return ["Advanced task management", "Enhanced data visualization"];
    } else if (level < 20) {
      return ["Premium templates access", "Extended storage limits"];
    } else if (level < 50) {
      return ["Special achievement badges", "Priority feature releases"];
    } else {
      return ["Experimental features access", "Mentorship program eligibility"];
    }
  };
  
  const nextStep = () => {
    if (step < 1) {
      setStep(step + 1);
      
      // Additional confetti for next step
      if (isMajorMilestone) {
        confetti({
          particleCount: 50,
          spread: 45,
          origin: { y: 0.6 },
          colors: [primaryColor, '#ffffff', '#D6F4FF'],
        });
      }
    } else {
      onClose();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md border-primary/30 bg-background/95 backdrop-blur-md">
        <DialogTitle className="sr-only">Level Up</DialogTitle>
        <DialogDescription className="sr-only">Congratulations on reaching a new level</DialogDescription>
        <div className="space-y-4 relative">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="level-up-intro"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4 pt-6"
              >
                <div className="flex justify-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1, rotate: [0, 10, 0] }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="relative"
                  >
                    <div 
                      className="w-24 h-24 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}20` }}
                    >
                      <Award className="w-14 h-14" style={{ color: primaryColor }} />
                    </div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7, duration: 0.3 }}
                      className="absolute -top-1 -right-1"
                    >
                      <Sparkles className="w-6 h-6 text-yellow-400" />
                    </motion.div>
                  </motion.div>
                </div>
                
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.3 }}
                  className="text-center space-y-2"
                >
                  <h2 className="text-xl font-orbitron" style={{ color: primaryColor }}>
                    LEVEL UP!
                  </h2>
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="text-4xl font-orbitron font-bold text-white"
                  >
                    {level}
                  </motion.div>
                  <motion.span
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1, duration: 0.3 }}
                    className="inline-block px-3 py-1 rounded-full text-xs font-orbitron font-bold mt-2"
                    style={{
                      backgroundColor: `${getRank(level).color}20`,
                      color: getRank(level).color,
                      border: `1px solid ${getRank(level).color}40`,
                    }}
                  >
                    {getRank(level).icon} {getRank(level).name}
                  </motion.span>
                  <p className="text-primary/60 text-sm">
                    Congratulations on reaching a new level in your journey.
                  </p>
                </motion.div>
                
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1, duration: 0.3 }}
                  className="flex justify-center pt-2"
                >
                  <Button 
                    variant="outline" 
                    className="border-primary/30 hover:bg-primary/20"
                    onClick={nextStep}
                  >
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              </motion.div>
            )}
            
            {step === 1 && (
              <motion.div
                key="level-benefits"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4 pt-6"
              >
                <h3 className="text-center font-orbitron text-lg text-primary">
                  New Features Unlocked
                </h3>
                
                <div className="space-y-3">
                  {getLevelBenefits().map((benefit, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + index * 0.1, duration: 0.3 }}
                      className="flex items-center gap-2 p-2 rounded-md"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }}></div>
                      <p className="text-sm text-primary">{benefit}</p>
                    </motion.div>
                  ))}
                </div>
                
                {isMilestone && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.3 }}
                    className="text-center p-2 rounded-md"
                    style={{ backgroundColor: `${primaryColor}20` }}
                  >
                    <p className="text-sm font-medium" style={{ color: primaryColor }}>
                      {isMajorMilestone ? 'MAJOR MILESTONE ACHIEVED!' : 'MILESTONE ACHIEVED!'}
                    </p>
                    <p className="text-xs text-primary/60 mt-1">
                      {isMajorMilestone 
                        ? `Level ${level} is a major achievement. Keep up the great work!` 
                        : `Level ${level} is a notable achievement on your journey.`}
                    </p>
                  </motion.div>
                )}
                
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8, duration: 0.3 }}
                  className="flex justify-center pt-2"
                >
                  <Button 
                    variant="outline" 
                    className="border-primary/30 hover:bg-primary/20"
                    onClick={nextStep}
                  >
                    Continue Your Journey <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}