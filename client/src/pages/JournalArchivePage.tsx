import React, { useState, useMemo } from 'react';
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { Archive, Calendar, ChevronDown, ChevronRight, ArrowLeft, Sun, Moon, Brain, Heart, Zap, BookOpen, Target, Lightbulb, CheckCircle, AlertCircle, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocalDateString } from "@/lib/utils";

interface DailyLog {
  id: number;
  userId: number;
  date: string;
  wakeTime: string | null;
  sleepTime: string | null;
  mentalState: number | null;
  physicalState: number | null;
  emotionalState: number | null;
  gratitude: string | null;
  tomorrowGoals: string | null;
  annualGoals: string | null;
  thoughts: string | null;
  contentConsumed: string | null;
  research: string | null;
  todoIdeas: string | null;
  wentWell: string | null;
  couldBeBetter: string | null;
  learned: string | null;
  createdAt: string;
}

interface MonthFolder {
  month: string;
  title: string;
  entries: DailyLog[];
}

export default function JournalArchivePage() {
  usePageTitle('Journal Archive');
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<string[]>([]);

  const { data: logsData, isLoading } = useQuery<{ logs: DailyLog[] }>({
    queryKey: ['/api/users', user?.id, 'daily-logs', 'all'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user?.id}/daily-logs`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch daily logs');
      return response.json();
    },
    enabled: !!user?.id,
  });

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => 
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  };

  const toggleDay = (date: string) => {
    setExpandedDays(prev => 
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
  };

  const monthFolders = useMemo(() => {
    if (!logsData?.logs) return [];
    
    // Get today's date in YYYY-MM-DD format (local timezone) to filter out today's log
    const today = getLocalDateString();
    
    // Debug: log what we're filtering
    console.log('[JournalArchive] Today (local):', today);
    console.log('[JournalArchive] All log dates:', logsData.logs.map(l => l.date));
    
    const folderMap = new Map<string, MonthFolder>();
    
    // Only include logs from previous days (exclude today)
    const filteredLogs = logsData.logs.filter(log => {
      const shouldInclude = log.date !== today;
      console.log('[JournalArchive] Log date:', log.date, 'Include:', shouldInclude);
      return shouldInclude;
    });
    
    filteredLogs.forEach(log => {
      const date = new Date(log.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      if (!folderMap.has(monthKey)) {
        folderMap.set(monthKey, {
          month: monthKey,
          title: monthTitle,
          entries: []
        });
      }
      
      folderMap.get(monthKey)?.entries.push(log);
    });
    
    return Array.from(folderMap.values())
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [logsData?.logs]);

  const formatTime12Hour = (time: string | null) => {
    if (!time) return '--:--';
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getStateColor = (value: number | null) => {
    if (value === null) return 'text-muted-foreground';
    if (value >= 7) return 'text-green-400';
    if (value >= 4) return 'text-yellow-400';
    return 'text-red-400';
  };

  const hasContent = (log: DailyLog) => {
    return log.wakeTime || log.sleepTime || log.mentalState || log.physicalState || 
           log.emotionalState || log.gratitude || log.tomorrowGoals || log.annualGoals ||
           log.thoughts || log.contentConsumed || log.research || log.todoIdeas ||
           log.wentWell || log.couldBeBetter || log.learned;
  };

  return (
    <>
      <div className="mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-primary hover:text-background" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Journal Archive</h1>
        <p className="text-[#7DAAB2]">Your daily logs organized by date - energy, intentions, data, and reflections</p>
      </div>
      
      {isLoading ? (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20">
          <div className="animate-pulse text-primary">Loading your journal entries...</div>
        </div>
      ) : monthFolders.length > 0 ? (
        <div className="space-y-4">
          {monthFolders.map((folder) => (
            <div key={folder.month} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40"
                onClick={() => toggleMonth(folder.month)}
              >
                <div className="flex items-center">
                  {expandedMonths.includes(folder.month) ? (
                    <ChevronDown className="h-5 w-5 text-primary mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary mr-2" />
                  )}
                  <Calendar className="h-5 w-5 text-primary mr-3" />
                  <h2 className="text-lg font-medium">{folder.title}</h2>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {folder.entries.length} {folder.entries.length === 1 ? 'day' : 'days'}
                </span>
              </div>
              
              {expandedMonths.includes(folder.month) && (
                <div className="px-4 pb-4 space-y-3 pt-2 border-t border-slate-700/50">
                  {folder.entries
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((log) => (
                      <div 
                        key={log.id}
                        className="rounded-lg bg-card/30 border border-slate-700/30 overflow-hidden"
                      >
                        <div 
                          className="p-3 flex justify-between items-center cursor-pointer hover:bg-card/50 transition-colors"
                          onClick={() => toggleDay(log.date)}
                        >
                          <div className="flex items-center gap-3">
                            {expandedDays.includes(log.date) ? (
                              <ChevronDown className="h-4 w-4 text-primary" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-primary" />
                            )}
                            <div>
                              <h3 className="font-medium">
                                {new Date(log.date).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </h3>
                              <div className="flex items-center gap-4 text-xs text-[#7DAAB2] mt-1">
                                <span className="flex items-center gap-1">
                                  <Sun className="h-3 w-3" /> {formatTime12Hour(log.wakeTime)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Moon className="h-3 w-3" /> {formatTime12Hour(log.sleepTime)}
                                </span>
                                <span className={`flex items-center gap-1 ${getStateColor(log.mentalState)}`}>
                                  <Brain className="h-3 w-3" /> {log.mentalState ?? '-'}/10
                                </span>
                                <span className={`flex items-center gap-1 ${getStateColor(log.physicalState)}`}>
                                  <Zap className="h-3 w-3" /> {log.physicalState ?? '-'}/10
                                </span>
                                <span className={`flex items-center gap-1 ${getStateColor(log.emotionalState)}`}>
                                  <Heart className="h-3 w-3" /> {log.emotionalState ?? '-'}/10
                                </span>
                              </div>
                            </div>
                          </div>
                          {hasContent(log) && (
                            <span className="text-xs text-primary/70 bg-primary/10 px-2 py-1 rounded">
                              View Details
                            </span>
                          )}
                        </div>
                        
                        {expandedDays.includes(log.date) && (
                          <div className="p-4 border-t border-slate-700/30 space-y-4 bg-background/30">
                            {(log.gratitude || log.tomorrowGoals || log.annualGoals) && (
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                                  <Target className="h-4 w-4" /> Intentions
                                </h4>
                                {log.gratitude && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Gratitude</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.gratitude}</p>
                                  </div>
                                )}
                                {log.tomorrowGoals && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Tomorrow's Goals</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.tomorrowGoals}</p>
                                  </div>
                                )}
                                {log.annualGoals && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Annual Goals</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.annualGoals}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {(log.thoughts || log.contentConsumed || log.research || log.todoIdeas) && (
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                                  <BookOpen className="h-4 w-4" /> Data & Thoughts
                                </h4>
                                {log.thoughts && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Thoughts</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.thoughts}</p>
                                  </div>
                                )}
                                {log.contentConsumed && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Content Consumed</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.contentConsumed}</p>
                                  </div>
                                )}
                                {log.research && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Research</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.research}</p>
                                  </div>
                                )}
                                {log.todoIdeas && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1">Todo Ideas</p>
                                    <p className="text-sm whitespace-pre-wrap">{log.todoIdeas}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {(log.wentWell || log.couldBeBetter || log.learned) && (
                              <div className="space-y-3">
                                <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                                  <Lightbulb className="h-4 w-4" /> Reflection
                                </h4>
                                {log.wentWell && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3 text-green-400" /> What Went Well
                                    </p>
                                    <p className="text-sm whitespace-pre-wrap">{log.wentWell}</p>
                                  </div>
                                )}
                                {log.couldBeBetter && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3 text-yellow-400" /> Could Be Better
                                    </p>
                                    <p className="text-sm whitespace-pre-wrap">{log.couldBeBetter}</p>
                                  </div>
                                )}
                                {log.learned && (
                                  <div className="pl-6">
                                    <p className="text-xs text-[#7DAAB2] mb-1 flex items-center gap-1">
                                      <GraduationCap className="h-3 w-3 text-blue-400" /> What I Learned
                                    </p>
                                    <p className="text-sm whitespace-pre-wrap">{log.learned}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {!hasContent(log) && (
                              <p className="text-sm text-[#7DAAB2] italic text-center py-4">
                                No detailed entries for this day
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Journal Entries Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Start documenting your journey by filling out your daily logs on the dashboard.
            They will be automatically archived here.
          </p>
          <Button 
            onClick={() => navigate('/dashboard')}
            className="bg-primary/10 hover:bg-primary hover:text-background border border-primary/50"
          >
            Go to Dashboard
          </Button>
        </div>
      )}
    </>
  );
}
