import { useState, useMemo } from 'react';
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { Archive, ChevronDown, ChevronRight, BookOpen, FileText, Search, Play, Link2, ArrowLeft, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DailyLog {
  id: number;
  date: string;
  sourceAuthor: string | null;
  sourceMaterial: string | null;
  researchNote: string | null;
  revisionNote: string | null;
  executionNote: string | null;
}

interface SourceEntry {
  sourceMaterial: string;
  entries: Array<{
    date: string;
    researchNote: string | null;
    revisionNote: string | null;
    executionNote: string | null;
  }>;
}

interface AuthorGroup {
  author: string;
  sources: SourceEntry[];
}

export default function KnowledgeArchivePage() {
  usePageTitle('Knowledge Vault');

  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set());
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const { data: logsData, isLoading } = useQuery<{ logs: DailyLog[] }>({
    queryKey: ['/api/users', user?.id, 'daily-logs', 'knowledge'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user?.id}/daily-logs`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch daily logs');
      return response.json();
    },
    enabled: !!user?.id,
  });

  const toggleAuthor = (author: string) => {
    setExpandedAuthors(prev => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  };

  const toggleSource = (key: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const authorGroups: AuthorGroup[] = useMemo(() => {
    if (!logsData?.logs) return [];

    const researchLogs = logsData.logs.filter(
      log => log.sourceAuthor || log.sourceMaterial || log.researchNote || log.revisionNote || log.executionNote
    );

    const authorMap: Record<string, Record<string, Array<{
      date: string;
      researchNote: string | null;
      revisionNote: string | null;
      executionNote: string | null;
    }>>> = {};

    researchLogs.forEach(log => {
      const author = log.sourceAuthor?.trim() || 'Unknown Author';
      const source = log.sourceMaterial?.trim() || 'Untitled Source';

      if (!authorMap[author]) authorMap[author] = {};
      if (!authorMap[author][source]) authorMap[author][source] = [];

      authorMap[author][source].push({
        date: log.date,
        researchNote: log.researchNote,
        revisionNote: log.revisionNote,
        executionNote: log.executionNote,
      });
    });

    return Object.keys(authorMap)
      .sort((a, b) => {
        if (a === 'Unknown Author') return 1;
        if (b === 'Unknown Author') return -1;
        return a.localeCompare(b);
      })
      .map(author => ({
        author,
        sources: Object.keys(authorMap[author])
          .sort((a, b) => a.localeCompare(b))
          .map(source => ({
            sourceMaterial: source,
            entries: authorMap[author][source].sort((a, b) => b.date.localeCompare(a.date)),
          })),
      }));
  }, [logsData]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return authorGroups;
    const q = searchQuery.toLowerCase().trim();

    return authorGroups
      .map(group => {
        if (group.author.toLowerCase().includes(q)) return group;

        const filteredSources = group.sources
          .map(source => {
            if (source.sourceMaterial.toLowerCase().includes(q)) return source;

            const matchingEntries = source.entries.filter(
              e => (e.researchNote?.toLowerCase().includes(q)) ||
                   (e.revisionNote?.toLowerCase().includes(q)) ||
                   (e.executionNote?.toLowerCase().includes(q))
            );
            if (matchingEntries.length > 0) return { ...source, entries: matchingEntries };
            return null;
          })
          .filter((s): s is SourceEntry => s !== null);

        if (filteredSources.length > 0) return { ...group, sources: filteredSources };
        return null;
      })
      .filter((g): g is AuthorGroup => g !== null);
  }, [authorGroups, searchQuery]);

  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDate = (dateStr: string) => {
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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
        <h1 className="text-2xl font-orbitron mb-1">Knowledge Vault</h1>
        <p className="text-[#7DAAB2]">Research log entries organized by author and source material</p>
      </div>

      {authorGroups.length > 0 && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" />
          <input
            type="text"
            placeholder="Search by author, source, or note content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background/50 border border-primary/20 rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>
      )}

      {filteredGroups.length > 0 ? (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const authorKey = group.author;
            const isAuthorExpanded = expandedAuthors.has(authorKey);
            const sourceCount = group.sources.length;
            const entryCount = group.sources.reduce((sum, s) => sum + s.entries.length, 0);

            return (
              <div key={authorKey} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40 transition-colors"
                  onClick={() => toggleAuthor(authorKey)}
                >
                  <div className="flex items-center gap-2">
                    {isAuthorExpanded ? (
                      <ChevronDown className="h-5 w-5 text-primary flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                    <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                    <h2 className="text-base font-medium">{group.author}</h2>
                  </div>
                  <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                    {sourceCount} {sourceCount === 1 ? 'source' : 'sources'} · {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {isAuthorExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-slate-700/50 pt-3">
                    {group.sources.map((source) => {
                      const sourceKey = `${authorKey}::${source.sourceMaterial}`;
                      const isSourceExpanded = expandedSources.has(sourceKey);

                      return (
                        <div key={sourceKey} className="rounded-lg border border-slate-700/30 overflow-hidden">
                          <div
                            className="px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-card/40 transition-colors bg-card/20"
                            onClick={() => toggleSource(sourceKey)}
                          >
                            <div className="flex items-center gap-2">
                              {isSourceExpanded ? (
                                <ChevronDown className="h-4 w-4 text-primary/70 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-primary/70 flex-shrink-0" />
                              )}
                              <Link2 className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                              <span className="text-sm">{source.sourceMaterial}</span>
                            </div>
                            <span className="text-xs text-[#7DAAB2] px-1.5 py-0.5 bg-slate-800/50 rounded">
                              {source.entries.length}
                            </span>
                          </div>

                          {isSourceExpanded && (
                            <div className="px-3 pb-3 pt-2 space-y-3 border-t border-slate-700/20">
                              {source.entries.map((entry, idx) => (
                                <div key={idx} className="p-3 rounded-lg bg-card/30 border border-slate-700/20 space-y-2">
                                  <div className="flex items-center gap-1.5 text-xs text-[#7DAAB2]">
                                    <Calendar className="h-3 w-3" />
                                    <span className="font-mono">{formatDate(entry.date)}</span>
                                  </div>

                                  {entry.researchNote && (
                                    <div>
                                      <p className="text-xs text-primary/80 mb-0.5 flex items-center gap-1">
                                        <Search className="h-3 w-3" /> Research Note
                                      </p>
                                      <p className="text-sm whitespace-pre-wrap text-foreground/90 pl-4">{entry.researchNote}</p>
                                    </div>
                                  )}
                                  {entry.revisionNote && (
                                    <div>
                                      <p className="text-xs text-primary/80 mb-0.5 flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> Revision & Summary Note
                                      </p>
                                      <p className="text-sm whitespace-pre-wrap text-foreground/90 pl-4">{entry.revisionNote}</p>
                                    </div>
                                  )}
                                  {entry.executionNote && (
                                    <div>
                                      <p className="text-xs text-primary/80 mb-0.5 flex items-center gap-1">
                                        <Play className="h-3 w-3" /> Execution Note
                                      </p>
                                      <p className="text-sm whitespace-pre-wrap text-foreground/90 pl-4">{entry.executionNote}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          {searchQuery.trim() ? (
            <>
              <h3 className="text-xl font-medium mb-2">No Matching Entries</h3>
              <p className="text-[#7DAAB2] mb-4 max-w-md">
                No research entries match "{searchQuery}". Try a different search term.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-medium mb-2">No Research Entries Yet</h3>
              <p className="text-[#7DAAB2] mb-4 max-w-md">
                Start documenting your research in the Daily Research Log on the Dashboard. Entries will appear here organized by author and source.
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}