import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ObsidianMarkdown } from './obsidian-markdown';

interface RealTimeMarkdownProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RealTimeMarkdown({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = "100px",
}: RealTimeMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [currentEditText, setCurrentEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Split content into lines on initial load and when value changes
  useEffect(() => {
    const contentLines = value ? value.split('\n') : [''];
    setLines(contentLines);
  }, [value]);

  // Start editing a line
  const handleLineClick = (index: number) => {
    setEditingLine(index);
    setCurrentEditText(lines[index]);
    
    // Focus input after a brief delay to ensure it's rendered
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 10);
  };

  // Handle text change in the editing line
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentEditText(e.target.value);
  };

  // Process when a line is finished editing
  const finishLineEdit = () => {
    if (editingLine !== null) {
      const newLines = [...lines];
      newLines[editingLine] = currentEditText;
      setLines(newLines);
      onChange(newLines.join('\n'));
      setEditingLine(null);
    }
  };

  // Create a new line when Enter is pressed
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && editingLine !== null) {
      e.preventDefault();
      
      // Finish editing the current line
      const newLines = [...lines];
      newLines[editingLine] = currentEditText;
      
      // Insert a new blank line after the current one
      newLines.splice(editingLine + 1, 0, '');
      setLines(newLines);
      onChange(newLines.join('\n'));
      
      // Start editing the new line
      setEditingLine(editingLine + 1);
      setCurrentEditText('');
      
      // Focus will happen automatically on the next render
    } else if (e.key === 'Escape') {
      setEditingLine(null);
    }
  };

  // Add new line at the end when clicking the "+ Add" button
  const addNewLine = () => {
    const newLines = [...lines, ''];
    setLines(newLines);
    setEditingLine(newLines.length - 1);
    setCurrentEditText('');
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "rounded-md border border-primary/30 bg-[#00141A] p-3 min-h-[100px]",
        className
      )}
      style={{ minHeight }}
    >
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="relative">
            {editingLine === index ? (
              <div className="py-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={currentEditText}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  onBlur={finishLineEdit}
                  className="w-full bg-[#001A20] text-[#D6F4FF] border-none outline-none px-2 py-1 rounded"
                  autoFocus
                />
              </div>
            ) : (
              <div 
                className="cursor-text py-1 hover:bg-primary/5 rounded px-2" 
                onClick={() => handleLineClick(index)}
              >
                {line ? (
                  <ObsidianMarkdown className="text-[#D6F4FF]">
                    {line}
                  </ObsidianMarkdown>
                ) : (
                  <div className="text-[#7DAAB2]/50 h-6 flex items-center">
                    {index === 0 && !lines[0] ? placeholder : "Click to edit..."}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {editingLine === null && (
        <button
          type="button"
          onClick={addNewLine}
          className="mt-2 text-xs text-primary flex items-center hover:underline"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span className="ml-1">Add line</span>
        </button>
      )}
      
      <div className="text-xs text-[#7DAAB2]/50 mt-3 text-right">
        Press Enter for new line • Edit lines individually
      </div>
    </div>
  );
}