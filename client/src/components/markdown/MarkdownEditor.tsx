import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Button } from '@/components/ui/button';
import { PenLine, Eye, Save, CheckSquare } from 'lucide-react';
import { useLocation } from 'wouter';
import './markdown-styles.css';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  autoSaveInterval?: number; // in milliseconds
}

// Create a custom renderer for task lists to match Obsidian style
const TaskListRenderer = ({ checked, children }: { checked: boolean; children: React.ReactNode }) => (
  <div className="obsidian-task-list-item">
    <span className={`task-checkbox ${checked ? 'checked' : ''}`}>
      {checked ? '✓' : ' '}
    </span>
    <span className={`task-text ${checked ? 'completed' : ''}`}>{children}</span>
  </div>
);

export default function MarkdownEditor({
  content,
  onChange,
  onSave,
  readOnly = false,
  placeholder = 'Start typing...',
  className = '',
  autoSaveInterval = 5000, // Default to 5 seconds
}: MarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState(content);
  const [isDirty, setIsDirty] = useState(false);
  const lastSavedContentRef = useRef(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();
  
  // Auto-save functionality
  useEffect(() => {
    if (!isDirty || !onSave) return;
    
    const autoSaveTimer = setTimeout(() => {
      onSave();
      lastSavedContentRef.current = editableContent;
      setIsDirty(false);
    }, autoSaveInterval);
    
    return () => clearTimeout(autoSaveTimer);
  }, [editableContent, isDirty, onSave, autoSaveInterval]);
  
  // Update local state when content prop changes
  useEffect(() => {
    setEditableContent(content);
    lastSavedContentRef.current = content;
  }, [content]);
  
  // Handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditableContent(newContent);
    onChange(newContent);
    setIsDirty(newContent !== lastSavedContentRef.current);
  };
  
  // Toggle between edit and view modes
  const toggleEditMode = () => {
    if (isEditing && isDirty) {
      // Save changes when exiting edit mode if the content has changed
      onSave?.();
      setIsDirty(false);
    }
    setIsEditing(!isEditing);
  };
  
  // Save content
  const handleSave = () => {
    onSave?.();
    lastSavedContentRef.current = editableContent;
    setIsDirty(false);
    setIsEditing(false);
  };
  
  // Process wiki-style links - converts [[Link Name]] to links
  const processWikiLinks = (text: string) => {
    return text.replace(
      /\[\[(.*?)\]\]/g, 
      (match, p1) => {
        const slug = p1.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
        return `[${p1}](/mission-page/${slug})`;
      }
    );
  };

  // Handle tab key in the textarea for indentation
  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      // Insert tab character at cursor
      const newContent = 
        editableContent.substring(0, start) + 
        '  ' + 
        editableContent.substring(end);
      
      setEditableContent(newContent);
      onChange(newContent);
      setIsDirty(true);
      
      // Set cursor position after the inserted tab
      setTimeout(() => {
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = start + 2;
      }, 0);
    }
  };
  
  // Convert task list items format on click (toggle between [ ] and [x])
  const handleTaskToggle = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Check if the clicked element is a task checkbox
    if (target.classList.contains('task-checkbox') || 
        target.parentElement?.classList.contains('obsidian-task-list-item')) {
      
      if (isEditing || readOnly) return; // Only toggle in view mode and when not readOnly
      
      const taskElement = 
        target.classList.contains('task-checkbox') 
          ? target.parentElement 
          : target;
          
      const isChecked = taskElement?.querySelector('.task-checkbox')?.classList.contains('checked');
      
      // Find the task item in the content and toggle it
      const lines = editableContent.split('\n');
      let updatedContent = '';
      let found = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (!found && 
            ((isChecked && line.match(/^- \[x\]/)) || 
             (!isChecked && line.match(/^- \[ \]/)))) {
          // Toggle the checkbox state
          const newLine = isChecked 
            ? line.replace(/^- \[x\]/, '- [ ]') 
            : line.replace(/^- \[ \]/, '- [x]');
          
          updatedContent += newLine + '\n';
          found = true;
        } else {
          updatedContent += line + (i < lines.length - 1 ? '\n' : '');
        }
      }
      
      if (found) {
        setEditableContent(updatedContent);
        onChange(updatedContent);
        setIsDirty(true);
        
        // Auto-save on task toggle
        if (onSave) {
          onSave();
          lastSavedContentRef.current = updatedContent;
          setIsDirty(false);
        }
      }
    }
  }, [editableContent, isEditing, onChange, onSave, readOnly]);
  
  // Process the content for display
  const processedContent = processWikiLinks(editableContent);
  
  // Allow clicking wiki links in view mode
  const handleMarkdownClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Handle task toggles
    handleTaskToggle(e);
    
    // Handle wiki link clicks
    if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('/mission-page/')) {
      e.preventDefault();
      navigate(target.getAttribute('href') || '');
    }
  };
  
  // Auto-focus on textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);
  
  return (
    <div className={`relative rounded-lg border border-slate-700/50 ${className}`}>
      {/* Toolbar */}
      <div className="flex justify-between items-center p-2 border-b border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center text-xs text-slate-400">
          {isDirty && <span className="mr-2 text-amber-400">●</span>}
          {isEditing ? 'Edit Mode' : 'View Mode'}
        </div>
        <div className="flex space-x-2">
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={toggleEditMode}
                title={isEditing ? "Switch to View Mode" : "Switch to Edit Mode"}
              >
                {isEditing ? <Eye className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              </Button>
              
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleSave}
                  title="Save"
                >
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Editor / Viewer */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editableContent}
          onChange={handleContentChange}
          onKeyDown={handleTabKey}
          placeholder={placeholder}
          className="w-full h-[500px] p-4 bg-transparent focus:outline-none resize-vertical font-mono text-sm"
          disabled={readOnly}
        />
      ) : (
        <div 
          className="markdown-preview p-4 prose prose-invert prose-sm max-w-none overflow-auto"
          style={{ maxHeight: '500px' }}
          onClick={handleMarkdownClick}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              li: ({ node, className, children, ...props }: any) => {
                if (props.checked !== undefined) {
                  return <TaskListRenderer checked={props.checked}>{children}</TaskListRenderer>;
                }
                return <li className={className} {...props}>{children}</li>;
              }
            }}
          >
            {processedContent || placeholder}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}