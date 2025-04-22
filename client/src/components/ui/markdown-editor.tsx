import React, { useState, useRef, useEffect } from 'react';
import { ObsidianMarkdown } from './obsidian-markdown';
import { cn } from '@/lib/utils';
import { Edit2, Save, CheckSquare } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  autoBullets?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = "100px",
  autoBullets = false,
}: MarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Focus the textarea and set cursor position when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      
      // Initial bullet functionality completely disabled
      textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, [isEditing, cursorPosition, value, onChange]);

  // Save cursor position when input changes
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Bullet handling completely disabled
    setCursorPosition(e.target.selectionStart || 0);
  };

  // Toggle to edit mode
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  // Toggle to read mode
  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  // Handle double-clicking on the read view to edit
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  // Handle common keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Detect common Markdown shortcuts and format
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      insertFormatting('**', '**');
    } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      insertFormatting('*', '*');
    } else if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      insertFormatting('[', '](url)');
    } else if (e.key === 't' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      insertTaskCheckbox();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      setIsEditing(false);
    }
    // All bullet-related functionality has been removed
  };

  // Insert auto bullet on Enter - Now modified to just add a normal newline
  const insertAutoBullet = () => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Get the text before and after cursor
    const textBeforeCursor = value.substring(0, start);
    const textAfterCursor = value.substring(end);
    
    // Just add a simple newline without any bullets
    const newValue = textBeforeCursor + '\n' + textAfterCursor;
    onChange(newValue);
    
    // Position cursor after the newline
    const newCursorPos = start + 1;
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Insert task checkbox at cursor position
  const insertTaskCheckbox = () => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    const before = value.substring(0, start);
    const after = value.substring(end);
    
    // Check if we're at the beginning of a line
    const isStartOfLine = start === 0 || value.charAt(start - 1) === '\n';
    const linePrefix = isStartOfLine ? '' : '\n';
    
    const newValue = before + linePrefix + '- [ ] ' + selectedText + after;
    onChange(newValue);
    
    // Move cursor to after the checkbox
    const newCursorPos = start + linePrefix.length + 6 + selectedText.length;
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Insert formatting characters around selection or at cursor position
  const insertFormatting = (prefix: string, suffix: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    const before = value.substring(0, start);
    const after = value.substring(end);
    
    const newValue = before + prefix + selectedText + suffix + after;
    onChange(newValue);
    
    // Move cursor to the appropriate position
    setTimeout(() => {
      if (selectedText) {
        // If text was selected, put cursor after the inserted formatting
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        // If no text was selected, put cursor between prefix and suffix
        const newCursorPos = start + prefix.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Detect clicks outside to exit edit mode
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsEditing(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div 
      ref={wrapperRef}
      className={cn(
        "relative inline-block w-full",
        className
      )}
      style={{ minHeight }}
    >
      <div className="relative">
        {isEditing ? (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[inherit] px-3 py-2 bg-background text-foreground resize-none outline-none rounded-md 
                        border border-primary/30 focus:border-primary/50 placeholder:text-muted-foreground font-mono"
              onClick={(e) => {
                // Bullet handling disabled
              }}
              onMouseDown={(e) => {
                // Bullet handling disabled
              }}
              onMouseMove={(e) => {
                // Bullet handling disabled
              }}
              style={{ minHeight }}
            />
            <button
              onClick={handleSaveClick}
              className="absolute right-0 top-0 h-full px-3 text-primary/70 hover:text-primary hover:bg-primary/10"
              title="Save (Esc)"
            >
              <Save className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <div 
              className="w-full min-h-[inherit] px-3 py-2 bg-background rounded-md border border-primary/30 cursor-pointer"
              onDoubleClick={handleDoubleClick}
              style={{ minHeight }}
            >
              {value ? (
                <ObsidianMarkdown className="dark:text-[#D6F4FF] light:text-slate-700">
                  {value}
                </ObsidianMarkdown>
              ) : (
                <div className="dark:text-[#7DAAB2]/50 light:text-slate-400/80">{placeholder}</div>
              )}
            </div>
            <button 
              onClick={handleEditClick}
              className="absolute right-0 top-0 h-full px-3 text-primary/70 hover:text-primary hover:bg-primary/10"
              title="Edit (Double-click text)"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      
      {/* Small hint in bottom-right corner when editing */}
      {isEditing && (
        <div className="absolute bottom-2 right-2 text-xs dark:text-[#7DAAB2]/50 light:text-slate-400/80">
          Ctrl+Enter or Esc to save
        </div>
      )}
    </div>
  );
}