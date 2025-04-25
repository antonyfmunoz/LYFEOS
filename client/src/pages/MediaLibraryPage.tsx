import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { 
  ChevronLeft, 
  ChevronRight,
  Plus, 
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

// Function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return size.toFixed(1) + ' ' + units[unitIndex];
}

// Media Item component
// Define interfaces for media items and albums
interface MediaItem {
  id: number;
  fileName: string;
  title: string;
  fileType: string;
  thumbnailUrl: string;
  fileUrl?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  albumId?: number;
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
  if (view === "grid") {
    return (
      <div 
        className={`relative rounded-md overflow-hidden group cursor-pointer 
          ${isSelected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/50'}`}
        onClick={() => onSelect(item)}
      >
        <div 
          className="aspect-square bg-cover bg-center"
          style={{ 
            backgroundImage: item.fileType === 'image' 
              ? `url(${item.fileUrl || item.thumbnailUrl || ''})` 
              : 'none',
            backgroundColor: '#1a1a1a'
          }}
        >
          {item.fileType === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-8 w-8 text-white/80" />
            </div>
          )}
          
          {/* Checkbox overlay that appears on hover or when selected */}
          <div 
            className={`absolute top-2 left-2 ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } transition-opacity`}
          >
            <div 
              className={`h-5 w-5 rounded-full ${
                isSelected ? 'bg-primary' : 'bg-black/50'
              } flex items-center justify-center`}
            >
              {isSelected && <span className="text-white text-xs">✓</span>}
            </div>
          </div>
          
          {/* Favorite star indicator */}
          {item.isFavorite && (
            <div className="absolute top-2 right-2">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            </div>
          )}
        </div>
        <div className="p-2 bg-card">
          <p className="text-xs font-medium truncate">{item.title || item.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(item.createdAt || new Date()).toLocaleDateString()}
          </p>
        </div>
      </div>
    );
  }
  
  // List view
  return (
    <div 
      className={`flex items-center p-3 hover:bg-secondary/10 cursor-pointer ${
        isSelected ? 'bg-secondary/20' : ''
      }`}
      onClick={() => onSelect(item)}
    >
      <div className="mr-3 relative">
        <div 
          className={`h-10 w-10 rounded bg-cover bg-center relative ${
            isSelected ? 'ring-2 ring-primary' : ''
          }`}
          style={{ 
            backgroundImage: item.fileType === 'image' 
              ? `url(${item.thumbnailUrl || ''})` 
              : 'none',
            backgroundColor: '#1a1a1a'
          }}
        >
          {item.fileType === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Video className="h-5 w-5 text-white/50" />
            </div>
          )}
        </div>
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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-xs cursor-pointer">
            <Pencil className="h-3 w-3 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs cursor-pointer">
            <Star className="h-3 w-3 mr-2" />
            {item.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs cursor-pointer text-destructive focus:text-destructive">
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
  return (
    <div 
      className="rounded-lg overflow-hidden border border-border hover:border-primary/50 cursor-pointer"
      onClick={() => onSelect(album)}
    >
      <div 
        className="aspect-video bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url(${album.coverImageUrl || ''})` }}
      >
        {!album.coverImageUrl && (
          <div className="h-full w-full flex items-center justify-center">
            <FolderIcon className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{album.title}</h3>
          <span className="text-xs text-muted-foreground">{album.itemCount} items</span>
        </div>
        {album.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{album.description}</p>
        )}
      </div>
    </div>
  );
}

export default function MediaLibraryPage() {
  // Search query state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Selected items state
  const [selectedItems, setSelectedItems] = useState<MediaItem[]>([]);
  
  // Active album state (for viewing album contents)
  const [activeAlbum, setActiveAlbum] = useState<MediaAlbum | null>(null);
  
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // View type state (grid or list)
  const [activeView, setActiveView] = useState<"grid" | "list">("grid");
  
  // Grid size state
  const [gridSize, setGridSize] = useState<"small" | "medium" | "large">("medium");
  
  // Function to get grid classes based on grid size
  const getGridClasses = (size: "small" | "medium" | "large") => {
    switch(size) {
      case "small":
        return "grid-cols-3 md:grid-cols-4 lg:grid-cols-6"; // Many smaller thumbnails
      case "medium":
        return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"; // Medium size
      case "large":
        return "grid-cols-1 md:grid-cols-1 lg:grid-cols-2"; // Just 1-2 large photos per row
    }
  };
  
  // Empty default arrays for when no data is available
  const emptyItems: MediaItem[] = [];
  const emptyAlbums: MediaAlbum[] = [];

  const { data: mediaItems, isLoading: isLoadingItems } = useQuery<{ mediaItems: MediaItem[] }>({
    queryKey: ['/api/users/2/media-items'],
    enabled: true
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
  
  // Filter items based on search query
  const filteredItems = (mediaItems?.mediaItems || emptyItems).filter(
    (item: MediaItem) => item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
           item.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Determine which items to display based on current state
  const displayItems = activeAlbum 
    ? filteredItems.filter((item: MediaItem) => item.albumId === activeAlbum.id)
    : filteredItems;
  
  // Get favorite items
  const favoriteItems = filteredItems.filter((item: MediaItem) => item.isFavorite);
  
  // Handle file upload
  const mediaUploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      
      return apiRequest('/api/media-items', {
        method: 'POST',
        body: formData
      });
    },
    onSuccess: () => {
      // Reset upload state
      setIsUploading(false);
      setUploadProgress(0);
      
      // Invalidate queries to refresh the media items
      queryClient.invalidateQueries({queryKey: ['/api/users/2/media-items']});
    }
  });
  
  const handleFileUpload = (files: File[]) => {
    // Filter out invalid files (not images or videos)
    const validFiles = files.filter(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );
    
    // Filter out files that are too large (100MB limit)
    const sizeLimit = 100 * 1024 * 1024; // 100MB in bytes
    const validSizeFiles = validFiles.filter(file => file.size <= sizeLimit);
    
    if (validSizeFiles.length === 0) {
      console.error('No valid files to upload');
      return;
    }
    
    // Start upload
    setIsUploading(true);
    
    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        const next = prev + (100 - prev) * 0.1;
        return next > 95 ? 95 : next;
      });
    }, 300);
    
    // Upload files
    mediaUploadMutation.mutate(validSizeFiles, {
      onSuccess: () => {
        clearInterval(progressInterval);
        setUploadProgress(100);
        
        // Reset upload state after a short delay to show 100% completion
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      },
      onError: (error) => {
        clearInterval(progressInterval);
        console.error('Upload failed:', error);
        setIsUploading(false);
        setUploadProgress(0);
      }
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link to="/">
              <Button 
                variant="ghost" 
                size="icon" 
                className="mr-2 hover:bg-transparent hover:text-primary hover:shadow-[0_0_10px_rgba(255,255,0,0.5)] transition-shadow"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Media Library</h1>
          </div>
        </div>
        
        {/* Search and filters bar */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex-1 min-w-[200px] max-w-md relative">
            <Input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* View type controls */}
            <div className="bg-background rounded-md flex">
              <Button 
                variant="outline" 
                size="sm" 
                className={`flex items-center h-8 px-2 rounded-r-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${activeView === 'grid' ? 'bg-primary/10' : ''}`}
                onClick={() => setActiveView("grid")}
                title="Grid view"
              >
                <div className="flex items-center">
                  <Grid className="h-4 w-4" />
                </div>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className={`flex items-center h-8 px-2 rounded-l-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${activeView === 'list' ? 'bg-primary/10' : ''}`}
                onClick={() => setActiveView("list")}
                title="List view"
              >
                <div className="flex items-center">
                  <List className="h-4 w-4" />
                </div>
              </Button>
            </div>
            
            {/* Zoom controls - only show in grid view */}
            {activeView === "grid" && (
              <div className="bg-background rounded-md flex">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`flex items-center h-8 px-2 rounded-r-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${gridSize === 'large' ? 'bg-primary/10' : ''}`}
                  onClick={() => setGridSize("large")}
                  title="Very large thumbnails (1-2 per row)"
                >
                  <div className="flex items-center">
                    <Grid className="h-5 w-5" />
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`flex items-center h-8 px-2 rounded-l-none rounded-r-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${gridSize === 'medium' ? 'bg-primary/10' : ''}`}
                  onClick={() => setGridSize("medium")}
                  title="Medium thumbnails"
                >
                  <div className="flex items-center">
                    <Grid className="h-4 w-4" />
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className={`flex items-center h-8 px-2 rounded-l-none hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow ${gridSize === 'small' ? 'bg-primary/10' : ''}`}
                  onClick={() => setGridSize("small")}
                  title="Small thumbnails (more items)"
                >
                  <div className="flex items-center">
                    <Grid className="h-3 w-3" />
                  </div>
                </Button>
              </div>
            )}
            
            {/* Sort dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow" title="Sort">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-xs cursor-pointer">
                  Date (Newest)
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs cursor-pointer">
                  Date (Oldest)
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs cursor-pointer">
                  Name (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs cursor-pointer">
                  Name (Z-A)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div className="flex-shrink-0 ml-auto">
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8 bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50"
                  title="Upload Media"
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
                <div className={`grid gap-4 ${getGridClasses(gridSize)}`}>
                  {Array.from({ length: gridSize === "large" ? 6 : gridSize === "small" ? 12 : 8 }).map((_, i) => (
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
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 bg-primary/10 hover:bg-primary hover:text-background hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow text-primary border border-primary/50"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload Media"
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                {activeView === "grid" ? (
                  <div className={`grid gap-4 ${getGridClasses(gridSize)}`}>
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
                <div className={`grid gap-4 ${getGridClasses(gridSize)}`}>
                  {Array.from({ length: gridSize === "large" ? 6 : gridSize === "small" ? 12 : 8 }).map((_, i) => (
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
                  <div className={`grid gap-4 ${getGridClasses(gridSize)}`}>
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
