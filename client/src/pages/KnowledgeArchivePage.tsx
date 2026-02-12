import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { Archive, ChevronDown, ChevronRight, BookOpen, FileText, Search, Play, Link2, ArrowLeft, Calendar, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useToast } from "@/hooks/use-toast";

interface ArchivedResearchEntry {
  sourceAuthor?: string;
  sourceMaterial?: string;
  researchNote?: string;
  revisionNote?: string;
  executionNote?: string;
  savedAt?: string;
}

interface DailyLog {
  id: number;
  date: string;
  sourceAuthor: string | null;
  sourceMaterial: string | null;
  researchNote: string | null;
  revisionNote: string | null;
  executionNote: string | null;
  researchEntries?: ArchivedResearchEntry[];
}

interface EntryData {
  date: string;
  logId: number;
  entryIndex?: number;
  researchNote: string | null;
  revisionNote: string | null;
  executionNote: string | null;
}

interface SourceEntry {
  sourceMaterial: string;
  entries: EntryData[];
}

interface AuthorGroup {
  author: string;
  sources: SourceEntry[];
}

export default function KnowledgeArchivePage() {
  usePageTitle('Knowledge');

  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set());
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
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

  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [dismissedLoaded, setDismissedLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetch('/api/dismissed-knowledge', { credentials: 'include' })
      .then(res => res.json())
      .then((data: Array<{ author: string; sourceMaterial: string | null }>) => {
        const keys = new Set<string>();
        data.forEach(d => {
          if (d.sourceMaterial) {
            keys.add(`${d.author}::${d.sourceMaterial}`);
          } else {
            keys.add(`author::${d.author}`);
          }
        });
        setDismissedKeys(keys);
        setDismissedLoaded(true);
      })
      .catch(() => {
        setDismissedLoaded(true);
      });
  }, [user?.id]);

  const dismissEntry = useCallback((author: string, sourceMaterial?: string | null) => {
    const key = sourceMaterial ? `${author}::${sourceMaterial}` : `author::${author}`;
    setDismissedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    fetch('/api/dismissed-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ author, sourceMaterial: sourceMaterial ?? null }),
    }).catch(() => {});
  }, []);

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

  const toggleNote = (key: string) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const { toast } = useToast();
  const [editedNotes, setEditedNotes] = useState<Record<string, string>>({});
  const saveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const updateNoteMutation = useMutation({
    mutationFn: async ({ date, field, value }: { date: string; field: string; value: string }) => {
      const response = await fetch(`/api/users/${user?.id}/daily-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date, [field]: value }),
      });
      if (!response.ok) throw new Error('Failed to save');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'daily-logs', 'knowledge'] });
    },
  });

  const handleNoteEdit = useCallback((noteKey: string, date: string, field: string, value: string) => {
    setEditedNotes(prev => ({ ...prev, [noteKey]: value }));
    if (saveTimeoutRef.current[noteKey]) {
      clearTimeout(saveTimeoutRef.current[noteKey]);
    }
    saveTimeoutRef.current[noteKey] = setTimeout(() => {
      updateNoteMutation.mutate({ date, field, value });
    }, 1000);
  }, [updateNoteMutation]);

  const handleNoteBlurSave = useCallback((noteKey: string, date: string, field: string) => {
    if (saveTimeoutRef.current[noteKey]) {
      clearTimeout(saveTimeoutRef.current[noteKey]);
      delete saveTimeoutRef.current[noteKey];
    }
    const value = editedNotes[noteKey];
    if (value !== undefined) {
      updateNoteMutation.mutate({ date, field, value });
    }
  }, [editedNotes, updateNoteMutation]);

  const [editingField, setEditingField] = useState<{ type: 'author' | 'source'; oldValue: string; parentAuthor?: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const renameFieldMutation = useMutation({
    mutationFn: async ({ field, oldValue, newValue, scopeAuthor }: { field: 'sourceAuthor' | 'sourceMaterial'; oldValue: string; newValue: string; scopeAuthor?: string }) => {
      const response = await fetch(`/api/users/${user?.id}/daily-logs/rename-research-field`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ field, oldValue, newValue, scopeAuthor }),
      });
      if (!response.ok) throw new Error('Failed to rename');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'daily-logs', 'knowledge'] });
      setEditingField(null);
      setEditingValue('');
    },
  });

  const startEditing = useCallback((type: 'author' | 'source', oldValue: string, parentAuthor?: string) => {
    setEditingField({ type, oldValue, parentAuthor });
    setEditingValue(oldValue);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, []);

  const confirmEdit = useCallback(() => {
    if (!editingField || !editingValue.trim() || editingValue.trim() === editingField.oldValue) {
      setEditingField(null);
      setEditingValue('');
      return;
    }
    renameFieldMutation.mutate({
      field: editingField.type === 'author' ? 'sourceAuthor' : 'sourceMaterial',
      oldValue: editingField.oldValue,
      newValue: editingValue.trim(),
      scopeAuthor: editingField.type === 'source' ? editingField.parentAuthor : undefined,
    });
  }, [editingField, editingValue, renameFieldMutation]);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
    setEditingValue('');
  }, []);

  const authorGroups: AuthorGroup[] = useMemo(() => {
    if (!logsData?.logs) return [];

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    const authorMap: Record<string, Record<string, EntryData[]>> = {};

    const addToMap = (author: string, source: string, entry: EntryData) => {
      if (dismissedKeys.has(`author::${author}`)) return;
      if (dismissedKeys.has(`${author}::${source}`)) return;
      if (!authorMap[author]) authorMap[author] = {};
      if (!authorMap[author][source]) authorMap[author][source] = [];
      authorMap[author][source].push(entry);
    };

    logsData.logs.forEach(log => {
      const isToday = log.date === todayStr;
      if (!isToday && (log.sourceAuthor || log.sourceMaterial || log.researchNote || log.revisionNote || log.executionNote)) {
        const author = log.sourceAuthor?.trim() || 'Unknown Author';
        const source = log.sourceMaterial?.trim() || 'Untitled Source';
        addToMap(author, source, {
          date: log.date,
          logId: log.id,
          researchNote: log.researchNote,
          revisionNote: log.revisionNote,
          executionNote: log.executionNote,
        });
      }

      if (log.researchEntries && Array.isArray(log.researchEntries)) {
        log.researchEntries.forEach((entry, idx) => {
          if (!entry.sourceAuthor && !entry.sourceMaterial && !entry.researchNote && !entry.revisionNote && !entry.executionNote) return;
          const author = entry.sourceAuthor?.trim() || 'Unknown Author';
          const source = entry.sourceMaterial?.trim() || 'Untitled Source';
          addToMap(author, source, {
            date: log.date,
            logId: log.id,
            entryIndex: idx,
            researchNote: entry.researchNote || null,
            revisionNote: entry.revisionNote || null,
            executionNote: entry.executionNote || null,
          });
        });
      }
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
  }, [logsData, dismissedKeys]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return authorGroups;
    const q = searchQuery.trim();

    return authorGroups
      .map(group => {
        if (group.author.includes(q)) return group;

        const filteredSources = group.sources
          .map(source => {
            if (source.sourceMaterial.includes(q)) return source;

            const matchingEntries = source.entries.filter(
              e => (e.researchNote?.includes(q)) ||
                   (e.revisionNote?.includes(q)) ||
                   (e.executionNote?.includes(q))
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

  if (isLoading || !dismissedLoaded) {
    return (
      <div className="pb-20">
        <div className="mb-6">
          <div className="h-8 bg-primary/20 rounded w-48 mb-2 animate-pulse"></div>
          <div className="h-4 bg-primary/10 rounded w-72 animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glassmorphic rounded-xl border border-primary/20 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/20"></div>
                <div className="flex-1">
                  <div className="h-4 bg-primary/20 rounded w-40 mb-2"></div>
                  <div className="h-3 bg-primary/10 rounded w-24"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
        <h1 className="text-2xl font-orbitron mb-1">Knowledge</h1>
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
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isAuthorExpanded ? (
                      <ChevronDown className="h-5 w-5 text-primary flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                    <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                    {editingField?.type === 'author' && editingField.oldValue === group.author ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                        <input
                          ref={editInputRef}
                          className="bg-background/80 border border-primary/40 rounded px-2 py-0.5 text-base font-medium flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-primary/50"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                          onBlur={confirmEdit}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/author min-w-0">
                        <h2 className="text-base font-medium truncate">{group.author}</h2>
                        <button
                          className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors flex-shrink-0"
                          title="Edit author name"
                          onClick={e => { e.stopPropagation(); startEditing('author', group.author); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-orbitron font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border bg-primary/20 border-primary/50 text-primary">
                      {sourceCount} {sourceCount === 1 ? 'source' : 'sources'} · {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                    </span>
                    <button
                      className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-destructive/30 hover:text-destructive hover:border-destructive/50 transition-colors"
                      title={`Hide all entries by ${group.author}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissEntry(group.author);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {isSourceExpanded ? (
                                <ChevronDown className="h-4 w-4 text-primary/70 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-primary/70 flex-shrink-0" />
                              )}
                              <Link2 className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
                              {editingField?.type === 'source' && editingField.oldValue === source.sourceMaterial && editingField.parentAuthor === group.author ? (
                                <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                                  <input
                                    ref={editInputRef}
                                    className="bg-background/80 border border-primary/40 rounded px-2 py-0.5 text-sm flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-primary/50"
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                    onBlur={confirmEdit}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 group/source min-w-0">
                                  <span className="text-sm truncate">{source.sourceMaterial}</span>
                                  <button
                                    className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors flex-shrink-0"
                                    title="Edit source material"
                                    onClick={e => { e.stopPropagation(); startEditing('source', source.sourceMaterial, group.author); }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-[#7DAAB2] px-1.5 py-0.5 bg-slate-800/50 rounded">
                                {source.entries.length}
                              </span>
                              <button
                                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-destructive/30 hover:text-destructive hover:border-destructive/50 transition-colors"
                                title={`Hide "${source.sourceMaterial}"`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissEntry(group.author, source.sourceMaterial);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isSourceExpanded && (
                            <div className="px-3 pb-3 pt-2 space-y-3 border-t border-slate-700/20">
                              {source.entries.map((entry, idx) => {
                                const entryKey = `${sourceKey}::${entry.date}::${idx}`;
                                const fieldMap: Record<string, string> = { research: 'researchNote', revision: 'revisionNote', execution: 'executionNote' };
                                const noteTypes = [
                                  { key: 'research', label: 'Research Note', icon: Search, content: entry.researchNote },
                                  { key: 'revision', label: 'Summary Note', icon: FileText, content: entry.revisionNote },
                                  { key: 'execution', label: 'Execution Note', icon: Play, content: entry.executionNote },
                                ];

                                return (
                                  <div key={idx} className="p-3 rounded-lg bg-card/30 border border-slate-700/20 space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-xs text-[#7DAAB2]">
                                      <Calendar className="h-3 w-3" />
                                      <span className="font-mono">{formatDate(entry.date)}</span>
                                    </div>

                                    {noteTypes.map(({ key, label, icon: Icon, content }) => {
                                      const noteKey = `${entryKey}::${key}`;
                                      const isNoteExpanded = expandedNotes.has(noteKey);
                                      const editValue = editedNotes[noteKey] !== undefined ? editedNotes[noteKey] : (content || '');
                                      return (
                                        <div key={key}>
                                          <div
                                            className="flex items-center gap-1 cursor-pointer hover:bg-card/40 rounded px-1 py-0.5 transition-colors"
                                            onClick={() => toggleNote(noteKey)}
                                          >
                                            {isNoteExpanded ? (
                                              <ChevronDown className="h-3 w-3 text-primary/60 flex-shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3 text-primary/60 flex-shrink-0" />
                                            )}
                                            <Icon className="h-3 w-3 text-primary/80" />
                                            <span className="text-xs text-primary/80">{label}</span>
                                          </div>
                                          {isNoteExpanded && (
                                            <div className="pl-5 pt-1">
                                              <MarkdownEditor
                                                placeholder={`Add your ${label.toLowerCase()} here...`}
                                                value={editValue}
                                                onChange={(value) => handleNoteEdit(noteKey, entry.date, fieldMap[key], value)}
                                                onBlur={() => handleNoteBlurSave(noteKey, entry.date, fieldMap[key])}
                                                minHeight="60px"
                                              />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
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
    </div>
  );
}