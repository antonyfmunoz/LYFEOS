import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ChevronDown, ArrowLeft, Eye, Compass, Flame, Target, Milestone } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GoalsArchivePage() {
  usePageTitle('Vision');

  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: profileData } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: !!user?.id,
  });

  const [legacyOpen, setLegacyOpen] = useWidgetState('goals.legacy-vision', false);
  const [tenYearOpen, setTenYearOpen] = useWidgetState('goals.10year-vision', false);
  const [fiveYearOpen, setFiveYearOpen] = useWidgetState('goals.5year-vision', false);
  const [eighteenMonthOpen, setEighteenMonthOpen] = useWidgetState('goals.18month-vision', false);
  const [ninetyDayOpen, setNinetyDayOpen] = useWidgetState('goals.90day-vision', false);

  return (
    <div className="pb-20">
      <div className="mb-4">
        <Button 
          variant="ghost" 
          className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Vision</h1>
        <p className="text-[#7DAAB2]">Document your life vision and goals at different time horizons</p>
      </div>

      <div className="space-y-6 mb-6">
        <div className="glassmorphic rounded-xl neon-border overflow-hidden">
          <div 
            className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
            onClick={() => setLegacyOpen(!legacyOpen)}
          >
            <div className="flex items-center">
              <Eye className="h-5 w-5 mr-2 text-primary" />
              <h2 className="text-lg font-orbitron text-foreground">Legacy Vision</h2>
            </div>
            <div className="text-primary">
              <ChevronDown className={`h-5 w-5 transition-transform ${legacyOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {legacyOpen && (
            <div className="p-4">
              <span className="text-sm text-foreground">{profileData?.vision10YearLegacy || "\u2014"}</span>
            </div>
          )}
        </div>

        <div className="glassmorphic rounded-xl neon-border overflow-hidden">
          <div 
            className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
            onClick={() => setTenYearOpen(!tenYearOpen)}
          >
            <div className="flex items-center">
              <Target className="h-5 w-5 mr-2 text-primary" />
              <h2 className="text-lg font-orbitron text-foreground">10-Year Vision</h2>
            </div>
            <div className="text-primary">
              <ChevronDown className={`h-5 w-5 transition-transform ${tenYearOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {tenYearOpen && (
            <div className="p-4">
              <span className="text-sm text-foreground">{profileData?.vision10Year || "\u2014"}</span>
            </div>
          )}
        </div>

        <div className="glassmorphic rounded-xl neon-border overflow-hidden">
          <div 
            className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
            onClick={() => setFiveYearOpen(!fiveYearOpen)}
          >
            <div className="flex items-center">
              <Compass className="h-5 w-5 mr-2 text-primary" />
              <h2 className="text-lg font-orbitron text-foreground">5-Year Vision</h2>
            </div>
            <div className="text-primary">
              <ChevronDown className={`h-5 w-5 transition-transform ${fiveYearOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {fiveYearOpen && (
            <div className="p-4">
              <span className="text-sm text-foreground">{profileData?.vision5Year || "\u2014"}</span>
            </div>
          )}
        </div>

        <div className="glassmorphic rounded-xl neon-border overflow-hidden">
          <div 
            className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
            onClick={() => setEighteenMonthOpen(!eighteenMonthOpen)}
          >
            <div className="flex items-center">
              <Milestone className="h-5 w-5 mr-2 text-primary" />
              <h2 className="text-lg font-orbitron text-foreground">18-Month Vision</h2>
            </div>
            <div className="text-primary">
              <ChevronDown className={`h-5 w-5 transition-transform ${eighteenMonthOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {eighteenMonthOpen && (
            <div className="p-4">
              <span className="text-sm text-foreground">{profileData?.vision18Month || "\u2014"}</span>
            </div>
          )}
        </div>

        <div className="glassmorphic rounded-xl neon-border overflow-hidden">
          <div 
            className="p-3 flex items-center justify-between cursor-pointer border-b border-primary/20 hover:bg-primary/5 transition-colors"
            onClick={() => setNinetyDayOpen(!ninetyDayOpen)}
          >
            <div className="flex items-center">
              <Flame className="h-5 w-5 mr-2 text-primary" />
              <h2 className="text-lg font-orbitron text-foreground">90-Day Vision</h2>
            </div>
            <div className="text-primary">
              <ChevronDown className={`h-5 w-5 transition-transform ${ninetyDayOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {ninetyDayOpen && (
            <div className="p-4">
              <span className="text-sm text-foreground">{profileData?.vision90Day || "\u2014"}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}