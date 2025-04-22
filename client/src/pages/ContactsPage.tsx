import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/use-page-title';
import { useLocation } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Contact2,
  Plus,
  Search,
  Star,
  Mail,
  Phone,
  Building,
  Clock,
  Heart,
  MoreHorizontal,
  ChevronsUpDown,
  Trash2,
  ArrowLeft
} from "lucide-react";

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

export function ContactsPage() {
  usePageTitle('Contacts');
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
  
  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete contact');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
        variant: 'destructive',
      });
    },
  });
  
  // Filter contacts based on search term and category
  const filteredContacts = contacts.filter((contact: Contact) => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.email ? contact.email.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
      (contact.phone ? contact.phone.toLowerCase().includes(searchTerm.toLowerCase()) : false) ||
      (contact.company ? contact.company.toLowerCase().includes(searchTerm.toLowerCase()) : false);
    
    const matchesCategory = selectedCategory ? contact.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Toggle favorite status
  const toggleFavorite = (id: number) => {
    toggleFavoriteMutation.mutate(id);
  };
  
  // Delete contact
  const deleteContact = (id: number) => {
    if (window.confirm('Are you sure you want to delete this contact?')) {
      deleteContactMutation.mutate(id);
    }
  };
  
  // Get category count
  const getCategoryCount = (category: string) => {
    return contacts.filter((contact: Contact) => contact.category === category).length;
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary border-r-2 border-b-2 border-gray-200 mx-auto"></div>
          <p className="mt-4">Loading contacts...</p>
        </div>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500">Failed to load contacts. Please try again.</p>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] })}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/systems')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Contacts</h1>
        </div>
        <Button onClick={() => navigate('/contacts/new')}>
          <Plus className="mr-2 h-4 w-4" /> New Contact
        </Button>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
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
      </div>
      
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Company</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.length > 0 ? (
                filteredContacts.map((contact: Contact) => (
                  <TableRow key={contact.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/contacts/${contact.id}`)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          contact.category === "work" ? "bg-blue-500/20" : "bg-purple-500/20"
                        }`}>
                          <Contact2 className={`h-4 w-4 ${
                            contact.category === "work" ? "text-blue-500" : "text-purple-500"
                          }`} />
                        </div>
                        <div>
                          <div className="font-medium flex items-center">
                            {contact.name}
                            {contact.favorite && <Star className="ml-1 h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                          </div>
                          <div className="text-xs text-muted-foreground md:hidden">
                            {contact.email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{contact.email || 'N/A'}</TableCell>
                    <TableCell className="hidden md:table-cell">{contact.phone || 'N/A'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{contact.company || 'N/A'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className={
                        contact.category === "work" ? "border-blue-500/50 text-blue-500" : 
                        "border-purple-500/50 text-purple-500"
                      }>
                        {contact.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleFavorite(contact.id)}
                        >
                          <Star className={`h-4 w-4 ${contact.favorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteContact(contact.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    {searchTerm || selectedCategory ? 'No contacts match your filters' : 'No contacts found. Add your first contact to get started!'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}