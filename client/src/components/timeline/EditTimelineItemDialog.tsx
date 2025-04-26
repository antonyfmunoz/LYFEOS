import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Define timeline item type (same as in the parent component)
type TimelineItemType = 'mission' | 'quest' | 'event' | 'achievement' | 'chat' | 'life' | 'journal' | 'ritual' | 'knowledge' | 'goal';

interface TimelineItem {
  id: string;
  date: string;
  title: string;
  description: string;
  content?: string;
  category: string;
  color: string;
  type: TimelineItemType;
  icon: React.ReactNode;
}

interface EditTimelineItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: TimelineItem | null;
  onSave: (updatedItem: TimelineItem) => void;
}

const EditTimelineItemDialog: React.FC<EditTimelineItemDialogProps> = ({
  isOpen,
  onClose,
  item,
  onSave
}) => {
  // Local form state
  const [formData, setFormData] = useState<{
    title: string;
    date: string;
    description: string;
    content: string;
  }>({
    title: '',
    date: '',
    description: '',
    content: '',
  });

  // Update form data when item or dialog open state changes
  useEffect(() => {
    if (item && isOpen) {
      // Reset the form with fresh data when dialog opens
      setFormData({
        title: item.title || '',
        date: item.date || '',
        description: item.description || '',
        content: item.content || '',
      });
      console.log("Form data initialized with:", item.title);
    }
  }, [item, isOpen]);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    console.log(`Updating ${name} field to:`, value);
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = () => {
    if (!item) return;
    
    const updatedItem: TimelineItem = {
      ...item,
      title: formData.title,
      date: formData.date,
      description: formData.description,
      content: formData.content,
    };
    
    onSave(updatedItem);
    onClose();
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-background text-foreground border-primary/40 shadow-[0_0_30px_rgba(0,0,0,0.3)]">
        <DialogHeader>
          <DialogTitle className="font-orbitron">Edit Timeline Item</DialogTitle>
          <DialogDescription>
            Make changes to the timeline item details below.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Title
            </Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="col-span-3 bg-background/50 border-primary/30 focus:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="date" className="text-right">
              Date
            </Label>
            <Input
              id="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="col-span-3 bg-background/50 border-primary/30 focus:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>
          
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right mt-2">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="col-span-3 min-h-[80px] bg-background/50 border-primary/30 focus:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>
          
          {item.content !== undefined && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="content" className="text-right mt-2">
                Content
              </Label>
              <Textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleChange}
                className="col-span-3 min-h-[120px] bg-background/50 border-primary/30 focus:border-primary/60 focus-visible:ring-1 focus-visible:ring-primary/30"
              />
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-muted/20 hover:text-destructive hover:shadow-[0_0_10px_rgba(255,0,0,0.3)] hover:bg-muted/30"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            className="bg-primary/20 text-primary hover:bg-primary/30 hover:shadow-[0_0_10px_rgba(255,255,0,0.5)]"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTimelineItemDialog;