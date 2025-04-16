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
  const [showBackdrop, setShowBackdrop] = useState(false)
  
  // Use effect to update backdrop state when toasts change
  useEffect(() => {
    if (toasts.length > 0) {
      setShowBackdrop(true)
    } else {
      // Slight delay to let animation complete
      const timer = setTimeout(() => {
        setShowBackdrop(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [toasts.length])

  return (
    <ToastProvider>
      {showBackdrop && (
        <div 
          className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[99] transition-opacity duration-300 ${toasts.length > 0 ? 'opacity-100' : 'opacity-0'}`} 
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
