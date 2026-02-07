import { useState, useCallback, useRef, useEffect, type CSSProperties } from 'react';

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  topBound?: number;
  bottomBound?: number;
}

export function useDraggable(options: UseDraggableOptions = {}) {
  const { topBound = 64, bottomBound = 64 } = options;
  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; elemX: number; elemY: number } | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const resetPosition = useCallback(() => {
    setPosition(null);
    setDragWidth(null);
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

    setDragWidth(rect.width);
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

      const el = elementRef.current;
      if (el) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const minY = topBound;
        const maxY = window.innerHeight - bottomBound - h;
        newX = Math.max(0, Math.min(window.innerWidth - w, newX));
        newY = Math.max(minY, Math.min(maxY, newY));
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
  }, [isDragging, topBound, bottomBound]);

  const dragStyle: CSSProperties = position
    ? {
        position: 'fixed',
        left: position.x,
        top: position.y,
        right: 'auto',
        bottom: 'auto',
        zIndex: 50,
        ...(dragWidth ? { width: dragWidth } : {}),
      }
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
    dragWidth,
  };
}
