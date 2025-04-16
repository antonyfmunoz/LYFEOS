import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';

interface ObsidianMarkdownProps {
  children: string;
  className?: string;
}

export function ObsidianMarkdown({ children, className }: ObsidianMarkdownProps) {
  // Process Obsidian-specific syntax before rendering markdown
  const processedContent = React.useMemo(() => {
    let content = children;
    
    // Process Obsidian wiki links [[Link]]
    content = content.replace(/\[\[(.*?)\]\]/g, (_, text) => {
      return `[${text}](/${text.toLowerCase().replace(/\s+/g, '-')})`;
    });
    
    // Process Obsidian tasks
    content = content.replace(/- \[ \] (.*)/g, '- [ ] $1');
    content = content.replace(/- \[x\] (.*)/g, '- [x] $1');
    
    return content;
  }, [children]);

  return (
    <div className={cn("prose prose-invert max-w-none prose-cyan", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => (
            <a 
              {...props} 
              className="text-primary hover:text-primary/80 underline underline-offset-4" 
              target="_blank" 
              rel="noreferrer"
            />
          ),
          ul: ({ node, ...props }) => <ul className="list-disc ml-6 my-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal ml-6 my-2" {...props} />,
          li: ({ node, checked, ...props }) => {
            if (checked === null) {
              return <li {...props} />;
            }
            
            return (
              <li className="flex items-start my-1">
                <input 
                  type="checkbox" 
                  checked={checked} 
                  readOnly 
                  className="mt-1 mr-2 h-4 w-4 rounded border-primary bg-background text-primary" 
                />
                <span className={cn(checked && "line-through text-muted-foreground")}>
                  {props.children}
                </span>
              </li>
            );
          },
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-[#D6F4FF]" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3 text-[#D6F4FF]" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2 text-[#D6F4FF]" {...props} />,
          p: ({ node, ...props }) => <p className="my-2" {...props} />,
          code: ({ node, inline, ...props }) => 
            inline ? 
              <code className="bg-[#001A20] px-1.5 py-0.5 rounded text-[#36F1CD] font-mono text-sm" {...props} /> :
              <code className="block bg-[#001A20] p-3 rounded font-mono text-sm overflow-x-auto text-[#D6F4FF]" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic text-[#7DAAB2]" {...props} />
          ),
          img: ({ node, ...props }) => (
            <img className="max-w-full rounded-md my-4" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-6 border-primary/20" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse table-auto w-full my-4" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-primary/30 bg-primary/10 px-4 py-2 text-left font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-primary/20 px-4 py-2" {...props} />
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}