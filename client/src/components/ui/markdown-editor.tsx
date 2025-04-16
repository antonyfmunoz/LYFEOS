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
      
      // If this is a bullet-enabled field and it's empty, add an initial bullet
      if (autoBullets && (!value || value.trim() === '')) {
        onChange('- ');
        // Set cursor after the initial bullet
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(2, 2);
          }
        }, 0);
      } else {
        textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
      }
    }
  }, [isEditing, cursorPosition, autoBullets, value, onChange]);

  // Save cursor position when input changes
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Get cursor position
    const cursorPos = e.target.selectionStart || 0;
    
    // If autoBullets is enabled, prevent cursor from going before bullet points
    if (autoBullets) {
      // Check if cursor is at the beginning of a line with a bullet
      const lines = newValue.split('\n');
      let charCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // If we've passed the cursor position, we're done
        if (charCount + line.length >= cursorPos) {
          // Calculate position within the current line
          const posInLine = cursorPos - charCount;
          const bulletMatch = line.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
          
          // If there's a bullet and cursor is before or in the bullet
          if (bulletMatch && posInLine <= bulletMatch[0].length) {
            // Move cursor to after the bullet
            const newPos = charCount + bulletMatch[0].length;
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.setSelectionRange(newPos, newPos);
                setCursorPosition(newPos);
              }
            }, 0);
            return;
          }
          break;
        }
        // Add line length plus the newline character
        charCount += line.length + 1;
      }
    }
    
    setCursorPosition(cursorPos);
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
    } else if (e.key === 'Enter' && autoBullets) {
      // Auto-generate bullet points on Enter for this field
      e.preventDefault();
      insertAutoBullet();
    } else if (e.key === 'ArrowLeft' && autoBullets && textareaRef.current) {
      // Prevent cursor from going before bullet points when pressing left arrow
      const pos = textareaRef.current.selectionStart;
      const value = textareaRef.current.value;
      
      // Find the current line
      const beforeCursor = value.substring(0, pos);
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const currentLine = beforeCursor.substring(lineStart);
      
      // If cursor is at the beginning of bullet content, prevent moving left
      const bulletMatch = currentLine.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
      if (bulletMatch && pos === lineStart + bulletMatch[0].length) {
        e.preventDefault();
      }
    } else if (e.key === 'Home' && autoBullets && textareaRef.current) {
      // When Home key is pressed, move to start of content after bullet point, not to start of line
      e.preventDefault();
      
      const pos = textareaRef.current.selectionStart;
      const value = textareaRef.current.value;
      
      // Find the current line
      const beforeCursor = value.substring(0, pos);
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      
      // Check if line has a bullet
      const currentLine = value.substring(lineStart, value.indexOf('\n', lineStart) === -1 ? undefined : value.indexOf('\n', lineStart));
      const bulletMatch = currentLine.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
      
      if (bulletMatch) {
        // Move cursor to start of content (after bullet)
        const newPos = lineStart + bulletMatch[0].length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      } else {
        // If no bullet, move to line start as normal
        textareaRef.current.setSelectionRange(lineStart, lineStart);
      }
    }
  };

  // Insert auto bullet on Enter
  const insertAutoBullet = () => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Get the current line
    const textBeforeCursor = value.substring(0, start);
    const textAfterCursor = value.substring(end);
    
    // Find the start of the current line
    const lastNewlineBeforeCursor = textBeforeCursor.lastIndexOf('\n');
    const currentLineStart = lastNewlineBeforeCursor === -1 ? 0 : lastNewlineBeforeCursor + 1;
    const currentLine = textBeforeCursor.substring(currentLineStart);
    
    // Check if current line starts with a bullet
    const bulletMatch = currentLine.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)(.*)/);
    
    if (bulletMatch) {
      // Extract the components of the bullet point
      const [, leadingSpace, bulletType, numberPart, bulletSpace, content] = bulletMatch;
      
      // If the content is empty and it's not the first bullet, remove the bullet
      if (content.trim() === '') {
        const newValue = textBeforeCursor.substring(0, currentLineStart) + textAfterCursor;
        onChange(newValue);
        
        // Set cursor position after removal
        const newCursorPos = currentLineStart;
        setTimeout(() => {
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
        return;
      }
      
      // Generate the next bullet
      let nextBullet: string;
      if (bulletType === '-' || bulletType === '*' || bulletType === '+' || bulletType === '•') {
        // For standard bullets, just repeat the same type
        nextBullet = `${leadingSpace}${bulletType}${bulletSpace}`;
      } else if (numberPart) {
        // For numbered lists, increment the number
        const nextNumber = parseInt(numberPart) + 1;
        nextBullet = `${leadingSpace}${nextNumber}.${bulletSpace}`;
      } else {
        // Fallback to a standard bullet
        nextBullet = `${leadingSpace}- `;
      }
      
      const newValue = textBeforeCursor + '\n' + nextBullet + textAfterCursor;
      onChange(newValue);
      
      // Position cursor after the new bullet
      const newCursorPos = start + 1 + nextBullet.length;
      setTimeout(() => {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      // If no bullet detected, just add a new bullet
      const newValue = textBeforeCursor + '\n- ' + textAfterCursor;
      onChange(newValue);
      
      // Position cursor after the new bullet
      const newCursorPos = start + 3;
      setTimeout(() => {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
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
        "relative rounded-md border border-primary/30 bg-[#00141A] min-h-[100px] group",
        className
      )}
      style={{ minHeight }}
    >
      {isEditing ? (
        <>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="p-3 w-full h-full focus:outline-none focus:ring-0 bg-[#00141A] text-[#D6F4FF] resize-y placeholder-[#7DAAB2]/50 border-0 rounded-md"
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                insertTaskCheckbox();
              }}
              className="p-1 bg-primary/10 rounded hover:bg-primary/20 text-primary"
              title="Insert Task Checkbox (Ctrl+T)"
            >
              <CheckSquare size={14} />
            </button>
          </div>
        </>
      ) : (
        <div className="p-3 cursor-default" onDoubleClick={handleDoubleClick}>
          {value ? (
            <ObsidianMarkdown className="text-[#D6F4FF]">
              {value}
            </ObsidianMarkdown>
          ) : (
            <div className="text-[#7DAAB2]/50">{placeholder}</div>
          )}
          <button 
            onClick={handleEditClick}
            className="absolute top-2 right-2 p-1 bg-primary/10 rounded hover:bg-primary/20 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit (Double-click text)"
          >
            <Edit2 size={14} />
          </button>
        </div>
      )}
      
      {/* Small hint in bottom-right corner when editing */}
      {isEditing && (
        <div className="absolute bottom-2 right-2 text-xs text-[#7DAAB2]/50">
          Ctrl+Enter or Esc to save
        </div>
      )}
    </div>
  );
}