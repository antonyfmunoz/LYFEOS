import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Check, Hash, Link, List, Bold, Italic, Code } from 'lucide-react';

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

// Custom plugin to handle Obsidian-style wiki links [[Link]]
function remarkObsidianLinks() {
  return (tree: any) => {
    // Look for text nodes that contain [[...]] patterns
    const visitor = (node: any, index: number, parent: any) => {
      if (node.type !== 'text') return;
      
      const wikiLinkRegex = /\[\[(.*?)\]\]/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = wikiLinkRegex.exec(node.value)) !== null) {
        // Push text before the match
        if (match.index > lastIndex) {
          parts.push({
            type: 'text',
            value: node.value.slice(lastIndex, match.index)
          });
        }
        
        // Extract the link text
        const linkText = match[1];
        const [target, label] = linkText.includes('|') 
          ? linkText.split('|') 
          : [linkText, linkText];
        
        // Push a link node
        parts.push({
          type: 'link',
          url: `#${target.trim().replace(/\s+/g, '-').toLowerCase()}`,
          children: [{
            type: 'text',
            value: label.trim()
          }],
          data: {
            hProperties: {
              className: 'obsidian-wikilink'
            }
          }
        });
        
        lastIndex = match.index + match[0].length;
      }
      
      // Push remaining text after all matches
      if (lastIndex < node.value.length) {
        parts.push({
          type: 'text',
          value: node.value.slice(lastIndex)
        });
      }
      
      // Replace the current node with the new parts if we found any wiki links
      if (parts.length > 1) {
        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      }
    };
    
    // @ts-ignore - simplified for this example
    const transform = (tree: any) => {
      for (let i = 0; i < tree.children?.length || 0; i++) {
        const node = tree.children[i];
        if (node.children) {
          // Process this node's children
          transform(node);
        } else if (node.type === 'text') {
          // This is a text node, check for wiki links
          const newIndex = visitor(node, i, tree);
          if (newIndex !== undefined) {
            i = newIndex - 1; // Adjust for the newly inserted nodes
          }
        }
      }
    };
    
    transform(tree);
  };
}

// Custom component for rendering Obsidian-style checkboxes [x] or [ ]
const obsidianComponents = {
  li: ({ node, children, ...props }: any) => {
    // Check for task item syntax
    const textContent = Array.isArray(children) 
      ? children.join('')
      : String(children || '');
    
    const match = textContent.match(/^\s*\[([ x])\]\s*(.*)$/);
    
    if (match) {
      const isCompleted = match[1] === 'x';
      const content = match[2];
      
      return (
        <li {...props} className="obsidian-task-list-item">
          <div className="flex items-start">
            <span className={`obsidian-checkbox ${isCompleted ? 'checked' : ''}`}>
              {isCompleted ? '✓' : ''}
            </span>
            <span className={isCompleted ? 'line-through opacity-70' : ''}>
              {content}
            </span>
          </div>
        </li>
      );
    }
    
    return <li {...props}>{children}</li>;
  }
};

export function WysiwygEditor({
  value,
  onChange,
  placeholder = "",
  className = "",
  minHeight = "100px",
}: WysiwygEditorProps) {
  const [cursorPosition, setCursorPosition] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Handle editor content changes
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const content = e.currentTarget.innerText || '';
    onChange(content);
    
    // Save cursor position
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      setCursorPosition(range.startOffset);
    }
  }, [onChange]);
  
  // Handle paste to strip formatting
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);
  
  // Insert Markdown formatting
  const insertFormatting = useCallback((prefix: string, suffix: string = '') => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    
    // Create text nodes for prefix and suffix
    const prefixNode = document.createTextNode(prefix);
    const suffixNode = document.createTextNode(suffix);
    
    if (selectedText) {
      // If text is selected, wrap it with formatting
      const fragment = range.extractContents();
      
      // Create a container to hold our formatted content
      const container = document.createDocumentFragment();
      container.appendChild(prefixNode);
      container.appendChild(fragment);
      container.appendChild(suffixNode);
      
      range.insertNode(container);
      
      // Move cursor to end of inserted text
      range.setStartAfter(suffixNode);
      range.setEndAfter(suffixNode);
    } else {
      // If no text is selected, insert formatting at cursor
      const container = document.createDocumentFragment();
      container.appendChild(prefixNode);
      container.appendChild(suffixNode);
      
      range.insertNode(container);
      
      // Place cursor between tags
      range.setStartAfter(prefixNode);
      range.setEndAfter(prefixNode);
    }
    
    // Update selection
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Trigger content update
    if (editorRef.current) {
      onChange(editorRef.current.innerText);
    }
  }, [onChange]);
  
  // Insert task checkbox
  const insertTaskCheckbox = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    
    // Create checkbox text node
    const checkboxText = document.createTextNode(`- [ ] ${selectedText}`);
    
    range.deleteContents();
    range.insertNode(checkboxText);
    
    // Move cursor to end of inserted text
    range.setStartAfter(checkboxText);
    range.setEndAfter(checkboxText);
    
    // Update selection
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Trigger content update
    if (editorRef.current) {
      onChange(editorRef.current.innerText);
    }
  }, [onChange]);
  
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
    }
  }, [insertFormatting, insertTaskCheckbox]);
  
  // Ensure the editor is always focusable
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setAttribute('contenteditable', 'true');
    }
  }, []);

  // Add toolbar buttons for common Markdown formatting
  const toolbar = (
    <div className="flex items-center space-x-1 p-1 border-b border-primary/20 bg-[#001824]">
      <button 
        onClick={() => insertFormatting('**', '**')}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="Bold (Ctrl+B)"
      >
        <Bold size={14} />
      </button>
      <button 
        onClick={() => insertFormatting('*', '*')}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="Italic (Ctrl+I)"
      >
        <Italic size={14} />
      </button>
      <button 
        onClick={() => insertFormatting('[[', ']]')}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="Wiki Link"
      >
        <Link size={14} />
      </button>
      <button 
        onClick={insertTaskCheckbox}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="Task Checkbox (Ctrl+T)"
      >
        <Check size={14} />
      </button>
      <button 
        onClick={() => insertFormatting('# ', '')}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="Heading"
      >
        <Hash size={14} />
      </button>
      <button 
        onClick={() => insertFormatting('- ', '')}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="List Item"
      >
        <List size={14} />
      </button>
      <button 
        onClick={() => insertFormatting('`', '`')}
        className="p-1 rounded hover:bg-primary/20 text-[#7DAAB2]"
        title="Code"
      >
        <Code size={14} />
      </button>
    </div>
  );

  return (
    <div 
      className={cn(
        "relative rounded-md border border-primary/30 bg-[#00141A] overflow-hidden",
        className
      )}
      style={{ minHeight }}
    >
      {toolbar}
      
      {/* Display formatted markdown */}
      <div className="absolute inset-0 pointer-events-none p-3 mt-8 overflow-auto">
        {value ? (
          <div className="prose prose-invert prose-sm max-w-none text-[#D6F4FF]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath, remarkObsidianLinks]}
              rehypePlugins={[rehypeKatex]}
              components={obsidianComponents}
            >
              {value}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-[#7DAAB2]/50">{placeholder}</div>
        )}
      </div>
      
      {/* Editable div with transparent text */}
      <div
        ref={editorRef}
        className="p-3 min-h-[100px] text-transparent caret-[#D6F4FF] outline-none focus:ring-1 focus:ring-primary/30 rounded-md whitespace-pre-wrap"
        style={{ minHeight: `calc(${minHeight} - 2rem)` }}
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        contentEditable
        suppressContentEditableWarning
      >
        {value}
      </div>
      
      {/* Hidden textarea for screenreaders */}
      <textarea 
        ref={hiddenTextareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-label="Markdown editor"
      />
    </div>
  );
}