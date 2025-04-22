import { useState } from 'react';
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
  Mail
} from "lucide-react";
import { Link } from 'wouter';

// Define contact type
interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  favorite: boolean;
}

export function RolodexWidget() {
  // Sample contacts data
  const [contacts, setContacts] = useState<Contact[]>([
    { 
      id: '1', 
      name: 'Alex Johnson', 
      email: 'alex@example.com', 
      phone: '555-1234', 
      category: 'work',
      favorite: true 
    },
    { 
      id: '2', 
      name: 'Sara Williams', 
      email: 'sara@example.com', 
      phone: '555-5678', 
      category: 'personal',
      favorite: false 
    },
    { 
      id: '3', 
      name: 'Michael Chen', 
      email: 'mike@example.com', 
      phone: '555-9012', 
      category: 'work',
      favorite: true 
    },
    { 
      id: '4', 
      name: 'Emma Rodriguez', 
      email: 'emma@example.com', 
      phone: '555-3456', 
      category: 'personal',
      favorite: false 
    }
  ]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Filter contacts based on search term and category
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contact.phone.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory ? contact.category === selectedCategory : true;
    
    return matchesSearch && matchesCategory;
  });
  
  // Display only top 3 contacts for the widget view
  const displayedContacts = filteredContacts.slice(0, 3);
  
  // Toggle favorite status
  const toggleFavorite = (id: string) => {
    setContacts(contacts.map(contact => 
      contact.id === id ? { ...contact, favorite: !contact.favorite } : contact
    ));
  };

  // Get category count
  const getCategoryCount = (category: string) => {
    return contacts.filter(contact => contact.category === category).length;
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
          
          <Link to="/contacts" className="text-xs text-primary hover:underline">
            View All
          </Link>
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
            displayedContacts.map(contact => (
              <div key={contact.id} className="flex items-center justify-between p-2 rounded-md border border-slate-700/30 hover:border-primary/50 transition-colors">
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
                      <Mail className="h-3 w-3" /> {contact.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => toggleFavorite(contact.id)}
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
            className="w-full border-dashed border-slate-700/30 text-xs hover:text-primary hover:border-primary/50"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add New Contact
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}