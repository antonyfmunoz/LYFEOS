import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useAuth } from '@/lib/authContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ArrowLeft, Calendar as CalendarIcon, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Tracker schema for form validation
const trackerFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  currentValue: z.number().min(0, 'Current value must be 0 or greater'),
  targetValue: z.number().min(1, 'Target value must be greater than 0'),
  unit: z.string().default(''),
  startDate: z.date(),
  endDate: z.date().optional().nullable(),
  color: z.string().default('#00e0ff'),
  favorite: z.boolean().default(false),
});

type TrackerFormValues = z.infer<typeof trackerFormSchema>;

export default function ProgressTrackerFormPage() {
  const [, navigate] = useLocation();
  const { id } = useParams<{id: string}>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditMode = !!id;
  
  // Define the interface for API response
  interface TrackerResponse {
    progressTracker: {
      id: number;
      userId: number;
      title: string;
      description?: string;
      category: string;
      currentValue: number;
      targetValue: number;
      unit: string;
      startDate: string;
      endDate?: string;
      color: string;
      favorite: boolean;
      createdAt: string;
      updatedAt: string;
    }
  }
  
  // Fetch tracker if in edit mode
  const { data: trackerData, isLoading: isLoadingTracker } = useQuery<TrackerResponse>({
    queryKey: ['/api/progress-trackers', id],
    enabled: !!id && !!user,
  });
  
  const form = useForm<TrackerFormValues>({
    resolver: zodResolver(trackerFormSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'personal',
      currentValue: 0,
      targetValue: 100,
      unit: '',
      startDate: new Date(),
      endDate: null,
      color: '#00e0ff',
      favorite: false,
    },
  });
  
  // Pre-populate form with tracker data when editing
  useEffect(() => {
    if (isEditMode && trackerData?.progressTracker) {
      const tracker = trackerData.progressTracker;
      form.reset({
        title: tracker.title,
        description: tracker.description || '',
        category: tracker.category,
        currentValue: tracker.currentValue,
        targetValue: tracker.targetValue,
        unit: tracker.unit,
        startDate: new Date(tracker.startDate),
        endDate: tracker.endDate ? new Date(tracker.endDate) : null,
        color: tracker.color,
        favorite: tracker.favorite,
      });
    }
  }, [isEditMode, trackerData, form]);
  
  // Create tracker mutation
  const createMutation = useMutation({
    mutationFn: (data: TrackerFormValues) => {
      return apiRequest('/api/progress-trackers', {
        method: 'POST', 
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'progress-trackers'] });
      toast({
        title: 'Success',
        description: 'Progress tracker created successfully',
      });
      navigate('/progress-trackers');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create progress tracker',
        variant: 'destructive',
      });
      console.error('Error creating tracker:', error);
    },
  });
  
  // Update tracker mutation
  const updateMutation = useMutation({
    mutationFn: (data: TrackerFormValues) => {
      return apiRequest(`/api/progress-trackers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'progress-trackers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/progress-trackers', id] });
      toast({
        title: 'Success',
        description: 'Progress tracker updated successfully',
      });
      navigate('/progress-trackers');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update progress tracker',
        variant: 'destructive',
      });
      console.error('Error updating tracker:', error);
    },
  });
  
  // Delete tracker mutation
  const deleteMutation = useMutation({
    mutationFn: () => {
      return apiRequest(`/api/progress-trackers/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'progress-trackers'] });
      toast({
        title: 'Success',
        description: 'Progress tracker deleted successfully',
      });
      navigate('/progress-trackers');
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete progress tracker',
        variant: 'destructive',
      });
      console.error('Error deleting tracker:', error);
    },
  });
  
  // Handle form submission
  const onSubmit = (values: TrackerFormValues) => {
    if (isEditMode) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };
  
  // Category options
  const categoryOptions = [
    { value: 'personal', label: 'Personal' },
    { value: 'professional', label: 'Professional' },
    { value: 'health', label: 'Health' },
    { value: 'fitness', label: 'Fitness' },
    { value: 'financial', label: 'Financial' },
    { value: 'learning', label: 'Learning' },
    { value: 'other', label: 'Other' },
  ];
  
  // Color options
  const colorOptions = [
    { value: '#00e0ff', label: 'Cyan (Default)' }, // Primary
    { value: '#ff5555', label: 'Red' },
    { value: '#50fa7b', label: 'Green' },
    { value: '#bd93f9', label: 'Purple' },
    { value: '#ffb86c', label: 'Orange' },
    { value: '#f1fa8c', label: 'Yellow' },
    { value: '#8be9fd', label: 'Light Blue' },
    { value: '#ff79c6', label: 'Pink' },
  ];
  
  return (
    <div className="container py-6 max-w-2xl">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/progress-trackers')} 
        className="mb-6 hover:bg-primary hover:text-background"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Progress Trackers
      </Button>
      
      <Card className="shadow-md border-slate-700/20">
        <CardHeader>
          <CardTitle className="text-xl font-orbitron">
            {isEditMode ? 'Edit Progress Tracker' : 'Create Progress Tracker'}
          </CardTitle>
        </CardHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="E.g., Daily Steps, Weight Loss, Reading Goal" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Add details about your tracking goal..."
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categoryOptions.map(category => (
                            <SelectItem key={category.value} value={category.value}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <div className="flex items-center">
                              <div 
                                className="w-4 h-4 rounded-full mr-2"
                                style={{ backgroundColor: field.value }}
                              />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {colorOptions.map(color => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center">
                                <div 
                                  className="w-4 h-4 rounded-full mr-2"
                                  style={{ backgroundColor: color.value }}
                                />
                                {color.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="currentValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Value</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(Number(e.target.value))} 
                          min={0}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="targetValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Value</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={e => field.onChange(Number(e.target.value))} 
                          min={1}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="kg, steps, etc." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Start Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date (Optional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < form.getValues().startDate || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="favorite"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Favorite</FormLabel>
                      <FormDescription>
                        Mark this tracker as a favorite for easy access
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
            
            <CardFooter className="flex justify-between border-t p-4">
              {isEditMode && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this tracker?')) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              )}
              
              <div className={isEditMode ? '' : 'ml-auto'}>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {isEditMode ? 'Update' : 'Create'} Tracker
                </Button>
              </div>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}