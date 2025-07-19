import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTheme } from "@/lib/themeContext";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { usePageTitle } from "@/hooks/use-page-title";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, ArrowLeft, ChevronRight, Check, Sparkles, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
};

const slideIn = {
  initial: { opacity: 0, x: 100 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.7, ease: "easeOut" } },
  exit: { opacity: 0, x: -100, transition: { duration: 0.3 } }
};

// Life stage options - step 2
const lifeStages = [
  { id: "awakening", label: "Awakening", icon: "✨" },
  { id: "building", label: "Building", icon: "🏗️" },
  { id: "mastering", label: "Mastering", icon: "🏆" },
  { id: "leading", label: "Leading", icon: "🚀" }
];

// Role archetypes - step 3
const archetypes = [
  { id: "leader", label: "Leader", icon: "👑" },
  { id: "creator", label: "Creator", icon: "🎨" },
  { id: "athlete", label: "Athlete", icon: "🏃" },
  { id: "healer", label: "Healer", icon: "🌿" },
  { id: "visionary", label: "Visionary", icon: "🔭" },
  { id: "artist", label: "Artist", icon: "🎭" },
  { id: "teacher", label: "Teacher", icon: "📚" },
  { id: "builder", label: "Builder", icon: "🛠️" }
];

// Core motivations - step 5
const motivations = [
  { id: "achievement", label: "Achievement" },
  { id: "freedom", label: "Freedom" },
  { id: "mastery", label: "Mastery" },
  { id: "impact", label: "Impact" },
  { id: "love", label: "Love" },
  { id: "adventure", label: "Adventure" }
];

// First missions - step 6
const firstMissions = [
  { id: "archetype", label: "Complete Your Archetype", description: "Dive deeper into your chosen path" },
  { id: "rituals", label: "Set Up Your Rituals", description: "Create daily routines for success" },
  { id: "future_self", label: "Design Your Future Self", description: "Visualize who you're becoming" }
];

export default function OnboardingPage() {
  // Set the page title
  usePageTitle('Onboarding');
  
  const { user } = useAuth();
  const { primaryColor, setPrimaryColor } = useTheme();
  const [, navigate] = useLocation();
  
  // Authentication protection and redirect logic
  useEffect(() => {
    console.log("OnboardingPage - Current user data:", user);
    
    // If user is not authenticated, redirect to login
    if (!user) {
      console.log("No user found in onboarding, redirecting to login");
      navigate('/login', { replace: true });
      return;
    }
  }, [user, navigate]);
  
  // Get onboarding data from localStorage if present
  useEffect(() => {
    const storedData = localStorage.getItem("onboarding_data");
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        if (data.displayName) {
          setFormData(prev => ({
            ...prev,
            displayName: data.displayName
          }));
        }
        if (data.avatarColor) {
          setPrimaryColor(data.avatarColor);
        }
      } catch (error) {
        console.error("Error parsing onboarding data:", error);
      }
    }
  }, []);
  
  // Store current step (1-7)
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1); // 1 for forward, -1 for backward
  
  // Store all form data
  const [formData, setFormData] = useState({
    displayName: "",
    lifeStage: "",
    archetype: "",
    workPace: 3,
    environment: 3,
    riskTolerance: 3,
    learningStyle: 3,
    energyManagement: 3,
    coreMotivation: "",
    customMotivation: "",
    selectedMission: "",
    skipSetup: false
  });
  
  // Track animation status
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Handle step navigation
  const goToNextStep = () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setDirection(1);
    
    // Stagger the animation slightly
    setTimeout(() => {
      if (currentStep < 7) {
        setCurrentStep(currentStep + 1);
      } else {
        completeOnboarding();
      }
      setTimeout(() => setIsAnimating(false), 500);
    }, 200);
  };
  
  const goToPreviousStep = () => {
    if (isAnimating || currentStep === 1) return;
    
    setIsAnimating(true);
    setDirection(-1);
    
    // Stagger the animation slightly
    setTimeout(() => {
      setCurrentStep(currentStep - 1);
      setTimeout(() => setIsAnimating(false), 500);
    }, 200);
  };
  
  // Check if current step is complete
  const isStepComplete = () => {
    switch (currentStep) {
      case 1: // Welcome
        return true;
      case 2: // Life Stage
        return !!formData.lifeStage;
      case 3: // Archetype
        return !!formData.archetype;
      case 4: // Thriving style (sliders)
        return true; // All sliders have default values
      case 5: // Core motivation
        return !!formData.coreMotivation || !!formData.customMotivation;
      case 6: // First mission
        return !!formData.selectedMission || formData.skipSetup;
      case 7: // Completion
        return true;
      default:
        return false;
    }
  };
  
  // Handle completion and save to database
  const completeOnboarding = async () => {
    try {
      // Save to database through API
      console.log("Onboarding completed with data:", formData);
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // First, update user profile to set onboarding completed
      try {
        // Update user_profile table not users table
        const profileResponse = await fetch(`/api/users/${user.id}/user-profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            onboardingCompleted: true,
            startStage: formData.lifeStage,
            targetArchetype: formData.archetype, 
            coreMotivation: formData.coreMotivation || formData.customMotivation,
            flowStyle: {
              pace: formData.workPace || 3,
              environment: formData.environment || 3,
              risk: formData.riskTolerance || 3,
              learning: formData.learningStyle || 3,
              energy: formData.energyManagement || 3
            }
          }),
          credentials: 'include'
        });
        
        if (!profileResponse.ok) {
          console.error("Failed to update profile onboarding status", await profileResponse.text());
        } else {
          console.log("Successfully marked onboarding as completed in user profile");
        }
      } catch (error) {
        console.error("Error updating profile onboarding status:", error);
      }
      
      // Prepare the data for stats API
      const onboardingData = {
        lifeStage: formData.lifeStage,
        archetype: formData.archetype,
        workPace: formData.workPace,
        environment: formData.environment,
        riskTolerance: formData.riskTolerance,
        learningStyle: formData.learningStyle,
        energyManagement: formData.energyManagement,
        coreMotivation: formData.coreMotivation || formData.customMotivation,
        onboardingCompleted: true
      };
      
      // Update user stats with onboarding data
      const response = await fetch(`/api/users/${user.id}/stats`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(onboardingData),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save onboarding data");
      }
      
      // Award XP for completing onboarding (100 XP)
      try {
        console.log("Awarding 100 XP for completing onboarding");
        const xpResponse = await fetch(`/api/users/${user.id}/award-xp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: 100,
            reason: 'Onboarding completed'
          }),
          credentials: 'include'
        });
        
        if (!xpResponse.ok) {
          console.error("Failed to award XP for onboarding", await xpResponse.text());
        } else {
          console.log("Successfully awarded 100 XP for completing onboarding");
        }
      } catch (error) {
        console.error("Error awarding XP for onboarding:", error);
      }
      
      // Clear temporary onboarding data
      localStorage.removeItem("onboarding_data");
      
      // Show success message
      toast({
        title: "Onboarding complete!",
        description: "Welcome to LYFEOS. Your journey begins now.",
      });
      
      // Navigate to dashboard
      navigate("/dashboard");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast({
        title: "Error",
        description: "Failed to complete onboarding. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Skip the setup mission and go to completion
  const handleSkipSetup = () => {
    setFormData(prev => ({
      ...prev,
      skipSetup: true
    }));
    goToNextStep();
  };
  
  // Update a slider value
  const updateSlider = (name: string, value: number[]) => {
    setFormData(prev => ({
      ...prev,
      [name]: value[0]
    }));
  };
  
  // Handle UI for finishing all steps
  const handleSystemInitialization = () => {
    // Simulate system coming online
    completeOnboarding();
  };
  
  // Parallax effect for background
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Handle browser back button
  const handleBackButtonEvent = useCallback((event: PopStateEvent) => {
    // Prevent default behavior only if we're in the onboarding flow
    event.preventDefault();
    
    // Instead use our controlled navigation
    if (currentStep > 1) {
      goToPreviousStep();
      
      // Push a new state to replace the one that was popped
      window.history.pushState(null, '', window.location.pathname);
    }
  }, [currentStep]);
  
  // Set up back button prevention
  useEffect(() => {
    // Push initial state to history stack
    window.history.pushState(null, '', window.location.pathname);
    
    // Listen for back button clicks
    window.addEventListener('popstate', handleBackButtonEvent);
    
    return () => {
      window.removeEventListener('popstate', handleBackButtonEvent);
    };
  }, [handleBackButtonEvent]);
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: e.clientX / window.innerWidth - 0.5,
        y: e.clientY / window.innerHeight - 0.5
      });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background relative">
      {/* Subtle parallax background */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, var(--primary-bg-subtle), transparent 80%)',
          transform: `translateX(${mousePosition.x * 20}px) translateY(${mousePosition.y * 20}px)`
        }}
      />
      
      <div className="z-10 max-w-4xl w-full px-4 py-8 flex flex-col items-center justify-center min-h-screen">
        {/* Header - constant across all steps */}
        <div className="text-center mb-10 relative">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl text-primary font-orbitron mb-2"
          >
            LYFE<span className="text-foreground">OS</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1, transition: { delay: 0.3 } }}
            className="text-muted-foreground"
          >
            Your personal life operating system
          </motion.p>
        </div>
        
        {/* Main content area with animations */}
        <div className="w-full max-w-2xl relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={direction > 0 ? "initial" : { opacity: 0, x: -100 }}
              animate="animate"
              exit="exit"
              variants={slideIn}
              className="w-full glassmorphic rounded-xl p-8 border border-primary/20"
              style={{ boxShadow: "0 0 30px var(--primary-glow-light)" }}
            >
              {/* Step 1: Welcome */}
              {currentStep === 1 && (
                <motion.div className="space-y-6 text-center">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-3xl font-orbitron text-foreground"
                  >
                    Welcome to LYFEOS
                  </motion.h2>
                  
                  <motion.p 
                    variants={fadeInUp}
                    className="text-xl text-muted-foreground"
                  >
                    Your journey to mastery begins now.
                  </motion.p>
                  
                  <motion.div 
                    variants={fadeInUp}
                    className="py-8"
                  >
                    <Sparkles className="w-16 h-16 text-primary mx-auto animate-pulse" />
                  </motion.div>
                  
                  <motion.p 
                    variants={fadeInUp}
                    className="text-muted-foreground"
                  >
                    Hello, {user?.username || formData.displayName || "Commander"}. Let's set up your operating system.
                  </motion.p>
                </motion.div>
              )}
              
              {/* Step 2: Life Stage */}
              {currentStep === 2 && (
                <motion.div className="space-y-6">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-2xl font-orbitron text-center mb-6 text-foreground"
                  >
                    Where Are You Starting From?
                  </motion.h2>
                  
                  <motion.div 
                    variants={fadeInUp}
                    className="grid grid-cols-2 gap-4"
                  >
                    {lifeStages.map((stage) => (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, lifeStage: stage.id })}
                        className={`p-6 rounded-xl transition-all flex flex-col items-center justify-center space-y-2 h-32
                          ${formData.lifeStage === stage.id 
                            ? 'bg-primary/20 border-2 border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]' 
                            : 'bg-card/30 border border-primary/10 hover:bg-primary/10 hover:border-primary/30'
                          }`}
                      >
                        <span className="text-2xl">{stage.icon}</span>
                        <span className={`${formData.lifeStage === stage.id ? 'text-primary font-medium' : 'text-foreground'}`}>
                          {stage.label}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                  
                  <motion.p 
                    variants={fadeInUp}
                    className="text-sm text-muted-foreground text-center mt-4"
                  >
                    Select the stage that best describes your current life phase
                  </motion.p>
                </motion.div>
              )}
              
              {/* Step 3: Role Archetype */}
              {currentStep === 3 && (
                <motion.div className="space-y-6">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-2xl font-orbitron text-center mb-6 text-foreground"
                  >
                    Where Do You Want to Go?
                  </motion.h2>
                  
                  <motion.div 
                    variants={fadeInUp}
                    className="grid grid-cols-2 sm:grid-cols-4 gap-3"
                  >
                    {archetypes.map((archetype) => (
                      <button
                        key={archetype.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, archetype: archetype.id })}
                        className={`p-3 rounded-lg transition-all flex flex-col items-center justify-center space-y-2
                          ${formData.archetype === archetype.id 
                            ? 'bg-primary/20 border border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]' 
                            : 'bg-card/30 border border-primary/10 hover:bg-primary/10'
                          }`}
                      >
                        <span className="text-2xl">{archetype.icon}</span>
                        <span className={`text-sm ${formData.archetype === archetype.id ? 'text-primary' : 'text-foreground'}`}>
                          {archetype.label}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                  
                  <motion.p 
                    variants={fadeInUp}
                    className="text-sm text-muted-foreground text-center mt-4"
                  >
                    Choose the role archetype that resonates with your aspirations
                  </motion.p>
                </motion.div>
              )}
              
              {/* Step 4: How do you thrive */}
              {currentStep === 4 && (
                <motion.div className="space-y-8">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-2xl font-orbitron text-center mb-6 text-foreground"
                  >
                    How Do You Thrive Best?
                  </motion.h2>
                  
                  <motion.div variants={fadeInUp} className="space-y-6">
                    {/* Work Pace Slider */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Fast-Paced</span>
                        <span>Methodical</span>
                      </div>
                      <Slider 
                        value={[formData.workPace]} 
                        min={1} 
                        max={5} 
                        step={1} 
                        onValueChange={(value) => updateSlider('workPace', value)} 
                        className="py-4"
                      />
                    </div>
                    
                    {/* Environment Slider */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Structured</span>
                        <span>Flexible</span>
                      </div>
                      <Slider 
                        value={[formData.environment]} 
                        min={1} 
                        max={5} 
                        step={1} 
                        onValueChange={(value) => updateSlider('environment', value)} 
                        className="py-4"
                      />
                    </div>
                    
                    {/* Risk Tolerance Slider */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Risk-Averse</span>
                        <span>Risk-Seeking</span>
                      </div>
                      <Slider 
                        value={[formData.riskTolerance]} 
                        min={1} 
                        max={5} 
                        step={1} 
                        onValueChange={(value) => updateSlider('riskTolerance', value)} 
                        className="py-4"
                      />
                    </div>
                    
                    {/* Learning Style Slider */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Visual Learner</span>
                        <span>Hands-on Learner</span>
                      </div>
                      <Slider 
                        value={[formData.learningStyle]} 
                        min={1} 
                        max={5} 
                        step={1} 
                        onValueChange={(value) => updateSlider('learningStyle', value)} 
                        className="py-4"
                      />
                    </div>
                    
                    {/* Energy Management Slider */}
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Solo Worker</span>
                        <span>Collaborative</span>
                      </div>
                      <Slider 
                        value={[formData.energyManagement]} 
                        min={1} 
                        max={5} 
                        step={1} 
                        onValueChange={(value) => updateSlider('energyManagement', value)} 
                        className="py-4"
                      />
                    </div>
                  </motion.div>
                </motion.div>
              )}
              
              {/* Step 5: Core Motivation */}
              {currentStep === 5 && (
                <motion.div className="space-y-6">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-2xl font-orbitron text-center mb-6 text-foreground"
                  >
                    What's Your Core Motivation?
                  </motion.h2>
                  
                  <motion.div 
                    variants={fadeInUp}
                    className="grid grid-cols-2 gap-3"
                  >
                    {motivations.map((motivation) => (
                      <button
                        key={motivation.id}
                        type="button"
                        onClick={() => setFormData({ 
                          ...formData, 
                          coreMotivation: motivation.id,
                          customMotivation: ""
                        })}
                        className={`p-5 rounded-lg transition-all
                          ${formData.coreMotivation === motivation.id 
                            ? 'bg-primary/20 border border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]' 
                            : 'bg-card/30 border border-primary/10 hover:bg-primary/10'
                          }`}
                      >
                        <span className={`${formData.coreMotivation === motivation.id ? 'text-primary font-medium' : 'text-foreground'}`}>
                          {motivation.label}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                  
                  <motion.div variants={fadeInUp} className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Or define your own motivation:</p>
                    <Input
                      placeholder="Enter custom motivation..."
                      value={formData.customMotivation}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        customMotivation: e.target.value,
                        coreMotivation: "" // Clear selected motivation
                      })}
                      className="w-full bg-transparent border-primary/30"
                    />
                  </motion.div>
                </motion.div>
              )}
              
              {/* Step 6: First Setup Mission */}
              {currentStep === 6 && (
                <motion.div className="space-y-6">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-2xl font-orbitron text-center mb-4 text-foreground flex items-center justify-center"
                  >
                    <Zap className="w-6 h-6 mr-2 text-primary" />
                    Your First Setup Mission
                  </motion.h2>
                  
                  <motion.p
                    variants={fadeInUp}
                    className="text-muted-foreground text-center mb-6"
                  >
                    Choose one initial mission to kickstart your journey:
                  </motion.p>
                  
                  <motion.div 
                    variants={fadeInUp}
                    className="space-y-3"
                  >
                    {firstMissions.map((mission) => (
                      <button
                        key={mission.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, selectedMission: mission.id })}
                        className={`p-4 rounded-lg transition-all w-full text-left
                          ${formData.selectedMission === mission.id 
                            ? 'bg-primary/20 border border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]' 
                            : 'bg-card/30 border border-primary/10 hover:bg-primary/10'
                          }`}
                      >
                        <div className={`flex items-center justify-between`}>
                          <div>
                            <div className={`font-medium ${formData.selectedMission === mission.id ? 'text-primary' : 'text-foreground'}`}>
                              {mission.label}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {mission.description}
                            </div>
                          </div>
                          
                          {formData.selectedMission === mission.id && (
                            <Check className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                  
                  <motion.div variants={fadeInUp} className="text-center mt-4">
                    <Button 
                      variant="link" 
                      onClick={handleSkipSetup}
                      className="text-muted-foreground hover:text-primary"
                    >
                      Skip for now
                    </Button>
                  </motion.div>
                </motion.div>
              )}
              
              {/* Step 7: Home Interface Initialization */}
              {currentStep === 7 && (
                <motion.div className="space-y-6 text-center">
                  <motion.h2 
                    variants={fadeInUp}
                    className="text-2xl font-orbitron text-foreground"
                  >
                    SYSTEM ONLINE
                  </motion.h2>
                  
                  <motion.div variants={fadeInUp} className="py-8 space-y-6">
                    <div className="w-24 h-24 rounded-full bg-primary/20 border-4 border-primary/30 mx-auto flex items-center justify-center shadow-glow animate-pulse">
                      <Sparkles className="w-12 h-12 text-primary" />
                    </div>
                    
                    <div className="text-2xl font-mono text-primary font-bold animate-counting">
                      +100 XP
                    </div>
                  </motion.div>
                  
                  <motion.p 
                    variants={fadeInUp}
                    className="text-muted-foreground"
                  >
                    Your personal growth operating system is now initialized and ready.
                  </motion.p>
                  
                  <motion.p 
                    variants={fadeInUp} 
                    className="text-muted-foreground"
                  >
                    Command center access granted.
                  </motion.p>
                </motion.div>
              )}
              
              {/* Navigation buttons - shown on all steps */}
              <div className={`flex ${currentStep === 1 ? 'justify-end' : 'justify-between'} mt-8`}>
                {currentStep > 1 && (
                  <Button
                    variant="outline"
                    onClick={goToPreviousStep}
                    className="flex items-center space-x-2 border-primary/30 hover:bg-primary/10"
                    disabled={isAnimating}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
                
                {currentStep < 7 ? (
                  <Button
                    onClick={goToNextStep}
                    className="flex items-center space-x-2"
                    disabled={!isStepComplete() || isAnimating}
                  >
                    {currentStep === 6 ? 'Initialize System' : 'Next'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSystemInitialization}
                    className="flex items-center space-x-2"
                    disabled={isAnimating}
                  >
                    Enter LYFEOS
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
              
              {/* Progress indicators */}
              {currentStep < 7 && (
                <div className="flex justify-center mt-6">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div 
                      key={i}
                      className={`w-2 h-2 rounded-full mx-1 transition-all ${
                        i + 1 === currentStep 
                          ? 'bg-primary w-4' 
                          : i + 1 < currentStep 
                            ? 'bg-primary/50' 
                            : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
