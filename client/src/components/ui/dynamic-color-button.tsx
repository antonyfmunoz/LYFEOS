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
  // Compute the appropriate styles based on the variant
  const getButtonStyles = () => {
    switch (variant) {
      case 'default':
        return {
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
          border: '1px solid var(--primary)',
          boxShadow: 'none',
          '&:hover': {
            backgroundColor: 'var(--primary-glow-strong)',
          }
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--primary)',
          border: '1px solid var(--primary-border)',
          '&:hover': {
            backgroundColor: 'var(--primary-bg-subtle)',
            borderColor: 'var(--primary)',
          }
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--primary)',
          border: 'none',
          '&:hover': {
            backgroundColor: 'var(--primary-bg-subtle)',
          }
        };
      case 'link':
        return {
          backgroundColor: 'transparent',
          color: 'var(--primary)',
          border: 'none',
          textDecoration: 'underline',
          textUnderlineOffset: '4px',
          '&:hover': {
            textDecoration: 'none',
          }
        };
      default:
        return {};
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'transition-colors duration-200 hover:shadow-[0_0_5px_var(--primary-glow-light)]',
        className
      )}
      onClick={onClick}
      style={{
        // Base styles
        color: variant === 'default' ? 'var(--primary-foreground)' : 'var(--primary)',
        borderColor: variant === 'outline' ? 'var(--primary-border)' : undefined,
        backgroundColor: variant === 'default' ? 'var(--primary)' : 'transparent',
        // Override with any custom styles
        ...style
      }}
      {...props}
    >
      {children}
    </Button>
  );
}