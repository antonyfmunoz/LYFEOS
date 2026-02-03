import { useState, useRef, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { 
  Send, ChevronRight, Edit2, Check, X,
  PlusCircle, Trash2, MessageSquare, MoreVertical, Menu
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { AIMessage, ChatSession } from "../lib/types";
import { useIsMobile } from "../hooks/use-mobile";

export default function AIPage() {
  // Set the page title
  usePageTitle('AI Assistant');

  const { 
    messages, 
    chatSessions, 
    activeChatSessionId, 
    sendMessageInSession, 
    createChatSession, 
    deleteChatSession, 
    setActiveChatSession, 
    updateChatSessionTitle,
    aiCompanionName, 
    setAICompanionName 
  } = useLYFEOS();
  
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(aiCompanionName);
  const [isEditingChatTitle, setIsEditingChatTitle] = useState(false);
  const [chatTitleInput, setChatTitleInput] = useState("");
  const [editingChatId, setEditingChatId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editChatInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  
  // Get active chat session
  const activeChat = chatSessions.find(chat => chat.id === activeChatSessionId);
  
  // Debug messages
  useEffect(() => {
    console.log("Active chat session:", activeChatSessionId);
    console.log("Chat sessions:", chatSessions);
    console.log("Active chat:", activeChat);
  }, [activeChatSessionId, chatSessions, activeChat]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages]);
  
  // Focus input fields when editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
    if (isEditingChatTitle && editChatInputRef.current) {
      editChatInputRef.current.focus();
    }
  }, [isEditingName, isEditingChatTitle]);
  
  // Prevent background scrolling when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen, isMobile]);
  
  const handleSaveName = () => {
    if (nameInput.trim()) {
      setAICompanionName(nameInput);
      setIsEditingName(false);
      
      // Show toast on name change
      toast({
        title: "AI Assistant Updated",
        description: `Your AI assistant is now named ${nameInput}`,
        className: "bg-background border border-primary text-foreground",
      });
    }
  };
  
  // For backward compatibility with existing code
  const sendMessage = (content: string) => {
    if (activeChatSessionId) {
      sendMessageInSession(activeChatSessionId, content);
    }
  };

  // Create a new chat instantly without requiring a name (auto-named from first message)
  const handleCreateChat = () => {
    createChatSession("New Chat");
    // Auto-close sidebar on mobile after selection
    if (isMobile) {
      setSidebarOpen(false);
    }
  };
  
  const handleUpdateChatTitle = () => {
    if (chatTitleInput.trim() && editingChatId) {
      updateChatSessionTitle(editingChatId, chatTitleInput);
      setIsEditingChatTitle(false);
      setEditingChatId("");
      setChatTitleInput("");
    }
  };
  
  const handleStartEditingChat = (chat: ChatSession) => {
    setEditingChatId(chat.id);
    setChatTitleInput(chat.title);
    setIsEditingChatTitle(true);
  };
  
  // Track message count to detect when AI responds
  const lastMessageCountRef = useRef<number>(0);
  const prevMessagesLengthRef = useRef<number>(0);
  
  // Watch for AI response to hide loading indicator
  useEffect(() => {
    if (activeChat?.messages) {
      const currentCount = activeChat.messages.length;
      const lastMessage = activeChat.messages[activeChat.messages.length - 1];
      
      // If we have a new AI message with actual content, stop loading
      if (currentCount > prevMessagesLengthRef.current && 
          lastMessage?.sender === 'ai' && 
          lastMessage?.content && 
          lastMessage.content.length > 0) {
        setIsLoading(false);
      }
      prevMessagesLengthRef.current = currentCount;
    }
  }, [activeChat?.messages]);
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && activeChatSessionId) {
      // Check if this is the first message in the chat
      const currentChat = chatSessions.find(chat => chat.id === activeChatSessionId);
      const isFirstMessage = currentChat && currentChat.messages.length === 0;
      
      // Show loading indicator immediately
      setIsLoading(true);
      
      // Send the message
      sendMessageInSession(activeChatSessionId, inputText);
      
      // If this is the first message, update the chat title based on this message
      if (isFirstMessage) {
        // Generate a chat title from the first user message
        // Limit title to first 30 chars of message or up to the first period if shorter
        let newTitle = inputText.trim();
        const periodIndex = newTitle.indexOf('.');
        if (periodIndex > 0 && periodIndex < 30) {
          newTitle = newTitle.substring(0, periodIndex);
        } else if (newTitle.length > 30) {
          newTitle = newTitle.substring(0, 30) + '...';
        }
        
        // Update the chat title
        updateChatSessionTitle(activeChatSessionId, newTitle);
      }
      
      setInputText("");
    }
  };

  const handleChatSelect = (chatId: string) => {
    setActiveChatSession(chatId);
    // Auto-close sidebar on mobile after selection
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] pb-10">
      {/* AI Assistant Header with integrated hamburger menu */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-primary/20">
        <div className="flex items-center">
          {/* Hamburger Menu for mobile - static in header */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="sm:hidden mr-2 p-0 h-9 w-9 text-primary hover:bg-primary/10"
          >
            {sidebarOpen ? <X className="h-5 w-5 text-primary" /> : <Menu className="h-5 w-5 text-primary" />}
          </Button>

          <span className="material-icons text-primary text-2xl mr-3">smart_toy</span>
          
          <div>
            <h1 className="text-xl font-orbitron text-foreground mb-1">AI Assistant</h1>
            
            {/* AI Name Editor */}
            {isEditingName ? (
              <div className="flex items-center">
                <Input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-8 text-sm bg-card/30 border-primary/30 focus-visible:ring-primary/30 mr-2 w-48"
                  placeholder="Enter AI name"
                  maxLength={20}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveName}
                  className="h-7 w-7 p-0 text-primary hover:bg-primary/20"
                >
                  <Check className="h-4 w-4 text-primary" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNameInput(aiCompanionName);
                    setIsEditingName(false);
                  }}
                  className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-500/20 ml-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center">
                <p className="text-sm text-primary mr-2">{aiCompanionName}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
                  className="h-6 w-6 p-0 text-primary hover:bg-primary/10"
                >
                  <Edit2 className="h-3 w-3 text-primary" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Main Chat Area with Collapsible Sidebar */}
      <div className="flex-grow flex flex-col sm:flex-row relative">
        {/* Backdrop overlay for mobile - only visible when sidebar is open */}
        {sidebarOpen && (
          <div 
            className="fixed left-0 right-0 top-[57px] bottom-[70px] bg-black/50 backdrop-blur-sm z-10 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Left Sidebar - Chat Sessions & Quick Prompts - Collapsible */}
        <div className={`
          fixed sm:static left-0 z-20
          top-[57px] bottom-[70px] sm:top-0 sm:bottom-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'} 
          transition-transform duration-200 ease-in-out
          flex flex-col w-[280px] sm:w-72 sm:h-auto
          bg-background sm:bg-transparent border-r border-primary/20 
          pt-4 sm:pt-0 px-4 sm:px-1 sm:mr-4
        `}>
          {/* Chat Sessions */}
          <div className="flex-1 flex flex-col min-h-0 pb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Chats</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-primary hover:bg-primary/10 rounded-full"
                onClick={handleCreateChat}
              >
                <PlusCircle className="h-4 w-4 text-primary" />
              </Button>
            </div>
            
            <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
              {chatSessions.map((chat) => (
                <div key={chat.id} className="relative group">
                  {isEditingChatTitle && editingChatId === chat.id ? (
                    <div className="flex items-center mb-1">
                      <Input
                        ref={editChatInputRef}
                        value={chatTitleInput}
                        onChange={(e) => setChatTitleInput(e.target.value)}
                        className="h-8 text-sm bg-card/30 border-primary/30 focus-visible:ring-primary/30 mr-2"
                        placeholder="Chat name"
                        maxLength={30}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleUpdateChatTitle();
                          } else if (e.key === 'Escape') {
                            setIsEditingChatTitle(false);
                            setEditingChatId("");
                            setChatTitleInput("");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleUpdateChatTitle}
                        className="h-7 w-7 p-0 text-primary hover:bg-primary/20"
                      >
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsEditingChatTitle(false);
                          setEditingChatId("");
                          setChatTitleInput("");
                        }}
                        className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-500/20 ml-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div 
                      className={`flex items-center justify-between px-2 py-2 rounded hover:bg-card/50 cursor-pointer ${
                        chat.id === activeChatSessionId ? 'bg-primary/10 border border-primary/20' : ''
                      }`}
                      onClick={() => handleChatSelect(chat.id)}
                    >
                      <div className="flex items-center flex-grow overflow-hidden mr-2">
                        <MessageSquare className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                        <span className="text-sm truncate pr-2">{chat.title}</span>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-primary hover:bg-primary/10 rounded-full"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3 text-primary" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background border border-primary/20">
                          <DropdownMenuItem 
                            className="text-foreground hover:bg-primary/10 focus:bg-primary/10 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditingChat(chat);
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5 mr-2 text-primary" />
                            Rename
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem 
                            className="text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-400 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChatSession(chat.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          </div>
        
        {/* Main Chat Window */}
        <div className="flex-1 flex flex-col glassmorphic rounded-xl p-4 neon-border h-full ml-0 sm:ml-4 md:ml-6 mt-12 sm:mt-0 relative min-w-0">
          {/* Messages area */}
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
            {activeChat && activeChat.messages.length > 0 ? (
              <div className="flex flex-col space-y-6 pt-2">
                {activeChat.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[90%] lg:max-w-[70%]`}>
                      {message.sender === 'ai' && (
                        <span className="material-icons text-primary text-2xl flex-shrink-0 mt-1">smart_toy</span>
                      )}
                      
                      <div className={`${message.sender === 'ai' 
                        ? 'ml-3 bg-card/70 border border-primary/30 rounded-2xl rounded-tl-sm text-foreground' 
                        : 'mr-0 bg-primary/10 border border-primary/30 rounded-2xl rounded-tr-sm text-foreground'} p-4 shadow-sm`}
                      >
                        {message.sender === 'ai' && (
                          <div className="text-xs text-primary mb-1 font-semibold">{aiCompanionName}</div>
                        )}
                        {message.sender === 'ai' ? (
                          <div className="text-sm prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:text-foreground prose-strong:text-foreground">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm">{message.content}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2 text-right">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      
                      {message.sender === 'user' && (
                        <span className="material-icons text-primary text-2xl ml-3 flex-shrink-0 mt-1">person</span>
                      )}
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex max-w-[70%]">
                      <span className="material-icons text-primary text-2xl flex-shrink-0 mt-1">smart_toy</span>
                      
                      <div className="ml-3 bg-card/70 border border-primary/30 rounded-2xl rounded-tl-sm p-4 shadow-sm">
                        <div className="text-xs text-primary mb-1 font-semibold">{aiCompanionName}</div>
                        <div className="flex space-x-2">
                          <div className="h-2 w-2 rounded-full bg-primary animate-bounce"></div>
                          <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <div className="h-full" />
            )}
          </div>
          
          {/* Input area */}
          <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-primary/20 relative">
            <div className="relative rounded-2xl border border-primary/30 bg-card/30 shadow-inner overflow-hidden">
              <Input 
                id="messageInput"
                placeholder={`Message ${aiCompanionName}...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="border-0 bg-transparent pr-12 py-6 min-h-[60px] focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputText.trim()) {
                      handleSendMessage(e);
                    }
                  }
                }}
              />
              <Button 
                type="submit"
                size="sm"
                disabled={!inputText.trim()}
                className="absolute right-2 bottom-2 h-9 w-9 p-0 rounded-lg bg-primary/50 text-white hover:bg-primary/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {aiCompanionName} can make mistakes. Consider checking important information.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}