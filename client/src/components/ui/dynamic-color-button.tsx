import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Dynamic color button that uses CSS variables directly for consistent theming
interface DynamicColorButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function DynamicColorButton({
  children,
  className,
  variant = 'outline',
  size = 'default',
  onClick,
  style,
  ...props
}: DynamicColorButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn(className)}
      onClick={onClick}
      style={{
        color: `var(--primary-color)`,
        borderColor: variant === 'outline' ? `var(--primary-border-subtle)` : undefined,
        backgroundColor: 'transparent',
        ...style
      }}
      {...props}
    >
      {children}
    </Button>
  );
}