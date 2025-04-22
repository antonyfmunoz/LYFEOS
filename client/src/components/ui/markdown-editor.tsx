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
    // No bullet functionality
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
        "relative min-h-[100px] group",
        className
      )}
      style={{ minHeight }}
    >
      {isEditing ? (
        <div className="relative rounded-md border border-primary/30 bg-background">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            className="w-full h-full min-h-[inherit] p-3 bg-transparent text-foreground resize-none outline-none border-none rounded-md placeholder:text-muted-foreground font-mono"
            placeholder={placeholder}
            style={{ minHeight }}
          />
          <div className="absolute top-2 right-2 flex space-x-1">
            <button
              onClick={handleSaveClick}
              className="p-1 bg-primary/10 rounded hover:bg-primary/20 text-primary"
              title="Save (Esc)"
            >
              <Save size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative rounded-md border border-primary/30 bg-background">
          <div className="p-3 cursor-default" onDoubleClick={handleDoubleClick}>
            {value ? (
              <ObsidianMarkdown className="dark:text-[#D6F4FF] light:text-slate-700">
                {value}
              </ObsidianMarkdown>
            ) : (
              <div className="dark:text-[#7DAAB2]/50 light:text-slate-400/80">{placeholder}</div>
            )}
            <button 
              onClick={handleEditClick}
              className="absolute top-2 right-2 p-1 bg-primary/10 rounded hover:bg-primary/20 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit (Double-click text)"
            >
              <Edit2 size={14} />
            </button>
          </div>
        </div>
      )}
      
      {/* Small hint in bottom-right corner when editing */}
      {isEditing && (
        <div className="absolute bottom-2 right-2 text-xs dark:text-[#7DAAB2]/50 light:text-slate-400/80">
          Ctrl+Enter or Esc to save
        </div>
      )}
    </div>
  );
}