import type { CanvasNode, CanvasDocument } from "@shared/canvases";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const MIN_OFFSET = -10_000;
const MAX_OFFSET = 10_000;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampCanvasZoom(value: number): number {
  return Math.round(clamp(finite(value, 1), MIN_ZOOM, MAX_ZOOM) * 100) / 100;
}

export function panCanvasViewport(viewport: CanvasDocument["viewport"], deltaX: number, deltaY: number): CanvasDocument["viewport"] {
  return {
    ...viewport,
    x: Math.round(clamp(viewport.x + finite(deltaX, 0), MIN_OFFSET, MAX_OFFSET)),
    y: Math.round(clamp(viewport.y + finite(deltaY, 0), MIN_OFFSET, MAX_OFFSET)),
  };
}

export function zoomCanvasViewport(viewport: CanvasDocument["viewport"], nextZoomInput: number, anchorX: number, anchorY: number): CanvasDocument["viewport"] {
  const nextZoom = clampCanvasZoom(nextZoomInput);
  const safeAnchorX = finite(anchorX, 0);
  const safeAnchorY = finite(anchorY, 0);
  const worldX = (safeAnchorX - viewport.x) / viewport.zoom;
  const worldY = (safeAnchorY - viewport.y) / viewport.zoom;
  return {
    x: Math.round(clamp(safeAnchorX - worldX * nextZoom, MIN_OFFSET, MAX_OFFSET)),
    y: Math.round(clamp(safeAnchorY - worldY * nextZoom, MIN_OFFSET, MAX_OFFSET)),
    zoom: nextZoom,
  };
}

export function fitCanvasViewport(nodes: CanvasNode[], viewportWidthInput: number, viewportHeightInput: number, paddingInput = 64): CanvasDocument["viewport"] {
  if (!nodes.length) return { x: 0, y: 0, zoom: 1 };
  const viewportWidth = Math.max(1, finite(viewportWidthInput, 1));
  const viewportHeight = Math.max(1, finite(viewportHeightInput, 1));
  const padding = clamp(finite(paddingInput, 64), 0, Math.min(viewportWidth, viewportHeight) / 2);
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const zoom = clampCanvasZoom(Math.min((viewportWidth - padding * 2) / contentWidth, (viewportHeight - padding * 2) / contentHeight));
  return {
    x: Math.round(clamp((viewportWidth - contentWidth * zoom) / 2 - minX * zoom, MIN_OFFSET, MAX_OFFSET)),
    y: Math.round(clamp((viewportHeight - contentHeight * zoom) / 2 - minY * zoom, MIN_OFFSET, MAX_OFFSET)),
    zoom,
  };
}
