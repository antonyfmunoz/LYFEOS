import React, { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomTimePicker } from "@/components/ui/custom-time-picker";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { CalendarEvent } from "@/lib/types";
import { format } from "date-fns";
import { Plus, Edit, Trash, Clock, ArrowLeft, Info, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  // Set the page title
  usePageTitle('Calendar');
  
  const { events, addEvent, updateEvent, deleteEvent } = useLYFEOS();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);
  const [isInfoEventOpen, setIsInfoEventOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  // Form states
  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventDuration, setEventDuration] = useState("1 hour");
  const [eventCategory, setEventCategory] = useState<"work" | "personal" | "health">("work");
  
  // Get events for the selected date
  const getEventsForDate = () => {
    if (!date) return [];
    
    // In a real app, we would filter based on the actual date
    // For now, we'll just return all events as a simplification
    return events;
  };
  
  const currentDateEvents = getEventsForDate();
  
  // Reset form state
  const resetForm = () => {
    setEventTitle("");
    setEventDescription("");
    setEventStartTime("09:00");
    setEventDuration("1 hour");
    setEventCategory("work");
  };
  
  // Open the add event dialog
  const handleAddEventClick = () => {
    resetForm();
    setIsAddEventOpen(true);
  };
  
  // Handle saving a new event
  const handleSaveEvent = () => {
    if (!eventTitle.trim() || !eventStartTime) return;
    
    const newEvent = {
      title: eventTitle,
      description: eventDescription,
      startTime: eventStartTime,
      duration: eventDuration,
      category: eventCategory,
    };
    
    addEvent(newEvent);
    setIsAddEventOpen(false);
    resetForm();
  };
  
  // Handle editing an event
  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventTitle(event.title);
    setEventDescription(event.description);
    setEventStartTime(event.startTime);
    setEventDuration(event.duration);
    setEventCategory(event.category);
    setIsEditEventOpen(true);
  };
  
  // Handle updating an event
  const handleUpdateEvent = () => {
    if (!selectedEvent || !eventTitle.trim() || !eventStartTime) return;
    
    updateEvent(selectedEvent.id, {
      title: eventTitle,
      description: eventDescription,
      startTime: eventStartTime,
      duration: eventDuration,
      category: eventCategory,
    });
    
    setIsEditEventOpen(false);
    setSelectedEvent(null);
    resetForm();
  };
  
  // Handle deleting an event
  const handleDeleteEvent = () => {
    if (!selectedEvent) return;
    
    deleteEvent(selectedEvent.id);
    setIsEditEventOpen(false);
    setSelectedEvent(null);
  };
  
  // Handle viewing event info
  const handleViewEventInfo = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the edit dialog
    setSelectedEvent(event);
    setIsInfoEventOpen(true);
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/dashboard" className="mr-3 flex items-center text-[#7DAAB2] hover:text-primary transition">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-orbitron">Calendar</h1>
        </div>
        <Button 
          onClick={handleAddEventClick}
          className="bg-primary/20 text-primary hover:bg-primary hover:text-background"
        >
          <Plus className="mr-2 h-4 w-4" /> Add Event
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Calendar widget */}
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="mx-auto bg-transparent"
          />
        </div>
        
        {/* Events for selected date */}
        <div className="glassmorphic rounded-xl p-4 neon-border md:col-span-2">
          <h2 className="text-xl font-orbitron mb-4">
            {date ? format(date, "MMMM d, yyyy") : "Select a date"}
          </h2>
          
          {currentDateEvents.length === 0 ? (
            <p className="text-[#7DAAB2] py-8 text-center">No events scheduled for this date.</p>
          ) : (
            <div className="space-y-4">
              {currentDateEvents.map((event) => (
                <div 
                  key={event.id} 
                  className={cn(
                    "flex items-start p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:bg-card/20",
                    event.category === "work" ? "border-primary" : 
                    event.category === "personal" ? "border-[#7e57c2]" : 
                    "border-[#EC4899]"
                  )}
                  onClick={() => handleEditEvent(event)}
                >
                  <div className="min-w-[70px] text-sm font-mono text-[#D6F4FF] mr-4">
                    {event.startTime}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{event.title}</h3>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-3.5 w-3.5 text-[#7DAAB2]" />
                        <span className="text-xs text-[#7DAAB2]">{event.duration}</span>
                        <Link href={`/mission/${event.id}`} onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 rounded-full text-[#7DAAB2] hover:bg-primary hover:text-background"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <p className="text-sm text-[#7DAAB2] mt-1">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Add Event Dialog */}
      <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
        <DialogContent className="glassmorphic backdrop-blur-lg border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron">Add New Event</DialogTitle>
            <DialogDescription>
              Create a new event on your calendar
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input 
                id="title" 
                value={eventTitle} 
                onChange={(e) => setEventTitle(e.target.value)} 
                placeholder="Enter event title" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input 
                id="description" 
                value={eventDescription} 
                onChange={(e) => setEventDescription(e.target.value)} 
                placeholder="Enter event description" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="time">Start Time</Label>
              <CustomTimePicker 
                value={eventStartTime} 
                onChange={setEventStartTime} 
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Select value={eventDuration} onValueChange={setEventDuration}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15 mins">15 minutes</SelectItem>
                      <SelectItem value="30 mins">30 minutes</SelectItem>
                      <SelectItem value="45 mins">45 minutes</SelectItem>
                      <SelectItem value="1 hour">1 hour</SelectItem>
                      <SelectItem value="1.5 hours">1.5 hours</SelectItem>
                      <SelectItem value="2 hours">2 hours</SelectItem>
                      <SelectItem value="3 hours">3 hours</SelectItem>
                      <SelectItem value="4 hours">4 hours</SelectItem>
                      <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {eventDuration === "custom" && (
                  <Input
                    placeholder="e.g. 2.5 hours"
                    value={eventDuration === "custom" ? "" : eventDuration}
                    onChange={(e) => setEventDuration(e.target.value)}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={eventCategory} onValueChange={(value: any) => setEventCategory(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work" className="text-primary">Work</SelectItem>
                  <SelectItem value="personal" className="text-[#7e57c2]">Personal</SelectItem>
                  <SelectItem value="health" className="text-[#EC4899]">Health</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddEventOpen(false)}
              className="hover:bg-primary hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEvent}
              className="bg-primary/20 text-primary hover:bg-primary hover:text-background"
            >
              Add Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Event Dialog */}
      <Dialog open={isEditEventOpen} onOpenChange={setIsEditEventOpen}>
        <DialogContent className="glassmorphic backdrop-blur-lg border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron">Edit Event</DialogTitle>
            <DialogDescription>
              Modify your calendar event
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input 
                id="edit-title" 
                value={eventTitle} 
                onChange={(e) => setEventTitle(e.target.value)} 
                placeholder="Enter event title" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input 
                id="edit-description" 
                value={eventDescription} 
                onChange={(e) => setEventDescription(e.target.value)} 
                placeholder="Enter event description" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-time">Start Time</Label>
              <CustomTimePicker 
                value={eventStartTime} 
                onChange={setEventStartTime} 
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-duration">Duration</Label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <Select value={eventDuration} onValueChange={setEventDuration}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15 mins">15 minutes</SelectItem>
                      <SelectItem value="30 mins">30 minutes</SelectItem>
                      <SelectItem value="45 mins">45 minutes</SelectItem>
                      <SelectItem value="1 hour">1 hour</SelectItem>
                      <SelectItem value="1.5 hours">1.5 hours</SelectItem>
                      <SelectItem value="2 hours">2 hours</SelectItem>
                      <SelectItem value="3 hours">3 hours</SelectItem>
                      <SelectItem value="4 hours">4 hours</SelectItem>
                      <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {eventDuration === "custom" && (
                  <Input
                    placeholder="e.g. 2.5 hours"
                    value={eventDuration === "custom" ? "" : eventDuration}
                    onChange={(e) => setEventDuration(e.target.value)}
                    className="flex-1"
                  />
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select value={eventCategory} onValueChange={(value: any) => setEventCategory(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work" className="text-primary">Work</SelectItem>
                  <SelectItem value="personal" className="text-[#7e57c2]">Personal</SelectItem>
                  <SelectItem value="health" className="text-[#EC4899]">Health</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteEvent}
              className="sm:mr-auto"
            >
              <Trash className="h-4 w-4 mr-2" /> Delete
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditEventOpen(false)}
              className="hover:bg-primary hover:text-background"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateEvent}
              className="bg-primary/20 text-primary hover:bg-primary hover:text-background"
            >
              <Edit className="mr-2 h-4 w-4" /> Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Event Info Dialog */}
      <Dialog open={isInfoEventOpen} onOpenChange={setIsInfoEventOpen}>
        <DialogContent className="glassmorphic backdrop-blur-lg border-primary/30 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-orbitron">
              {selectedEvent?.title}
            </DialogTitle>
            <DialogDescription>
              Event details
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4 py-2">
              <div className="flex items-center text-muted-foreground">
                <Clock className="h-4 w-4 mr-2" />
                <span>
                  {selectedEvent.startTime} • {selectedEvent.duration}
                </span>
              </div>
              
              <div className="p-4 bg-card/10 rounded-md">
                <p className="text-muted-foreground">
                  {selectedEvent.description || "No description provided."}
                </p>
              </div>
              
              <div className="flex justify-between items-center">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs",
                  selectedEvent.category === "work" ? "bg-primary/10 text-primary" : 
                  selectedEvent.category === "personal" ? "bg-[#7e57c2]/10 text-[#7e57c2]" : 
                  "bg-[#EC4899]/10 text-[#EC4899]"
                )}>
                  {selectedEvent.category.charAt(0).toUpperCase() + selectedEvent.category.slice(1)}
                </span>
                
                <Link href={`/mission/${selectedEvent.id}`}>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="text-primary border-primary/30 hover:bg-primary hover:text-background"
                  >
                    View Mission <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="hover:bg-primary hover:text-background">Close</Button>
            </DialogClose>
            <Button 
              onClick={() => {
                setIsInfoEventOpen(false);
                if (selectedEvent) {
                  handleEditEvent(selectedEvent);
                }
              }}
              className="bg-primary/20 text-primary hover:bg-primary hover:text-background"
            >
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}