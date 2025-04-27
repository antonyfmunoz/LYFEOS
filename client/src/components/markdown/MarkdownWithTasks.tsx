import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// This component renders markdown and adds click handlers to task items
interface MarkdownWithTasksProps {
  content: string;
  onChange: (newContent: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export const MarkdownWithTasks: React.FC<MarkdownWithTasksProps> = ({
  content,
  onChange,
  onSave,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // After each render, add click handlers to task checkboxes directly in the DOM
  useEffect(() => {
    if (readOnly || !containerRef.current) return;

    const taskItems = containerRef.current.querySelectorAll('li[data-task]');
    
    taskItems.forEach((item) => {
      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (!checkbox) return;
      
      checkbox.addEventListener('click', (e) => {
        // Don't let the checkbox actually change
        e.preventDefault();

        // Get the current state of the checkbox
        const isChecked = checkbox.checked;
        
        // Get the text content (minus the checkbox) to help find the task
        const taskText = item.textContent?.replace(/^\s*☐|☑\s*/, '') || '';
        
        // Regex to find the task in the markdown content
        const taskRegex = new RegExp(`- \\[${isChecked ? 'x' : ' '}\\].*?${taskText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        
        // Find and replace the task in the content
        const lines = content.split('\n');
        const newContent = lines.map(line => {
          if (line.match(taskRegex)) {
            return isChecked 
              ? line.replace(/\[x\]/, '[ ]') 
              : line.replace(/\[ \]/, '[x]');
          }
          return line;
        }).join('\n');
        
        onChange(newContent);
        
        // Auto-save if needed
        if (onSave) {
          onSave();
        }
      });
    });
  }, [content, onChange, onSave, readOnly]);

  return (
    <div ref={containerRef} className="markdown-container">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownWithTasks;