import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Image as ImageIcon, 
  Video, 
  FolderOpen, 
  Star, 
  ChevronRight, 
  Circle, 
  Plus 
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// Gallery grid for the media items
function GalleryGrid({ items }: { items: any[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.length === 0 ? (
        <div className="col-span-3 py-6 flex flex-col items-center justify-center text-muted-foreground">
          <ImageIcon className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">No media items found</p>
        </div>
      ) : (
        items.map((item) => (
          <div 
            key={item.id} 
            className="aspect-square rounded-md overflow-hidden relative group"
          >
            {item.fileType === 'image' ? (
              <div 
                className="w-full h-full bg-cover bg-center"
                style={{ 
                  backgroundImage: `url(${item.fileUrl || item.thumbnailUrl || ''})`,
                  backgroundColor: '#1a1a1a'
                }}
              />
            ) : (
              <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
                <Video className="h-8 w-8 text-white/50" />
              </div>
            )}
            
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="text-white text-xs text-center">
                {item.title || item.fileName}
              </div>
            </div>
            
            {/* Favorite indicator */}
            {item.isFavorite && (
              <div className="absolute top-1 right-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Album grid for albums
function AlbumGrid({ albums }: { albums: any[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-2">
      {albums.length === 0 ? (
        <div className="col-span-2 py-6 flex flex-col items-center justify-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">No albums found</p>
        </div>
      ) : (
        albums.map((album) => (
          <div 
            key={album.id}
            className="rounded-lg overflow-hidden border border-border flex flex-col"
          >
            <div 
              className="aspect-video bg-cover bg-center"
              style={{ 
                backgroundImage: album.coverImageUrl ? `url(${album.coverImageUrl})` : 'none',
                backgroundColor: album.coverImageUrl ? undefined : '#1a1a1a'
              }}
            >
              {!album.coverImageUrl && (
                <div className="w-full h-full flex items-center justify-center">
                  <FolderOpen className="h-12 w-12 text-white/20" />
                </div>
              )}
            </div>
            <div className="p-2">
              <h3 className="text-sm font-medium truncate">{album.title}</h3>
              <p className="text-xs text-muted-foreground">
                {album.itemCount || 0} items
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function MediaWidget() {
  // Mock data for quick UI development - will be replaced with actual API calls
  const mockRecentItems = [
    { 
      id: 1, 
      fileName: 'beach.jpg', 
      title: 'Beach Sunset', 
      fileType: 'image', 
      thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YmVhY2h8ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60',
      isFavorite: true
    },
    {
      id: 2,
      fileName: 'mountains.jpg',
      title: 'Mountain View',
      fileType: 'image',
      thumbnailUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8bW91bnRhaW5zfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60',
      isFavorite: false
    },
    {
      id: 3,
      fileName: 'drone_video.mp4',
      title: 'Drone Footage',
      fileType: 'video',
      thumbnailUrl: '',
      isFavorite: false
    }
  ];

  const mockAlbums = [
    {
      id: 1,
      title: 'Vacations',
      coverImageUrl: 'https://images.unsplash.com/photo-1607705703571-c5a8695f18f6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGJlYWNoJTIwdmFjYXRpb258ZW58MHx8MHx8fDA%3D&auto=format&fit=crop&w=800&q=60',
      itemCount: 32
    },
    {
      id: 2,
      title: 'Work Projects',
      coverImageUrl: '',
      itemCount: 15
    }
  ];

  const { data: mediaItems, isLoading: isLoadingItems } = useQuery({
    queryKey: ['/api/users/:userId/media-items'],
    queryFn: async () => {
      // This would fetch from actual API
      // Mocking for now
      return { mediaItems: mockRecentItems };
    },
    enabled: false // Disable auto-fetch while developing UI
  });

  const { data: mediaAlbums, isLoading: isLoadingAlbums } = useQuery({
    queryKey: ['/api/users/:userId/media-albums'],
    queryFn: async () => {
      // This would fetch from actual API
      // Mocking for now
      return { mediaAlbums: mockAlbums };
    },
    enabled: false // Disable auto-fetch while developing UI
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium flex items-center">
          <ImageIcon className="h-4 w-4 mr-2 text-primary" />
          Media
        </div>
        <Link 
          to="/media" 
          className="h-7 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md flex items-center hover:shadow-[0_0_5px_var(--primary-glow-light)] border border-primary/50 transition-shadow"
        >
          View Library
          <ChevronRight className="ml-1 h-3 w-3" />
        </Link>
      </div>

      <Tabs defaultValue="recent" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-3">
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
          <TabsTrigger value="favorites">
            <div className="flex items-center">
              <Star className="h-3 w-3 mr-1 fill-current" />
              Favorites
            </div>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="recent">
          {isLoadingItems ? (
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <GalleryGrid items={mediaItems?.mediaItems || mockRecentItems} />
              <div className="mt-3 flex justify-center">
                <Button 
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 border-primary/30 hover:border-primary hover:bg-primary/5"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Media
                </Button>
              </div>
            </>
          )}
        </TabsContent>
        
        <TabsContent value="albums">
          {isLoadingAlbums ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="aspect-video rounded-md" />
              <Skeleton className="aspect-video rounded-md" />
            </div>
          ) : (
            <>
              <AlbumGrid albums={mediaAlbums?.mediaAlbums || mockAlbums} />
              <div className="mt-3 flex justify-center">
                <Button 
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 border-primary/30 hover:border-primary hover:bg-primary/5"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Album
                </Button>
              </div>
            </>
          )}
        </TabsContent>
        
        <TabsContent value="favorites">
          {isLoadingItems ? (
            <div className="grid grid-cols-3 gap-2">
              {[1,.2, 3].map((i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : (
            <GalleryGrid 
              items={(mediaItems?.mediaItems || mockRecentItems).filter(item => item.isFavorite)} 
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}