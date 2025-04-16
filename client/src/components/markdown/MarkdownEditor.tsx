import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { PenLine, Eye, Save } from 'lucide-react';

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export default function MarkdownEditor({
  content,
  onChange,
  onSave,
  readOnly = false,
  placeholder = 'Start typing...',
  className = '',
}: MarkdownEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState(content);
  
  // Update local state when content prop changes
  useEffect(() => {
    setEditableContent(content);
  }, [content]);
  
  // Handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditableContent(newContent);
    onChange(newContent);
  };
  
  // Toggle between edit and view modes
  const toggleEditMode = () => {
    if (isEditing) {
      // Save changes when exiting edit mode
      onSave?.();
    }
    setIsEditing(!isEditing);
  };
  
  // Save content
  const handleSave = () => {
    onSave?.();
    setIsEditing(false);
  };
  
  // Process wiki-style links - converts [[Link Name]] to links
  const processWikiLinks = (text: string) => {
    return text.replace(
      /\[\[(.*?)\]\]/g, 
      (match, p1) => `[${p1}](#/mission/${p1.toLowerCase().replace(/\s+/g, '-')})`
    );
  };

  // Process task checkboxes - converts [ ] and [x] to proper checkboxes
  const processCheckboxes = (text: string) => {
    // Replace "- [ ]" with "- ◻️" and "- [x]" with "- ✅"
    return text
      .replace(/^- \[ \]/gm, '- ◻️')
      .replace(/^- \[x\]/gm, '- ✅');
  };
  
  // Process the content for display
  const processedContent = processCheckboxes(processWikiLinks(editableContent));
  
  return (
    <div className={`relative rounded-lg border border-slate-700/50 ${className}`}>
      {/* Toolbar */}
      <div className="flex justify-between items-center p-2 border-b border-slate-700/50 bg-slate-800/30">
        <div className="text-xs text-slate-400">
          {isEditing ? 'Edit Mode' : 'View Mode'}
        </div>
        <div className="flex space-x-2">
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={toggleEditMode}
              >
                {isEditing ? <Eye className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              </Button>
              
              {isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleSave}
                >
                  <Save className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Editor / Viewer */}
      {isEditing ? (
        <textarea
          value={editableContent}
          onChange={handleContentChange}
          placeholder={placeholder}
          className="w-full h-[300px] p-4 bg-transparent focus:outline-none resize-none font-mono text-sm"
          disabled={readOnly}
        />
      ) : (
        <div className="markdown-preview p-4 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {processedContent || placeholder}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}