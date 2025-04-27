import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

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

// Custom components for rendering Obsidian-style elements
const obsidianComponents = {
  // Handle standard lists - let ReactMarkdown handle the bullets
  ul: ({ node, children, ...props }: any) => {
    return <ul {...props}>{children}</ul>;
  },
  
  ol: ({ node, children, ...props }: any) => {
    return <ol {...props}>{children}</ol>;
  },
  
  // Handle task lists with checkboxes (Obsidian style)
  li: ({ node, children, checked, className, ...props }: any) => {
    // If this is a task item with a checkbox (ReactMarkdown passes the 'checked' prop)
    if (checked !== undefined) {
      // Create a clickable task with accessibility support
      return (
        <li className="obsidian-task-list-item" style={{ listStyleType: 'none', display: 'flex', alignItems: 'flex-start' }}>
          <span
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            data-task-item="true"
            className={`obsidian-checkbox ${checked ? 'checked' : ''}`}
            onClick={(e) => {
              // This click handler is more for visual effect - the actual toggle happens in MarkdownEditor
              e.stopPropagation();
              // The styling will be changed via CSS, but no content change happens here
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }}
            style={{
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '1.2em',
              height: '1.2em',
              border: '1px solid var(--primary-color, #00E0FF)',
              borderRadius: '0.2em',
              marginRight: '0.5em',
              color: 'var(--primary-color, #00E0FF)',
              backgroundColor: checked ? 'rgba(var(--primary-rgb, 0, 224, 255), 0.2)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative'
            }}
          >
            {checked && "✓"}
          </span>
          <span 
            className={checked ? 'line-through opacity-70' : ''}
            style={{ cursor: 'default' }}
          >
            {children}
          </span>
        </li>
      );
    }
    
    // For regular list items, use standard <li> with proper classes
    return <li {...props} className={className}>{children}</li>;
  }
};

interface ObsidianMarkdownProps {
  children: string;
  className?: string;
}

export function ObsidianMarkdown({ children, className = '' }: ObsidianMarkdownProps) {
  // Add a direct style to override the list styling completely
  const customStyle = `
    .remove-bullets ul li.obsidian-task-list-item {
      list-style-type: none !important;
      padding-left: 0 !important;
      margin-left: 0 !important;
    }
    .remove-bullets ul li.obsidian-task-list-item::before,
    .remove-bullets ul li.obsidian-task-list-item::marker {
      display: none !important;
      content: '' !important;
    }
  `;

  return (
    <div className={`prose prose-invert prose-sm max-w-none remove-bullets ${className}`}>
      <style>{customStyle}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkObsidianLinks]}
        rehypePlugins={[rehypeKatex]}
        components={obsidianComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}