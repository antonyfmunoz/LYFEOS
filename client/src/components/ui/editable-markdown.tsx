import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ObsidianMarkdown } from './obsidian-markdown';

interface EditableMarkdownProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function EditableMarkdown({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = "100px",
}: EditableMarkdownProps) {
  const [isEditing, setIsEditing] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  
  // Handle click on the markdown container
  const handleClick = () => {
    setIsEditing(true);
  };
  
  // Handle blur (clicking outside)
  const handleBlur = () => {
    if (editableRef.current) {
      // Get the raw markdown text
      const rawText = editableRef.current.innerText;
      // Update the value
      onChange(rawText);
      // Switch to view mode
      setIsEditing(false);
    }
  };
  
  // When entering edit mode, focus the editable area
  useEffect(() => {
    if (isEditing && editableRef.current) {
      editableRef.current.focus();
      
      // Place cursor at the end
      const range = document.createRange();
      const selection = window.getSelection();
      
      if (editableRef.current.childNodes.length > 0) {
        const lastNode = editableRef.current.childNodes[editableRef.current.childNodes.length - 1];
        range.setStartAfter(lastNode);
      } else {
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
      }
      
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);
  
  // Handle keyboard event
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Render markdown on regular Enter (without Shift)
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter or Cmd+Enter always saves and exits
        e.preventDefault();
        handleBlur();
      } else if (!e.shiftKey) {
        // Regular Enter (without Shift) also saves and exits
        e.preventDefault();
        handleBlur();
      }
      // Shift+Enter will allow multi-line editing (default behavior)
    }
  };

  return (
    <div 
      className={cn(
        "rounded-md border border-primary/30 bg-[#00141A] p-3 min-h-[100px]",
        isEditing && "ring-1 ring-primary/40",
        className
      )}
      style={{ minHeight }}
      onClick={isEditing ? undefined : handleClick}
    >
      {isEditing ? (
        <>
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="outline-none text-[#D6F4FF] min-h-full"
          >
            {value}
          </div>
          <div className="text-xs text-[#7DAAB2]/50 mt-2 text-right">
            Press Enter to save • Shift+Enter for new line
          </div>
        </>
      ) : (
        <div className="cursor-text">
          {value ? (
            <ObsidianMarkdown className="text-[#D6F4FF]">
              {value}
            </ObsidianMarkdown>
          ) : (
            <div className="text-[#7DAAB2]/50">{placeholder}</div>
          )}
        </div>
      )}
    </div>
  );
}