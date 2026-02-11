import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Check, Loader2, Zap, X, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const MISSIONS = [
  { id: 0, title: "Access & Quickstart", questions: 3, xp: 100 },
  { id: 1, title: "Archetype Calibration", questions: 54, xp: 150 },
  { id: 2, title: "Identity & Direction", questions: 20, xp: 75 },
  { id: 3, title: "Craft & Mastery", questions: 6, xp: 60 },
  { id: 4, title: "Capacity & Constraints", questions: 9, xp: 55 },
  { id: 5, title: "Baselines & States", questions: 14, xp: 70 },
  { id: 6, title: "History & Roots", questions: 5, xp: 50 },
  { id: 7, title: "Systems & Rituals", questions: 7, xp: 65 },
];

type Archetype = "warrior" | "architect" | "creator" | "monarch" | "oracle" | "alchemist";

interface ArchetypeScores {
  warrior: number;
  architect: number;
  creator: number;
  monarch: number;
  oracle: number;
  alchemist: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function calculateAge(year: number, month: number, day: number): number {
  const today = new Date();
  const birthDate = new Date(year, month - 1, day);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function ageToRange(age: number): string {
  if (age < 18) return "under-18";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  if (age <= 64) return "55-64";
  return "65+";
}
const LIFE_STAGES = [
  { label: "Awakening", description: "Just starting your journey" },
  { label: "Building", description: "Actively constructing your path" },
  { label: "Mastering", description: "Refining your expertise" },
  { label: "Leading", description: "Guiding others forward" },
];

const DESIRED_EMOTIONS = ["Achievement", "Freedom", "Mastery", "Impact", "Love", "Adventure"];

const CORE_VALUES = [
  "Integrity", "Growth", "Freedom", "Adventure", "Creativity",
  "Connection", "Family", "Health", "Wealth", "Wisdom",
  "Service", "Leadership", "Excellence", "Balance", "Joy",
  "Peace", "Power", "Love", "Purpose", "Authenticity"
];

const ARCHETYPE_QUESTIONS = [
  { id: 1, text: "I am motivated by mastering difficult challenges", archetype: "warrior" as Archetype, weight: 1 },
  { id: 2, text: "I am motivated by building systems that outlast me", archetype: "architect" as Archetype, weight: 1 },
  { id: 3, text: "I am motivated by creating something new", archetype: "creator" as Archetype, weight: 1 },
  { id: 4, text: "I am motivated by leading others", archetype: "monarch" as Archetype, weight: 1 },
  { id: 5, text: "I am motivated by discovering truths", archetype: "oracle" as Archetype, weight: 1 },
  { id: 6, text: "I am motivated by transforming others", archetype: "alchemist" as Archetype, weight: 1 },
  { id: 7, text: "I feel strongest overcoming obstacles", archetype: "warrior" as Archetype, weight: 1.5 },
  { id: 8, text: "I feel strongest designing elegant solutions", archetype: "architect" as Archetype, weight: 1.5 },
  { id: 9, text: "I feel strongest expressing my ideas", archetype: "creator" as Archetype, weight: 1.5 },
  { id: 10, text: "I feel strongest guiding a vision", archetype: "monarch" as Archetype, weight: 1.5 },
  { id: 11, text: "I excel at pushing through resistance", archetype: "warrior" as Archetype, weight: 1 },
  { id: 12, text: "I excel at designing efficient processes", archetype: "architect" as Archetype, weight: 1 },
  { id: 13, text: "I excel at generating novel ideas", archetype: "creator" as Archetype, weight: 1 },
  { id: 14, text: "I excel at making tough decisions", archetype: "monarch" as Archetype, weight: 1 },
  { id: 15, text: "I excel at seeing patterns others miss", archetype: "oracle" as Archetype, weight: 1 },
  { id: 16, text: "I excel at helping others transform", archetype: "alchemist" as Archetype, weight: 1 },
  { id: 17, text: "People say I'm relentless", archetype: "warrior" as Archetype, weight: 1.5 },
  { id: 18, text: "People say I'm systematic", archetype: "architect" as Archetype, weight: 1.5 },
  { id: 19, text: "People say I'm innovative", archetype: "creator" as Archetype, weight: 1.5 },
  { id: 20, text: "People say I'm authoritative", archetype: "monarch" as Archetype, weight: 1.5 },
  { id: 21, text: "I avoid conflict at all costs", archetype: "warrior" as Archetype, weight: -1 },
  { id: 22, text: "I prefer flexibility over structure", archetype: "architect" as Archetype, weight: -1 },
  { id: 23, text: "I stick to proven methods", archetype: "creator" as Archetype, weight: -1 },
  { id: 24, text: "I prefer to follow rather than lead", archetype: "monarch" as Archetype, weight: -1 },
  { id: 25, text: "I trust gut over analysis", archetype: "oracle" as Archetype, weight: -1 },
  { id: 26, text: "I prioritize my needs over others'", archetype: "alchemist" as Archetype, weight: -1 },
  { id: 27, text: "I give up when things get hard", archetype: "warrior" as Archetype, weight: -1 },
  { id: 28, text: "I act impulsively without planning", archetype: "architect" as Archetype, weight: -1 },
  { id: 29, text: "You face a major setback. First instinct?", type: "scenario" as const },
  { id: 30, text: "A team member is struggling. You...", type: "scenario" as const },
  { id: 31, text: "You have unlimited resources for a day. You...", type: "scenario" as const },
  { id: 32, text: "A conflict arises in your group. You...", type: "scenario" as const },
  { id: 33, text: "You receive unexpected criticism. You...", type: "scenario" as const },
  { id: 34, text: "A new opportunity appears. You...", type: "scenario" as const },
  { id: 35, text: "You're asked to teach something. You...", type: "scenario" as const },
  { id: 36, text: "You notice inefficiency. You...", type: "scenario" as const },
  { id: 37, text: "Someone challenges your idea. You...", type: "scenario" as const },
  { id: 38, text: "You have free creative time. You...", type: "scenario" as const },
  { id: 39, text: "A deadline is approaching. You...", type: "scenario" as const },
  { id: 40, text: "You see someone in need. You...", type: "scenario" as const },
  { id: 41, text: "I thrive in high-pressure situations", archetype: "warrior" as Archetype, weight: 1 },
  { id: 42, text: "I need clear structure to perform well", archetype: "architect" as Archetype, weight: 1 },
  { id: 43, text: "I need creative freedom for best work", archetype: "creator" as Archetype, weight: 1 },
  { id: 44, text: "I naturally take charge in groups", archetype: "monarch" as Archetype, weight: 1 },
  { id: 45, text: "I prefer to observe before acting", archetype: "oracle" as Archetype, weight: 1 },
  { id: 46, text: "I feel fulfilled helping others grow", archetype: "alchemist" as Archetype, weight: 1 },
  { id: 47, text: "I'm energized by competition", archetype: "warrior" as Archetype, weight: 1.5 },
  { id: 48, text: "I'm energized by optimization", archetype: "architect" as Archetype, weight: 1.5 },
  { id: 49, text: "My greatest contribution is resilience", archetype: "warrior" as Archetype, weight: 1 },
  { id: 50, text: "My greatest contribution is systems thinking", archetype: "architect" as Archetype, weight: 1 },
  { id: 51, text: "My greatest contribution is creativity", archetype: "creator" as Archetype, weight: 1 },
  { id: 52, text: "My greatest contribution is leadership", archetype: "monarch" as Archetype, weight: 1 },
  { id: 53, text: "My greatest contribution is wisdom", archetype: "oracle" as Archetype, weight: 1 },
  { id: 54, text: "My greatest contribution is compassion", archetype: "alchemist" as Archetype, weight: 1 },
];

const SCENARIO_OPTIONS: Record<number, { text: string; archetype: Archetype }[]> = {
  29: [
    { text: "Push harder, overcome this", archetype: "warrior" },
    { text: "Analyze what went wrong, redesign", archetype: "architect" },
    { text: "Find creative workaround", archetype: "creator" },
    { text: "Rally the team, lead through it", archetype: "monarch" },
    { text: "Reflect deeply, find the lesson", archetype: "oracle" },
    { text: "Support those affected, focus on healing", archetype: "alchemist" },
  ],
  30: [
    { text: "Challenge them to rise up", archetype: "warrior" },
    { text: "Create a clear action plan for them", archetype: "architect" },
    { text: "Brainstorm creative solutions together", archetype: "creator" },
    { text: "Delegate and empower them", archetype: "monarch" },
    { text: "Listen deeply to understand the root cause", archetype: "oracle" },
    { text: "Mentor and transform their mindset", archetype: "alchemist" },
  ],
  31: [
    { text: "Take on an extreme challenge", archetype: "warrior" },
    { text: "Build a system that lasts", archetype: "architect" },
    { text: "Create something beautiful", archetype: "creator" },
    { text: "Launch a major initiative", archetype: "monarch" },
    { text: "Research and discover truths", archetype: "oracle" },
    { text: "Help others transform their lives", archetype: "alchemist" },
  ],
  32: [
    { text: "Confront it head-on", archetype: "warrior" },
    { text: "Create a fair process to resolve it", archetype: "architect" },
    { text: "Find an unconventional solution", archetype: "creator" },
    { text: "Make the final call", archetype: "monarch" },
    { text: "Seek to understand all perspectives", archetype: "oracle" },
    { text: "Facilitate healing between parties", archetype: "alchemist" },
  ],
  33: [
    { text: "Use it as fuel to improve", archetype: "warrior" },
    { text: "Analyze it objectively for valid points", archetype: "architect" },
    { text: "See it as input for innovation", archetype: "creator" },
    { text: "Consider it, but trust your vision", archetype: "monarch" },
    { text: "Reflect deeply on the truth in it", archetype: "oracle" },
    { text: "Understand the critic's perspective", archetype: "alchemist" },
  ],
  34: [
    { text: "Jump in and give it everything", archetype: "warrior" },
    { text: "Evaluate it against your system", archetype: "architect" },
    { text: "Explore its creative potential", archetype: "creator" },
    { text: "Assess if it aligns with your vision", archetype: "monarch" },
    { text: "Research it thoroughly first", archetype: "oracle" },
    { text: "Consider how it could help others", archetype: "alchemist" },
  ],
  35: [
    { text: "Share through intense practice", archetype: "warrior" },
    { text: "Create a structured curriculum", archetype: "architect" },
    { text: "Make learning creative and fun", archetype: "creator" },
    { text: "Inspire through vision and example", archetype: "monarch" },
    { text: "Share deep insights and wisdom", archetype: "oracle" },
    { text: "Transform the learner's approach", archetype: "alchemist" },
  ],
  36: [
    { text: "Push through it with effort", archetype: "warrior" },
    { text: "Design a better system", archetype: "architect" },
    { text: "Innovate a new approach", archetype: "creator" },
    { text: "Direct change from the top", archetype: "monarch" },
    { text: "Analyze the root cause", archetype: "oracle" },
    { text: "Coach others to improve", archetype: "alchemist" },
  ],
  37: [
    { text: "Defend it with conviction", archetype: "warrior" },
    { text: "Present systematic evidence", archetype: "architect" },
    { text: "Explore both ideas for innovation", archetype: "creator" },
    { text: "Assert your position confidently", archetype: "monarch" },
    { text: "Seek truth in both perspectives", archetype: "oracle" },
    { text: "Use it as a teaching moment", archetype: "alchemist" },
  ],
  38: [
    { text: "Train or compete", archetype: "warrior" },
    { text: "Organize or plan", archetype: "architect" },
    { text: "Create art or explore ideas", archetype: "creator" },
    { text: "Strategize or network", archetype: "monarch" },
    { text: "Learn or contemplate", archetype: "oracle" },
    { text: "Help or connect with others", archetype: "alchemist" },
  ],
  39: [
    { text: "Power through, no matter what", archetype: "warrior" },
    { text: "Execute the plan systematically", archetype: "architect" },
    { text: "Find an innovative shortcut", archetype: "creator" },
    { text: "Delegate and oversee", archetype: "monarch" },
    { text: "Prioritize what truly matters", archetype: "oracle" },
    { text: "Support the team to finish together", archetype: "alchemist" },
  ],
  40: [
    { text: "Jump in and take action", archetype: "warrior" },
    { text: "Assess and create a help plan", archetype: "architect" },
    { text: "Find creative ways to help", archetype: "creator" },
    { text: "Organize others to assist", archetype: "monarch" },
    { text: "Understand their deeper needs", archetype: "oracle" },
    { text: "Guide them through transformation", archetype: "alchemist" },
  ],
};

const ONBOARDING_TIMEZONE_OPTIONS = [
  { label: 'EST', value: 'America/New_York' },
  { label: 'CST', value: 'America/Chicago' },
  { label: 'MST', value: 'America/Denver' },
  { label: 'PST', value: 'America/Los_Angeles' },
  { label: 'GMT', value: 'Europe/London' },
  { label: 'CET', value: 'Europe/Paris' },
  { label: 'JST', value: 'Asia/Tokyo' },
  { label: 'AEST', value: 'Australia/Sydney' },
  { label: 'NZST', value: 'Pacific/Auckland' }
];

function TimezoneDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLabel = ONBOARDING_TIMEZONE_OPTIONS.find(tz => tz.value === value)?.label || value;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative max-w-md mx-auto">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-lg border border-primary/20 bg-card/30 backdrop-blur px-4 py-3 text-sm text-foreground hover:border-primary/50 transition-colors"
      >
        <span className="font-mono">{currentLabel}</span>
        <ChevronDown className={`h-4 w-4 text-primary transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 rounded-xl border border-primary/30 bg-card/95 backdrop-blur shadow-[0_0_20px_var(--primary-bg-subtle)] overflow-hidden"
        >
          <div className="max-h-48 overflow-y-auto p-1">
            {ONBOARDING_TIMEZONE_OPTIONS.map(tz => (
              <button
                key={tz.value}
                onClick={() => { onChange(tz.value); setIsOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm font-mono rounded hover:bg-primary/20 transition-colors flex items-center justify-between ${
                  tz.value === value ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                {tz.label}
                {tz.value === value && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DotNavigation({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 justify-center mt-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-all ${
            i === current
              ? "bg-primary w-6"
              : i < current
              ? "bg-primary/60"
              : "bg-primary/20"
          }`}
        />
      ))}
    </div>
  );
}

function LocationDropdown({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current && !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.length < 2) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&format=json&addressdetails=1&limit=8&featuretype=city`,
          { headers: { "Accept-Language": "en" } }
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const locations = data
          .map((item: any) => {
            const city = item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || item.name;
            const state = item.address?.state;
            const country = item.address?.country;
            const parts = [city, state, country].filter(Boolean);
            return parts.join(", ");
          })
          .filter((loc: string, i: number, arr: string[]) => arr.indexOf(loc) === i);
        setSuggestions(locations);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    onChange(val);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelect = (loc: string) => {
    onChange(loc);
    setSearch(loc);
    setIsOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative max-w-md mx-auto" ref={dropdownRef}>
      <input
        ref={inputRef}
        value={search}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        placeholder="Type your city or search..."
        autoComplete="off"
        className="w-full rounded-lg border border-primary/20 bg-card/30 backdrop-blur px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary/50 focus:outline-none transition-colors"
      />
      {isOpen && (search.length >= 2 || isSearching) && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl border border-primary/30 bg-card/95 backdrop-blur shadow-[0_0_20px_var(--primary-bg-subtle)] overflow-hidden"
        >
          <div className="max-h-48 overflow-y-auto">
            {isSearching && (
              <p className="text-xs text-muted-foreground text-center py-3">Searching...</p>
            )}
            {!isSearching && suggestions.length > 0 && suggestions.map((loc) => (
              <button
                key={loc}
                onClick={() => handleSelect(loc)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/20 transition-colors ${
                  loc === value ? "bg-primary/10 text-primary" : "text-foreground"
                }`}
              >
                {loc}
              </button>
            ))}
            {!isSearching && search.length >= 2 && suggestions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No results — your typed value will be used</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmojiGridSelect({ 
  options, 
  value, 
  onChange,
  columns = 2
}: { 
  options: { label: string; description?: string }[]; 
  value: string; 
  onChange: (val: string) => void;
  columns?: number;
}) {
  return (
    <div className={`grid gap-3 mt-4 ${columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
      {options.map((option) => (
        <button
          key={option.label}
          onClick={() => onChange(option.label)}
          className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
            value === option.label
              ? "bg-primary/20 border-primary shadow-[0_0_15px_var(--primary-glow-light)]"
              : "bg-card/30 border-primary/20 hover:border-primary/50"
          }`}
        >
          <span className="text-sm font-medium">{option.label}</span>
          {option.description && <span className="text-xs text-muted-foreground">{option.description}</span>}
        </button>
      ))}
    </div>
  );
}

function GradientSlider({ 
  value, 
  onChange, 
  left, 
  right 
}: { 
  value: number; 
  onChange: (val: number) => void; 
  left: string; 
  right: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="relative">
        <div className="absolute inset-0 h-2 rounded-full bg-gradient-to-r from-primary/80 via-primary to-primary/80 top-1/2 -translate-y-1/2" />
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="theme-slider relative w-full h-6 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
        />
      </div>
    </div>
  );
}

function ChipSelect({ 
  options, 
  value, 
  onChange, 
  multiple = false 
}: { 
  options: string[]; 
  value: string | string[]; 
  onChange: (val: string | string[]) => void;
  multiple?: boolean;
}) {
  const handleClick = (option: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(option)) {
        onChange(currentValues.filter(v => v !== option));
      } else {
        onChange([...currentValues, option]);
      }
    } else {
      onChange(option);
    }
  };

  const isSelected = (option: string) => {
    if (multiple) {
      return Array.isArray(value) && value.includes(option);
    }
    return value === option;
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center mt-4">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => handleClick(option)}
          className={`px-4 py-2 rounded-xl border-2 transition-all text-sm ${
            isSelected(option)
              ? "bg-primary/20 text-primary border-primary shadow-[0_0_10px_var(--primary-glow-light)]"
              : "bg-card/30 text-foreground border-primary/20 hover:border-primary/50"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function LikertScale({ value, onChange }: { value: number; onChange: (val: number) => void }) {
  return (
    <div className="flex gap-2 justify-center mt-4">
      {[1, 2, 3, 4, 5].map((num) => (
        <button
          key={num}
          onClick={() => onChange(num)}
          className={`w-12 h-12 rounded-xl border-2 transition-all font-medium ${
            value === num
              ? "bg-primary/20 text-primary border-primary shadow-[0_0_10px_var(--primary-glow-light)]"
              : "bg-card/30 text-foreground border-primary/20 hover:border-primary/50"
          }`}
        >
          {num}
        </button>
      ))}
    </div>
  );
}

function ScenarioSelect({ 
  options, 
  value, 
  onChange 
}: { 
  options: { text: string; archetype: Archetype }[]; 
  value: string; 
  onChange: (archetype: Archetype) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-4">
      {options.map((option) => (
        <button
          key={option.archetype}
          onClick={() => onChange(option.archetype)}
          className={`px-4 py-3 rounded-xl border-2 transition-all text-sm text-left ${
            value === option.archetype
              ? "bg-primary/20 text-primary border-primary shadow-[0_0_10px_var(--primary-glow-light)]"
              : "bg-card/30 text-foreground border-primary/20 hover:border-primary/50"
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  usePageTitle("Onboarding");
  const { user, isLoading: authLoading, completeRegistration } = useAuth();
  const { quests, refetchQuests } = useLYFEOS();
  const [, navigate] = useLocation();

  const pendingReg = sessionStorage.getItem("lyfeos-pending-registration");
  const isPendingRegistration = !!pendingReg && !user;
  
  const { data: userProfile } = useQuery({
    queryKey: ["/api/profile"],
    enabled: !!user?.id,
  });
  
  useEffect(() => {
    if (!authLoading && !user && !isPendingRegistration) {
      console.log("User not authenticated, redirecting to login");
      navigate("/login");
    }
  }, [user, authLoading, navigate, isPendingRegistration]);
  
  const [currentMission, setCurrentMission] = useState(0);
  const missionStartTimeRef = useRef<Date>(new Date());
  const [continuedPastMission0, setContinuedPastMission0] = useState(() => {
    return localStorage.getItem("lyfeos-continued-past-mission0") === "true";
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingAffirmation, setIsGeneratingAffirmation] = useState(false);
  const [showMissionComplete, setShowMissionComplete] = useState(false);
  const [completedOnboardingMissions, setCompletedOnboardingMissions] = useState<number[]>([]);
  
  useEffect(() => {
    const resumeData = localStorage.getItem("lyfeos-onboarding-resume");
    if (resumeData) {
      try {
        const { mission, step } = JSON.parse(resumeData);
        if (typeof mission === "number" && mission >= 0 && mission <= 7) {
          setCurrentMission(mission);
          setCurrentStep(step || 0);
          missionStartTimeRef.current = new Date();
        }
      } catch {}
      localStorage.removeItem("lyfeos-onboarding-resume");
      return;
    }
    
    const params = new URLSearchParams(window.location.search);
    const missionParam = params.get("mission");
    if (missionParam !== null) {
      const missionNum = parseInt(missionParam, 10);
      if (!isNaN(missionNum) && missionNum >= 0 && missionNum <= 7) {
        setCurrentMission(missionNum);
        setCurrentStep(0);
        missionStartTimeRef.current = new Date();
      }
    }
  }, []);
  
  useEffect(() => {
    if (userProfile) {
      const existingCompleted = (userProfile as any)?.completedOnboardingMissions || [];
      setCompletedOnboardingMissions(existingCompleted);
    }
  }, [userProfile]);
  
  const STORAGE_KEY = "lyfeos-onboarding-answers";
  
  const loadSavedAnswers = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  };
  
  const saved = loadSavedAnswers();
  
  const [birthMonth, setBirthMonth] = useState<number>(0);
  const [birthDay, setBirthDay] = useState<number>(0);
  const [birthYear, setBirthYear] = useState<number>(0);
  const [location, setLocation] = useState(saved.location || "");
  const [detectedLocation, setDetectedLocation] = useState("");
  const [timezone, setTimezone] = useState(saved.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/geo/location");
        if (!res.ok) return;
        const data = await res.json();
        if (data.location) {
          setDetectedLocation(data.location);
          if (!location) {
            setLocation(data.location);
          }
        }
      } catch {}
    })();
  }, []);
  const [onboardingUsername, setOnboardingUsername] = useState("");
  const [onboardingFirstName, setOnboardingFirstName] = useState("");
  const [onboardingLastName, setOnboardingLastName] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [lifeStage, setLifeStage] = useState(saved.lifeStage || "");
  
  const [archetypeAnswers, setArchetypeAnswers] = useState<Record<number, number | Archetype>>(saved.archetypeAnswers || {});
  
  const [coreValues, setCoreValues] = useState<string[]>(saved.coreValues || []);
  const [desiredEmotion, setDesiredEmotion] = useState(saved.desiredEmotion || "");
  const [coreBelief, setCoreBelief] = useState(saved.coreBelief || "");
  const [limitingBelief, setLimitingBelief] = useState(saved.limitingBelief || "");
  const [empoweringBelief, setEmpoweringBelief] = useState(saved.empoweringBelief || "");
  const [strengths, setStrengths] = useState<string[]>(saved.strengths || []);
  const [weaknesses, setWeaknesses] = useState<string[]>(saved.weaknesses || []);
  const [selfStandards, setSelfStandards] = useState(saved.selfStandards || "");
  const [traitToReprogram, setTraitToReprogram] = useState(saved.traitToReprogram || "");
  const [desiredTrait, setDesiredTrait] = useState(saved.desiredTrait || "");
  const [vision90Day, setVision90Day] = useState(saved.vision90Day || "");
  const [vision90DayMetric, setVision90DayMetric] = useState(saved.vision90DayMetric || "");
  const [vision18Month, setVision18Month] = useState(saved.vision18Month || "");
  const [vision18MonthMetric, setVision18MonthMetric] = useState(saved.vision18MonthMetric || "");
  const [vision5Year, setVision5Year] = useState(saved.vision5Year || "");
  const [vision10YearLegacy, setVision10YearLegacy] = useState(saved.vision10YearLegacy || "");
  const [legacyMetric, setLegacyMetric] = useState(saved.legacyMetric || "");
  const [mortalityReflection, setMortalityReflection] = useState(saved.mortalityReflection || "");
  const [lifeDomains, setLifeDomains] = useState<string[]>(saved.lifeDomains || []);
  
  const [primaryCraft, setPrimaryCraft] = useState(saved.primaryCraft || "");
  const [primaryCraftWhy, setPrimaryCraftWhy] = useState(saved.primaryCraftWhy || "");
  const [knowledgeAreas, setKnowledgeAreas] = useState(saved.knowledgeAreas || "");
  const [skillsToAcquire, setSkillsToAcquire] = useState(saved.skillsToAcquire || "");
  const [learningPreference, setLearningPreference] = useState(saved.learningPreference || "");
  const [practiceHours, setPracticeHours] = useState(saved.practiceHours ?? 10);
  
  const [weeklyCapacity, setWeeklyCapacity] = useState(saved.weeklyCapacity ?? 40);
  const [energyDrains, setEnergyDrains] = useState<string[]>(saved.energyDrains || []);
  const [physicalEnvironment, setPhysicalEnvironment] = useState(saved.physicalEnvironment || "");
  const [physicalEnvironmentImpact, setPhysicalEnvironmentImpact] = useState(saved.physicalEnvironmentImpact || "");
  const [financialIncome, setFinancialIncome] = useState(saved.financialIncome || "");
  const [financialSavings, setFinancialSavings] = useState(saved.financialSavings || "");
  const [financialConstraints, setFinancialConstraints] = useState<string[]>(saved.financialConstraints || []);
  const [moneyConfidenceScore, setMoneyConfidenceScore] = useState(saved.moneyConfidenceScore ?? 5);
  const [moneyRelationship, setMoneyRelationship] = useState(saved.moneyRelationship || "");
  
  const [sleepHours, setSleepHours] = useState(saved.sleepHours ?? 7);
  const [exerciseFrequency, setExerciseFrequency] = useState(saved.exerciseFrequency || "");
  const [nutritionApproach, setNutritionApproach] = useState(saved.nutritionApproach || "");
  const [habitsToReprogram, setHabitsToReprogram] = useState<string[]>(saved.habitsToReprogram || []);
  const [traitsToCultivate, setTraitsToCultivate] = useState<string[]>(saved.traitsToCultivate || []);
  const [emotionsToCultivate, setEmotionsToCultivate] = useState<string[]>(saved.emotionsToCultivate || []);
  const [copingPractices, setCopingPractices] = useState(saved.copingPractices || "");
  const [copingEssential, setCopingEssential] = useState(saved.copingEssential || "");
  const [dominantInstinctType, setDominantInstinctType] = useState(saved.dominantInstinctType || "");
  const [decisionMakingStyles, setDecisionMakingStyles] = useState<string[]>(saved.decisionMakingStyles || []);
  const [decisionMakingPrimary, setDecisionMakingPrimary] = useState(saved.decisionMakingPrimary || "");
  
  const [shadowPatternText, setShadowPatternText] = useState(saved.shadowPatternText || "");
  const [upbringing, setUpbringing] = useState(saved.upbringing || "");
  const [culturalContext, setCulturalContext] = useState(saved.culturalContext || "");
  const [keyExperiences, setKeyExperiences] = useState(saved.keyExperiences || "");
  const [relationshipDrains, setRelationshipDrains] = useState(saved.relationshipDrains || "");
  
  const [idealDay, setIdealDay] = useState(saved.idealDay || "");
  const [morningRituals, setMorningRituals] = useState<string[]>(saved.morningRituals || []);
  const [eveningRituals, setEveningRituals] = useState<string[]>(saved.eveningRituals || []);
  const [groundingRitual, setGroundingRitual] = useState(saved.groundingRitual || "");
  const [boundaries, setBoundaries] = useState(saved.boundaries || { techOffTime: "", workHours: "" });
  const [lockedHabit, setLockedHabit] = useState(saved.lockedHabit || "");
  const [yearlyCyclesText, setYearlyCyclesText] = useState(saved.yearlyCyclesText || "");
  
  useEffect(() => {
    const data = {
      onboardingUsername, onboardingFirstName, onboardingLastName,
      birthMonth, birthDay, birthYear, location, timezone, lifeStage, archetypeAnswers,
      coreValues, desiredEmotion, coreBelief, limitingBelief, empoweringBelief,
      strengths, weaknesses, selfStandards, traitToReprogram, desiredTrait,
      vision90Day, vision90DayMetric, vision18Month, vision18MonthMetric,
      vision5Year, vision10YearLegacy, legacyMetric, mortalityReflection, lifeDomains,
      primaryCraft, primaryCraftWhy, knowledgeAreas, skillsToAcquire, learningPreference, practiceHours,
      weeklyCapacity, energyDrains, physicalEnvironment, physicalEnvironmentImpact,
      financialIncome, financialSavings, financialConstraints, moneyConfidenceScore, moneyRelationship,
      sleepHours, exerciseFrequency, nutritionApproach, habitsToReprogram, traitsToCultivate,
      emotionsToCultivate, copingPractices, copingEssential, dominantInstinctType, decisionMakingStyles, decisionMakingPrimary,
      shadowPatternText, upbringing, culturalContext, keyExperiences, relationshipDrains,
      idealDay, morningRituals, eveningRituals, groundingRitual, boundaries, lockedHabit, yearlyCyclesText,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [
    onboardingUsername, onboardingFirstName, onboardingLastName,
    birthMonth, birthDay, birthYear, location, timezone, lifeStage, archetypeAnswers,
    coreValues, desiredEmotion, coreBelief, limitingBelief, empoweringBelief,
    strengths, weaknesses, selfStandards, traitToReprogram, desiredTrait,
    vision90Day, vision90DayMetric, vision18Month, vision18MonthMetric,
    vision5Year, vision10YearLegacy, legacyMetric, mortalityReflection, lifeDomains,
    primaryCraft, primaryCraftWhy, knowledgeAreas, skillsToAcquire, learningPreference, practiceHours,
    weeklyCapacity, energyDrains, physicalEnvironment, physicalEnvironmentImpact,
    financialIncome, financialSavings, financialConstraints, moneyConfidenceScore, moneyRelationship,
    sleepHours, exerciseFrequency, nutritionApproach, habitsToReprogram, traitsToCultivate,
    emotionsToCultivate, copingPractices, copingEssential, dominantInstinctType, decisionMakingStyles, decisionMakingPrimary,
    shadowPatternText, upbringing, culturalContext, keyExperiences, relationshipDrains,
    idealDay, morningRituals, eveningRituals, groundingRitual, boundaries, lockedHabit, yearlyCyclesText,
  ]);
  
  const calculateArchetypeScores = (): ArchetypeScores => {
    const scores: ArchetypeScores = {
      warrior: 0, architect: 0, creator: 0, monarch: 0, oracle: 0, alchemist: 0,
    };
    
    ARCHETYPE_QUESTIONS.forEach((question) => {
      const answer = archetypeAnswers[question.id];
      if (answer !== undefined) {
        if (question.type === "scenario") {
          if (typeof answer === "string") {
            scores[answer as Archetype] += 5;
          }
        } else if (question.archetype && question.weight !== undefined) {
          const numAnswer = typeof answer === "number" ? answer : 0;
          if (question.weight < 0) {
            scores[question.archetype] += (6 - numAnswer) * Math.abs(question.weight);
          } else {
            scores[question.archetype] += numAnswer * question.weight;
          }
        }
      }
    });
    
    return scores;
  };
  
  const getArchetypeResults = () => {
    const scores = calculateArchetypeScores();
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return {
      primary: sorted[0][0] as Archetype,
      secondary: sorted[1][0] as Archetype,
      shadow: sorted[sorted.length - 1][0] as Archetype,
      scores,
    };
  };

  const saveCompletedMission = async (missionId: number) => {
    try {
      const mission = MISSIONS.find(m => m.id === missionId);
      if (!mission) return;
      
      if (missionId === 0) {
        const pendingRegData = sessionStorage.getItem("lyfeos-pending-registration");
        if (pendingRegData) {
          const { email, password, avatarColor } = JSON.parse(pendingRegData);
          const birthdayStr = birthYear && birthMonth && birthDay
            ? `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`
            : "";
          await completeRegistration({
            email,
            password,
            username: onboardingUsername.trim(),
            firstName: onboardingFirstName.trim(),
            lastName: onboardingLastName.trim(),
            avatarColor,
            birthday: birthdayStr,
            location,
            timezone,
            termsAccepted: true,
          });
        } else if (onboardingUsername.trim()) {
          try {
            await fetch("/api/auth/set-username", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                username: onboardingUsername.trim(),
                firstName: onboardingFirstName.trim(),
                lastName: onboardingLastName.trim(),
              }),
            });
          } catch (err) {
            console.error("Failed to set username:", err);
          }
        }
      }
      
      const now = new Date();
      const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const profileResponse = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          completedOnboardingMissions: [...(completedOnboardingMissions || []), missionId].filter((v, i, a) => a.indexOf(v) === i)
        })
      });
      
      if (user?.id) {
        try {
          const questTitle = `Onboarding: ${mission.title}`;
          
          const existingCompletedQuest = quests.find(q => q.title === questTitle && q.completed);
          if (existingCompletedQuest) {
            console.log("Onboarding quest already completed, skipping creation:", questTitle);
          } else {
            const startTime = missionStartTimeRef.current;
            const startDateStr = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}-${String(startTime.getDate()).padStart(2, '0')}`;
            const startTimeStr = startTime.toTimeString().slice(0, 5);
            const endTimeStr = now.toTimeString().slice(0, 5);
            const questData = {
              userId: user.id,
              title: questTitle,
              description: `Completed onboarding mission "${mission.title}"`,
              category: "onboarding",
              completed: true,
              completedAt: now.toISOString(),
              experienceReward: mission.xp,
              startDate: startDateStr,
              startTime: startTimeStr,
              dueDate: localDateStr,
              endDate: localDateStr,
              endTime: endTimeStr,
            };
            console.log("Creating quest with data:", questData);
            const result = await apiRequest("/api/quests", {
              method: "POST",
              body: JSON.stringify(questData),
            });
            console.log("Quest created successfully:", result);
          }
          console.log("Refetching quests after onboarding mission completion...");
          await refetchQuests();
          console.log("Quests refetched successfully");
        } catch (questError: any) {
          console.error("Failed to create quest:", questError?.message || questError);
        }
      }
      
      if (profileResponse.ok) {
        setCompletedOnboardingMissions(prev => [...(prev || []), missionId].filter((v, i, a) => a.indexOf(v) === i));
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      }
    } catch (error: any) {
      console.error("Failed to save completed mission:", error?.message || error);
    }
  };

  const mission = MISSIONS[currentMission];
  const totalSteps = getMaxSteps(currentMission);
  
  function getMaxSteps(missionId: number) {
    switch (missionId) {
      case 0: return 5;
      case 1: return ARCHETYPE_QUESTIONS.length;
      case 2: return 20;
      case 3: return 6;
      case 4: return 9;
      case 5: return 14;
      case 6: return 5;
      case 7: return 7;
      default: return 1;
    }
  }
  
  const canProceed = () => {
    if (currentMission === 0) {
      if (currentStep === 0) return onboardingUsername.trim().length >= 3 && usernameAvailable === true;
      if (currentStep === 1) return onboardingFirstName.trim() !== "" && onboardingLastName.trim() !== "";
      if (currentStep === 2) return birthMonth > 0 && birthDay > 0 && birthYear > 0;
      if (currentStep === 3) return location.trim() !== "";
      if (currentStep === 4) return timezone !== "";
    }
    if (currentMission === 1) {
      return archetypeAnswers[ARCHETYPE_QUESTIONS[currentStep]?.id] !== undefined;
    }
    if (currentMission === 2) {
      switch (currentStep) {
        case 0: return lifeStage !== "";
        case 1: return coreValues.length > 0;
        case 2: return desiredEmotion !== "";
        case 3: return coreBelief.trim() !== "";
        case 4: return limitingBelief.trim() !== "";
        case 5: return empoweringBelief.trim() !== "";
        case 6: return strengths.length > 0;
        case 7: return weaknesses.length > 0;
        case 8: return selfStandards.trim() !== "";
        case 9: return traitToReprogram.trim() !== "";
        case 10: return desiredTrait.trim() !== "";
        case 11: return vision90Day.trim() !== "";
        case 12: return vision90DayMetric.trim() !== "";
        case 13: return vision18Month.trim() !== "";
        case 14: return vision18MonthMetric.trim() !== "";
        case 15: return vision5Year.trim() !== "";
        case 16: return vision10YearLegacy.trim() !== "";
        case 17: return legacyMetric.trim() !== "";
        case 18: return mortalityReflection.trim() !== "";
        case 19: return lifeDomains.length > 0;
      }
    }
    if (currentMission === 3) {
      switch (currentStep) {
        case 0: return primaryCraft.trim() !== "";
        case 1: return primaryCraftWhy.trim() !== "";
        case 2: return knowledgeAreas.trim() !== "";
        case 3: return skillsToAcquire.trim() !== "";
        case 4: return learningPreference !== "";
        case 5: return true;
      }
    }
    if (currentMission === 4) {
      switch (currentStep) {
        case 0: return true;
        case 1: return energyDrains.length > 0;
        case 2: return physicalEnvironment.trim() !== "";
        case 3: return physicalEnvironmentImpact.trim() !== "";
        case 4: return financialIncome.trim() !== "";
        case 5: return financialSavings.trim() !== "";
        case 6: return financialConstraints.length > 0;
        case 7: return true;
        case 8: return moneyRelationship.trim() !== "";
      }
    }
    if (currentMission === 5) {
      switch (currentStep) {
        case 0: return true;
        case 1: return exerciseFrequency !== "";
        case 2: return nutritionApproach !== "";
        case 3: return habitsToReprogram.length > 0;
        case 4: return traitsToCultivate.length > 0;
        case 5: return coreBelief.trim() !== "";
        case 6: return limitingBelief.trim() !== "";
        case 7: return empoweringBelief.trim() !== "";
        case 8: return emotionsToCultivate.length > 0;
        case 9: return copingPractices.trim() !== "";
        case 10: return copingEssential.trim() !== "";
        case 11: return dominantInstinctType !== "";
        case 12: return decisionMakingStyles.length > 0;
        case 13: return decisionMakingPrimary !== "";
      }
    }
    if (currentMission === 6) {
      switch (currentStep) {
        case 0: return shadowPatternText.trim() !== "";
        case 1: return upbringing.trim() !== "";
        case 2: return culturalContext.trim() !== "";
        case 3: return keyExperiences.trim() !== "";
        case 4: return relationshipDrains.trim() !== "";
      }
    }
    if (currentMission === 7) {
      switch (currentStep) {
        case 0: return idealDay.trim() !== "";
        case 1: return morningRituals.length > 0;
        case 2: return eveningRituals.length > 0;
        case 3: return groundingRitual.trim() !== "";
        case 4: return boundaries.techOffTime.trim() !== "" && boundaries.workHours.trim() !== "";
        case 5: return lockedHabit.trim() !== "";
        case 6: return yearlyCyclesText.trim() !== "";
      }
    }
    return true;
  };
  
  const handleNext = async () => {
    const maxSteps = getMaxSteps(currentMission);
    
    if (currentStep < maxSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await saveCompletedMission(currentMission);
      await saveMissionData(currentMission);
      setShowMissionComplete(true);
    }
  };
  
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStop = async () => {
    if (continuedPastMission0 && currentMission > 0) {
      handleSkipToSystem();
    } else {
      localStorage.removeItem("lyfeos-pending-onboarding");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-ceremony-mode");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      localStorage.removeItem(STORAGE_KEY);
      try {
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ onboardingCompleted: true }),
        });
        navigate("/missions");
      } catch (error) {
        console.error("Error completing onboarding:", error);
        toast({
          title: "Error",
          description: "Failed to save your profile. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleContinueToNextMission = () => {
    setShowMissionComplete(false);
    if (currentMission === 0) {
      setContinuedPastMission0(true);
      localStorage.setItem("lyfeos-continued-past-mission0", "true");
    }
    setCurrentMission(currentMission + 1);
    setCurrentStep(0);
    missionStartTimeRef.current = new Date();
  };

  const handleSkipToSystem = async () => {
    setShowMissionComplete(false);
    localStorage.removeItem("lyfeos-pending-onboarding");
    localStorage.setItem("lyfeos-ceremony-mode", currentMission === 0 ? "init" : "update");
    localStorage.removeItem("lyfeos-onboarding-resume");
    localStorage.removeItem("lyfeos-continued-past-mission0");
    localStorage.removeItem(STORAGE_KEY);
    
    setIsLoading(true);
    setIsGeneratingAffirmation(true);
    
    try {
      await apiRequest("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ onboardingCompleted: true }),
      });
      await generateAffirmationRequest();
      navigate("/ceremony");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast({
        title: "Error",
        description: "Failed to save your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsGeneratingAffirmation(false);
    }
  };
  
  const getMissionProfileData = (missionId: number): Record<string, any> => {
    switch (missionId) {
      case 0:
        return { username: onboardingUsername.trim(), firstName: onboardingFirstName.trim(), lastName: onboardingLastName.trim(), ageRange: birthYear && birthMonth && birthDay ? ageToRange(calculateAge(birthYear, birthMonth, birthDay)) : "", birthday: birthYear && birthMonth && birthDay ? `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}` : "", location, timezone };
      case 1: {
        const archetypeResults = getArchetypeResults();
        return {
          archetypePrimary: archetypeResults.primary,
          archetypeSecondary: archetypeResults.secondary,
          archetypeShadow: archetypeResults.shadow,
          archetypeScores: archetypeResults.scores,
        };
      }
      case 2:
        return {
          lifeStage,
          primaryValues: coreValues.slice(0, 3),
          supportingValues: coreValues.slice(3),
          desiredEmotion,
          coreBelief,
          limitingBelief,
          empoweringBelief,
          strengths,
          weaknesses,
          selfStandards,
          traitToReprogram,
          desiredTrait,
          vision90Day,
          vision90DayMetric,
          vision18Month,
          vision18MonthMetric,
          vision5Year,
          vision10YearLegacy,
          legacyMetric,
          mortalityInsights: { reflection: mortalityReflection },
          lifeDomains,
        };
      case 3:
        return {
          primaryCraft,
          primaryCraftWhy,
          knowledgeAreas: knowledgeAreas.split(",").map(s => s.trim()).filter(Boolean),
          skillsToAcquire: skillsToAcquire.split(",").map(s => s.trim()).filter(Boolean),
          learningStyle: { preference: learningPreference },
          practiceCadence: { hoursPerWeek: practiceHours },
        };
      case 4:
        return {
          weeklyCapacity: { hours: weeklyCapacity },
          energyDrains,
          physicalEnvironment,
          physicalEnvironmentImpact,
          financialPosition: { income: financialIncome, savings: financialSavings },
          financialConstraints,
          moneyConfidence: { score: moneyConfidenceScore },
          moneyRelationship,
        };
      case 5:
        return {
          healthBaseline: { sleep: sleepHours, exercise: exerciseFrequency, nutrition: nutritionApproach },
          habits: habitsToReprogram,
          traitsToCultivate,
          emotionsToCultivate,
          copingPractices,
          copingEssential,
          dominantInstinct: { type: dominantInstinctType },
          decisionMakingStyles,
          decisionMakingPrimary,
          shadowPatterns: { pattern: shadowPatternText },
        };
      case 6:
        return {
          upbringing,
          culturalContext,
          keyExperiences: { experience: keyExperiences },
          relationshipDrains,
        };
      case 7:
        return {
          idealDay,
          morningRituals,
          eveningRituals,
          groundingRitual,
          boundaries,
          lockedHabit,
          yearlyCycles: yearlyCyclesText.split("\n").filter(Boolean),
        };
      default:
        return {};
    }
  };

  const generateAffirmationRequest = async () => {
    const archetypeResults = getArchetypeResults();
    const affirmationData = await apiRequest<{ affirmation: string }>("/api/profile/generate-affirmation", {
      method: "POST",
      body: JSON.stringify({
        displayName: [(userProfile as any)?.firstName, (userProfile as any)?.lastName].filter(Boolean).join(" ") || user?.username || "Player",
        archetypePrimary: archetypeResults.primary,
        archetypeSecondary: archetypeResults.secondary,
        coreValues: coreValues.slice(0, 3),
        vision5Year,
        primaryCraft,
        desiredEmotion,
      }),
    });
    
    await apiRequest("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({
        characterAffirmation: affirmationData.affirmation,
      }),
    });
  };


  const saveMissionData = async (missionId: number) => {
    try {
      const data = getMissionProfileData(missionId);
      if (Object.keys(data).length > 0) {
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify(data),
        });
      }
    } catch (error) {
      console.error(`Error saving mission ${missionId} data:`, error);
    }
  };
  
  const checkUsernameAvailability = async (name: string) => {
    if (name.trim().length < 3) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(name.trim())}`, { credentials: "include" });
      const data = await res.json();
      setUsernameAvailable(data.available === true);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  const renderMission0 = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-5">
            <h2 className="text-2xl font-orbitron font-bold text-center">Choose your username</h2>
            <p className="text-sm text-muted-foreground text-center">This is how you'll be known in LYFEOS</p>
            <div className="max-w-sm mx-auto space-y-2">
              <Input
                value={onboardingUsername}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^a-zA-Z0-9_-]/g, '');
                  setOnboardingUsername(val);
                  setUsernameAvailable(null);
                }}
                onBlur={() => checkUsernameAvailability(onboardingUsername)}
                placeholder="e.g., phantom_coder"
                autoComplete="off"
                className="bg-card/30 border-primary/20 text-center text-lg"
              />
              {onboardingUsername.trim().length > 0 && onboardingUsername.trim().length < 3 && (
                <p className="text-xs text-muted-foreground text-center">Must be at least 3 characters</p>
              )}
              {checkingUsername && (
                <p className="text-xs text-muted-foreground text-center">Checking availability...</p>
              )}
              {usernameAvailable === true && onboardingUsername.trim().length >= 3 && (
                <p className="text-xs text-green-400 text-center">Username is available!</p>
              )}
              {usernameAvailable === false && (
                <p className="text-xs text-red-400 text-center">Username is already taken</p>
              )}
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-5">
            <h2 className="text-2xl font-orbitron font-bold text-center">What's your name?</h2>
            <p className="text-sm text-muted-foreground text-center">So we know what to call you</p>
            <div className="max-w-sm mx-auto grid grid-cols-2 gap-3">
              <Input
                value={onboardingFirstName}
                onChange={(e) => setOnboardingFirstName(e.target.value)}
                placeholder="First name"
                autoComplete="off"
                className="bg-card/30 border-primary/20"
              />
              <Input
                value={onboardingLastName}
                onChange={(e) => setOnboardingLastName(e.target.value)}
                placeholder="Last name"
                autoComplete="off"
                className="bg-card/30 border-primary/20"
              />
            </div>
          </div>
        );
      case 2: {
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
        const daysInMonth = birthMonth && birthYear ? getDaysInMonth(birthMonth, birthYear) : 31;
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const age = birthMonth && birthDay && birthYear ? calculateAge(birthYear, birthMonth, birthDay) : null;
        return (
          <div className="space-y-5">
            <h2 className="text-2xl font-orbitron font-bold text-center">When were you born?</h2>
            <div className="flex gap-2 justify-center">
              <Select value={birthMonth ? String(birthMonth) : ""} onValueChange={(val) => {
                const m = parseInt(val) || 0;
                setBirthMonth(m);
                if (birthDay > getDaysInMonth(m, birthYear || currentYear)) setBirthDay(0);
              }}>
                <SelectTrigger className="w-[120px] h-9 text-xs border-primary/30">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {MONTHS.map((name, i) => (
                    <SelectItem key={i} value={String(i + 1)} className="text-xs">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={birthDay ? String(birthDay) : ""} onValueChange={(val) => setBirthDay(parseInt(val) || 0)}>
                <SelectTrigger className="w-[80px] h-9 text-xs border-primary/30">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {days.map((d) => (
                    <SelectItem key={d} value={String(d)} className="text-xs">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={birthYear ? String(birthYear) : ""} onValueChange={(val) => {
                const y = parseInt(val) || 0;
                setBirthYear(y);
                if (birthDay > getDaysInMonth(birthMonth || 1, y)) setBirthDay(0);
              }}>
                <SelectTrigger className="w-[90px] h-9 text-xs border-primary/30">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {age !== null && age >= 0 && (
              <p className="text-center text-muted-foreground text-sm">
                Age: <span className="text-primary font-semibold">{age}</span>
              </p>
            )}
          </div>
        );
      }
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-orbitron font-bold text-center">Confirm your location</h2>
            <p className="text-sm text-muted-foreground text-center">
              {location
                ? <>Auto-detected as <span className="text-primary font-medium">{location}</span>. Click below to change if needed:</>
                : "Click below to search and select your city:"}
            </p>
            <LocationDropdown value={location} onChange={setLocation} />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-2xl font-orbitron font-bold text-center">Confirm your timezone</h2>
            <p className="text-sm text-muted-foreground text-center">Auto-detected as <span className="text-primary font-medium">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>. Change below if needed:</p>
            <TimezoneDropdown value={timezone} onChange={setTimezone} />
          </div>
        );
      default:
        return null;
    }
  };
  
  const renderMission1 = () => {
    const question = ARCHETYPE_QUESTIONS[currentStep];
    if (!question) return null;
    
    const currentValue = archetypeAnswers[question.id];
    
    if (question.type === "scenario") {
      const options = SCENARIO_OPTIONS[question.id];
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-center">{question.text}</h3>
          <ScenarioSelect options={options || []} value={currentValue as string || ""} onChange={(archetype) => setArchetypeAnswers({ ...archetypeAnswers, [question.id]: archetype })} />
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-center">{question.text}</h3>
        <p className="text-xs text-muted-foreground text-center">1 = Strongly Disagree, 5 = Strongly Agree</p>
        <LikertScale value={typeof currentValue === "number" ? currentValue : 0} onChange={(val) => setArchetypeAnswers({ ...archetypeAnswers, [question.id]: val })} />
      </div>
    );
  };
  
  const renderMission2 = () => {
    switch (currentStep) {
      case 0: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What life stage are you in?</h3><EmojiGridSelect options={LIFE_STAGES} value={lifeStage} onChange={setLifeStage} columns={2} /></div>);
      case 1: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Select your core values (up to 5)</h3><ChipSelect options={CORE_VALUES} value={coreValues} onChange={(val) => { const values = val as string[]; if (values.length <= 5) setCoreValues(values); }} multiple /></div>);
      case 2: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What emotion do you want to feel most?</h3><ChipSelect options={DESIRED_EMOTIONS} value={desiredEmotion} onChange={(val) => setDesiredEmotion(val as string)} /></div>);
      case 3: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your core belief about yourself?</h3><Input value={coreBelief} onChange={(e) => setCoreBelief(e.target.value)} placeholder="I believe I am..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 4: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What limiting belief holds you back?</h3><Input value={limitingBelief} onChange={(e) => setLimitingBelief(e.target.value)} placeholder="I can't because..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 5: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What empowering belief will you adopt?</h3><Input value={empoweringBelief} onChange={(e) => setEmpoweringBelief(e.target.value)} placeholder="I am capable of..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 6: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What are your top strengths?</h3><ChipSelect options={["Discipline", "Creativity", "Leadership", "Analytical", "Communication", "Adaptability", "Empathy", "Resilience", "Strategic Thinking", "Problem Solving"]} value={strengths} onChange={(val) => setStrengths(val as string[])} multiple /></div>);
      case 7: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What are your key weaknesses?</h3><ChipSelect options={["Procrastination", "Overthinking", "Impatience", "Perfectionism", "Indecisiveness", "People-Pleasing", "Self-Doubt", "Distraction"]} value={weaknesses} onChange={(val) => setWeaknesses(val as string[])} multiple /></div>);
      case 8: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What standards do you hold for yourself?</h3><Textarea value={selfStandards} onChange={(e) => setSelfStandards(e.target.value)} placeholder="The standards I live by..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 9: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What trait do you want to reprogram?</h3><Input value={traitToReprogram} onChange={(e) => setTraitToReprogram(e.target.value)} placeholder="A trait to change..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 10: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What trait do you want to develop?</h3><Input value={desiredTrait} onChange={(e) => setDesiredTrait(e.target.value)} placeholder="A trait to cultivate..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 11: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What does success look like in 90 days?</h3><Textarea value={vision90Day} onChange={(e) => setVision90Day(e.target.value)} placeholder="Describe your 90-day vision..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 12: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How will you measure your 90-day progress?</h3><Input value={vision90DayMetric} onChange={(e) => setVision90DayMetric(e.target.value)} placeholder="Key metric or milestone..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 13: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's the headline of your life in 18 months?</h3><Input value={vision18Month} onChange={(e) => setVision18Month(e.target.value)} placeholder="My 18-month headline..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 14: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How will you know you've reached 18-month vision?</h3><Input value={vision18MonthMetric} onChange={(e) => setVision18MonthMetric(e.target.value)} placeholder="Key indicator..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 15: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Who are you in 5 years?</h3><Textarea value={vision5Year} onChange={(e) => setVision5Year(e.target.value)} placeholder="Describe your 5-year self..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 16: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What legacy do you want to leave?</h3><Textarea value={vision10YearLegacy} onChange={(e) => setVision10YearLegacy(e.target.value)} placeholder="Describe your lifetime legacy..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 17: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How will your legacy be measured?</h3><Input value={legacyMetric} onChange={(e) => setLegacyMetric(e.target.value)} placeholder="Legacy metric..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 18: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">If you had 5 years to live, what would change?</h3><Textarea value={mortalityReflection} onChange={(e) => setMortalityReflection(e.target.value)} placeholder="What would you do differently..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 19: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Rank your life domains by priority</h3><p className="text-xs text-muted-foreground text-center">Select in order of importance to you</p><ChipSelect options={["Health", "Career", "Relationships", "Finance", "Spirituality", "Creativity", "Learning", "Adventure", "Family", "Community"]} value={lifeDomains} onChange={(val) => setLifeDomains(val as string[])} multiple /></div>);
      default: return null;
    }
  };
  
  const renderMission3 = () => {
    switch (currentStep) {
      case 0: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What is your primary craft?</h3><Input value={primaryCraft} onChange={(e) => setPrimaryCraft(e.target.value)} placeholder="e.g., Software Development, Writing..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 1: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Why is this your chosen craft?</h3><Textarea value={primaryCraftWhy} onChange={(e) => setPrimaryCraftWhy(e.target.value)} placeholder="What draws you to this craft..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 2: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What knowledge areas interest you?</h3><Input value={knowledgeAreas} onChange={(e) => setKnowledgeAreas(e.target.value)} placeholder="Comma-separated: AI, Philosophy..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 3: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What skills do you want to acquire?</h3><Input value={skillsToAcquire} onChange={(e) => setSkillsToAcquire(e.target.value)} placeholder="Comma-separated: Public Speaking..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 4: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How do you prefer to learn?</h3><ChipSelect options={["Visual", "Auditory", "Reading/Writing", "Kinesthetic", "Mixed"]} value={learningPreference} onChange={(val) => setLearningPreference(val as string)} /></div>);
      case 5: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Hours per week for practice?</h3><div className="max-w-md mx-auto"><input type="range" min="0" max="40" value={practiceHours} onChange={(e) => setPracticeHours(parseInt(e.target.value))} className="w-full accent-primary" /><p className="text-center text-primary font-medium">{practiceHours} hours/week</p></div></div>);
      default: return null;
    }
  };
  
  const renderMission4 = () => {
    switch (currentStep) {
      case 0: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your weekly capacity (hours)?</h3><div className="max-w-md mx-auto"><input type="range" min="10" max="80" value={weeklyCapacity} onChange={(e) => setWeeklyCapacity(parseInt(e.target.value))} className="w-full accent-primary" /><p className="text-center text-primary font-medium">{weeklyCapacity} hours/week</p></div></div>);
      case 1: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What drains your energy?</h3><ChipSelect options={["Meetings", "Admin Tasks", "Conflict", "Uncertainty", "Multitasking", "Perfectionism", "Social Obligations", "Poor Sleep"]} value={energyDrains} onChange={(val) => setEnergyDrains(val as string[])} multiple /></div>);
      case 2: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Describe your physical environment</h3><Textarea value={physicalEnvironment} onChange={(e) => setPhysicalEnvironment(e.target.value)} placeholder="Where do you work, live, create..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 3: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How does your environment impact your productivity?</h3><Textarea value={physicalEnvironmentImpact} onChange={(e) => setPhysicalEnvironmentImpact(e.target.value)} placeholder="How your space affects your work..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 4: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your income situation?</h3><Input value={financialIncome} onChange={(e) => setFinancialIncome(e.target.value)} placeholder="Describe your income..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 5: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your savings situation?</h3><Input value={financialSavings} onChange={(e) => setFinancialSavings(e.target.value)} placeholder="Describe your savings..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 6: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What financial constraints limit you?</h3><ChipSelect options={["Debt", "Low Income", "High Expenses", "No Savings", "Unstable Income", "Dependents", "Student Loans", "Medical Costs"]} value={financialConstraints} onChange={(val) => setFinancialConstraints(val as string[])} multiple /></div>);
      case 7: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Rate your money confidence (1-10)</h3><div className="max-w-md mx-auto"><input type="range" min="1" max="10" value={moneyConfidenceScore} onChange={(e) => setMoneyConfidenceScore(parseInt(e.target.value))} className="w-full accent-primary" /><p className="text-center text-primary font-medium">{moneyConfidenceScore} / 10</p></div></div>);
      case 8: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Describe your relationship with money</h3><Textarea value={moneyRelationship} onChange={(e) => setMoneyRelationship(e.target.value)} placeholder="How do you relate to money..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      default: return null;
    }
  };
  
  const renderMission5 = () => {
    switch (currentStep) {
      case 0: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How many hours of sleep do you get?</h3><div className="max-w-md mx-auto"><input type="range" min="4" max="10" step="0.5" value={sleepHours} onChange={(e) => setSleepHours(parseFloat(e.target.value))} className="w-full accent-primary" /><p className="text-center text-primary font-medium">{sleepHours} hours/night</p></div></div>);
      case 1: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How often do you exercise?</h3><ChipSelect options={["Daily", "4-6x/week", "2-3x/week", "Weekly", "Rarely", "Never"]} value={exerciseFrequency} onChange={(val) => setExerciseFrequency(val as string)} /></div>);
      case 2: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your nutrition approach?</h3><ChipSelect options={["Clean Eating", "Balanced", "Intuitive", "Keto/Low Carb", "Vegan/Vegetarian", "No Specific Diet"]} value={nutritionApproach} onChange={(val) => setNutritionApproach(val as string)} /></div>);
      case 3: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What habits do you want to reprogram?</h3><ChipSelect options={["Procrastination", "Overthinking", "Poor Sleep", "Unhealthy Eating", "Phone Addiction", "Negative Self-Talk", "Avoidance", "Perfectionism"]} value={habitsToReprogram} onChange={(val) => setHabitsToReprogram(val as string[])} multiple /></div>);
      case 4: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What traits do you want to cultivate?</h3><ChipSelect options={["Discipline", "Patience", "Confidence", "Resilience", "Creativity", "Focus", "Empathy", "Courage"]} value={traitsToCultivate} onChange={(val) => setTraitsToCultivate(val as string[])} multiple /></div>);
      case 5: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your core belief about yourself?</h3><Input value={coreBelief} onChange={(e) => setCoreBelief(e.target.value)} placeholder="I believe I am..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 6: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What limiting belief holds you back?</h3><Input value={limitingBelief} onChange={(e) => setLimitingBelief(e.target.value)} placeholder="I can't because..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 7: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What empowering belief will you adopt?</h3><Input value={empoweringBelief} onChange={(e) => setEmpoweringBelief(e.target.value)} placeholder="I am capable of..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 8: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What emotions do you want to cultivate?</h3><ChipSelect options={["Joy", "Peace", "Gratitude", "Confidence", "Love", "Excitement", "Serenity", "Passion"]} value={emotionsToCultivate} onChange={(val) => setEmotionsToCultivate(val as string[])} multiple /></div>);
      case 9: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What coping practices work for you?</h3><Textarea value={copingPractices} onChange={(e) => setCopingPractices(e.target.value)} placeholder="Practices that help you cope..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 10: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What is essential for you to cope with stress?</h3><Input value={copingEssential} onChange={(e) => setCopingEssential(e.target.value)} placeholder="The one thing you need..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 11: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What is your dominant instinct?</h3><ChipSelect options={["Self-Preservation", "Social", "Sexual/Creative", "Intellectual"]} value={dominantInstinctType} onChange={(val) => setDominantInstinctType(val as string)} /></div>);
      case 12: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">How do you make decisions?</h3><ChipSelect options={["Intuitive", "Analytical", "Collaborative", "Impulsive", "Deliberate", "Emotional", "Data-Driven"]} value={decisionMakingStyles} onChange={(val) => setDecisionMakingStyles(val as string[])} multiple /></div>);
      case 13: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your primary decision-making style?</h3><ChipSelect options={["Intuitive", "Analytical", "Collaborative", "Impulsive", "Deliberate", "Emotional", "Data-Driven"]} value={decisionMakingPrimary} onChange={(val) => setDecisionMakingPrimary(val as string)} /></div>);
      default: return null;
    }
  };
  
  const renderMission6 = () => {
    switch (currentStep) {
      case 0: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What shadow patterns do you recognize?</h3><Textarea value={shadowPatternText} onChange={(e) => setShadowPatternText(e.target.value)} placeholder="Describe patterns you want to change..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 1: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Describe your upbringing</h3><Textarea value={upbringing} onChange={(e) => setUpbringing(e.target.value)} placeholder="How were you raised..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 2: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What cultural expectations shaped you?</h3><Textarea value={culturalContext} onChange={(e) => setCulturalContext(e.target.value)} placeholder="Cultural influences..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 3: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What key experiences shaped you?</h3><Textarea value={keyExperiences} onChange={(e) => setKeyExperiences(e.target.value)} placeholder="Significant life experiences..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 4: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What relationships drain your energy?</h3><Textarea value={relationshipDrains} onChange={(e) => setRelationshipDrains(e.target.value)} placeholder="Relationships that take more than they give..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      default: return null;
    }
  };
  
  const renderMission7 = () => {
    switch (currentStep) {
      case 0: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Describe your ideal day</h3><Textarea value={idealDay} onChange={(e) => setIdealDay(e.target.value)} placeholder="From morning to night..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 1: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What morning rituals do you practice?</h3><ChipSelect options={["Meditation", "Exercise", "Journaling", "Cold Shower", "Reading", "Gratitude", "Planning", "Breathwork"]} value={morningRituals} onChange={(val) => setMorningRituals(val as string[])} multiple /></div>);
      case 2: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What evening rituals do you practice?</h3><ChipSelect options={["Reflection", "Reading", "Stretching", "Planning Tomorrow", "Digital Detox", "Gratitude", "Meditation", "Journaling"]} value={eveningRituals} onChange={(val) => setEveningRituals(val as string[])} multiple /></div>);
      case 3: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's your grounding ritual?</h3><Input value={groundingRitual} onChange={(e) => setGroundingRitual(e.target.value)} placeholder="What brings you back to center..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 4: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">Set your boundaries</h3><div className="max-w-md mx-auto space-y-3"><div><label className="text-sm text-muted-foreground">Tech off-time</label><Input value={boundaries.techOffTime} onChange={(e) => setBoundaries({ ...boundaries, techOffTime: e.target.value })} placeholder="e.g., 9 PM - 7 AM" className="bg-card/30 border-primary/20" /></div><div><label className="text-sm text-muted-foreground">Work hours</label><Input value={boundaries.workHours} onChange={(e) => setBoundaries({ ...boundaries, workHours: e.target.value })} placeholder="e.g., 9 AM - 6 PM" className="bg-card/30 border-primary/20" /></div></div></div>);
      case 5: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What's one habit you've locked in?</h3><Input value={lockedHabit} onChange={(e) => setLockedHabit(e.target.value)} placeholder="A habit that's non-negotiable..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      case 6: return (<div className="space-y-4"><h3 className="text-lg font-medium text-center">What yearly cycles do you follow?</h3><Textarea value={yearlyCyclesText} onChange={(e) => setYearlyCyclesText(e.target.value)} placeholder="One per line: seasonal rhythms, annual events..." autoComplete="off" className="max-w-md mx-auto bg-card/30 border-primary/20" /></div>);
      default: return null;
    }
  };
  
  const renderMissionContent = () => {
    switch (currentMission) {
      case 0: return renderMission0();
      case 1: return renderMission1();
      case 2: return renderMission2();
      case 3: return renderMission3();
      case 4: return renderMission4();
      case 5: return renderMission5();
      case 6: return renderMission6();
      case 7: return renderMission7();
      default: return null;
    }
  };

  if (showMissionComplete) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-orbitron font-bold">
              <span className="text-foreground">LYFE</span>
              <span className="text-primary">OS</span>
            </h1>
            <p className="text-muted-foreground text-sm">Your personal life operating system</p>
          </div>
          
          <Card className="w-full max-w-md border-primary/30 bg-card/50 backdrop-blur shadow-[0_0_30px_var(--primary-bg-subtle)]">
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-orbitron font-bold mb-4">Mission Complete!</h2>
              <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary mx-auto flex items-center justify-center mb-4">
                <Check className="h-10 w-10 text-primary" />
              </div>
              <p className="text-3xl font-orbitron text-primary mb-4">+{mission.xp} XP</p>
              <p className="text-muted-foreground mb-6">{mission.title} completed successfully.</p>
              
              {currentMission < MISSIONS.length - 1 ? (
                <div className="space-y-3">
                  <Button 
                    onClick={handleContinueToNextMission}
                    className="w-full bg-primary/20 border border-primary text-primary hover:bg-primary/30"
                  >
                    Continue to {MISSIONS[currentMission + 1].title}
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                  <button
                    onClick={handleSkipToSystem}
                    className="text-muted-foreground text-sm hover:text-primary transition-colors"
                  >
                    Skip to LYFEOS
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button 
                    onClick={handleSkipToSystem}
                    className="w-full bg-primary/20 border border-primary text-primary hover:bg-primary/30"
                  >
                    Initialize System
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isGeneratingAffirmation) {
    const isFirstMission = currentMission === 0;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-medium">
            {isFirstMission ? "Generating" : "Updating"} Your Character Affirmation...
          </h2>
          <p className="text-muted-foreground">
            {isFirstMission ? "Your AI is crafting your personalized narrative" : "Your AI is refining your personalized narrative"}
          </p>
        </div>
      </div>
    );
  }

  if ((authLoading || !user) && !isPendingRegistration) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="text-center pt-6 pb-4">
        <h1 className="text-4xl font-orbitron font-bold">
          <span className="text-foreground">LYFE</span>
          <span className="text-primary">OS</span>
        </h1>
        <p className="text-muted-foreground text-sm">Your life operating system</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        <Card className="w-full max-w-lg border-primary/30 bg-card/50 backdrop-blur shadow-[0_0_30px_var(--primary-bg-subtle)]">
          <CardContent className="p-6">
            {renderMissionContent()}
            <DotNavigation current={currentStep} total={totalSteps} />
          </CardContent>
        </Card>
      </div>
      <div className="p-4">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          {currentMission === 0 && currentStep === 0 ? (
            <div />
          ) : currentStep === 0 && currentMission > 0 ? (
            <Button 
              onClick={handleStop} 
              className="bg-transparent border-2 border-primary text-primary hover:bg-primary/20 hover:text-primary"
            >
              <X className="h-4 w-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button 
              onClick={handlePrevious} 
              className="bg-transparent border-2 border-primary text-primary hover:bg-primary/20 hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          
          <Button 
            onClick={handleNext} 
            disabled={!canProceed() || isLoading}
            className="bg-transparent border-2 border-primary text-primary hover:bg-primary/20"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : currentMission === 0 && currentStep === 2 ? (
              <>Enter LYFEOS<ChevronRight className="h-4 w-4 ml-2" /></>
            ) : currentMission === MISSIONS.length - 1 && currentStep === totalSteps - 1 ? (
              <>Initialize System<ChevronRight className="h-4 w-4 ml-2" /></>
            ) : (
              <>Next<ChevronRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
