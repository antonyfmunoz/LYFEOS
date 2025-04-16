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
    
    if (autoBullets) {
      // Ensure cursor is always after the bullet point on the current line
      const cursorPos = e.target.selectionStart || 0;
      const textBeforeCursor = newValue.substring(0, cursorPos);
      const lastNewlineBeforeCursor = textBeforeCursor.lastIndexOf('\n');
      const currentLineStart = lastNewlineBeforeCursor === -1 ? 0 : lastNewlineBeforeCursor + 1;
      const currentLine = textBeforeCursor.substring(currentLineStart);
      
      // Check if current line starts with a bullet
      const bulletMatch = currentLine.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
      
      if (bulletMatch) {
        const [fullMatch] = bulletMatch;
        const bulletLength = fullMatch.length;
        
        // If cursor is placed before bullet, move it after bullet
        if (cursorPos < currentLineStart + bulletLength) {
          const newCursorPos = currentLineStart + bulletLength;
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
              setCursorPosition(newCursorPos);
            }
          }, 0);
          return;
        }
      }
    }
    
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
    } else if (e.key === 'Enter' && autoBullets) {
      // Auto-generate bullet points on Enter for this field
      e.preventDefault();
      insertAutoBullet();
    } else if (autoBullets && (e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'Backspace')) {
      // Prevent navigating before the bullet with arrow keys and handle Backspace
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart || 0;
      const textBeforeCursor = value.substring(0, cursorPos);
      const lastNewlineBeforeCursor = textBeforeCursor.lastIndexOf('\n');
      const currentLineStart = lastNewlineBeforeCursor === -1 ? 0 : lastNewlineBeforeCursor + 1;
      const currentLine = textBeforeCursor.substring(currentLineStart);
      
      // Check if current line starts with a bullet
      const bulletMatch = currentLine.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
      
      if (bulletMatch) {
        const [fullMatch] = bulletMatch;
        const bulletLength = fullMatch.length;
        
        // Prevent any cursor movement that would place it before the bullet end
        if (e.key === 'ArrowLeft' && cursorPos <= currentLineStart + bulletLength) {
          // Don't allow cursor to go before the bullet
          e.preventDefault();
          
          // If cursor tries to go before bullet, force it after the bullet
          if (cursorPos <= currentLineStart + bulletLength) {
            const newCursorPos = currentLineStart + bulletLength;
            setTimeout(() => {
              textarea.setSelectionRange(newCursorPos, newCursorPos);
              setCursorPosition(newCursorPos);
            }, 0);
          }
          return;
        }
        
        // Prevent backspace from deleting bullet
        if (e.key === 'Backspace' && cursorPos <= currentLineStart + bulletLength) {
          e.preventDefault();
          return;
        }
        
        // If Home key is pressed, go to position after bullet, not start of line
        if (e.key === 'Home') {
          e.preventDefault();
          const newCursorPos = currentLineStart + bulletLength;
          setTimeout(() => {
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            setCursorPosition(newCursorPos);
          }, 0);
          return;
        }
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
            onClick={(e) => {
              handleBulletPointCursorConstraint(e);
            }}
            onMouseDown={(e) => {
              if (autoBullets) {
                // Prevent clicks from placing cursor before bullet points
                // This catches the cursor before placement
                const textarea = e.currentTarget;
                
                // Get the approximate cursor position from click coordinates
                const clickX = e.clientX;
                const clickY = e.clientY;
                const containerRect = textarea.getBoundingClientRect();
                
                // If we can't accurately detect, let the onClick handler manage it
                if (clickX < containerRect.left || clickX > containerRect.right ||
                    clickY < containerRect.top || clickY > containerRect.bottom) {
                  return;
                }
                
                // Analyze text to estimate if click was near beginning of line
                const lines = value.split('\n');
                const clickOffsetY = clickY - containerRect.top;
                const lineHeight = parseInt(getComputedStyle(textarea).lineHeight || '20');
                const approxLineIndex = Math.floor(clickOffsetY / lineHeight);
                
                // Safety check for out of bounds
                if (approxLineIndex >= 0 && approxLineIndex < lines.length) {
                  const line = lines[approxLineIndex];
                  const bulletMatch = line.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
                  
                  // If line has a bullet and click was in the beginning area
                  if (bulletMatch) {
                    const bulletEndPosition = bulletMatch[0].length;
                    const charWidth = 8; // Approximate character width
                    const bulletWidthInPx = bulletEndPosition * charWidth;
                    
                    // If click appears to be within the bullet area
                    if ((clickX - containerRect.left) <= bulletWidthInPx + 5) { // Add small margin
                      e.preventDefault(); // Prevent the default cursor placement
                      
                      // Wait for next cycle to get the correct textarea state
                      setTimeout(() => {
                        // Find the correct index for this line in the text
                        let lineStartIndex = 0;
                        for (let i = 0; i < approxLineIndex; i++) {
                          lineStartIndex += lines[i].length + 1; // +1 for the newline character
                        }
                        // Place cursor after bullet
                        const cursorPosition = lineStartIndex + bulletEndPosition;
                        textarea.setSelectionRange(cursorPosition, cursorPosition);
                        setCursorPosition(cursorPosition);
                      }, 0);
                    }
                  }
                }
              }
            }}
            onMouseMove={(e) => {
              if (autoBullets) {
                // Also monitor mouse movement to prevent text selection before bullet
                const textarea = e.currentTarget;
                if (textarea.selectionStart !== textarea.selectionEnd) {
                  // Only handle when there's no selection (just cursor movement)
                  return;
                }
                
                const cursorPos = textarea.selectionStart || 0;
                const textBeforeCursor = value.substring(0, cursorPos);
                const lastNewlineBeforeCursor = textBeforeCursor.lastIndexOf('\n');
                const currentLineStart = lastNewlineBeforeCursor === -1 ? 0 : lastNewlineBeforeCursor + 1;
                const currentLine = textBeforeCursor.substring(currentLineStart);
                
                // Check if current line starts with a bullet
                const bulletMatch = currentLine.match(/^(\s*)([-*+•]|(\d+)\.)(\s+)/);
                
                if (bulletMatch) {
                  const [fullMatch] = bulletMatch;
                  const bulletLength = fullMatch.length;
                  
                  // If cursor is placed before bullet, move it after bullet
                  if (cursorPos < currentLineStart + bulletLength) {
                    const newCursorPos = currentLineStart + bulletLength;
                    setTimeout(() => {
                      textarea.setSelectionRange(newCursorPos, newCursorPos);
                      setCursorPosition(newCursorPos);
                    }, 0);
                  }
                }
              }
            }}
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