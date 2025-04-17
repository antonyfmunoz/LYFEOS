import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useLYFEOS } from '@/lib/context';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Calendar,
  Clock,
  Tag,
  Edit,
  Trash2,
  Award,
  ArrowLeft,
  Save,
  Plus,
  X
} from 'lucide-react';

export default function EnhancedMissionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { getMissionPageBySlug, updateMissionPage, deleteMissionPage } = useLYFEOS();
  const [, navigate] = useLocation();
  
  // Get the mission page data
  const missionPage = getMissionPageBySlug(slug);
  
  // State for editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [xpValue, setXpValue] = useState(10);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInputVisible, setTagInputVisible] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Update local state when mission page changes
  useEffect(() => {
    if (missionPage) {
      setTitle(missionPage.title);
      setContent(missionPage.content);
      setXpValue(missionPage.xpValue);
      setTags([...missionPage.tags]);
    }
  }, [missionPage]);
  
  // Redirect to Codex page if the mission page doesn't exist
  useEffect(() => {
    if (!missionPage) {
      navigate('/codex');
    }
  }, [missionPage, navigate]);
  
  if (!missionPage) {
    return (
      <div className="flex justify-center items-center h-full">
        <p>Mission page not found. Redirecting...</p>
      </div>
    );
  }
  
  // Handle content changes
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };
  
  // Save the mission page
  const handleSave = () => {
    updateMissionPage(missionPage.id, {
      title,
      content,
      xpValue,
      tags,
      updatedAt: new Date().toISOString()
    });
    
    // End editing modes
    setIsEditingTitle(false);
    setIsEditingTags(false);
  };
  
  // Toggle mission completion
  const toggleCompletion = () => {
    updateMissionPage(missionPage.id, {
      completed: !missionPage.completed,
      updatedAt: new Date().toISOString()
    });
  };
  
  // Delete the mission page
  const handleDelete = () => {
    deleteMissionPage(missionPage.id);
    setDeleteDialogOpen(false);
    navigate('/codex');
  };
  
  // Handle tags
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
    setTagInputVisible(false);
  };
  
  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  const keyDownHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTag();
    }
  };
  
  return (
    <div className="pb-12">
      {/* Page Header */}
      <div className="flex justify-between items-start mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="rounded-full w-8 h-8 p-0" 
          onClick={() => navigate('/codex')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`border-cyan-500/30 text-[#36F1CD] ${missionPage.completed ? 'bg-cyan-950/20' : ''}`}
                  onClick={toggleCompletion}
                >
                  <Award className="h-4 w-4 mr-1" />
                  {missionPage.completed ? 'Completed' : 'Mark Complete'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Earns {xpValue} XP when completed</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Button
            variant="destructive"
            size="sm"
            className="bg-red-900/20 hover:bg-red-900/30 border-red-500/30 text-red-400"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Title */}
      <div className="mb-4 flex items-start justify-between">
        {isEditingTitle ? (
          <div className="flex-1 mr-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-orbitron bg-transparent border-cyan-500/30 focus-visible:ring-cyan-500/50"
              autoFocus
            />
          </div>
        ) : (
          <h1 className="text-2xl font-orbitron">{title}</h1>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full w-8 h-8 p-0"
          onClick={() => {
            if (isEditingTitle) {
              handleSave();
            } else {
              setIsEditingTitle(true);
            }
          }}
        >
          {isEditingTitle ? (
            <Save className="h-4 w-4 text-cyan-400" />
          ) : (
            <Edit className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      {/* Metadata */}
      <div className="flex flex-wrap gap-3 mb-6 text-xs text-[#7DAAB2]">
        <div className="flex items-center">
          <Calendar className="h-3 w-3 mr-1" />
          <span>Created: {new Date(missionPage.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center">
          <Clock className="h-3 w-3 mr-1" />
          <span>Updated: {new Date(missionPage.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center">
          <Award className="h-3 w-3 mr-1" />
          <span>{xpValue} XP</span>
        </div>
      </div>
      
      {/* Tags */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 items-center">
          {tags.map((tag, idx) => (
            <div 
              key={idx} 
              className="bg-slate-800/50 text-slate-300 text-xs px-2 py-1 rounded-full flex items-center"
            >
              <Tag className="h-3 w-3 mr-1" />
              <span>{tag}</span>
              {isEditingTags && (
                <button 
                  className="ml-1 rounded-full p-0.5 hover:bg-slate-700"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          
          {isEditingTags && (
            tagInputVisible ? (
              <div className="flex items-center">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={keyDownHandler}
                  placeholder="Add tag..."
                  className="h-7 text-xs w-32 bg-transparent"
                  autoFocus
                />
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6 ml-1" 
                  onClick={addTag}
                >
                  <Save className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs flex items-center" 
                onClick={() => setTagInputVisible(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Tag
              </Button>
            )
          )}
          
          {!isEditingTags && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-xs" 
              onClick={() => setIsEditingTags(true)}
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}
          
          {isEditingTags && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-6 px-2 text-xs" 
              onClick={() => {
                handleSave();
                setIsEditingTags(false);
              }}
            >
              Done
            </Button>
          )}
        </div>
      </div>
      
      {/* Markdown Editor */}
      <MarkdownEditor
        content={content}
        onChange={handleContentChange}
        onSave={handleSave}
        className="mb-8"
      />
      
      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Mission Page</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete "{title}"? This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              className="bg-red-900/40 hover:bg-red-900/60"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}