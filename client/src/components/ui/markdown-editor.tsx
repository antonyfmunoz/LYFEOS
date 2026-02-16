import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ObsidianMarkdown } from './obsidian-markdown';
import { cn } from '@/lib/utils';
import { Edit2, Save, CheckSquare, ImagePlus, Loader2 } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  autoBullets?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder = "",
  className = "",
  minHeight = "100px",
  autoBullets = false,
}: MarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.max(textareaRef.current.scrollHeight, parseInt(minHeight)) + 'px';
    }
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
      autoResize();
    }
  }, [isEditing, cursorPosition, value, onChange]);

  // Save cursor position when input changes
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setCursorPosition(e.target.selectionStart || 0);
    autoResize();
  };

  // Toggle to edit mode
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  // Toggle to read mode and trigger blur save
  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    onBlur?.();
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
      onBlur?.();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      setIsEditing(false);
      onBlur?.();
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

  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = value.substring(0, start);
    const after = value.substring(end);
    const newValue = before + text + after;
    onChange(newValue);
    const newPos = start + text.length;
    setTimeout(() => {
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  }, [value, onChange]);

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/inline-upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      insertAtCursor(`\n${data.markdown}\n`);
    } catch {
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [insertAtCursor]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImage(file);
  }, [uploadImage]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadImage(file);
        break;
      }
    }
  }, [uploadImage]);

  // Detect clicks outside to exit edit mode and trigger blur save
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        if (isEditing) {
          setIsEditing(false);
          onBlur?.();
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, onBlur]);

  return (
    <div 
      ref={wrapperRef}
      className={cn(
        "relative group",
        className
      )}
    >
      {isEditing ? (
        <div className="relative rounded-md border border-primary/30 bg-background">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="w-full p-3 bg-transparent resize-none outline-none border-none rounded-md placeholder:text-muted-foreground/50 dark:text-[#D6F4FF] light:text-slate-700 text-base overflow-hidden"
            placeholder={placeholder}
            style={{ minHeight }}
          />
          <div className="absolute top-2 right-2 flex space-x-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-1 bg-primary/10 rounded hover:bg-primary/20 text-primary disabled:opacity-50"
              title="Upload image"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            </button>
            <button
              onClick={handleSaveClick}
              className="p-1 bg-primary/10 rounded hover:bg-primary/20 text-primary"
              title="Save (Esc)"
            >
              <Save size={14} />
            </button>
          </div>
          <div className="absolute bottom-2 right-2 text-xs dark:text-[#7DAAB2]/50 light:text-slate-400/80">
            Ctrl+Enter or Esc to save
          </div>
        </div>
      ) : (
        <div className="relative rounded-md border border-primary/30 bg-background overflow-hidden" style={{ height: minHeight }}>
          <div className="p-3 cursor-default h-full" onDoubleClick={handleDoubleClick}>
            {value ? (
              <ObsidianMarkdown className="dark:text-[#D6F4FF] light:text-slate-700 [&_p:first-of-type]:mt-0 [&_ul:first-of-type]:mt-0 [&_ol:first-of-type]:mt-0 [&_h1:first-of-type]:mt-0 [&_h2:first-of-type]:mt-0 [&_h3:first-of-type]:mt-0">
                {value}
              </ObsidianMarkdown>
            ) : (
              <div className="text-muted-foreground/50">{placeholder}</div>
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
    </div>
  );
}