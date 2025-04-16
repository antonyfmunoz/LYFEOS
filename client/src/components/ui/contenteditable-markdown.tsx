import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ObsidianMarkdown } from './obsidian-markdown';

interface ContentEditableMarkdownProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function ContentEditableMarkdown({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = "100px",
}: ContentEditableMarkdownProps) {
  const [isEditing, setIsEditing] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);

  // Focus when entering edit mode
  useEffect(() => {
    if (isEditing && divRef.current) {
      divRef.current.focus();
      
      // Place cursor at the end
      const range = document.createRange();
      const selection = window.getSelection();
      if (divRef.current.childNodes.length > 0) {
        const lastNode = divRef.current.childNodes[divRef.current.childNodes.length - 1];
        if (lastNode.nodeType === Node.TEXT_NODE) {
          range.setStart(lastNode, lastNode.textContent?.length || 0);
        } else {
          range.selectNodeContents(lastNode);
          range.collapse(false);
        }
      } else {
        range.selectNodeContents(divRef.current);
        range.collapse(false);
      }
      
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  // Switch to edit mode
  const handleClick = () => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  // Save content and switch to view mode
  const handleBlur = () => {
    if (isEditing && divRef.current) {
      const content = divRef.current.innerText || '';
      onChange(content);
      setIsEditing(false);
    }
  };

  // Update content as user types
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const content = e.currentTarget.innerText || '';
    onChange(content);
  };

  // Handle keyboard shortcuts and Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleBlur();
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border border-primary/30 bg-[#00141A] min-h-[100px] p-3",
        isEditing ? "ring-1 ring-primary/40" : "hover:border-primary/50",
        className
      )}
      style={{ minHeight }}
      onClick={handleClick}
    >
      {isEditing ? (
        <div
          ref={divRef}
          contentEditable
          suppressContentEditableWarning
          className="outline-none min-h-full"
          onBlur={handleBlur}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        >
          {value || ''}
        </div>
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
      
      {isEditing && (
        <div className="text-xs text-[#7DAAB2]/50 mt-2 text-right">
          Press Ctrl+Enter to save
        </div>
      )}
    </div>
  );
}