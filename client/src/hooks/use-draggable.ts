import { useState, useCallback, useRef, useEffect, type CSSProperties } from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  boundToWindow?: boolean;
}

export function useDraggable(options: UseDraggableOptions = {}) {
  const { boundToWindow = true } = options;
  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; elemX: number; elemY: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const resetPosition = useCallback(() => {
    setPosition(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;

    const el = elementRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: rect.left,
      elemY: rect.top,
    };

    setIsDragging(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;

      const { x: startX, y: startY, elemX, elemY } = dragStartRef.current;
      let newX = elemX + (e.clientX - startX);
      let newY = elemY + (e.clientY - startY);

      if (boundToWindow && elementRef.current) {
        const el = elementRef.current;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        newX = Math.max(0, Math.min(window.innerWidth - w, newX));
        newY = Math.max(0, Math.min(window.innerHeight - h, newY));
      }

      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    const preventScroll = (e: TouchEvent) => {
      e.preventDefault();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isDragging, boundToWindow]);

  const dragStyle: CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : {};

  const dragHandleProps = {
    onPointerDown: handlePointerDown,
    style: { cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' as const },
  };

  return {
    elementRef,
    position,
    isDragging,
    dragStyle,
    dragHandleProps,
    resetPosition,
  };
}
