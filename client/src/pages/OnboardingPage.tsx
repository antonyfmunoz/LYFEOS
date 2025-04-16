import { useState } from "react";
import { useLYFEOS } from "../lib/context";
import { useLocation } from "wouter";

export default function OnboardingPage() {
  const { setUsername } = useLYFEOS();
  const [, navigate] = useLocation();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    username: "",
    lifeSeason: "",
    intentions: [] as string[],
  });
  
  const lifeSeasons = [
    "New Beginnings",
    "Growth & Exploration",
    "Stability & Focus",
    "Leadership & Legacy",
    "Wisdom & Reflection"
  ];
  
  const intentions = [
    "Clarity",
    "Creation",
    "Healing",
    "Connection",
    "Growth",
    "Balance"
  ];
  
  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Submit and redirect to dashboard
      setUsername(formData.username);
      navigate("/dashboard");
    }
  };
  
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };
  
  const toggleIntention = (intention: string) => {
    setFormData(prev => {
      const currentIntentions = [...prev.intentions];
      
      if (currentIntentions.includes(intention)) {
        // Remove intention if already selected
        return {
          ...prev,
          intentions: currentIntentions.filter(i => i !== intention)
        };
      } else if (currentIntentions.length < 2) {
        // Add intention if less than 2 are selected
        return {
          ...prev,
          intentions: [...currentIntentions, intention]
        };
      }
      
      return prev;
    });
  };
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-primary font-orbitron mb-2">LYFE<span className="text-white">OS</span></h1>
        <p className="text-[#7DAAB2]">Your personal life operating system</p>
      </div>
      
      <div className="w-full max-w-md glassmorphic rounded-xl p-6 neon-border">
        {/* Progress indicator */}
        <div className="flex justify-between mb-8">
          {[1, 2, 3].map((i) => (
            <div 
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                i === step ? 'bg-primary text-background' : 
                i < step ? 'bg-primary/20 text-primary border border-primary' : 
                'bg-card/50 text-[#7DAAB2] border border-[#7DAAB2]/30'
              }`}
            >
              {i}
            </div>
          ))}
        </div>
        
        {/* Step 1: Username */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-orbitron text-center mb-4">Who is entering the simulation?</h2>
            
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm text-[#7DAAB2]">USERNAME</label>
              <input 
                type="text" 
                id="username"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                className="w-full bg-transparent border border-primary/30 rounded-lg p-3 outline-none text-[#D6F4FF] focus:border-primary/70 transition"
                placeholder="Enter your name"
              />
            </div>
          </div>
        )}
        
        {/* Step 2: Life Season */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-orbitron text-center mb-4">Which season of life are you in?</h2>
            
            <div className="space-y-3">
              {lifeSeasons.map((season) => (
                <div 
                  key={season}
                  onClick={() => setFormData(prev => ({ ...prev, lifeSeason: season }))}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    formData.lifeSeason === season 
                      ? 'bg-primary/20 border border-primary/70 shadow-[0_0_8px_rgba(0,224,255,0.3)]' 
                      : 'bg-card/30 border border-primary/20 hover:bg-card/50'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-5 h-5 rounded-full flex-shrink-0 mr-3 border ${
                      formData.lifeSeason === season 
                        ? 'border-primary bg-primary/20' 
                        : 'border-[#7DAAB2]/30 bg-transparent'
                    }`}>
                      {formData.lifeSeason === season && (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-primary"></div>
                        </div>
                      )}
                    </div>
                    <span>{season}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Step 3: Intentions */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-orbitron text-center mb-4">
              Select 1-2 intentions for your journey
            </h2>
            
            <div className="grid grid-cols-2 gap-3">
              {intentions.map((intention) => (
                <div 
                  key={intention}
                  onClick={() => toggleIntention(intention)}
                  className={`p-3 rounded-lg cursor-pointer transition text-center ${
                    formData.intentions.includes(intention) 
                      ? 'bg-primary/20 border border-primary/70 shadow-[0_0_8px_rgba(0,224,255,0.3)]' 
                      : 'bg-card/30 border border-primary/20 hover:bg-card/50'
                  }`}
                >
                  {intention}
                </div>
              ))}
            </div>
            
            <p className="text-xs text-[#7DAAB2] text-center">
              Selected: {formData.intentions.length}/2
            </p>
          </div>
        )}
        
        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button 
              onClick={handleBack}
              className="px-5 py-2 border border-primary/50 rounded-lg text-primary hover:bg-primary/10 transition"
            >
              Back
            </button>
          ) : (
            <div></div> // Empty div for spacing
          )}
          
          <button 
            onClick={handleNext}
            disabled={
              (step === 1 && !formData.username) || 
              (step === 2 && !formData.lifeSeason) ||
              (step === 3 && formData.intentions.length === 0)
            }
            className={`px-5 py-2 bg-primary rounded-lg text-background hover:bg-opacity-80 transition ${
              ((step === 1 && !formData.username) || 
              (step === 2 && !formData.lifeSeason) ||
              (step === 3 && formData.intentions.length === 0))
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            {step === 3 ? 'Start Journey' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
