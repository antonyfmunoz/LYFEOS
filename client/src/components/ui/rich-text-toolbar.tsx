import { useState, useRef, useCallback } from 'react';
import { ImagePlus, Link, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface RichTextToolbarProps {
  onInsert: (text: string, cursorOffset?: number) => void;
  className?: string;
  compact?: boolean;
}

export function RichTextToolbar({ onInsert, className, compact = false }: RichTextToolbarProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Only image files are allowed', variant: 'destructive' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Image must be under 10MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/inline-upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      onInsert(`\n${data.markdown}\n`);
    } catch (error) {
      toast({ title: 'Failed to upload image', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onInsert, toast]);

  const handleInsertLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    const display = linkText.trim() || linkUrl.trim();
    const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    onInsert(`[${display}](${url})`);
    setLinkUrl('');
    setLinkText('');
    setShowLinkInput(false);
  }, [linkUrl, linkText, onInsert]);

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
      <Button
        type="button"
        variant="ghost"
        size={compact ? 'icon' : 'sm'}
        className={cn(
          'text-primary/70 hover:text-primary hover:bg-primary/10 active:bg-primary/20',
          compact ? 'h-7 w-7' : 'h-7 gap-1 px-2 text-xs'
        )}
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        title="Upload image"
      >
        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {!compact && !isUploading && <span>Image</span>}
      </Button>

      {showLinkInput ? (
        <div className="flex items-center gap-1 animate-in slide-in-from-left-2 duration-200">
          <Input
            placeholder="Link text (optional)"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            className="h-7 w-24 text-xs"
          />
          <Input
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInsertLink()}
            className="h-7 w-36 text-xs"
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10 active:bg-primary/20"
            onClick={handleInsertLink}
            disabled={!linkUrl.trim()}
            title="Insert link"
          >
            <Link className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-primary/10 active:bg-primary/20"
            onClick={() => { setShowLinkInput(false); setLinkUrl(''); setLinkText(''); }}
            title="Cancel"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'sm'}
          className={cn(
            'text-primary/70 hover:text-primary hover:bg-primary/10 active:bg-primary/20',
            compact ? 'h-7 w-7' : 'h-7 gap-1 px-2 text-xs'
          )}
          onClick={() => setShowLinkInput(true)}
          title="Insert link"
        >
          <Link className="h-3.5 w-3.5" />
          {!compact && <span>Link</span>}
        </Button>
      )}
    </div>
  );
}

interface RichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
  rows?: number;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
  name?: string;
}

export function RichTextArea({
  value,
  onChange,
  placeholder,
  className,
  textareaClassName,
  rows = 3,
  disabled = false,
  compact = false,
  id,
  name,
}: RichTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsert = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + text);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    onChange(newValue);

    requestAnimationFrame(() => {
      const newPos = start + text.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    });
  }, [value, onChange]);

  return (
    <div className={cn('space-y-1', className)}>
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          textareaClassName
        )}
        onPaste={async (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
              e.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;
              const formData = new FormData();
              formData.append('file', file);
              try {
                const response = await fetch('/api/inline-upload', {
                  method: 'POST',
                  body: formData,
                  credentials: 'include',
                });
                if (response.ok) {
                  const data = await response.json();
                  handleInsert(`\n${data.markdown}\n`);
                }
              } catch {}
              break;
            }
          }
        }}
      />
      {!disabled && (
        <RichTextToolbar onInsert={handleInsert} compact={compact} />
      )}
    </div>
  );
}
