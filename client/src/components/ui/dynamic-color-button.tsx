import React from 'react';
import { Button as BaseButton } from '@/components/ui/button';
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

export const DynamicColorButton = ({
  children,
  className,
  variant = 'outline',
  size = 'default',
  onClick,
  style,
  ...props
}: DynamicColorButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  return (
    <BaseButton
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
    </BaseButton>
  );
};

// Also export as DynamicButton for backward compatibility
export const DynamicButton = DynamicColorButton;

export default DynamicColorButton;