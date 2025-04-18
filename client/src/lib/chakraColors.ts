/**
 * Chakra color system for LYFEOS stats
 * Each stat is associated with a specific chakra energy center and color
 */

export type ChakraColor = {
  name: string;
  color: string;
  colorHover: string;
  description: string;
  gradient: string;
};

export const chakraColors = {
  // Red (Root) - Health Points
  health: {
    name: "Root Chakra",
    color: "#EF4444",
    colorHover: "#DC2626",
    description: "Connected to physical health, survival, and grounding",
    gradient: "from-[#EF4444]/50 to-[#EF4444]"
  },
  
  // Orange (Sacral) - Energy Points
  energy: {
    name: "Sacral Chakra",
    color: "#F97316", 
    colorHover: "#EA580C",
    description: "Connected to creativity, passion, and vitality",
    gradient: "from-[#F97316]/50 to-[#F97316]"
  },
  
  // Yellow (Solar Plexus) - Efficiency Score 
  efficiency: {
    name: "Solar Plexus Chakra",
    color: "#FACC15",
    colorHover: "#EAB308",
    description: "Connected to personal power, confidence, and productivity",
    gradient: "from-[#FACC15]/50 to-[#FACC15]"
  },
  
  // Green (Heart) - Streak Days
  streak: {
    name: "Heart Chakra",
    color: "#4ADE80",
    colorHover: "#22C55E",
    description: "Connected to love, balance, and consistency",
    gradient: "from-[#4ADE80]/50 to-[#4ADE80]"
  },
  
  // Cyan (Throat) - Time Tokens
  time: {
    name: "Throat Chakra",
    color: "#22D3EE",
    colorHover: "#06B6D4",
    description: "Connected to communication, expression, and time management",
    gradient: "from-[#22D3EE]/50 to-[#22D3EE]"
  },
  
  // Indigo (Third Eye) - Attention Tokens
  attention: {
    name: "Third Eye Chakra",
    color: "#818CF8",
    colorHover: "#6366F1",
    description: "Connected to intuition, focus, and cognitive clarity",
    gradient: "from-[#818CF8]/50 to-[#818CF8]"
  },
  
  // Violet (Crown) - Experience Points
  experience: {
    name: "Crown Chakra",
    color: "#C084FC",
    colorHover: "#A855F7",
    description: "Connected to wisdom, consciousness, and personal growth",
    gradient: "from-[#C084FC]/50 to-[#C084FC]"
  }
};

/**
 * Get chakra color utility by type
 * @param type The type of chakra color to get
 */
export function getChakraColor(type: keyof typeof chakraColors): ChakraColor {
  return chakraColors[type];
}