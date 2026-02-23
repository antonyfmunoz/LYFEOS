import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/authContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ObsidianMarkdown } from '@/components/ui/obsidian-markdown';
import {
  ArrowLeft, Plus, FolderPlus, FileText, Folder, FolderOpen, MoreHorizontal,
  Trash, Edit, Star, StarOff, ChevronRight, Home, Search, Save, X, Eye, Pencil,
  ArrowUpLeft, File, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Document, Folder as FolderType } from '@shared/schema';

type ViewMode = 'browse' | 'edit' | 'preview';

export default function DocumentVaultPage() {
  usePageTitle('Document Vault');
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showRenameFolderDialog, setShowRenameFolderDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'folder' | 'document'; id: number; name: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [renameFolderId, setRenameFolderId] = useState<number | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [moveTarget, setMoveTarget] = useState<{ type: 'folder' | 'document'; id: number } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: folders = [], isLoading: foldersLoading } = useQuery<FolderType[]>({
    queryKey: ['/api/folders'],
    enabled: !!user,
  });

  const { data: documents = [], isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    enabled: !!user,
  });

  const createFolder = useMutation({
    mutationFn: (data: { name: string; parentId?: number | null }) =>
      apiRequest('/api/folders', { method: 'POST', body: JSON.stringify({ ...data, userId: user!.id }), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      setShowNewFolderDialog(false);
      setNewFolderName('');
      toast({ title: 'Folder created' });
    },
  });

  const updateFolder = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; parentId?: number | null }) =>
      apiRequest(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      setShowRenameFolderDialog(false);
      toast({ title: 'Folder updated' });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/folders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({ title: 'Folder deleted' });
    },
  });

  const createDocument = useMutation({
    mutationFn: (data: { title: string; content: string; folderId?: number | null }) =>
      apiRequest<Document>('/api/documents', { method: 'POST', body: JSON.stringify({ ...data, userId: user!.id }), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setShowNewDocDialog(false);
      setNewDocTitle('');
      setSelectedDoc(doc);
      setEditTitle(doc.title);
      setEditContent(doc.content);
      setViewMode('edit');
    },
  });

  const updateDocument = useMutation({
    mutationFn: ({ id, ...data }: { id: number; title?: string; content?: string; folderId?: number | null }) =>
      apiRequest(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setHasUnsavedChanges(false);
      toast({ title: 'Document saved' });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      if (selectedDoc) {
        setSelectedDoc(null);
        setViewMode('browse');
      }
      toast({ title: 'Document deleted' });
    },
  });

  const toggleFavoriteDoc = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/documents/${id}/favorite`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/documents'] }),
  });

  const toggleFavoriteFolder = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/folders/${id}/favorite`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/folders'] }),
  });

  const currentFolders = folders.filter(f =>
    currentFolderId === null ? !f.parentId : f.parentId === currentFolderId
  );

  const currentDocuments = documents.filter(d =>
    currentFolderId === null ? !d.folderId : d.folderId === currentFolderId
  );

  const getBreadcrumbs = useCallback(() => {
    const crumbs: { id: number | null; name: string }[] = [{ id: null, name: 'Root' }];
    if (currentFolderId === null) return crumbs;
    const buildPath = (fid: number) => {
      const folder = folders.find(f => f.id === fid);
      if (!folder) return;
      if (folder.parentId) buildPath(folder.parentId);
      crumbs.push({ id: folder.id, name: folder.name });
    };
    buildPath(currentFolderId);
    return crumbs;
  }, [currentFolderId, folders]);

  const filteredDocs = searchQuery
    ? documents.filter(d =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : currentDocuments;

  const filteredFolders = searchQuery
    ? folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : currentFolders;

  const handleSaveDoc = useCallback(() => {
    if (!selectedDoc) return;
    updateDocument.mutate({ id: selectedDoc.id, title: editTitle, content: editContent });
    setSelectedDoc(prev => prev ? { ...prev, title: editTitle, content: editContent } : null);
  }, [selectedDoc, editTitle, editContent]);

  const openDoc = (doc: Document) => {
    setSelectedDoc(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setViewMode('preview');
    setHasUnsavedChanges(false);
  };

  const handleMove = (targetFolderId: number | null) => {
    if (!moveTarget) return;
    if (moveTarget.type === 'document') {
      updateDocument.mutate({ id: moveTarget.id, folderId: targetFolderId });
    } else {
      updateFolder.mutate({ id: moveTarget.id, parentId: targetFolderId });
    }
    setShowMoveDialog(false);
    setMoveTarget(null);
  };

  const formatDate = (d: string | Date) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isLoading = foldersLoading || docsLoading;

  if (viewMode !== 'browse' && selectedDoc) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-card/50">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              if (hasUnsavedChanges) {
                if (confirm('You have unsaved changes. Discard them?')) {
                  setViewMode('browse');
                  setSelectedDoc(null);
                  setHasUnsavedChanges(false);
                }
              } else {
                setViewMode('browse');
                setSelectedDoc(null);
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {viewMode === 'edit' ? (
            <Input
              value={editTitle}
              onChange={e => { setEditTitle(e.target.value); setHasUnsavedChanges(true); }}
              className="text-lg font-semibold border-none bg-transparent focus-visible:ring-0 px-0 h-auto"
              placeholder="Document title"
            />
          ) : (
            <h2 className="text-lg font-semibold truncate flex-1">{selectedDoc.title}</h2>
          )}
          <div className="flex items-center gap-1 ml-auto">
            {viewMode === 'edit' ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode('preview')}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveDoc}
                  disabled={updateDocument.isPending}
                  className="h-8 gap-1"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode('edit')}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toggleFavoriteDoc.mutate(selectedDoc.id)}>
                  {selectedDoc.favorite ? <StarOff className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                  {selectedDoc.favorite ? 'Remove Favorite' : 'Add Favorite'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setMoveTarget({ type: 'document', id: selectedDoc.id }); setShowMoveDialog(true); }}>
                  <ArrowUpLeft className="h-4 w-4 mr-2" />
                  Move to Folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteTarget({ type: 'document', id: selectedDoc.id, name: selectedDoc.title })}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {viewMode === 'edit' ? (
            <Textarea
              ref={editorRef}
              value={editContent}
              onChange={e => { setEditContent(e.target.value); setHasUnsavedChanges(true); }}
              className="w-full h-full min-h-[calc(100vh-8rem)] resize-none border-none rounded-none bg-transparent font-mono text-sm focus-visible:ring-0 p-4"
              placeholder="Start writing... (Markdown supported)"
            />
          ) : (
            <div className="p-4 prose prose-invert max-w-none">
              <ObsidianMarkdown>{editContent || selectedDoc.content}</ObsidianMarkdown>
            </div>
          )}
        </div>
        {renderDeleteDialog()}
        {renderMoveDialog()}
      </div>
    );
  }

  function renderDeleteDialog() {
    return (
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === 'folder' ? 'Folder' : 'Document'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
              {deleteTarget?.type === 'folder' && ' Documents inside will be moved to the parent folder.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.type === 'folder') deleteFolder.mutate(deleteTarget.id);
                else {
                  deleteDocument.mutate(deleteTarget.id);
                }
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  function renderMoveDialog() {
    const availableFolders = folders.filter(f => {
      if (moveTarget?.type === 'folder' && f.id === moveTarget.id) return false;
      return true;
    });
    return (
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 max-h-60 overflow-auto">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => handleMove(null)}
            >
              <Home className="h-4 w-4" />
              Root (No Folder)
            </Button>
            {availableFolders.map(f => (
              <Button
                key={f.id}
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={() => handleMove(f.id)}
              >
                <Folder className="h-4 w-4" />
                {f.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const favoriteDocuments = documents.filter(d => d.favorite);
  const favoriteFolders = folders.filter(f => f.favorite);
  const hasFavorites = favoriteDocuments.length > 0 || favoriteFolders.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/chronilog')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold font-orbitron">Document Vault</h1>
          <div className="flex gap-1 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={() => setShowNewFolderDialog(true)}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Folder</span>
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1"
              onClick={() => setShowNewDocDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Document</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search documents & folders..."
            className="pl-9 h-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {!searchQuery && (
          <div className="flex items-center gap-1 text-sm overflow-x-auto no-scrollbar">
            {getBreadcrumbs().map((crumb, i, arr) => (
              <span key={crumb.id ?? 'root'} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className={cn(
                    "hover:text-primary transition-colors",
                    i === arr.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {i === 0 ? <Home className="h-3.5 w-3.5 inline" /> : crumb.name}
                </button>
                {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-24 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {!searchQuery && hasFavorites && currentFolderId === null && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Favorites</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {favoriteFolders.map(f => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      onOpen={() => setCurrentFolderId(f.id)}
                      onRename={() => { setRenameFolderId(f.id); setRenameFolderName(f.name); setShowRenameFolderDialog(true); }}
                      onDelete={() => setDeleteTarget({ type: 'folder', id: f.id, name: f.name })}
                      onToggleFavorite={() => toggleFavoriteFolder.mutate(f.id)}
                      onMove={() => { setMoveTarget({ type: 'folder', id: f.id }); setShowMoveDialog(true); }}
                      docCount={documents.filter(d => d.folderId === f.id).length}
                    />
                  ))}
                  {favoriteDocuments.map(d => (
                    <DocumentCard
                      key={d.id}
                      doc={d}
                      onOpen={() => openDoc(d)}
                      onDelete={() => setDeleteTarget({ type: 'document', id: d.id, name: d.title })}
                      onToggleFavorite={() => toggleFavoriteDoc.mutate(d.id)}
                      onMove={() => { setMoveTarget({ type: 'document', id: d.id }); setShowMoveDialog(true); }}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredFolders.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Folders</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredFolders.map(f => (
                    <FolderCard
                      key={f.id}
                      folder={f}
                      onOpen={() => { setCurrentFolderId(f.id); setSearchQuery(''); }}
                      onRename={() => { setRenameFolderId(f.id); setRenameFolderName(f.name); setShowRenameFolderDialog(true); }}
                      onDelete={() => setDeleteTarget({ type: 'folder', id: f.id, name: f.name })}
                      onToggleFavorite={() => toggleFavoriteFolder.mutate(f.id)}
                      onMove={() => { setMoveTarget({ type: 'folder', id: f.id }); setShowMoveDialog(true); }}
                      docCount={documents.filter(d => d.folderId === f.id).length}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredDocs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Documents</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredDocs.map(d => (
                    <DocumentCard
                      key={d.id}
                      doc={d}
                      onOpen={() => openDoc(d)}
                      onDelete={() => setDeleteTarget({ type: 'document', id: d.id, name: d.title })}
                      onToggleFavorite={() => toggleFavoriteDoc.mutate(d.id)}
                      onMove={() => { setMoveTarget({ type: 'document', id: d.id }); setShowMoveDialog(true); }}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredFolders.length === 0 && filteredDocs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-primary/50" />
                </div>
                <h3 className="text-lg font-semibold mb-1">
                  {searchQuery ? 'No results found' : 'Empty folder'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery ? 'Try a different search term' : 'Create a folder or document to get started'}
                </p>
                {!searchQuery && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowNewFolderDialog(true)}>
                      <FolderPlus className="h-4 w-4 mr-2" />
                      New Folder
                    </Button>
                    <Button size="sm" onClick={() => setShowNewDocDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Document
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                createFolder.mutate({ name: newFolderName.trim(), parentId: currentFolderId });
              }
            }}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => createFolder.mutate({ name: newFolderName.trim(), parentId: currentFolderId })}
              disabled={!newFolderName.trim() || createFolder.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewDocDialog} onOpenChange={setShowNewDocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>
          <Input
            value={newDocTitle}
            onChange={e => setNewDocTitle(e.target.value)}
            placeholder="Document title"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && newDocTitle.trim()) {
                createDocument.mutate({ title: newDocTitle.trim(), content: '', folderId: currentFolderId });
              }
            }}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => createDocument.mutate({ title: newDocTitle.trim(), content: '', folderId: currentFolderId })}
              disabled={!newDocTitle.trim() || createDocument.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameFolderDialog} onOpenChange={setShowRenameFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={renameFolderName}
            onChange={e => setRenameFolderName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && renameFolderName.trim() && renameFolderId) {
                updateFolder.mutate({ id: renameFolderId, name: renameFolderName.trim() });
              }
            }}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (renameFolderId) updateFolder.mutate({ id: renameFolderId, name: renameFolderName.trim() });
              }}
              disabled={!renameFolderName.trim() || updateFolder.isPending}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {renderDeleteDialog()}
      {renderMoveDialog()}
    </div>
  );
}

function FolderCard({ folder, onOpen, onRename, onDelete, onToggleFavorite, onMove, docCount }: {
  folder: FolderType;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onMove: () => void;
  docCount: number;
}) {
  return (
    <Card
      className="group cursor-pointer hover:border-primary/50 transition-all duration-200"
      onClick={onOpen}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium truncate">{folder.name}</span>
            {folder.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
          </div>
          <span className="text-xs text-muted-foreground">{docCount} document{docCount !== 1 ? 's' : ''}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={onRename}>
              <Edit className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleFavorite}>
              {folder.favorite ? <StarOff className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
              {folder.favorite ? 'Remove Favorite' : 'Add Favorite'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <ArrowUpLeft className="h-4 w-4 mr-2" />
              Move
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}

function DocumentCard({ doc, onOpen, onDelete, onToggleFavorite, onMove, formatDate }: {
  doc: Document;
  onOpen: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onMove: () => void;
  formatDate: (d: string | Date) => string;
}) {
  const preview = doc.content?.slice(0, 100) || '';
  return (
    <Card
      className="group cursor-pointer hover:border-primary/50 transition-all duration-200"
      onClick={onOpen}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium truncate">{doc.title}</span>
            {doc.favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(doc.updatedAt)}
            </span>
            {preview && <span className="truncate">- {preview}</span>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={onToggleFavorite}>
              {doc.favorite ? <StarOff className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
              {doc.favorite ? 'Remove Favorite' : 'Add Favorite'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <ArrowUpLeft className="h-4 w-4 mr-2" />
              Move to Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}
