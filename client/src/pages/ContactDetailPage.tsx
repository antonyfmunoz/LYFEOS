import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/use-page-title';
import { useLocation, useRoute } from 'wouter';
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
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Contact2,
  ArrowLeft,
  Mail,
  Phone,
  Building,
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  Heart,
  Star,
  Save,
  Pencil,
  Trash2
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";

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

// Contact form schema
const contactFormSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  email: z.string().email({ message: "Invalid email address" }).nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  category: z.string(),
  notes: z.string().nullable().optional(),
  favorite: z.boolean().default(false),
  address: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  lastContacted: z.string().nullable().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

export function ContactDetailPage() {
  const [, params] = useRoute<{ id: string }>('/contacts/:id');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(params?.id === 'new');
  
  // Check if this is a new contact
  const isNewContact = params?.id === 'new';
  
  usePageTitle(isNewContact ? 'New Contact' : 'Contact Details');
  
  // Fetch contact data if not a new contact
  const { data: contactData, isLoading, isError } = useQuery({
    queryKey: ['/api/contacts', params?.id],
    queryFn: async () => {
      if (isNewContact || !params?.id) return { contact: null };
      const response = await fetch(`/api/contacts/${params.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch contact');
      }
      return response.json();
    },
    enabled: !isNewContact && !!params?.id,
  });
  
  const contact = contactData?.contact;
  
  // Create contact mutation
  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormValues) => {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create contact');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: 'Contact created successfully',
      });
      navigate(`/contacts/${data.contact.id}`);
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create contact',
        variant: 'destructive',
      });
    },
  });
  
  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ContactFormValues }) => {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to update contact');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Contact updated successfully',
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', params?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update contact',
        variant: 'destructive',
      });
    },
  });
  
  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete contact');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });
      navigate('/contacts');
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'contacts'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete contact',
        variant: 'destructive',
      });
    },
  });
  
  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/contacts/${id}/toggle-favorite`, {
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
      queryClient.invalidateQueries({ queryKey: ['/api/contacts', params?.id] });
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
  
  // Form setup
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: contact?.name || '',
      email: contact?.email || '',
      phone: contact?.phone || '',
      company: contact?.company || '',
      jobTitle: contact?.jobTitle || '',
      category: contact?.category || 'personal',
      notes: contact?.notes || '',
      favorite: contact?.favorite || false,
      address: contact?.address || '',
      birthday: contact?.birthday || '',
      lastContacted: contact?.lastContacted || '',
    },
  });
  
  // Update form values when contact data is loaded
  useEffect(() => {
    if (contact) {
      form.reset({
        name: contact.name,
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        jobTitle: contact.jobTitle || '',
        category: contact.category,
        notes: contact.notes || '',
        favorite: contact.favorite,
        address: contact.address || '',
        birthday: contact.birthday || '',
        lastContacted: contact.lastContacted || '',
      });
    }
  }, [contact, form]);
  
  // Form submission handler
  const onSubmit = (data: ContactFormValues) => {
    if (isNewContact) {
      // Create new contact
      createContactMutation.mutate(data);
    } else if (params?.id) {
      // Update existing contact
      updateContactMutation.mutate({ id: parseInt(params.id), data });
    }
  };
  
  // Delete contact handler
  const handleDelete = () => {
    if (!params?.id || isNewContact) return;
    
    if (window.confirm('Are you sure you want to delete this contact?')) {
      deleteContactMutation.mutate(parseInt(params.id));
    }
  };
  
  // Toggle favorite handler
  const toggleFavorite = () => {
    if (!params?.id || isNewContact) return;
    toggleFavoriteMutation.mutate(parseInt(params.id));
  };
  
  if (isLoading && !isNewContact) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary border-r-2 border-b-2 border-gray-200 mx-auto"></div>
          <p className="mt-4">Loading contact...</p>
        </div>
      </div>
    );
  }
  
  if (isError && !isNewContact) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500">Failed to load contact. Please try again.</p>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={() => navigate('/contacts')}
          >
            Back to Contacts
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/contacts')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        
        {!isNewContact && (
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <Button variant="outline" onClick={toggleFavorite}>
                  <Star className={`mr-2 h-4 w-4 ${contact?.favorite ? "text-yellow-500 fill-yellow-500" : ""}`} />
                  {contact?.favorite ? 'Remove favorite' : 'Add to favorites'}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      
      <Card className="w-full lg:max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>{isNewContact ? 'New Contact' : (isEditing ? 'Edit Contact' : contact?.name)}</CardTitle>
          <CardDescription>
            {isNewContact 
              ? 'Add a new contact to your address book' 
              : (isEditing 
                ? 'Update contact information' 
                : `Added on ${contact ? new Date(contact.createdAt).toLocaleDateString() : ''}`
              )
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing || isNewContact ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="personal">Personal</SelectItem>
                            <SelectItem value="work">Work</SelectItem>
                            <SelectItem value="family">Family</SelectItem>
                            <SelectItem value="friend">Friend</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="john@example.com" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 (555) 123-4567" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <FormControl>
                          <Input placeholder="Company name" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="jobTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Job title" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="col-span-1 md:col-span-2">
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main St, City, Country" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="birthday"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Birthday</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="lastContacted"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Contacted</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="favorite"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between space-y-0 rounded-md border p-4">
                        <div className="space-y-0.5">
                          <FormLabel>Favorite</FormLabel>
                          <FormDescription>Mark this contact as a favorite</FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Add notes about this contact" 
                          className="min-h-[100px]"
                          {...field} 
                          value={field.value || ''} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2">
                  {!isNewContact && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" disabled={createContactMutation.isPending || updateContactMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {createContactMutation.isPending || updateContactMutation.isPending 
                      ? 'Saving...' 
                      : 'Save Contact'
                    }
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start">
                <div className={`h-12 w-12 rounded-full flex items-center justify-center mr-4 ${
                  contact?.category === "work" ? "bg-blue-500/20" : "bg-purple-500/20"
                }`}>
                  <Contact2 className={`h-6 w-6 ${
                    contact?.category === "work" ? "text-blue-500" : "text-purple-500"
                  }`} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold flex items-center">
                    {contact?.name}
                    {contact?.favorite && <Star className="ml-2 h-4 w-4 text-yellow-500 fill-yellow-500" />}
                  </h3>
                  <Badge variant="outline" className={
                    contact?.category === "work" ? "border-blue-500/50 text-blue-500" : 
                    "border-purple-500/50 text-purple-500"
                  }>
                    {contact?.category}
                  </Badge>
                </div>
              </div>
              
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4">
                {contact?.email && (
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">{contact.email}</span>
                  </div>
                )}
                
                {contact?.phone && (
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">{contact.phone}</span>
                  </div>
                )}
                
                {contact?.company && (
                  <div className="flex items-center">
                    <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">{contact.company}</span>
                  </div>
                )}
                
                {contact?.jobTitle && (
                  <div className="flex items-center">
                    <Briefcase className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">{contact.jobTitle}</span>
                  </div>
                )}
                
                {contact?.address && (
                  <div className="flex items-center col-span-1 md:col-span-2">
                    <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">{contact.address}</span>
                  </div>
                )}
                
                {contact?.birthday && (
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">Birthday: {new Date(contact.birthday).toLocaleDateString()}</span>
                  </div>
                )}
                
                {contact?.lastContacted && (
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span className="text-sm">Last contacted: {new Date(contact.lastContacted).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              
              {contact?.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contact.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}