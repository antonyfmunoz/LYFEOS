import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { 
  ChevronLeft, 
  Download,
  Star,
  Trash2,
  Pencil,
  Share
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

// Define the MediaItem interface
interface MediaItem {
  id: number;
  userId?: number;
  fileName: string;
  title: string;
  fileType: string;
  thumbnailUrl: string;
  fileUrl?: string;
  fileData?: string; // Base64 data URL from server
  fileSize?: number;
  width?: number;
  height?: number;
  albumId?: number | null;
  isFavorite: boolean;
  createdAt?: string;
}

// Format file size helper
function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function MediaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  // Get the selected media item
  const { data, isLoading, error } = useQuery<{ mediaItems: MediaItem[] }>({
    queryKey: ['/api/users/2/media-items'],
    enabled: true,
  });

  // Find the specific media item by ID
  const mediaItem = data?.mediaItems.find(item => item.id === parseInt(id));

  // States for edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  // Set title when mediaItem loads
  useEffect(() => {
    if (mediaItem) {
      setEditTitle(mediaItem.title || mediaItem.fileName);
    }
  }, [mediaItem]);

  // Handle download
  const handleDownload = () => {
    if (!mediaItem) return;
    
    // Handle download logic
    const link = document.createElement('a');
    
    if (mediaItem.fileData) {
      // For data URLs
      link.href = mediaItem.fileData;
    } else if (mediaItem.fileUrl) {
      // For file URLs
      link.href = mediaItem.fileUrl;
    } else if (mediaItem.thumbnailUrl) {
      // Fallback to thumbnail
      link.href = mediaItem.thumbnailUrl;
    } else {
      console.error("No downloadable URL available");
      return;
    }
    
    link.download = mediaItem.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If loading, show skeleton
  if (isLoading) {
    return (
      <div className="container py-6 max-w-4xl">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate('/media')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Skeleton className="h-8 w-48 ml-4" />
        </div>
        <Skeleton className="w-full aspect-video rounded-md mb-4" />
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  // If error or no mediaItem found, show error message
  if (error || !mediaItem) {
    return (
      <div className="container py-6 max-w-4xl">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate('/media')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-orbitron">Media Not Found</h1>
        </div>
        <div className="bg-destructive/10 p-4 rounded-md text-destructive">
          The requested media item could not be found. It may have been deleted or moved.
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2" 
            onClick={() => navigate('/media')}
          >
            Return to Media Library
          </Button>
        </div>
      </div>
    );
  }

  // Determine the media source to display
  const mediaSource = mediaItem.fileData || mediaItem.fileUrl || mediaItem.thumbnailUrl || '';

  return (
    <div className="container py-6 max-w-4xl">
      {/* Header with back button and title */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
            onClick={() => navigate('/media')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {isEditMode ? (
            <div className="flex items-center gap-2 ml-4">
              <input 
                type="text" 
                value={editTitle} 
                onChange={(e) => setEditTitle(e.target.value)}
                className="px-2 py-1 rounded-md border border-input bg-background text-xl"
                autoFocus
              />
              <Button 
                size="sm" 
                onClick={() => setIsEditMode(false)}
                className="ml-2"
              >
                Save
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setEditTitle(mediaItem.title || mediaItem.fileName);
                  setIsEditMode(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <h1 className="text-2xl font-orbitron ml-4">{mediaItem.title || mediaItem.fileName}</h1>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => setIsEditMode(true)}>
                <Pencil className="h-3 w-3 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs cursor-pointer">
                <Star className="h-3 w-3 mr-2" />
                {mediaItem.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs cursor-pointer">
                <Share className="h-3 w-3 mr-2" />
                Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="h-3 w-3 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Media display */}
      <div className="rounded-lg overflow-hidden border border-border mb-4 flex justify-center">
        {mediaItem.fileType === 'image' ? (
          <img 
            src={mediaSource} 
            alt={mediaItem.title || mediaItem.fileName} 
            className="max-h-[80vh] object-contain"
          />
        ) : mediaItem.fileType === 'video' ? (
          <video 
            controls 
            className="max-h-[80vh] w-full"
            src={mediaSource}
          >
            Your browser doesn't support video playback.
          </video>
        ) : (
          <div className="p-4 text-center">
            Unsupported media type
          </div>
        )}
      </div>

      {/* Media details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div>
          <h2 className="text-lg font-semibold mb-2">Details</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Filename:</span> {mediaItem.fileName}</div>
            <div><span className="text-muted-foreground">Type:</span> {mediaItem.fileType}</div>
            <div><span className="text-muted-foreground">Size:</span> {formatFileSize(mediaItem.fileSize)}</div>
            {mediaItem.width && mediaItem.height && (
              <div><span className="text-muted-foreground">Dimensions:</span> {mediaItem.width} × {mediaItem.height}</div>
            )}
            <div><span className="text-muted-foreground">Created:</span> {new Date(mediaItem.createdAt || '').toLocaleString()}</div>
          </div>
        </div>
        
        {mediaItem.albumId && (
          <div>
            <h2 className="text-lg font-semibold mb-2">Album</h2>
            <div className="text-sm">
              <div><span className="text-muted-foreground">Album ID:</span> {mediaItem.albumId}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}