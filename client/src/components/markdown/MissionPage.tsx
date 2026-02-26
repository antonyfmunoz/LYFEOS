import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ArrowLeft, Tag, Clock, Calendar, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MissionPage as MissionPageType } from '@/lib/types';
import { useLYFEOS } from '@/lib/context';
import { Badge } from '@/components/ui/badge';
import MarkdownEditor from './MarkdownEditor';
import { toast } from '@/hooks/use-toast';

interface MissionPageProps {
  slug?: string;
  id?: string;
  onBack?: () => void;
}

export default function MissionPage({ slug, id, onBack }: MissionPageProps) {
  const [, navigate] = useLocation();
  const [match, params] = useRoute('/mission/:slug');
  const { 
    missionPages, 
    getMissionPageBySlug, 
    getMissionPageById,
    updateMissionPage
  } = useLYFEOS();
  
  // Get page slug from route params if not provided as prop
  const pageSlug = slug || (params?.slug as string);
  
  // Find the mission page
  const missionPage = id 
    ? getMissionPageById(id)
    : pageSlug 
      ? getMissionPageBySlug(pageSlug)
      : undefined;
  
  // Local state for editing
  const [content, setContent] = useState(missionPage?.content || '');
  
  // Update content when mission page changes
  useEffect(() => {
    if (missionPage) {
      setContent(missionPage.content);
    }
  }, [missionPage]);
  
  // Handle content changes
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };
  
  // Save changes
  const handleSave = () => {
    if (missionPage) {
      updateMissionPage(missionPage.id, { content });
      
      toast({
        title: "Mission Page Saved",
        description: "Your changes have been saved successfully.",
        className: "bg-[#001E26] border border-[#36F1CD] text-white",
      });
    }
  };
  
  // Handle back navigation
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };
  
  // If no mission page found
  if (!missionPage) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-orbitron mb-4">Mission Not Found</h2>
        <p className="text-primary/60 mb-4">
          The mission you're looking for doesn't exist or has been deleted.
        </p>
        <Button onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mb-2" 
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        
        <h1 className="text-2xl font-orbitron mb-2">{missionPage.title}</h1>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {missionPage.tags.map((tag, index) => (
            <Badge key={index} variant="outline" className="bg-slate-800/50">
              <Tag className="h-3 w-3 mr-1" />
              {tag}
            </Badge>
          ))}
        </div>
        
        <div className="flex flex-wrap gap-4 text-sm text-primary/60">
          <div className="flex items-center">
            <Calendar className="h-4 w-4 mr-1" />
            Created: {new Date(missionPage.createdAt).toLocaleDateString()}
          </div>
          
          <div className="flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Updated: {new Date(missionPage.updatedAt).toLocaleDateString()}
          </div>
          
          <div className="flex items-center">
            <Trophy className="h-4 w-4 mr-1" />
            XP Value: {missionPage.xpValue}
          </div>
        </div>
      </div>
      
      {/* Markdown Editor */}
      <MarkdownEditor
        content={content}
        onChange={handleContentChange}
        onSave={handleSave}
        className="mb-6"
      />
      
      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-slate-700/50">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Missions
        </Button>
        
        <Button onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}