import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckSquare, Download, ExternalLink, GripHorizontal, Heading, History, Link2, Maximize2, Minus, Plus, Redo2, RotateCcw, Save, StickyNote, Trash2, Undo2, Upload } from "lucide-react";
import {
  canvasDocumentSchema,
  createCanvasId,
  createEmptyCanvasDocument,
  parseCanvasDocument,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from "@shared/canvases";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fitCanvasViewport, panCanvasViewport, zoomCanvasViewport } from "@/lib/canvasViewport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

type CanvasRecord = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  favorite: boolean;
  content: unknown;
  revision: number;
};

type CanvasRevisionRecord = {
  id: number;
  revisionNumber: number;
  action: "created" | "updated" | "restored";
  sourceRevision: number | null;
  createdAt: string;
};

const nodeColorClasses: Record<CanvasNode["color"], string> = {
  slate: "border-slate-400/40 bg-slate-950/90",
  cyan: "border-cyan-400/45 bg-cyan-950/90",
  violet: "border-violet-400/45 bg-violet-950/90",
  amber: "border-amber-400/45 bg-amber-950/90",
  rose: "border-rose-400/45 bg-rose-950/90",
  emerald: "border-emerald-400/45 bg-emerald-950/90",
};

const nodeLabels: Record<CanvasNodeType, string> = { note: "Note", heading: "Heading", task: "Task", link: "Link" };

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CanvasEditorPage() {
  const { canvasId } = useParams();
  const isNew = canvasId === "new";
  const id = Number(canvasId);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [title, setTitle] = useState("Untitled Canvas");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [document, setDocument] = useState<CanvasDocument>(() => createEmptyCanvasDocument());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [connectionTarget, setConnectionTarget] = useState("");
  const [dirty, setDirty] = useState(isNew);
  const [legacyContent, setLegacyContent] = useState<unknown | null>(null);
  const [pendingImport, setPendingImport] = useState<{ document: CanvasDocument; fileName: string } | null>(null);
  const [localHistoryState, setLocalHistoryState] = useState({ canUndo: false, canRedo: false });
  const dragRef = useRef<{ nodeIds: string[]; clientX: number; clientY: number; origins: Record<string, { x: number; y: number }>; snapshot: CanvasDocument; moved: boolean } | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; x: number; y: number; snapshot: CanvasDocument; moved: boolean } | null>(null);
  const undoStack = useRef<CanvasDocument[]>([]);
  const redoStack = useRef<CanvasDocument[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  usePageTitle(title || "Canvas");

  const query = useQuery<{ canvas: CanvasRecord }>({
    queryKey: ["/api/canvases", id],
    queryFn: () => apiRequest(`/api/canvases/${id}`),
    enabled: !isNew && Number.isInteger(id),
  });
  const revisions = useQuery<{ revisions: CanvasRevisionRecord[]; disclosure: string }>({
    queryKey: ["/api/canvases", id, "revisions"],
    queryFn: () => apiRequest(`/api/canvases/${id}/revisions`),
    enabled: !isNew && Number.isInteger(id),
  });

  useEffect(() => {
    const canvas = query.data?.canvas;
    if (!canvas) return;
    setTitle(canvas.title);
    setDescription(canvas.description || "");
    setCategory(canvas.category);
    const parsed = parseCanvasDocument(canvas.content);
    if (parsed) {
      setDocument(parsed);
      setLegacyContent(null);
    } else {
      setDocument(createEmptyCanvasDocument());
      setLegacyContent(canvas.content);
    }
    setDirty(false);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setPendingImport(null);
    undoStack.current = [];
    redoStack.current = [];
    setLocalHistoryState({ canUndo: false, canRedo: false });
  }, [query.data?.canvas.id]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => apiRequest<{ canvas: CanvasRecord }>(isNew ? "/api/canvases" : `/api/canvases/${id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: !isNew && query.data?.canvas.revision ? { "x-lyfeos-expected-revision": String(query.data.canvas.revision) } : undefined,
      body: JSON.stringify({
        title,
        description: description || null,
        category,
        favorite: query.data?.canvas.favorite || false,
        content: document,
      }),
    }),
    onSuccess: (result) => {
      setDirty(false);
      undoStack.current = []; redoStack.current = []; setLocalHistoryState({ canUndo: false, canRedo: false });
      if (!isNew) queryClient.setQueryData(["/api/canvases", id], result);
      void queryClient.invalidateQueries({ queryKey: ["/api/canvases", id, "revisions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Canvas saved", description: "Your visual workspace is stored in your private LyfeOS account." });
      if (isNew) navigate(`/canvases/${result.canvas.id}`, { replace: true });
    },
    onError: (error) => toast({ title: "Canvas could not be saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }),
  });
  const restoreRevision = useMutation({
    mutationFn: (revisionNumber: number) => apiRequest<{ canvas: CanvasRecord }>(`/api/canvases/${id}/revisions/${revisionNumber}/restore`, {
      method: "POST",
      headers: { "x-lyfeos-expected-revision": String(query.data!.canvas.revision) },
    }),
    onSuccess: (result) => {
      const restored = result.canvas;
      const content = parseCanvasDocument(restored.content);
      if (!content) return;
      setTitle(restored.title); setDescription(restored.description || ""); setCategory(restored.category); setDocument(content);
      setLegacyContent(null); setDirty(false); setSelectedNodeId(null); setSelectedNodeIds([]); setConnectionTarget("");
      undoStack.current = []; redoStack.current = []; setLocalHistoryState({ canUndo: false, canRedo: false });
      queryClient.setQueryData(["/api/canvases", id], result);
      void queryClient.invalidateQueries({ queryKey: ["/api/canvases", id, "revisions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: `Restored as version ${restored.revision}`, description: "The historical canvas was copied into a new immutable version." });
    },
  });

  const updateDocument = (updater: (current: CanvasDocument) => CanvasDocument) => {
    undoStack.current = [...undoStack.current.slice(-19), document];
    redoStack.current = [];
    setDocument(updater(document));
    setDirty(true);
    setLocalHistoryState({ canUndo: true, canRedo: false });
  };
  const undoDocument = () => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current = [...redoStack.current.slice(-19), document];
    setDocument(previous); setDirty(true); setSelectedNodeId(null); setSelectedNodeIds([]); setConnectionTarget("");
    setLocalHistoryState({ canUndo: undoStack.current.length > 0, canRedo: true });
  };
  const redoDocument = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current = [...undoStack.current.slice(-19), document];
    setDocument(next); setDirty(true); setSelectedNodeId(null); setSelectedNodeIds([]); setConnectionTarget("");
    setLocalHistoryState({ canUndo: true, canRedo: redoStack.current.length > 0 });
  };
  const stageJsonImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error("Choose a JSON file no larger than 16 MB.");
      const parsedJson = JSON.parse(await file.text()) as unknown;
      const parsed = canvasDocumentSchema.safeParse(parsedJson);
      if (!parsed.success) throw new Error("This file is not a supported LyfeOS Canvas v1 document.");
      setPendingImport({ document: parsed.data, fileName: file.name });
    } catch (error) {
      setPendingImport(null);
      toast({ title: "Canvas import could not be reviewed", description: error instanceof Error ? error.message : "Choose a valid LyfeOS Canvas JSON file.", variant: "destructive" });
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };
  const confirmJsonImport = () => {
    if (!pendingImport) return;
    updateDocument(() => pendingImport.document);
    setLegacyContent(null); setSelectedNodeId(null); setSelectedNodeIds([]); setConnectionTarget(""); setPendingImport(null);
    toast({ title: "Canvas import staged", description: "Review the imported workspace, then Save to create a new immutable version." });
  };
  const updateNode = (nodeId: string, changes: Partial<CanvasNode>) => updateDocument((current) => ({
    ...current,
    nodes: current.nodes.map((node) => node.id === nodeId ? { ...node, ...changes } : node),
  }));
  const updateEdge = (edgeId: string, changes: Partial<CanvasEdge>) => updateDocument((current) => ({
    ...current,
    edges: current.edges.map((edge) => edge.id === edgeId ? { ...edge, ...changes } : edge),
  }));
  const selectNode = (nodeId: string, extend: boolean) => {
    if (!extend) {
      setSelectedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);
      return;
    }
    const next = selectedNodeIds.includes(nodeId) ? selectedNodeIds.filter((id) => id !== nodeId) : [...selectedNodeIds, nodeId];
    setSelectedNodeIds(next);
    setSelectedNodeId(next.includes(nodeId) ? nodeId : next.at(-1) || null);
  };
  const clearSelection = () => { setSelectedNodeIds([]); setSelectedNodeId(null); setConnectionTarget(""); };
  const addNode = (type: CanvasNodeType) => {
    const index = document.nodes.length;
    const node: CanvasNode = {
      id: createCanvasId("node"),
      type,
      x: 40 + (index % 4) * 260,
      y: 40 + Math.floor(index / 4) * 190,
      width: type === "heading" ? 300 : 220,
      height: type === "heading" ? 90 : 140,
      title: type === "heading" ? "New heading" : type === "task" ? "New task" : type === "link" ? "New link" : "New note",
      body: "",
      color: type === "task" ? "emerald" : type === "link" ? "violet" : type === "heading" ? "cyan" : "slate",
      completed: false,
      url: null,
    };
    updateDocument((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(node.id); setSelectedNodeIds([node.id]);
  };
  const deleteNode = (nodeId: string) => {
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId),
    }));
    clearSelection();
  };
  const deleteSelectedNodes = () => {
    const selected = new Set(selectedNodeIds);
    if (!selected.size) return;
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !selected.has(node.id)),
      edges: current.edges.filter((edge) => !selected.has(edge.sourceId) && !selected.has(edge.targetId)),
    }));
    clearSelection();
  };
  const updateSelectedNodes = (changes: Partial<CanvasNode>) => {
    const selected = new Set(selectedNodeIds);
    updateDocument((current) => ({ ...current, nodes: current.nodes.map((node) => selected.has(node.id) ? { ...node, ...changes } : node) }));
  };
  const addConnection = () => {
    if (!selectedNodeId || !connectionTarget || selectedNodeId === connectionTarget) return;
    if (document.edges.some((edge) => edge.sourceId === selectedNodeId && edge.targetId === connectionTarget)) return;
    updateDocument((current) => ({
      ...current,
      edges: [...current.edges, { id: createCanvasId("edge"), sourceId: selectedNodeId, targetId: connectionTarget, label: "", style: "solid" }],
    }));
    setConnectionTarget("");
  };
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, node: CanvasNode) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nodeIds = selectedNodeIds.includes(node.id) ? selectedNodeIds : event.shiftKey ? [...selectedNodeIds, node.id] : [node.id];
    const origins = Object.fromEntries(document.nodes.filter((item) => nodeIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    dragRef.current = { nodeIds, clientX: event.clientX, clientY: event.clientY, origins, snapshot: document, moved: false };
    setSelectedNodeIds(nodeIds); setSelectedNodeId(node.id);
    event.preventDefault();
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const deltaX = (event.clientX - drag.clientX) / document.viewport.zoom;
    const deltaY = (event.clientY - drag.clientY) / document.viewport.zoom;
    if (!deltaX && !deltaY) return;
    drag.moved = true;
    setDocument((current) => ({ ...current, nodes: current.nodes.map((node) => {
      const origin = drag.origins[node.id];
      return origin ? { ...node, x: Math.max(0, Math.min(10_000, Math.round(origin.x + deltaX))), y: Math.max(0, Math.min(10_000, Math.round(origin.y + deltaY))) } : node;
    }) }));
    setDirty(true);
  };
  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const drag = dragRef.current;
    if (drag?.moved) {
      undoStack.current = [...undoStack.current.slice(-19), drag.snapshot];
      redoStack.current = [];
      setLocalHistoryState({ canUndo: true, canRedo: false });
    }
    dragRef.current = null;
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-canvas-node]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { clientX: event.clientX, clientY: event.clientY, x: document.viewport.x, y: document.viewport.y, snapshot: document, moved: false };
    clearSelection();
    event.preventDefault();
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const deltaX = event.clientX - pan.clientX;
    const deltaY = event.clientY - pan.clientY;
    if (!deltaX && !deltaY) return;
    pan.moved = true;
    setDocument((current) => ({ ...current, viewport: panCanvasViewport({ x: pan.x, y: pan.y, zoom: current.viewport.zoom }, deltaX, deltaY) }));
    setDirty(true);
  };
  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const pan = panRef.current;
    if (pan?.moved) {
      undoStack.current = [...undoStack.current.slice(-19), pan.snapshot];
      redoStack.current = [];
      setLocalHistoryState({ canUndo: true, canRedo: false });
    }
    panRef.current = null;
  };
  const changeZoom = (delta: number) => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    updateDocument((current) => ({ ...current, viewport: zoomCanvasViewport(current.viewport, current.viewport.zoom + delta, viewport.clientWidth / 2, viewport.clientHeight / 2) }));
  };
  const fitView = () => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    updateDocument((current) => ({ ...current, viewport: fitCanvasViewport(current.nodes, viewport.clientWidth, viewport.clientHeight) }));
  };
  const resetView = () => updateDocument((current) => ({ ...current, viewport: { x: 0, y: 0, zoom: 1 } }));

  const selectedNode = selectedNodeIds.length === 1 ? document.nodes.find((node) => node.id === selectedNodeId) || null : null;
  const selectedEdges = useMemo(() => document.edges.filter((edge) => edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId), [document.edges, selectedNodeId]);
  const filename = `${title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "lyfeos-canvas"}.json`;

  if (query.isLoading) return <div className="container py-8 text-sm text-muted-foreground">Loading canvas…</div>;
  if (query.isError) return <div className="container py-8 text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Canvas unavailable."}</div>;

  return <div className="container max-w-[1600px] py-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href="/canvases"><Button variant="outline">Canvas</Button></Link>
        <Input aria-label="Canvas title" value={title} maxLength={160} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} className="max-w-md font-medium" />
        {dirty && <span className="text-xs text-amber-400">unsaved</span>}
      </div>
      <div className="flex gap-2">
        <input ref={importInput} type="file" accept="application/json,.json" className="hidden" aria-label="Import LyfeOS Canvas JSON" onChange={(event) => void stageJsonImport(event.target.files?.[0])} />
        <Button variant="outline" onClick={() => importInput.current?.click()}><Upload className="mr-1 h-4 w-4" />Import</Button>
        <Button variant="outline" onClick={() => downloadJson(filename, legacyContent ?? document)}><Download className="mr-1 h-4 w-4" />JSON</Button>
        <Button disabled={!dirty || !title.trim() || save.isPending || legacyContent !== null} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />{save.isPending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
      <Input aria-label="Canvas category" value={category} maxLength={80} onChange={(event) => { setCategory(event.target.value); setDirty(true); }} placeholder="Category" />
      <Textarea aria-label="Canvas description" value={description} maxLength={800} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} placeholder="What is this canvas for?" className="min-h-9 resize-y py-2" />
    </div>

    {pendingImport && <section className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label="Canvas import review">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-medium">Review JSON import</h2><p className="mt-1 text-xs text-muted-foreground">{pendingImport.fileName} · {pendingImport.document.nodes.length} nodes · {pendingImport.document.edges.length} connections · viewport {Math.round(pendingImport.document.viewport.zoom * 100)}%</p></div>
        <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancel</Button><Button size="sm" onClick={confirmJsonImport}>Replace unsaved canvas</Button></div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">The file was parsed locally and has not been uploaded or saved. Confirming replaces the current unsaved document only; Undo remains available, and persistence still requires Save.</p>
    </section>}

    {legacyContent !== null ? <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm">
      <p className="font-medium text-amber-200">Legacy canvas preserved</p>
      <p className="mt-1 text-amber-100/75">This record predates the versioned Canvas format. LyfeOS will not overwrite it silently. Download the JSON for safekeeping, then explicitly start a blank v1 workspace when you are ready.</p>
      <Button className="mt-3" variant="outline" onClick={() => {
        if (!window.confirm("Replace the legacy canvas content with a blank versioned canvas? Download the JSON first if you need the old data.")) return;
        setLegacyContent(null);
        setDocument(createEmptyCanvasDocument());
        setDirty(true);
      }}>Start blank v1 canvas</Button>
    </div> : <>
      <div className="flex flex-wrap gap-2 rounded-xl border border-primary/15 bg-card/30 p-2">
        <Button size="sm" variant="outline" disabled={!localHistoryState.canUndo} onClick={undoDocument}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>
        <Button size="sm" variant="outline" disabled={!localHistoryState.canRedo} onClick={redoDocument}><Redo2 className="mr-1 h-4 w-4" />Redo</Button>
        <span aria-hidden="true" className="mx-1 w-px self-stretch bg-primary/15" />
        <Button size="sm" variant="outline" onClick={() => addNode("note")}><StickyNote className="mr-1 h-4 w-4" />Note</Button>
        <Button size="sm" variant="outline" onClick={() => addNode("heading")}><Heading className="mr-1 h-4 w-4" />Heading</Button>
        <Button size="sm" variant="outline" onClick={() => addNode("task")}><CheckSquare className="mr-1 h-4 w-4" />Task</Button>
        <Button size="sm" variant="outline" onClick={() => addNode("link")}><Link2 className="mr-1 h-4 w-4" />Link</Button>
        <span aria-hidden="true" className="mx-1 w-px self-stretch bg-primary/15" />
        <Button size="sm" variant="outline" disabled={!document.nodes.length || selectedNodeIds.length === document.nodes.length} onClick={() => { setSelectedNodeIds(document.nodes.map((node) => node.id)); setSelectedNodeId(document.nodes.at(-1)?.id || null); }}>Select all</Button>
        <Button size="sm" variant="ghost" disabled={!selectedNodeIds.length} onClick={clearSelection}>Clear</Button>
        <span aria-live="polite" className="self-center text-xs text-muted-foreground">{selectedNodeIds.length} selected</span>
        <span className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom out" disabled={document.viewport.zoom <= 0.25} onClick={() => changeZoom(-0.25)}><Minus className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" className="h-8 min-w-16" onClick={resetView} aria-label="Reset canvas view to 100 percent">{Math.round(document.viewport.zoom * 100)}%</Button>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom in" disabled={document.viewport.zoom >= 3} onClick={() => changeZoom(0.25)}><Plus className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="h-8" disabled={!document.nodes.length} onClick={fitView}><Maximize2 className="mr-1 h-4 w-4" />Fit</Button>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Drag empty space to pan. Shift-click nodes to extend or reduce the selection; selected nodes move together. Undo and Redo retain 20 unsaved document changes, with each node drag, pan, zoom, fit, bulk action, or confirmed import stored as one reversible change.</p>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div ref={canvasViewportRef} className="relative h-[72vh] min-h-[500px] touch-none overflow-hidden rounded-xl border border-primary/15 bg-black/30 cursor-grab active:cursor-grabbing" aria-label="Canvas workspace. Drag empty space to pan." onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}>
          <div className="absolute left-0 top-0 h-[10000px] w-[10000px] origin-top-left" style={{ transform: `translate3d(${document.viewport.x}px, ${document.viewport.y}px, 0) scale(${document.viewport.zoom})`, backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-[10000px] w-[10000px]">
              <defs><marker id="canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 Z" fill="hsl(var(--primary))" fillOpacity="0.65" /></marker></defs>
              {document.edges.map((edge) => {
                const source = document.nodes.find((node) => node.id === edge.sourceId);
                const target = document.nodes.find((node) => node.id === edge.targetId);
                if (!source || !target) return null;
                const x1 = source.x + source.width / 2; const y1 = source.y + source.height / 2; const x2 = target.x + target.width / 2; const y2 = target.y + target.height / 2;
                return <g key={edge.id}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--primary))" strokeOpacity="0.45" strokeWidth="2" strokeDasharray={edge.style === "dashed" ? "7 6" : undefined} markerEnd="url(#canvas-arrow)" />{edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fill="hsl(var(--foreground))" fillOpacity="0.75" fontSize="12" paintOrder="stroke" stroke="hsl(var(--background))" strokeWidth="4">{edge.label}</text>}</g>;
              })}
            </svg>
            {document.nodes.map((node) => <div
              key={node.id}
              data-canvas-node={node.id}
              role="button"
              tabIndex={0}
              aria-label={`${nodeLabels[node.type]}: ${node.title || "Untitled"}`}
              aria-pressed={selectedNodeIds.includes(node.id)}
              onClick={(event) => selectNode(node.id, event.shiftKey)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(node.id, event.shiftKey); } }}
              className={`absolute cursor-default overflow-hidden rounded-xl border shadow-xl transition ${nodeColorClasses[node.color]} ${selectedNodeIds.includes(node.id) ? "ring-2 ring-primary" : "hover:border-primary/60"}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
            >
              <div className="flex touch-none cursor-grab items-center justify-between border-b border-white/10 px-3 py-2 active:cursor-grabbing" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startDrag(event, node)} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
                <span className="truncate text-[10px] font-mono uppercase tracking-wider text-white/55">{nodeLabels[node.type]}</span><GripHorizontal className="h-3.5 w-3.5 text-white/40" />
              </div>
              <div className="p-3">
                <p className={`${node.type === "heading" ? "text-xl font-orbitron" : "font-medium"} ${node.completed ? "line-through opacity-60" : ""}`}>{node.title || "Untitled"}</p>
                {node.body && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-white/65">{node.body}</p>}
                {node.type === "link" && node.url && <a href={node.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Open <ExternalLink className="h-3 w-3" /></a>}
              </div>
            </div>)}
            {!document.nodes.length && <div className="absolute left-10 top-10 rounded-xl border border-dashed border-primary/25 bg-background/60 p-8 text-sm text-muted-foreground">Add a note, heading, task, or link to begin mapping.</div>}
          </div>
        </div>
        <aside className="rounded-xl border border-primary/15 bg-card/35 p-4">
          {selectedNode ? <div className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="font-medium">Node inspector</h2><Button size="icon" variant="ghost" aria-label="Delete selected node" onClick={() => deleteNode(selectedNode.id)}><Trash2 className="h-4 w-4" /></Button></div>
            <select aria-label="Node type" value={selectedNode.type} onChange={(event) => updateNode(selectedNode.id, { type: event.target.value as CanvasNodeType })} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm">
              {Object.entries(nodeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <Input aria-label="Node title" value={selectedNode.title} maxLength={160} onChange={(event) => updateNode(selectedNode.id, { title: event.target.value })} placeholder="Title" />
            <Textarea aria-label="Node body" value={selectedNode.body} maxLength={10_000} onChange={(event) => updateNode(selectedNode.id, { body: event.target.value })} placeholder="Details" className="min-h-28" />
            {selectedNode.type === "link" && <Input aria-label="Node URL" type="url" value={selectedNode.url || ""} maxLength={2_000} onChange={(event) => updateNode(selectedNode.id, { url: event.target.value || null })} placeholder="https://example.com" />}
            {selectedNode.type === "task" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedNode.completed} onChange={(event) => updateNode(selectedNode.id, { completed: event.target.checked })} />Complete</label>}
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Node X position" type="number" min={0} max={10_000} value={selectedNode.x} onChange={(event) => updateNode(selectedNode.id, { x: Math.max(0, Math.min(10_000, Number(event.target.value) || 0)) })} />
              <Input aria-label="Node Y position" type="number" min={0} max={10_000} value={selectedNode.y} onChange={(event) => updateNode(selectedNode.id, { y: Math.max(0, Math.min(10_000, Number(event.target.value) || 0)) })} />
            </div>
            <select aria-label="Node color" value={selectedNode.color} onChange={(event) => updateNode(selectedNode.id, { color: event.target.value as CanvasNode["color"] })} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm">
              {Object.keys(nodeColorClasses).map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
            <div className="border-t border-primary/15 pt-3">
              <p className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">Connections</p>
              <div className="flex gap-2">
                <select aria-label="Connection target" value={connectionTarget} onChange={(event) => setConnectionTarget(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-primary/20 bg-background px-2 text-xs">
                  <option value="">Choose target</option>
                  {document.nodes.filter((node) => node.id !== selectedNode.id).map((node) => <option key={node.id} value={node.id}>{node.title || nodeLabels[node.type]}</option>)}
                </select>
                <Button size="icon" variant="outline" aria-label="Add connection" disabled={!connectionTarget} onClick={addConnection}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 space-y-1">
                {selectedEdges.map((edge) => {
                  const otherId = edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
                  const other = document.nodes.find((node) => node.id === otherId);
                  return <div key={edge.id} className="space-y-2 rounded border border-primary/10 p-2 text-xs"><div className="flex items-center justify-between"><span className="truncate">{edge.sourceId === selectedNode.id ? "to" : "from"} {other?.title || "Node"}</span><Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Delete connection" onClick={() => updateDocument((current) => ({ ...current, edges: current.edges.filter((item) => item.id !== edge.id) }))}><Trash2 className="h-3 w-3" /></Button></div><Input aria-label={`Connection label ${other?.title || "Node"}`} value={edge.label} maxLength={120} onChange={(event) => updateEdge(edge.id, { label: event.target.value })} className="h-8 text-xs" placeholder="Relationship label" /><select aria-label={`Connection style ${other?.title || "Node"}`} value={edge.style} onChange={(event) => updateEdge(edge.id, { style: event.target.value as CanvasEdge["style"] })} className="h-8 w-full rounded-md border border-primary/20 bg-background px-2 text-xs"><option value="solid">Directed solid</option><option value="dashed">Directed dashed</option></select></div>;
                })}
                {!selectedEdges.length && <p className="text-xs text-muted-foreground">No connections yet.</p>}
              </div>
            </div>
          </div> : selectedNodeIds.length > 1 ? <div className="space-y-3">
            <div className="flex items-center justify-between"><div><h2 className="font-medium">Group inspector</h2><p className="text-xs text-muted-foreground">{selectedNodeIds.length} nodes selected</p></div><Button size="icon" variant="ghost" aria-label="Delete selected nodes" onClick={deleteSelectedNodes}><Trash2 className="h-4 w-4" /></Button></div>
            <p className="text-xs text-muted-foreground">Drag any selected node header to move the group together. Bulk color and deletion are each one reversible change.</p>
            <select aria-label="Selected node color" defaultValue="" onChange={(event) => { if (event.target.value) updateSelectedNodes({ color: event.target.value as CanvasNode["color"] }); event.currentTarget.value = ""; }} className="h-9 w-full rounded-md border border-primary/20 bg-background px-2 text-sm">
              <option value="">Apply color…</option>
              {Object.keys(nodeColorClasses).map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
            <Button variant="outline" className="w-full" onClick={clearSelection}>Clear selection</Button>
          </div> : <p className="text-sm text-muted-foreground">Select a node to edit it. Shift-click to select multiple nodes for grouped movement and bulk actions.</p>}
        </aside>
      </div>
    </>}
    {!isNew && <details className="rounded-xl border border-primary/15 bg-card/30 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium"><History className="h-4 w-4" />Saved version history</summary>
      <p className="mt-2 text-xs text-muted-foreground">Saved versions are immutable. Restoring copies the selected canvas into a new version; it never deletes or rewrites history. The 100 most recent versions are shown.</p>
      {revisions.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading saved versions…</p>}
      {revisions.isError && <p role="alert" className="mt-3 text-sm text-destructive">{revisions.error instanceof Error ? revisions.error.message : "Saved versions are unavailable."}</p>}
      {restoreRevision.isError && <p role="alert" className="mt-3 text-sm text-destructive">{restoreRevision.error instanceof Error ? restoreRevision.error.message : "That version could not be restored."} Reload the canvas if another session saved a newer version.</p>}
      {revisions.data?.revisions && <ol className="mt-3 divide-y divide-primary/10">
        {revisions.data.revisions.map((revision) => {
          const isCurrent = revision.revisionNumber === query.data?.canvas.revision;
          const action = revision.action === "restored" ? `restored from version ${revision.sourceRevision}` : revision.action;
          return <li key={revision.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium">Version {revision.revisionNumber}{isCurrent ? " · current" : ""}</p><p className="text-xs text-muted-foreground">{action} · {new Date(revision.createdAt).toLocaleString()}</p></div>
            <Button type="button" size="sm" variant="outline" disabled={isCurrent || restoreRevision.isPending || dirty} onClick={() => { if (window.confirm(`Restore version ${revision.revisionNumber} as a new saved version? Your existing history will remain available.`)) restoreRevision.mutate(revision.revisionNumber); }}><RotateCcw className="mr-1 h-3.5 w-3.5" />Restore</Button>
          </li>;
        })}
      </ol>}
      {dirty && <p className="mt-2 text-xs text-amber-400">Save or discard your current unsaved changes before restoring a saved version.</p>}
    </details>}
  </div>;
}
