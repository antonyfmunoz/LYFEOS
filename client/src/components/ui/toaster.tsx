import { useToast } from "@/hooks/use-toast"
import { useEffect, useState } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  
  // We'll directly check if there are any open toasts
  // This ensures the backdrop is removed immediately when toasts are closed
  const hasOpenToasts = toasts.some(toast => toast.open === true);

  return (
    <ToastProvider>
      {/* Only show backdrop when there are open toasts */}
      {hasOpenToasts && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99]" 
        />
      )}
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
