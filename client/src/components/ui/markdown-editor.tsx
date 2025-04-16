import React, { useState, useRef, useEffect } from 'react';
import { ObsidianMarkdown } from './obsidian-markdown';
import { cn } from '@/lib/utils';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = "100px",
}: MarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Focus the textarea and set cursor position when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
    }
  }, [isEditing, cursorPosition]);

  // Save cursor position when input changes
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setCursorPosition(e.target.selectionStart || 0);
  };

  // Toggle between edit and preview mode
  const handleContainerClick = (e: React.MouseEvent) => {
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
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
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
        "relative rounded-md border border-primary/30 bg-[#00141A] min-h-[100px]",
        className
      )}
      style={{ minHeight }}
      onClick={handleContainerClick}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="p-3 w-full h-full focus:outline-none focus:ring-0 bg-[#00141A] text-[#D6F4FF] resize-y placeholder-[#7DAAB2]/50 border-0 rounded-md"
          style={{ minHeight }}
        />
      ) : (
        <div className="p-3 cursor-text">
          {value ? (
            <ObsidianMarkdown className="text-[#D6F4FF]">
              {value}
            </ObsidianMarkdown>
          ) : (
            <div className="text-[#7DAAB2]/50">{placeholder}</div>
          )}
        </div>
      )}
      
      {/* Small hint in bottom-right corner when editing */}
      {isEditing && (
        <div className="absolute bottom-2 right-2 text-xs text-[#7DAAB2]/50">
          Esc to exit
        </div>
      )}
    </div>
  );
}