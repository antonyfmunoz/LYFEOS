import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { Contact } from '@shared/schema';
import { Users, Star, Search, ChevronLeft, ChevronRight, Briefcase, Mail, Phone, MapPin, GripVertical, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatInfoDialog } from '@/components/ui/stat-info-dialog';

const CATEGORY_COLORS: Record<string, string> = {
  personal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  work: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  family: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  friend: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  mentor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  client: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RolodexWidget() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['/api/users', user?.id, 'contacts'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/contacts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch contacts');
      return res.json();
    },
    enabled: !!user?.id,
  });

  const contacts = contactsData?.contacts || [];

  const filteredContacts = useMemo(() => {
    let sorted = [...contacts].sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return a.name.localeCompare(b.name);
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      sorted = sorted.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.jobTitle?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q)
      );
    }

    return sorted;
  }, [contacts, searchQuery]);

  const currentContact = filteredContacts[currentIndex];
  const totalContacts = filteredContacts.length;

  const goNext = () => {
    if (currentIndex < totalContacts - 1) setCurrentIndex(currentIndex + 1);
    else setCurrentIndex(0);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
    else setCurrentIndex(Math.max(0, totalContacts - 1));
  };

  return (
    <div className="glassmorphic rounded-xl neon-border">
      <div className="p-3 flex items-center justify-between border-b border-primary/10">
        <div className="flex items-center">
          <div className="cursor-move">
            <GripVertical className="h-4 w-4 mr-2 text-muted-foreground" />
          </div>
          <div className="mr-2">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-lg font-orbitron text-foreground">Rolodex</h3>
          <div onClick={(e) => e.stopPropagation()} className="ml-2">
            <StatInfoDialog
              trigger={
                <button className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                  <Info className="h-3.5 w-3.5" />
                </button>
              }
              title="Rolodex"
              description="Flip through your contacts like a classic rolodex. Favorites are pinned to the front. Use search to find specific people."
              hideMoreDetails
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowSearch(!showSearch); setSearchQuery(''); setCurrentIndex(0); }}
            className="h-7 w-7 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          {totalContacts > 0 && (
            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {currentIndex + 1}/{totalContacts}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); navigate('/rolodex'); }}
            className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
          >
            OPEN
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="px-3 pt-3" onClick={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentIndex(0); }}
              placeholder="Search contacts..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="p-4">
        {totalContacts === 0 ? (
          <div className="text-center py-6">
            <Users className="h-8 w-8 text-primary/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {searchQuery ? 'No contacts match your search.' : 'No contacts yet. Add contacts to see them here.'}
            </p>
          </div>
        ) : currentContact ? (
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex-1 mx-3">
                <div className="bg-card/30 rounded-xl border border-primary/10 p-4 hover:border-primary/30 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-orbitron text-primary font-bold">
                        {getInitials(currentContact.name)}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-base font-orbitron text-foreground truncate">
                          {currentContact.name}
                        </h4>
                        {currentContact.favorite && (
                          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                        )}
                      </div>

                      {(currentContact.jobTitle || currentContact.company) && (
                        <div className="flex items-center gap-1.5 text-xs text-primary/60 mb-2">
                          <Briefcase className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">
                            {currentContact.jobTitle}{currentContact.jobTitle && currentContact.company ? ' at ' : ''}{currentContact.company}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        {currentContact.category && (
                          <span className={cn(
                            "text-[10px] font-mono px-2 py-0.5 rounded-full border capitalize",
                            CATEGORY_COLORS[currentContact.category] || 'bg-primary/20 text-primary border-primary/30'
                          )}>
                            {currentContact.category}
                          </span>
                        )}
                        {currentContact.email && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                            <Mail className="h-2.5 w-2.5" />
                            Email
                          </span>
                        )}
                        {currentContact.phone && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            Phone
                          </span>
                        )}
                        {currentContact.address && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" />
                            Address
                          </span>
                        )}
                      </div>

                      {currentContact.lastContacted && (
                        <p className="text-[10px] font-mono text-muted-foreground mt-2">
                          Last contacted: <span className="text-primary">{formatDate(currentContact.lastContacted)}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {currentContact.notes && (
                    <div className="mt-3 pt-3 border-t border-primary/10">
                      <p className="text-xs text-muted-foreground line-clamp-2">{currentContact.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
              {filteredContacts.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, i) => {
                const actualIndex = Math.max(0, currentIndex - 3) + i;
                return (
                  <button
                    key={actualIndex}
                    onClick={() => setCurrentIndex(actualIndex)}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      actualIndex === currentIndex
                        ? "bg-primary shadow-[0_0_4px_var(--primary-glow-medium)]"
                        : "bg-primary/20 hover:bg-primary/40"
                    )}
                  />
                );
              })}
              {totalContacts > 7 && currentIndex + 4 < totalContacts && (
                <span className="text-[8px] text-muted-foreground ml-1">...</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
