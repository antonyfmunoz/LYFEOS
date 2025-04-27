import React, { useState } from 'react';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function TaskTest() {
  const [, navigate] = useLocation();
  const initialContent = `# Task List Test
This page demonstrates Obsidian-style clickable task items.

## Getting Started
- [ ] Click this task to toggle its completion state
- [x] This task is already completed
- [ ] Tasks are saved automatically when toggled

## Project Tasks
- [ ] Implement clickable task items
- [ ] Add visual feedback when hovering over tasks
- [ ] Ensure keyboard navigation works properly
- [ ] Test with multiple task items

## Notes
- Regular list items remain normal
- Only task list items with \`- [ ]\` or \`- [x]\` are clickable
- The editor switches between edit and view modes with the button in the top right
`;

  const [content, setContent] = useState(initialContent);
  
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };
  
  const handleSave = () => {
    console.log('Content saved:', content);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <Button 
          variant="ghost" 
          className="text-primary"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <h1 className="text-2xl font-orbitron">Task List Demo</h1>
      </div>
      
      <div className="mb-4">
        <p className="text-sm text-slate-400 mb-2">
          Click on the checkboxes below to toggle task completion. This demonstrates the Obsidian-style clickable task items.
        </p>
      </div>
      
      <MarkdownEditor
        content={content}
        onChange={handleContentChange}
        onSave={handleSave}
        className="min-h-[500px]"
      />
      
      <p className="mt-4 text-sm text-slate-400">
        Task changes are automatically saved when toggled in view mode.
      </p>
    </div>
  );
}