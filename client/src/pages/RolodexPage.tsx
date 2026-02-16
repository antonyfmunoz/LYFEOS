import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { Contact } from '@shared/schema';
import {
  ArrowLeft, Users, Star, Search, Briefcase, Mail, Phone,
  MapPin, Trash2, Edit3, X, ChevronDown, Calendar, SlidersHorizontal,
  Shield, Globe, Linkedin, Twitter, Instagram, Link, Clock, Building2,
  UserCircle, Radar, MessageSquare, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RichTextArea } from '@/components/ui/rich-text-toolbar';

const CATEGORY_OPTIONS = ['personal', 'work', 'family', 'friend', 'mentor', 'client'];
const CATEGORY_COLORS: Record<string, string> = {
  personal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  work: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  family: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  friend: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  mentor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  client: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const RELATIONSHIP_TYPES = ['friend', 'mentor', 'mentee', 'client', 'partner', 'colleague', 'acquaintance', 'collaborator'];
const FREQUENCY_OPTIONS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'as-needed'];

const TRUST_LABELS: Record<number, string> = {
  1: 'New',
  2: 'Familiar',
  3: 'Reliable',
  4: 'Close',
  5: 'Inner Circle',
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  friend: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  mentor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  mentee: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  client: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  partner: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  colleague: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  acquaintance: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  collaborator: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

interface ContactFormData {
  name: string;
  alias: string;
  email: string;
  phone: string;
  secondaryPhone: string;
  company: string;
  jobTitle: string;
  department: string;
  industry: string;
  category: string;
  relationshipType: string;
  notes: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  birthday: string;
  favorite: boolean;
  linkedin: string;
  twitter: string;
  instagram: string;
  website: string;
  howMet: string;
  trustLevel: number;
  strengths: string;
  contactFrequency: string;
}

const emptyForm: ContactFormData = {
  name: '',
  alias: '',
  email: '',
  phone: '',
  secondaryPhone: '',
  company: '',
  jobTitle: '',
  department: '',
  industry: '',
  category: 'personal',
  relationshipType: '',
  notes: '',
  address: '',
  city: '',
  country: '',
  timezone: '',
  birthday: '',
  favorite: false,
  linkedin: '',
  twitter: '',
  instagram: '',
  website: '',
  howMet: '',
  trustLevel: 0,
  strengths: '',
  contactFrequency: '',
};

function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-[10px] font-mono text-primary uppercase tracking-widest whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-primary/20" />
    </div>
  );
}

export default function RolodexPage() {
  usePageTitle('Rolodex');
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const { isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ['/api/users', user?.id, 'contacts'],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/contacts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch contacts');
      const data = await res.json();
      setContacts(data.contacts || []);
      return data;
    },
  });

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
      if (!body.alias) delete body.alias;
      if (!body.secondaryPhone) delete body.secondaryPhone;
      if (!body.department) delete body.department;
      if (!body.industry) delete body.industry;
      if (!body.relationshipType) delete body.relationshipType;
      if (!body.city) delete body.city;
      if (!body.country) delete body.country;
      if (!body.timezone) delete body.timezone;
      if (!body.linkedin) delete body.linkedin;
      if (!body.twitter) delete body.twitter;
      if (!body.instagram) delete body.instagram;
      if (!body.website) delete body.website;
      if (!body.howMet) delete body.howMet;
      if (!body.trustLevel) delete body.trustLevel;
      if (!body.strengths) delete body.strengths;
      if (!body.contactFrequency) delete body.contactFrequency;
      const res = await fetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create contact');
      return res.json();
    },
    onSuccess: (data) => {
      setContacts(prev => [...prev, data.contact]);
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ContactFormData> }) => {
      const body: any = { ...data };
      if (body.birthday === '') body.birthday = null;
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update contact');
      return res.json();
    },
    onSuccess: (data) => {
      setContacts(prev => prev.map(c => c.id === data.contact.id ? data.contact : c));
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE', credentials: 'include' });
      return id;
    },
    onSuccess: (deletedId) => {
      setContacts(prev => prev.filter(c => c.id !== deletedId));
      setDeleteConfirmId(null);
      setExpandedId(null);
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contacts/${id}/toggle-favorite`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to toggle favorite');
      return res.json();
    },
    onSuccess: (data) => {
      setContacts(prev => prev.map(c => c.id === data.contact.id ? data.contact : c));
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
        c.phone?.includes(q) ||
        c.alias?.toLowerCase().includes(q) ||
        c.linkedin?.toLowerCase().includes(q) ||
        c.twitter?.toLowerCase().includes(q) ||
        c.instagram?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.country?.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.strengths?.toLowerCase().includes(q)
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
      alias: contact.alias || '',
      email: contact.email || '',
      phone: contact.phone || '',
      secondaryPhone: contact.secondaryPhone || '',
      company: contact.company || '',
      jobTitle: contact.jobTitle || '',
      department: contact.department || '',
      industry: contact.industry || '',
      category: contact.category || 'personal',
      relationshipType: contact.relationshipType || '',
      notes: contact.notes || '',
      address: contact.address || '',
      city: contact.city || '',
      country: contact.country || '',
      timezone: contact.timezone || '',
      birthday: contact.birthday || '',
      favorite: contact.favorite,
      linkedin: contact.linkedin || '',
      twitter: contact.twitter || '',
      instagram: contact.instagram || '',
      website: contact.website || '',
      howMet: contact.howMet || '',
      trustLevel: contact.trustLevel || 0,
      strengths: contact.strengths || '',
      contactFrequency: contact.contactFrequency || '',
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

  const inputClass = "w-full px-3 py-2 text-sm bg-card/30 border border-primary/20 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors";
  const labelClass = "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1 block";

  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <Button
          className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
          size="sm"
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Rolodex</h1>
          <p className="text-[#7DAAB2]">Your personal contacts</p>
        </div>
        <Button
          onClick={openCreateForm}
          className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
          size="sm"
        >
          Create Contact
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
        </div>
      ) : (
        <div className="space-y-2">
          {filteredContacts.map(contact => {
            return (
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
                      <h3 className="text-sm font-orbitron text-foreground truncate">
                        {contact.name}
                        {contact.alias && (
                          <span className="text-muted-foreground font-normal text-xs ml-1">({contact.alias})</span>
                        )}
                      </h3>
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
                    {contact.relationshipType && (
                      <span className={cn(
                        "text-[10px] font-mono px-2 py-0.5 rounded-full border capitalize hidden sm:inline-flex",
                        RELATIONSHIP_COLORS[contact.relationshipType] || 'bg-primary/20 text-primary border-primary/30'
                      )}>
                        {contact.relationshipType}
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
                      {contact.secondaryPhone && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
                          <a href={`tel:${contact.secondaryPhone}`} className="text-primary hover:underline">{contact.secondaryPhone}</a>
                        </div>
                      )}
                      {contact.address && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="truncate">{contact.address}</span>
                        </div>
                      )}
                      {(contact.city || contact.country) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Globe className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="truncate">{[contact.city, contact.country].filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                      {contact.birthday && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span>{contact.birthday}</span>
                        </div>
                      )}
                      {(contact.department || contact.industry) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          <span className="truncate">{[contact.department, contact.industry].filter(Boolean).join(' · ')}</span>
                        </div>
                      )}
                    </div>

                    {contact.trustLevel && contact.trustLevel > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="text-[10px] font-mono text-muted-foreground uppercase mr-1">Trust:</span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map(level => (
                            <div
                              key={level}
                              className={cn(
                                "w-2.5 h-2.5 rounded-full border",
                                level <= (contact.trustLevel || 0)
                                  ? "bg-primary border-primary"
                                  : "bg-transparent border-primary/30"
                              )}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-mono text-primary/70">{TRUST_LABELS[contact.trustLevel]}</span>
                      </div>
                    )}

                    {(contact.linkedin || contact.twitter || contact.instagram || contact.website) && (
                      <div className="flex items-center gap-1.5 mb-3">
                        {contact.linkedin && (
                          <a href={contact.linkedin.startsWith('http') ? contact.linkedin : `https://linkedin.com/in/${contact.linkedin}`} target="_blank" rel="noopener noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {contact.twitter && (
                          <a href={contact.twitter.startsWith('http') ? contact.twitter : `https://twitter.com/${contact.twitter}`} target="_blank" rel="noopener noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                            <Twitter className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {contact.instagram && (
                          <a href={contact.instagram.startsWith('http') ? contact.instagram : `https://instagram.com/${contact.instagram}`} target="_blank" rel="noopener noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                            <Instagram className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {contact.website && (
                          <a href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} target="_blank" rel="noopener noreferrer"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors">
                            <Link className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    )}

                    {contact.howMet && (
                      <div className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                        <span><span className="text-primary/70 font-mono">How Met:</span> {contact.howMet}</span>
                      </div>
                    )}

                    {contact.strengths && (
                      <div className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
                        <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                        <span><span className="text-primary/70 font-mono">Strengths:</span> {contact.strengths}</span>
                      </div>
                    )}

                    {contact.contactFrequency && (
                      <div className="mb-3">
                        <span className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded-full border capitalize inline-flex items-center gap-1",
                          "bg-primary/10 text-primary border-primary/30"
                        )}>
                          <Clock className="h-3 w-3" />
                          {contact.contactFrequency}
                        </span>
                      </div>
                    )}

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
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div
            className="glassmorphic rounded-xl neon-border w-full max-w-2xl max-h-[90vh] overflow-y-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              <span className="text-[80px] font-orbitron font-bold text-primary/[0.03] uppercase select-none" style={{ transform: 'rotate(-12deg)' }}>
                ROLODEX
              </span>
            </div>

            <div className="p-4 border-b border-primary/10 flex items-center justify-between relative z-10">
              <h2 className="text-lg font-orbitron text-foreground">
                {editingContact ? 'EDIT CONTACT' : 'NEW CONTACT'}
              </h2>
              <button
                onClick={closeForm}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-5 relative z-10">
              <div>
                <SectionHeader icon={UserCircle} label="BASICS" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={inputClass}
                      placeholder="Full name"
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Alias</label>
                    <input
                      type="text"
                      value={formData.alias}
                      onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                      className={inputClass}
                      placeholder="Codename / nickname"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>Birthday</label>
                    <input
                      type="date"
                      value={formData.birthday}
                      onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Category</label>
                    <div className="relative">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className={cn(inputClass, "appearance-none pr-8")}
                      >
                        {CATEGORY_OPTIONS.map(cat => (
                          <option key={cat} value={cat} className="bg-card text-foreground capitalize">{cat}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Relationship</label>
                    <div className="relative">
                      <select
                        value={formData.relationshipType}
                        onChange={(e) => setFormData({ ...formData, relationshipType: e.target.value })}
                        className={cn(inputClass, "appearance-none pr-8")}
                      >
                        <option value="" className="bg-card text-foreground">Select...</option>
                        {RELATIONSHIP_TYPES.map(rt => (
                          <option key={rt} value={rt} className="bg-card text-foreground capitalize">{rt}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader icon={Radar} label="CONTACT INFO" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={inputClass}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={inputClass}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>Secondary Phone</label>
                    <input
                      type="tel"
                      value={formData.secondaryPhone}
                      onChange={(e) => setFormData({ ...formData, secondaryPhone: e.target.value })}
                      className={inputClass}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Website</label>
                    <input
                      type="text"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className={inputClass}
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>LinkedIn</label>
                    <input
                      type="text"
                      value={formData.linkedin}
                      onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                      className={inputClass}
                      placeholder="profile URL or handle"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Twitter / X</label>
                    <input
                      type="text"
                      value={formData.twitter}
                      onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                      className={inputClass}
                      placeholder="@handle"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Instagram</label>
                    <input
                      type="text"
                      value={formData.instagram}
                      onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                      className={inputClass}
                      placeholder="@handle"
                    />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader icon={Building2} label="WORK" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Company</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className={inputClass}
                      placeholder="Company name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Job Title</label>
                    <input
                      type="text"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className={inputClass}
                      placeholder="Position"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>Department</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. Engineering"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Industry</label>
                    <input
                      type="text"
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. Technology"
                    />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader icon={MapPin} label="LOCATION" />
                <div>
                  <label className={labelClass}>Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className={inputClass}
                    placeholder="Street address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className={inputClass}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Country</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className={inputClass}
                      placeholder="Country"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelClass}>Timezone</label>
                  <input
                    type="text"
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. America/New_York"
                  />
                </div>
              </div>

              <div>
                <SectionHeader icon={Shield} label="NOTES & DETAILS" />
                <div>
                  <label className={labelClass}>How Met</label>
                  <input
                    type="text"
                    value={formData.howMet}
                    onChange={(e) => setFormData({ ...formData, howMet: e.target.value })}
                    className={inputClass}
                    placeholder="How did you meet this contact?"
                  />
                </div>

                <div className="mt-3">
                  <label className={labelClass}>Trust Level</label>
                  <div className="flex items-center gap-3 mt-1">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setFormData({ ...formData, trustLevel: formData.trustLevel === level ? 0 : level })}
                        className="flex flex-col items-center gap-1 group"
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 transition-all",
                          level <= formData.trustLevel
                            ? "bg-primary border-primary shadow-[0_0_6px_var(--primary)]"
                            : "bg-transparent border-primary/30 group-hover:border-primary/60"
                        )} />
                        <span className="text-[9px] font-mono text-muted-foreground">{TRUST_LABELS[level]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <label className={labelClass}>Strengths / Skills</label>
                  <input
                    type="text"
                    value={formData.strengths}
                    onChange={(e) => setFormData({ ...formData, strengths: e.target.value })}
                    className={inputClass}
                    placeholder="Key strengths, skills, or expertise"
                  />
                </div>

                <div className="mt-3">
                  <label className={labelClass}>Contact Frequency</label>
                  <div className="relative">
                    <select
                      value={formData.contactFrequency}
                      onChange={(e) => setFormData({ ...formData, contactFrequency: e.target.value })}
                      className={cn(inputClass, "appearance-none pr-8")}
                    >
                      <option value="" className="bg-card text-foreground">Select...</option>
                      {FREQUENCY_OPTIONS.map(freq => (
                        <option key={freq} value={freq} className="bg-card text-foreground capitalize">{freq}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className={labelClass}>Notes</label>
                  <RichTextArea
                    value={formData.notes}
                    onChange={(val) => setFormData({ ...formData, notes: val })}
                    textareaClassName={cn(inputClass, "min-h-[80px] resize-y")}
                    placeholder="Additional notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3 mt-1">
                  <Star className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="text-[10px] font-mono text-primary uppercase tracking-widest whitespace-nowrap">STATUS</span>
                  <div className="flex-1 h-px bg-primary/20" />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, favorite: !formData.favorite })}
                    className={cn(
                      "text-xs font-mono px-3 py-1.5 rounded border transition-colors flex items-center gap-1.5",
                      formData.favorite
                        ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                        : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", formData.favorite && "fill-amber-400")} />
                    {formData.favorite ? 'FAVORITED' : 'MARK FAVORITE'}
                  </button>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={closeForm}
                      className="text-muted-foreground hover:text-foreground font-mono text-xs"
                      size="sm"
                    >
                      CANCEL
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs"
                      size="sm"
                    >
                      {(createMutation.isPending || updateMutation.isPending) ? 'SAVING...' : editingContact ? 'SAVE CHANGES' : 'ADD CONTACT'}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
