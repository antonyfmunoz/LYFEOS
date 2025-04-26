import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { 
  ChevronLeft, 
  ChevronRight,
  Plus, 
  Minus,
  Search, 
  Filter, 
  Image as ImageIcon, 
  FolderIcon, 
  Star, 
  Grid, 
  List, 
  SlidersHorizontal, 
  MoreHorizontal, 
  Video, 
  Upload, 
  Pencil, 
  Trash2,
  X,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// Media Item component
// Define interfaces for media items and albums
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

interface MediaAlbum {
  id: number;
  title: string;
  coverImageUrl: string;
  itemCount: number;
  description?: string;
  createdAt?: string;
}

interface MediaItemProps {
  item: MediaItem;
  view: "grid" | "list";
  onSelect: (item: MediaItem) => void;
  isSelected: boolean;
}

function MediaItem({ item, view, onSelect, isSelected }: MediaItemProps) {
  const [, navigate] = useLocation();
  
  // We don't want to use blob URLs directly in the component, as they can cause memory leaks
  // Instead, we'll use a data URL if available, or a direct URL
  
  // The thumbnail should always be displayed immediately without relying on blob URLs
  const thumbnailSource = useMemo(() => {
    // Use fileData from server if available (which is a data URL)
    if (item.fileData) {
      return item.fileData;
    }
    
    // Otherwise fallback to thumbnailUrl
    return item.thumbnailUrl || '';
  }, [item.fileData, item.thumbnailUrl]);
  
  // Handler to open the media detail page
  const handleOpenDetail = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    navigate(`/media/${item.id}`);
  };
  
  // Handler for dropdown menu click
  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when menu is clicked
  };

  // Handler for selection (now separate from clicking the item)
  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    onSelect(item);
  };
  
  if (view === "grid") {
    return (
      <div 
        className={`relative rounded-md overflow-hidden group cursor-pointer 
          ${isSelected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
        onClick={handleOpenDetail}
      >
        {item.fileType === 'image' ? (
          // Always use img tags with strong memoization to prevent re-renders
          <img 
            src={thumbnailSource}
            alt={item.title || item.fileName} 
            className="aspect-square object-cover w-full h-full"
            loading="lazy"
          />
        ) : (
          // For videos
          <div 
            className="aspect-square bg-cover bg-center"
            style={{ backgroundColor: '#1a1a1a' }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-8 w-8 text-white/50" />
            </div>
          </div>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={handleMenuClick}>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-white hover:bg-white/20 rounded-full"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-primary/20">
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                  onClick={(e) => { e.stopPropagation(); handleSelect(e); }}
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-2">
                    <path d="M12 2H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V3a1 1 0 00-1-1zm-1.5 6.5h-6a.5.5 0 010-1h6a.5.5 0 010 1z" stroke="currentColor" strokeWidth="1" fill="none"></path>
                  </svg>
                  {isSelected ? 'Deselect' : 'Select'}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                >
                  <Pencil className="h-3 w-3 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                >
                  <Star className="h-3 w-3 mr-2" />
                  {item.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuItem 
                  className="text-xs cursor-pointer text-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_5px_rgba(255,0,0,0.3)] transition-all"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-white text-xs">
            {item.title || item.fileName}
          </div>
        </div>
        
        {/* Favorite indicator */}
        {item.isFavorite && (
          <div className="absolute top-1 right-1">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          </div>
        )}
        
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-2 left-2 h-5 w-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
            </svg>
          </div>
        )}
      </div>
    );
  }
  
  // List view
  return (
    <div 
      className={`flex items-center p-2 hover:bg-primary/5 rounded-md cursor-pointer
        ${isSelected ? 'bg-primary/10' : ''}`}
      onClick={handleOpenDetail}
    >
      <div className="w-10 h-10 mr-3 rounded-md overflow-hidden flex-shrink-0">
        {item.fileType === 'image' ? (
          // Same image strategy as grid view, reusing the thumbnailSource
          <img 
            src={thumbnailSource}
            alt={item.title || item.fileName} 
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
            <Video className="h-5 w-5 text-white/50" />
          </div>
        )}
      </div>
      <div className="flex-grow min-w-0">
        <p className="text-sm font-medium truncate">{item.title || item.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(item.createdAt || new Date()).toLocaleDateString()}
          {item.fileSize && ` • ${formatFileSize(item.fileSize)}`}
        </p>
      </div>
      {item.isFavorite && (
        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-2" />
      )}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={handleMenuClick}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-primary/20">
          <DropdownMenuItem 
            className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
            onClick={(e) => { e.stopPropagation(); handleSelect(e); }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-2">
              <path d="M12 2H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V3a1 1 0 00-1-1zm-1.5 6.5h-6a.5.5 0 010-1h6a.5.5 0 010 1z" stroke="currentColor" strokeWidth="1" fill="none"></path>
            </svg>
            {isSelected ? 'Deselect' : 'Select'}
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
          >
            <Pencil className="h-3 w-3 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
          >
            <Star className="h-3 w-3 mr-2" />
            {item.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-primary/20" />
          <DropdownMenuItem 
            className="text-xs cursor-pointer text-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_5px_rgba(255,0,0,0.3)] transition-all"
          >
            <Trash2 className="h-3 w-3 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Album Item component
function AlbumItem({ album, onSelect }: { album: MediaAlbum, onSelect: (album: MediaAlbum) => void }) {
  // Same pattern as MediaItem - safely handle thumbnail images
  const coverImage = useMemo(() => {
    return album.coverImageUrl || '';
  }, [album.coverImageUrl]);
  
  return (
    <div 
      className="rounded-lg overflow-hidden border border-border hover:border-primary/50 cursor-pointer"
      onClick={() => onSelect(album)}
    >
      {album.coverImageUrl ? (
        <div className="aspect-video relative">
          <img 
            src={coverImage}
            alt={album.title} 
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-video bg-[#1a1a1a] flex items-center justify-center">
          <FolderIcon className="h-12 w-12 text-white/20" />
        </div>
      )}
      <div className="p-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium truncate">{album.title}</h3>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-primary/20">
              <DropdownMenuItem 
                className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
              >
                <Pencil className="h-3 w-3 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-primary/20" />
              <DropdownMenuItem 
                className="text-xs cursor-pointer text-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_5px_rgba(255,0,0,0.3)] transition-all"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-xs text-muted-foreground">
          {album.itemCount || 0} items • {new Date(album.createdAt || new Date()).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

// Format file size helper
function formatFileSize(bytes?: number): string {
  if (!bytes) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Main Media Library Page
export default function MediaLibraryPage() {
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<MediaItem[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<MediaAlbum | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(2); // 1=extra small, 2=small, 3=medium, 4=large
  const [optimisticMedia, setOptimisticMedia] = useState<MediaItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("all"); // 'all', 'images', 'videos', 'recent7', 'recent30'
  
  // Empty default arrays for when no data is available
  const emptyItems: MediaItem[] = [];
  const emptyAlbums: MediaAlbum[] = [];

  const { data: mediaItems, isLoading: isLoadingItems, refetch: refetchMediaItems } = useQuery<{ mediaItems: MediaItem[] }>({
    queryKey: ['/api/users/2/media-items'],
    enabled: true,
    staleTime: 5000, // Consider data fresh for only 5 seconds
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: true // Refetch when the window regains focus
  });

  const { data: mediaAlbums, isLoading: isLoadingAlbums } = useQuery<{ mediaAlbums: MediaAlbum[] }>({
    queryKey: ['/api/users/2/media-albums'],
    enabled: true
  });

  // Handle item selection
  const handleItemSelect = (item: MediaItem) => {
    if (selectedItems.some(i => i.id === item.id)) {
      setSelectedItems(selectedItems.filter(i => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  // Clear all selections
  const clearSelection = () => {
    setSelectedItems([]);
  };

  // Handle album selection
  const handleAlbumSelect = (album: MediaAlbum) => {
    setActiveAlbum(album);
  };
  
  // Combine server items with optimistic items
  const allItems = [...(mediaItems?.mediaItems || emptyItems), ...optimisticMedia];
  
  // Apply type filter and date filter based on activeFilter
  const applyFilters = (items: MediaItem[]) => {
    // First apply search filter
    let result = items.filter(
      (item) => item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
              item.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // Then apply type filter
    switch (activeFilter) {
      case 'images':
        result = result.filter(item => item.fileType === 'image');
        break;
      case 'videos':
        result = result.filter(item => item.fileType === 'video');
        break;
      case 'recent7':
        // Filter for items created in the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        result = result.filter(item => new Date(item.createdAt || '') > sevenDaysAgo);
        break;
      case 'recent30':
        // Filter for items created in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        result = result.filter(item => new Date(item.createdAt || '') > thirtyDaysAgo);
        break;
      default:
        // 'all' or any other value, no additional filtering
        break;
    }
    
    return result;
  };
  
  // Apply all filters
  const filteredItems = applyFilters(allItems);
  
  // Determine which items to display based on current state
  const displayItems = activeAlbum 
    ? filteredItems.filter((item: MediaItem) => item.albumId === activeAlbum.id)
    : filteredItems;
  
  // Favorites tab items
  const favoriteItems = filteredItems.filter((item: MediaItem) => item.isFavorite);
  
  // Get appropriate grid layout based on zoom level
  const getGridClass = () => {
    switch(zoomLevel) {
      case 1: // Extra small thumbnails
        return "grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10";
      case 2: // Small thumbnails
        return "grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
      case 4: // Large thumbnails
        return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      case 3: // Medium thumbnails (default)
      default:
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    }
  };
  
  // Get appropriate skeleton count based on zoom level
  const getSkeletonCount = () => {
    switch(zoomLevel) {
      case 1: return 20; // Extra small thumbnails
      case 2: return 12; // Small thumbnails
      case 4: return 6;  // Large thumbnails
      case 3: // Medium thumbnails (default)
      default:
        return 8;
    }
  };
  
  // Keep track of all blob URLs to ensure they don't cause memory leaks
  const [blobRegistry, setBlobRegistry] = useState<{[key: string]: boolean}>({});
  
  // Register a blob URL for tracking and future cleanup
  const registerBlobUrl = (url: string) => {
    if (url && url.startsWith('blob:')) {
      // Add to registry
      setBlobRegistry(prev => {
        if (prev[url]) return prev; // Already registered
        return {...prev, [url]: true};
      });
      
      console.log('Registered blob URL:', url);
    }
  };
  
  // Safely revoke a blob URL and remove it from registry
  const revokeBlobUrl = (url: string | undefined) => {
    if (!url || !url.startsWith('blob:')) return;
    
    try {
      // Check if this URL is in our registry
      if (blobRegistry[url]) {
        URL.revokeObjectURL(url);
        console.log('Safely revoked blob URL:', url);
        
        // Remove from registry
        setBlobRegistry(prev => {
          const updated = {...prev};
          delete updated[url];
          return updated;
        });
      }
    } catch (e) {
      console.error('Error revoking blob URL:', e);
    }
  };
  
  // Clean up all registered blob URLs
  const cleanupAllBlobUrls = () => {
    // Make a copy of the keys to avoid mutation issues
    const urlsToCleanup = Object.keys(blobRegistry);
    
    if (urlsToCleanup.length === 0) {
      console.log('No blob URLs to clean up');
      return;
    }
    
    console.log(`Cleaning up ${urlsToCleanup.length} blob URLs`);
    
    // Process URLs in small batches to avoid UI freezing
    const processBatch = (startIndex: number, batchSize: number) => {
      const endIndex = Math.min(startIndex + batchSize, urlsToCleanup.length);
      
      for (let i = startIndex; i < endIndex; i++) {
        const url = urlsToCleanup[i];
        try {
          URL.revokeObjectURL(url);
          console.log('Cleanup: revoked blob URL:', url);
        } catch (e) {
          console.error('Error in cleanup of blob URL:', e);
        }
      }
      
      // Process next batch if there are more URLs
      if (endIndex < urlsToCleanup.length) {
        setTimeout(() => {
          processBatch(endIndex, batchSize);
        }, 10);
      } else {
        // All URLs processed, reset registry
        setBlobRegistry({});
      }
    };
    
    // Start processing in batches of 5
    processBatch(0, 5);
  };
  
  // Cleanup blob URLs on component unmount
  useEffect(() => {
    return () => {
      console.log('Component unmounting - cleaning up blob registry');
      // Add a small delay to avoid race conditions with react unmounting
      setTimeout(() => {
        cleanupAllBlobUrls();
      }, 50);
    };
  }, []);
  
  // Handle zoom in
  const zoomIn = () => {
    setZoomLevel(Math.min(4, zoomLevel + 1));
  };
  
  // Handle zoom out
  const zoomOut = () => {
    setZoomLevel(Math.max(1, zoomLevel - 1));
  };
  
  // Media upload mutation with improved stability
  const uploadMediaMutation = useMutation({
    mutationFn: async (files: File[]) => {
      setIsUploading(true);
      setUploadProgress(0);
      
      // Create optimistic placeholders for each file to display instantly
      const timestamp = Date.now();
      const optimisticItems = files.map((file, index) => {
        // Create a temporary object URL for the file
        const tempUrl = URL.createObjectURL(file);
        
        // Register this blob URL for tracking and cleanup
        registerBlobUrl(tempUrl);
        
        // Create a proper media item with correct types
        return {
          id: -(timestamp + index), // Use negative IDs for optimistic items
          userId: 2, // Assuming current user ID is 2
          albumId: activeAlbum?.id || null,
          fileName: file.name,
          title: file.name,
          fileType: file.type.startsWith('image/') ? 'image' : 'video',
          thumbnailUrl: tempUrl,
          fileUrl: tempUrl,
          fileSize: file.size,
          isFavorite: false,
          createdAt: new Date().toISOString()
        } as MediaItem; // Force type as MediaItem
      });
      
      // Get the current items from the cache
      const currentItems = mediaItems?.mediaItems || [];
      
      // Add to local state for tracking
      setOptimisticMedia(prev => [...optimisticItems, ...prev]);
      
      // Log the update for debugging
      console.log('Adding optimistic items to UI', optimisticItems);
      
      // Immediately update the UI with the new combined items
      queryClient.setQueryData<{mediaItems: MediaItem[]}>(['/api/users/2/media-items'], { 
        mediaItems: [...optimisticItems, ...currentItems] 
      });
      
      const formData = new FormData();
      
      // Append all files to the form data
      files.forEach(file => {
        formData.append('files', file);
      });
      
      // If there's an active album, append the albumId
      if (activeAlbum) {
        formData.append('albumId', activeAlbum.id.toString());
      }
      
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progressPercent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progressPercent);
            console.log(`Upload progress: ${progressPercent}%`);
          }
        });
        
        // Handle response when complete
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              console.log('Upload completed successfully:', response);
              
              // Safely close the upload modal first
              setUploadModalOpen(false);
              
              // Handle updates in a safe way that won't cause navigation issues
              setTimeout(() => {
                // Manipulate cache directly first for immediate feedback
                // instead of using invalidation which can trigger unwanted navigation
                try {
                  const serverItems = response.mediaItems || [];
                  const existingItems = queryClient.getQueryData<{mediaItems: MediaItem[]}>(['/api/users/2/media-items']);
                  
                  if (existingItems) {
                    // Filter out any optimistic items that match our uploaded items
                    const filteredItems = existingItems.mediaItems.filter(item => 
                      // Keep all items that aren't optimistic (positive IDs)
                      item.id > 0 || 
                      // Or optimistic items that don't match our uploads
                      !optimisticItems.some(oi => oi.id === item.id)
                    );
                    
                    // Update the cache with the server items plus remaining optimistic items
                    queryClient.setQueryData<{mediaItems: MediaItem[]}>(['/api/users/2/media-items'], {
                      mediaItems: [...serverItems, ...filteredItems]
                    });
                  }
                } catch (e) {
                  console.error('Error updating media items cache:', e);
                }
                
                // Now schedule a refresh after the cache update
                setTimeout(() => {
                  refetchMediaItems();
                }, 500);
                
                // Don't clean up blobs immediately - let the img tags handle them naturally
                // This prevents premature cleanup that can cause flicker/loading issues
              }, 500);
              
              resolve(response);
            } catch (error) {
              console.error('Error parsing response:', error);
              reject(new Error('Invalid response format'));
            }
          } else {
            console.error('Upload failed with status:', xhr.status);
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        };
        
        // Handle network/connection errors
        xhr.onerror = () => {
          console.error('Network error during upload');
          reject(new Error('Network error during upload'));
        };
        
        // Handle completion (successful or not)
        xhr.onloadend = () => {
          setIsUploading(false);
          // Reset progress after a delay to show 100% briefly
          setTimeout(() => setUploadProgress(0), 500);
        };
        
        // Set up and send the request
        xhr.open('POST', '/api/media-items', true);
        xhr.send(formData);
      });
    },
    onSuccess: (data) => {
      // Log success
      console.log('Upload mutation completed successfully');
      
      // Clean optimistic media in a safe, deferred way
      setTimeout(() => {
        setOptimisticMedia(prev => {
          // Now it's safe to cleanup blob URLs since they've had time to load in the UI
          prev.forEach(item => {
            if (item.thumbnailUrl) revokeBlobUrl(item.thumbnailUrl);
            if (item.fileUrl && item.fileUrl !== item.thumbnailUrl) revokeBlobUrl(item.fileUrl);
          });
          return [];
        });
      }, 2000);
    },
    onError: (error) => {
      console.error('Upload error:', error);
      setOptimisticMedia([]);
    }
  });
  
  // Handle file upload
  const handleFileUpload = (files: File[]) => {
    if (files.length > 0) {
      try {
        // Close dialog instantly
        setUploadModalOpen(false);
        
        // Let mutation handle everything - don't create optimistic items here
        // to avoid duplicate blob URLs
        uploadMediaMutation.mutate(files);
      } catch (error) {
        console.error("Error during file upload preparation:", error);
      }
    }
  };

  return (
    <div className="pb-8">
      <div className="mb-6">
        <div className="flex items-center w-full">
          <Link to="/systems">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow" 
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-orbitron mx-auto pr-8">Media Library</h1>
        </div>
        <p className="text-[#7DAAB2] mt-1">Organize and manage your photos and videos</p>
      </div>
      
      <div className="flex flex-col space-y-4">
        {/* Search and controls */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search media..." 
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center space-x-2">
            {/* View toggle */}
            <div className="bg-background rounded-md flex">
              <Button 
                variant="outline" 
                size="sm" 
                className={`flex items-center rounded-r-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${activeView === 'grid' ? 'bg-primary/10' : ''}`}
                onClick={() => setActiveView("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className={`flex items-center rounded-l-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${activeView === 'list' ? 'bg-primary/10' : ''}`}
                onClick={() => setActiveView("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className={`h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${activeFilter !== 'all' ? 'bg-primary/10 text-primary' : ''}`}
                  title="Filter"
                >
                  <Filter className="h-4 w-4" />
                  {activeFilter !== 'all' && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full"></span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-primary/20">
                <DropdownMenuItem 
                  className={`text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background ${activeFilter === 'all' ? 'bg-primary/10' : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All Media
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background ${activeFilter === 'images' ? 'bg-primary/10' : ''}`}
                  onClick={() => setActiveFilter('images')}
                >
                  Images Only
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background ${activeFilter === 'videos' ? 'bg-primary/10' : ''}`}
                  onClick={() => setActiveFilter('videos')}
                >
                  Videos Only
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuItem 
                  className={`text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background ${activeFilter === 'recent7' ? 'bg-primary/10' : ''}`}
                  onClick={() => setActiveFilter('recent7')}
                >
                  Last 7 Days
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background ${activeFilter === 'recent30' ? 'bg-primary/10' : ''}`}
                  onClick={() => setActiveFilter('recent30')}
                >
                  Last 30 Days
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow" 
                  title="Sort"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-primary/20">
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                >
                  Date (Newest)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                >
                  Date (Oldest)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                >
                  Name (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-xs cursor-pointer hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-all focus:bg-primary focus:text-background"
                >
                  Name (Z-A)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Zoom controls - only show in grid view */}
            {activeView === "grid" && (
              <div className="bg-background rounded-md flex ml-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-r-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
                  onClick={zoomOut}
                  title="Zoom Out"
                  disabled={zoomLevel <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-l-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
                  onClick={zoomIn}
                  title="Zoom In"
                  disabled={zoomLevel >= 4}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex-shrink-0 ml-auto">
            <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8 bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50"
                  title="Upload Media"
                  onClick={() => setUploadModalOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload Media</DialogTitle>
                  <DialogDescription>
                    Add photos and videos to your library
                  </DialogDescription>
                </DialogHeader>
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center border-2 border-primary/20 rounded-lg p-12 mt-2">
                    <div className="w-full max-w-md">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Uploading files...</span>
                        <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-primary/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300 rounded-full"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-center text-muted-foreground mt-4">
                        Please wait while your files are being uploaded
                      </p>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="flex flex-col items-center justify-center border-2 border-dashed border-primary/20 rounded-lg p-12 mt-2"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add('border-primary');
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('border-primary');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.remove('border-primary');
                      
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        // Convert FileList to Array for better processing
                        const filesArray = Array.from(e.dataTransfer.files);
                        console.log('Files dropped:', filesArray);
                        
                        // Upload the files
                        handleFileUpload(filesArray);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="text-sm text-center text-muted-foreground mb-2">Drag and drop files here or click to browse</p>
                    <p className="text-xs text-center text-muted-foreground">Supports JPG, PNG, GIF, MP4, MOV up to 100MB</p>
                  </div>
                )}
                <DialogFooter className="sm:justify-start">
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept="image/*, video/*"
                    className="hidden"
                    onChange={(e) => {
                      // Handle file upload logic here
                      if (e.target.files && e.target.files.length > 0) {
                        // Convert FileList to Array for better processing
                        const filesArray = Array.from(e.target.files);
                        console.log('Files selected:', filesArray);
                        
                        // Upload the files
                        handleFileUpload(filesArray);
                      }
                    }}
                    disabled={isUploading}
                  />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon"
                    className={`h-8 w-8 mt-2 ${
                      isUploading 
                        ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                        : 'bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50'
                    }`}
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    disabled={isUploading}
                    title={isUploading ? "Processing..." : "Select Files"}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        
        {/* Selected items toolbar */}
        {selectedItems.length > 0 && (
          <div className="bg-background border rounded-md p-2 flex items-center justify-between">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={clearSelection}
                className="h-7 w-7 bg-muted/50 hover:bg-muted text-muted-foreground hover:shadow-[0_0_5px_rgba(0,0,0,0.2)] transition-shadow"
                title="Cancel Selection"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Separator orientation="vertical" className="h-5 mx-2" />
              <span className="text-sm">{selectedItems.length} selected</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7 bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50"
                title="Add to Favorites"
              >
                <Star className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7 bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50"
                title="Add to Album"
              >
                <FolderIcon className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7 bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_5px_rgba(239,68,68,0.5)] transition-shadow text-destructive border border-destructive/50"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Album breadcrumb */}
        {activeAlbum && (
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-sm p-0 h-auto hover:bg-transparent hover:text-primary hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
              onClick={() => setActiveAlbum(null)}
            >
              All Media
            </Button>
            <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />
            <span className="text-sm font-medium">{activeAlbum.title}</span>
          </div>
        )}
        
        {/* Content tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Media</TabsTrigger>
            <TabsTrigger value="albums">Albums</TabsTrigger>
            <TabsTrigger value="favorites">
              <div className="flex items-center">
                <Star className="h-3 w-3 mr-1 fill-current" />
                Favorites
              </div>
            </TabsTrigger>
          </TabsList>
          
          {/* All Media Content */}
          <TabsContent value="all" className="mt-4">
            {isLoadingItems ? (
              activeView === "grid" ? (
                <div className={`grid gap-4 ${getGridClass()}`}>
                  {Array.from({ length: getSkeletonCount() }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-md" />
                  ))}
                </div>
              )
            ) : displayItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-16 w-16 mb-4 opacity-30" />
                {searchQuery ? (
                  <>
                    <p className="text-lg font-medium mb-1">No results found</p>
                    <p className="text-sm">Try different search terms</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-1">No media found</p>
                    <p className="text-sm mb-4">Upload some photos or videos to get started</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {activeView === "grid" ? (
                  <div className={`grid gap-4 ${getGridClass()}`}>
                    {displayItems.map((item) => (
                      <MediaItem 
                        key={item.id} 
                        item={item} 
                        view="grid" 
                        onSelect={handleItemSelect}
                        isSelected={selectedItems.some(i => i.id === item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 border rounded-md overflow-hidden">
                    {displayItems.map((item) => (
                      <MediaItem 
                        key={item.id} 
                        item={item} 
                        view="list" 
                        onSelect={handleItemSelect}
                        isSelected={selectedItems.some(i => i.id === item.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
          
          {/* Albums Content */}
          <TabsContent value="albums" className="mt-4">
            {isLoadingAlbums ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="aspect-video rounded-md" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Create album card */}
                <Dialog>
                  <DialogTrigger asChild>
                    <div className="rounded-lg overflow-hidden border border-dashed border-primary/30 hover:border-primary/60 cursor-pointer flex flex-col items-center justify-center min-h-[180px] bg-background/50">
                      <Plus className="h-10 w-10 text-primary/40 mb-2" />
                      <p className="text-sm font-medium">Create New Album</p>
                    </div>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Album</DialogTitle>
                      <DialogDescription>
                        Create a new album to organize your media
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="album-name">Album Name</Label>
                        <Input id="album-name" placeholder="Enter album name..." />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="album-description">Description (optional)</Label>
                        <Input id="album-description" placeholder="Add a description..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        type="submit" 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50"
                        title="Create Album"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                
                {/* Album cards */}
                {(mediaAlbums?.mediaAlbums || emptyAlbums).map((album: MediaAlbum) => (
                  <AlbumItem 
                    key={album.id} 
                    album={album} 
                    onSelect={handleAlbumSelect} 
                  />
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Favorites Content */}
          <TabsContent value="favorites" className="mt-4">
            {isLoadingItems ? (
              activeView === "grid" ? (
                <div className={`grid gap-4 ${getGridClass()}`}>
                  {Array.from({ length: getSkeletonCount() }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-md" />
                  ))}
                </div>
              )
            ) : favoriteItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                <Star className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium mb-1">No favorites found</p>
                <p className="text-sm">Mark items as favorites to see them here</p>
              </div>
            ) : (
              <>
                {activeView === "grid" ? (
                  <div className={`grid gap-4 ${getGridClass()}`}>
                    {favoriteItems.map((item: MediaItem) => (
                      <MediaItem 
                        key={item.id} 
                        item={item} 
                        view="grid" 
                        onSelect={handleItemSelect}
                        isSelected={selectedItems.some(i => i.id === item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 border rounded-md overflow-hidden">
                    {favoriteItems.map((item: MediaItem) => (
                      <MediaItem 
                        key={item.id} 
                        item={item} 
                        view="list" 
                        onSelect={handleItemSelect}
                        isSelected={selectedItems.some(i => i.id === item.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}