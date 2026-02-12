import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { Contact } from '@shared/schema';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Users, Star, Search, Plus, Briefcase, Mail, Phone,
  MapPin, Trash2, Edit3, X, ChevronDown, Calendar, SlidersHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const CATEGORY_OPTIONS = ['personal', 'work', 'family', 'friend', 'mentor', 'client'];
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

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  category: string;
  notes: string;
  address: string;
  birthday: string;
  favorite: boolean;
}

const emptyForm: ContactFormData = {
  name: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
  category: 'personal',
  notes: '',
  address: '',
  birthday: '',
  favorite: false,
};

export default function RolodexPage() {
  usePageTitle('Rolodex');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: contactsData, isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['/api/users', user?.id, 'contacts'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/contacts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch contacts');
      return res.json();
    },
    enabled: !!user?.id,
  });

  const contacts = contactsData?.contacts || [];

  const createMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const body: any = { ...data };
      if (!body.birthday) delete body.birthday;
      if (!body.email) delete body.email;
      if (!body.phone) delete body.phone;
      if (!body.company) delete body.company;
      if (!body.jobTitle) delete body.jobTitle;
      if (!body.address) delete body.address;
      if (!body.notes) delete body.notes;
      return apiRequest('/api/contacts', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
      toast({ title: 'Contact created', description: 'New contact added to your rolodex.' });
      closeForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create contact.', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ContactFormData> }) => {
      const body: any = { ...data };
      if (body.birthday === '') body.birthday = null;
      return apiRequest(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
      toast({ title: 'Contact updated', description: 'Contact details saved.' });
      closeForm();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update contact.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/contacts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
      toast({ title: 'Contact deleted', description: 'Contact removed from your rolodex.' });
      setDeleteConfirmId(null);
      setExpandedId(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete contact.', variant: 'destructive' });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/contacts/${id}/toggle-favorite`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
    },
  });

  const filteredContacts = useMemo(() => {
    let sorted = [...contacts].sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return a.name.localeCompare(b.name);
    });

    if (filterCategory !== 'all') {
      sorted = sorted.filter(c => c.category === filterCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      sorted = sorted.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.jobTitle?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }

    return sorted;
  }, [contacts, searchQuery, filterCategory]);

  const openCreateForm = () => {
    setEditingContact(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      email: contact.email || '',
      phone: contact.phone || '',
      company: contact.company || '',
      jobTitle: contact.jobTitle || '',
      category: contact.category || 'personal',
      notes: contact.notes || '',
      address: contact.address || '',
      birthday: contact.birthday || '',
      favorite: contact.favorite,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingContact(null);
    setFormData(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach(c => {
      counts[c.category] = (counts[c.category] || 0) + 1;
    });
    return counts;
  }, [contacts]);

  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/chronilog')}
            className="text-primary hover:bg-primary/10"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-orbitron text-foreground">Rolodex</h1>
          </div>
        </div>
        <Button
          onClick={openCreateForm}
          className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          ADD CONTACT
        </Button>
      </div>

      <div className="glassmorphic rounded-xl neon-border p-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-colors",
              showFilters ? "bg-primary/30 border-primary text-primary" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-primary/10">
            <p className="text-[10px] font-mono text-muted-foreground mb-2 uppercase tracking-wider">Category</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterCategory('all')}
                className={cn(
                  "text-xs font-mono px-2.5 py-1 rounded-full border transition-all",
                  filterCategory === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                )}
              >
                All ({contacts.length})
              </button>
              {CATEGORY_OPTIONS.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={cn(
                    "text-xs font-mono px-2.5 py-1 rounded-full border transition-all capitalize",
                    filterCategory === cat
                      ? 'bg-primary text-primary-foreground border-primary'
                      : cn(CATEGORY_COLORS[cat] || 'bg-primary/10 text-primary border-primary/30', 'hover:opacity-80')
                  )}
                >
                  {cat} ({categoryCount[cat] || 0})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">
          {filteredContacts.length} {filteredContacts.length === 1 ? 'contact' : 'contacts'}
          {filterCategory !== 'all' ? ` in ${filterCategory}` : ''}
        </span>
        <span className="text-xs font-mono text-primary/50">
          {contacts.filter(c => c.favorite).length} favorites
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="glassmorphic rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10" />
                <div className="flex-1">
                  <div className="h-4 bg-primary/10 rounded w-32 mb-2" />
                  <div className="h-3 bg-primary/5 rounded w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="glassmorphic rounded-xl p-8 neon-border text-center">
          <Users className="h-10 w-10 text-primary/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            {searchQuery || filterCategory !== 'all'
              ? 'No contacts match your search.'
              : 'No contacts yet. Add your first contact to get started.'}
          </p>
          {!searchQuery && filterCategory === 'all' && (
            <Button
              onClick={openCreateForm}
              className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              ADD FIRST CONTACT
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredContacts.map(contact => (
            <div
              key={contact.id}
              className={cn(
                "glassmorphic rounded-xl transition-all",
                expandedId === contact.id ? "neon-border" : "border border-primary/10 hover:border-primary/30"
              )}
            >
              <div
                className="p-3 cursor-pointer flex items-center gap-3"
                onClick={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-orbitron text-primary font-bold">
                    {getInitials(contact.name)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-orbitron text-foreground truncate">{contact.name}</h3>
                    {contact.favorite && (
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                    )}
                  </div>
                  {(contact.jobTitle || contact.company) && (
                    <p className="text-xs text-[#7DAAB2] truncate">
                      {contact.jobTitle}{contact.jobTitle && contact.company ? ' at ' : ''}{contact.company}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {contact.category && (
                    <span className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded-full border capitalize hidden sm:inline-flex",
                      CATEGORY_COLORS[contact.category] || 'bg-primary/20 text-primary border-primary/30'
                    )}>
                      {contact.category}
                    </span>
                  )}
                  <ChevronDown className={cn(
                    "h-4 w-4 text-primary/50 transition-transform",
                    expandedId === contact.id && "rotate-180"
                  )} />
                </div>
              </div>

              {expandedId === contact.id && (
                <div className="px-3 pb-3 border-t border-primary/10 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {contact.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                      </div>
                    )}
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a>
                      </div>
                    )}
                    {contact.address && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="truncate">{contact.address}</span>
                      </div>
                    )}
                    {contact.birthday && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span>{contact.birthday}</span>
                      </div>
                    )}
                  </div>

                  {contact.notes && (
                    <div className="mb-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs text-muted-foreground">{contact.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavoriteMutation.mutate(contact.id); }}
                      className={cn(
                        "text-xs font-mono px-2.5 py-1 rounded border transition-colors flex items-center gap-1",
                        contact.favorite
                          ? "bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30"
                          : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      )}
                    >
                      <Star className={cn("h-3 w-3", contact.favorite && "fill-amber-400")} />
                      {contact.favorite ? 'Unfavorite' : 'Favorite'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditForm(contact); }}
                      className="text-xs font-mono px-2.5 py-1 rounded border bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    {deleteConfirmId === contact.id ? (
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px] text-red-400 font-mono">Delete?</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(contact.id); }}
                          className="text-xs font-mono px-2 py-1 rounded border bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                          className="text-xs font-mono px-2 py-1 rounded border bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(contact.id); }}
                        className="text-xs font-mono px-2.5 py-1 rounded border bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1 ml-auto"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div
            className="glassmorphic rounded-xl neon-border w-full max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-primary/10 flex items-center justify-between">
              <h2 className="text-lg font-orbitron text-foreground">
                {editingContact ? 'Edit Contact' : 'New Contact'}
              </h2>
              <button
                onClick={closeForm}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="Full name"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Company</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Job Title</label>
                  <input
                    type="text"
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="Job title"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground focus:outline-none focus:border-primary/50 transition-colors capitalize"
                  >
                    {CATEGORY_OPTIONS.map(cat => (
                      <option key={cat} value={cat} className="capitalize bg-background">{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Birthday</label>
                  <input
                    type="date"
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="Address"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                  rows={3}
                  placeholder="Notes about this contact..."
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, favorite: !formData.favorite })}
                  className={cn(
                    "h-8 w-8 inline-flex items-center justify-center rounded-lg border transition-colors",
                    formData.favorite
                      ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                      : "bg-primary/10 border-primary/30 text-primary/50 hover:text-primary"
                  )}
                >
                  <Star className={cn("h-4 w-4", formData.favorite && "fill-amber-400")} />
                </button>
                <span className="text-xs text-muted-foreground font-mono">
                  {formData.favorite ? 'Favorited' : 'Mark as favorite'}
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending || !formData.name.trim()}
                  className="flex-1 bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingContact ? 'SAVE CHANGES' : 'CREATE CONTACT'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeForm}
                  className="text-muted-foreground hover:text-foreground font-mono text-xs"
                >
                  CANCEL
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
