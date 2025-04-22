import React, { useState, useMemo } from 'react';
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Calendar, Clock, Tag, ChevronDown, ChevronRight, FilePlus2, BookOpen, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface KnowledgeCategory {
  category: string; // "books", "courses", "articles", etc.
  title: string;
  entries: Array<{
    id: string;
    title: string;
    content: string;
    slug: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>;
}

export default function KnowledgeArchivePage() {
  // Set the page title
  usePageTitle('Knowledge Archive');

  // Get mission pages from context
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['books']);

  // Toggle folder expansion
  const toggleFolder = (category: string) => {
    if (expandedFolders.includes(category)) {
      setExpandedFolders(expandedFolders.filter(c => c !== category));
    } else {
      setExpandedFolders([...expandedFolders, category]);
    }
  };

  // Filter and organize knowledge entries by category
  const knowledgeCategories = useMemo(() => {
    // Filter for knowledge entries
    const knowledgeEntries = missionPages.filter(page => 
      page.tags.includes('Knowledge Base')
    );
    
    // Determine category from title or content
    const getCategory = (entry: typeof missionPages[0]) => {
      const titleLower = entry.title.toLowerCase();
      const contentLower = entry.content.toLowerCase();
      
      if (titleLower.includes('book') || contentLower.includes('book summary')) {
        return 'books';
      } else if (titleLower.includes('course') || contentLower.includes('course notes')) {
        return 'courses';
      } else if (titleLower.includes('article') || contentLower.includes('article summary')) {
        return 'articles';
      } else {
        return 'general';
      }
    };
    
    // Group entries
    const bookEntries = knowledgeEntries.filter(entry => getCategory(entry) === 'books');
    const courseEntries = knowledgeEntries.filter(entry => getCategory(entry) === 'courses');
    const articleEntries = knowledgeEntries.filter(entry => getCategory(entry) === 'articles');
    const generalEntries = knowledgeEntries.filter(entry => getCategory(entry) === 'general');
    
    return [
      {
        category: 'books',
        title: 'Books & Summaries',
        entries: bookEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        category: 'courses',
        title: 'Courses & Tutorials',
        entries: courseEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        category: 'articles',
        title: 'Articles & Papers',
        entries: articleEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        category: 'general',
        title: 'General Knowledge',
        entries: generalEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      }
    ];
  }, [missionPages]);

  // Create new knowledge entry
  const createNewKnowledgeEntry = () => {
    const title = `Book Notes: [Title] - ${new Date().toLocaleDateString()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
    
    const newPage = useLYFEOS().createMissionPage({
      title,
      slug,
      content: `# ${title}\n\n## Summary\n\nBrief overview of the book/course/article...\n\n## Key Takeaways\n\n- Key point 1\n- Key point 2\n- Key point 3\n\n## Quotes\n\n> Insert memorable quote here\n\n## Action Items\n\n- [ ] Action item 1\n- [ ] Action item 2\n- [ ] Action item 3\n\n## Related Resources\n\n- Link or reference to related material`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      xpValue: 10,
      tags: ['Knowledge Base']
    });
    
    toast({
      title: "Knowledge Entry Created",
      description: "Your new knowledge entry is ready for editing",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    navigate(`/mission-page/${slug}`);
  };

  return (
    <>
      <div className="mb-4">
        <Link href="/chronilog" className="text-primary flex items-center hover:underline">
          <ChevronRight className="h-4 w-4 mr-1" />
          Back to Chronilog
        </Link>
      </div>
      
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Knowledge Archive</h1>
          <p className="text-[#7DAAB2]">Organize your notes, learnings, and insights from various sources</p>
        </div>
        <Button 
          onClick={createNewKnowledgeEntry}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Entry</span>
        </Button>
      </div>
      
      {knowledgeCategories.some(category => category.entries.length > 0) ? (
        <div className="space-y-4">
          {knowledgeCategories.map((category) => (
            <div key={category.category} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40"
                onClick={() => toggleFolder(category.category)}
              >
                <div className="flex items-center">
                  {expandedFolders.includes(category.category) ? (
                    <ChevronDown className="h-5 w-5 text-primary mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary mr-2" />
                  )}
                  <div className="flex items-center">
                    <span className="material-icons text-accent mr-3">school</span>
                    <h2 className="text-lg font-medium">{category.title}</h2>
                  </div>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {category.entries.length} {category.entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              
              {expandedFolders.includes(category.category) && (
                <div className="px-4 pb-4 space-y-3 pt-2 border-t border-slate-700/50">
                  {category.entries.length > 0 ? (
                    category.entries
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((entry) => (
                        <div 
                          key={entry.id}
                          className="p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors border border-slate-700/30 cursor-pointer"
                          onClick={() => navigate(`/mission-page/${entry.slug}`)}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center">
                              {category.category === 'books' ? (
                                <BookOpen className="h-4 w-4 text-accent mr-2" />
                              ) : (
                                <Bookmark className="h-4 w-4 text-accent mr-2" />
                              )}
                              <h3 className="font-medium">{entry.title}</h3>
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                              <span className="text-xs text-[#7DAAB2] font-mono">
                                {new Date(entry.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          
                          {/* Tags */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            {entry.tags.map((tag, idx) => (
                              <div key={idx} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 flex items-center">
                                <Tag className="h-3 w-3 mr-1" />
                                {tag}
                              </div>
                            ))}
                          </div>
                          
                          <p className="text-sm text-[#7DAAB2] line-clamp-2">
                            {entry.content.length > 150 
                              ? entry.content.substring(0, 150) + '...' 
                              : entry.content}
                          </p>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-[#7DAAB2]">No entries in {category.title.toLowerCase()} found.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Knowledge Entries Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Start documenting your learnings from books, courses, articles, and other sources to build your personal knowledge base.
          </p>
          <Button 
            onClick={createNewKnowledgeEntry}
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
          >
            Create Your First Entry
          </Button>
        </div>
      )}
    </>
  );
}