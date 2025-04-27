import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Button } from '@/components/ui/button';
import { PenLine, Eye, Save } from 'lucide-react';
import { useLocation } from 'wouter';
import ObsidianTaskList from './ObsidianTaskList';
import './markdown-styles.css';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  autoSaveInterval?: number; // in milliseconds
  autoBullets?: boolean; // Enable automatic bullet points
}

export default function MarkdownEditor({
  content,
  onChange,
  onSave,
  readOnly = false,
  placeholder = 'Start typing...',
  className = '',
  autoSaveInterval = 5000, // Default to 5 seconds
  autoBullets = false, // Default auto bullets to off
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

  // Handle keyboard shortcuts in the textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle tab key for indentation
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
    
    // Handle Markdown shortcuts (Ctrl+B for bold)
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = editableContent.substring(start, end);
      
      const newContent = 
        editableContent.substring(0, start) + 
        `**${selectedText}**` + 
        editableContent.substring(end);
      
      setEditableContent(newContent);
      onChange(newContent);
      setIsDirty(true);
      
      setTimeout(() => {
        textarea.setSelectionRange(start + 2, end + 2);
      }, 0);
    }
  };
  
  // Process the content for display
  const processedContent = processWikiLinks(editableContent);
  
  // Toggle a task checkbox in the markdown content
  const handleTaskToggle = (index: number, checked: boolean) => {
    if (readOnly) return;
    
    const lines = editableContent.split('\n');
    let taskCount = 0;
    
    const newLines = lines.map(line => {
      // Check if this line is a task
      if (line.match(/^- \[[ x]\]/)) {
        // If this is the task we're toggling
        if (taskCount === index) {
          // Toggle the checkbox
          return checked 
            ? line.replace(/^- \[ \]/, '- [x]') 
            : line.replace(/^- \[x\]/, '- [ ]');
        }
        taskCount++;
      }
      return line;
    });
    
    const newContent = newLines.join('\n');
    setEditableContent(newContent);
    onChange(newContent);
    setIsDirty(true);
    
    // Auto-save on task toggle
    if (onSave) {
      onSave();
      lastSavedContentRef.current = newContent;
      setIsDirty(false);
    }
  };

  // Handle wiki link clicks
  const handleWikiLinkClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
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
      <div className="relative">
        <div className="border border-primary/30 rounded-md overflow-hidden bg-background">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editableContent}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full h-[500px] p-4 bg-transparent resize-vertical border-none outline-none dark:text-[#D6F4FF] light:text-slate-700 text-base"
              disabled={readOnly}
            />
          ) : (
            <div 
              className="markdown-preview p-4 prose prose-invert prose-sm max-w-none overflow-auto"
              style={{ maxHeight: '500px' }}
              onClick={handleWikiLinkClick}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  li: ({ node, className, children, ...props }: any) => {
                    // Handle task list items
                    if (props.checked !== undefined) {
                      // Find the task index by counting preceding task items
                      let taskIndex = 0;
                      const lines = editableContent.split('\n');
                      let lineIndex = 0;
                      
                      // Search for this task in the content
                      for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.match(/^- \[[ x]\]/)) {
                          // If we found a task that matches our current state
                          const isCurrentChecked = line.includes('[x]');
                          if (isCurrentChecked === props.checked) {
                            // If we've found enough matching tasks to reach our index
                            if (lineIndex === taskIndex) {
                              taskIndex = lineIndex;
                              break;
                            }
                            taskIndex++;
                          }
                          lineIndex++;
                        }
                      }
                      
                      return (
                        <ObsidianTaskList
                          checked={props.checked}
                          onChange={(newChecked) => handleTaskToggle(taskIndex, newChecked)}
                          readOnly={readOnly}
                        >
                          {children}
                        </ObsidianTaskList>
                      );
                    }
                    // Regular list items
                    return <li className={className} {...props}>{children}</li>;
                  }
                }}
              >
                {processedContent || placeholder}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}