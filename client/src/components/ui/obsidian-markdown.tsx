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
  ul: ({ node, children, ...props }: any) => {
    return <div className="obsidian-list">{children}</div>;
  },
  
  li: ({ node, children, ...props }: any) => {
    // Safety check - if children is undefined or empty, just render a regular li
    if (!children || children.length === 0) {
      return <li {...props} className="normal-list-item" />;
    }
    
    // Check if first child is a text node or has text content we can examine
    let textContent = '';
    let firstChild = children[0];
    
    // Try to extract text content from different possible structures
    if (typeof firstChild === 'string') {
      textContent = firstChild;
    } else if (
      firstChild && 
      typeof firstChild === 'object' && 
      firstChild.props && 
      typeof firstChild.props.children === 'string'
    ) {
      textContent = firstChild.props.children;
    }
    
    // If we have text content to check
    if (textContent) {
      const taskMatch = textContent.match(/^\s*\[([ x])\]\s*(.*)$/);
      
      if (taskMatch) {
        const isCompleted = taskMatch[1] === 'x';
        const content = taskMatch[2];
        
        // Completely custom rendering with no reliance on li element
        return (
          <div 
            className="task-item-container flex items-start my-1"
            style={{ display: 'flex', alignItems: 'flex-start' }}
          >
            <div 
              className={`task-checkbox ${isCompleted ? 'checked' : ''}`}
              style={{ 
                display: 'inline-flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '1.2em',
                height: '1.2em',
                border: '1px solid #00E0FF',
                borderRadius: '0.2em',
                marginRight: '0.5em',
                color: '#00E0FF',
                backgroundColor: isCompleted ? 'rgba(0, 224, 255, 0.2)' : 'transparent'
              }}
            >
              {isCompleted ? '✓' : ''}
            </div>
            <div 
              className={isCompleted ? 'line-through opacity-70' : ''}
              style={{ flexGrow: 1 }}
            >
              {content}
            </div>
          </div>
        );
      }
    }
    
    // For regular list items, add bullet manually
    return (
      <div className="normal-list-item flex items-start my-1">
        <span className="bullet-point mr-2" style={{ color: '#7DAAB2' }}>•</span>
        <div>{children}</div>
      </div>
    );
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