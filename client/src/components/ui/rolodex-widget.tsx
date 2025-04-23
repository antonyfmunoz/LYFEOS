import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Contact2, 
  Plus, 
  Search, 
  Star,
  Mail,
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Define contact type to match the database schema
interface Contact {
  id: number;
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  category: string;
  notes: string | null;
  favorite: boolean;
  lastContacted: string | null;
  birthday: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export function RolodexWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Fetch contacts from the database
  const { data: contactsData, isLoading, isError } = useQuery({
    queryKey: ['/api/users', user?.id, 'contacts'],
    queryFn: async () => {
      if (!user) return { contacts: [] };
      const response = await fetch(`/api/users/${user.id}/contacts`);
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }
      return response.json();
    },
    enabled: !!user,
  });
  
  const contacts = contactsData?.contacts || [];
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await fetch(`/api/contacts/${contactId}/toggle-favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to toggle favorite status');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });
  
  // Filter contacts based on search term and category
  const filteredContacts = contacts.filter((contact: Contact) => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.email ? contact.email.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
      (contact.phone ? contact.phone.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    
    const matchesCategory = selectedCategory ? contact.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Display only top 3 contacts for the widget view
  const displayedContacts = filteredContacts.slice(0, 3);
  
  // Toggle favorite status
  const toggleFavorite = (id: number) => {
    toggleFavoriteMutation.mutate(id);
  };

  // Get category count
  const getCategoryCount = (category: string) => {
    return contacts.filter((contact: Contact) => contact.category === category).length;
  };
  
  return (
    <Card className="w-full border border-slate-700/30 p-0 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-9 w-full max-w-[200px] border border-slate-700/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate("/contacts")}
          >
            View All
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
        
        <div className="flex gap-2 mb-3">
          <Badge 
            variant={selectedCategory === null ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            All ({contacts.length})
          </Badge>
          <Badge 
            variant={selectedCategory === "work" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSelectedCategory("work")}
          >
            Work ({getCategoryCount("work")})
          </Badge>
          <Badge 
            variant={selectedCategory === "personal" ? "default" : "outline"} 
            className="cursor-pointer"
            onClick={() => setSelectedCategory("personal")}
          >
            Personal ({getCategoryCount("personal")})
          </Badge>
        </div>
        
        <div className="space-y-2">
          {displayedContacts.length > 0 ? (
            displayedContacts.map((contact: Contact) => (
              <div 
                key={contact.id} 
                className="flex items-center justify-between p-2 rounded-md border border-slate-700/30 hover:border-primary/50 transition-colors cursor-pointer hover:bg-primary/5"
                onClick={() => navigate(`/contacts/${contact.id}`)}>
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    contact.category === "work" ? "bg-blue-500/20" : "bg-purple-500/20"
                  }`}>
                    <Contact2 className={`h-4 w-4 ${
                      contact.category === "work" ? "text-blue-500" : "text-purple-500"
                    }`} />
                  </div>
                  <div>
                    <div className="font-medium text-sm flex items-center gap-1">
                      {contact.name}
                      {contact.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {contact.email || 'No email'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the parent's onClick
                      toggleFavorite(contact.id);
                    }}
                  >
                    <Star className={`h-3.5 w-3.5 ${contact.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No contacts found
            </div>
          )}
          
          {/* Add New Contact Button */}
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full border-dashed border-slate-700/30 text-xs hover:text-black hover:bg-yellow-400 hover:border-yellow-500"
            onClick={() => navigate("/contacts/new")}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add New Contact
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}