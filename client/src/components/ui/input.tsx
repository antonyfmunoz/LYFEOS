import * as React from "react"

import { cn } from "@/lib/utils"

type ExtraInputProps = {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof ExtraInputProps>, 
  ExtraInputProps {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, ...props }, ref) => {
    if (prefix || suffix) {
      return (
        <div className="relative flex items-center">
          {prefix && (
            <div className="absolute left-3 flex items-center pointer-events-none">
              {prefix}
            </div>
          )}
          <input
            type={type}
            autoComplete="off"
            className={cn(
              "flex h-10 w-full rounded-md border border-input bg-background py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              prefix && "pl-9",
              suffix && "pr-9",
              !prefix && !suffix && "px-3",
              className
            )}
            ref={ref}
            {...props}
          />
          {suffix && (
            <div className="absolute right-3 flex items-center pointer-events-none">
              {suffix}
            </div>
          )}
        </div>
      )
    }
    
    return (
      <input
        type={type}
        autoComplete="off"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
