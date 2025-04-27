import React, { useState } from 'react';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import { toast } from '@/hooks/use-toast';

const TaskTestPage: React.FC = () => {
  const [content, setContent] = useState(`# Obsidian Task List Demo

This is a demonstration of the Obsidian-style task list functionality.

## Try checking/unchecking these tasks:

- [ ] Task 1: Click this checkbox to toggle it
- [x] Task 2: This task is already completed
- [ ] Task 3: Another uncompleted task
- [x] Task 4: Another completed task

## Here's a mixed list:

- Regular bullet point
- [ ] Task item in a mixed list
- Another regular bullet point
- [x] Completed task in a mixed list

## Wiki Links Demo

You can also try clicking on a wiki link like [[Test Page]] to see how it works.
  `);

  const handleSave = () => {
    toast({
      title: 'Content saved',
      description: 'Your markdown content has been saved successfully',
      duration: 3000,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6 text-primary">Obsidian Task List Test</h1>
      <p className="mb-4 text-slate-300">
        This page demonstrates the Obsidian-style task list functionality.
        You can toggle tasks by clicking on the checkboxes in view mode.
      </p>
      
      <div className="mb-8">
        <MarkdownEditor
          content={content}
          onChange={setContent}
          onSave={handleSave}
          placeholder="Start typing your markdown content here..."
          className="bg-slate-900/50 border-slate-700"
        />
      </div>
      
      <div className="mt-8 text-sm text-slate-400">
        <h2 className="text-xl font-semibold mb-2 text-primary">How it works:</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Click the pencil icon to edit the content</li>
          <li>Click the eye icon to view the rendered markdown</li>
          <li>In view mode, click on task checkboxes to toggle them</li>
          <li>Tasks are saved using the Markdown format: <code>- [ ]</code> or <code>- [x]</code></li>
          <li>Wiki links use the format: <code>[[Link Name]]</code></li>
        </ul>
      </div>
    </div>
  );
};

export default TaskTestPage;