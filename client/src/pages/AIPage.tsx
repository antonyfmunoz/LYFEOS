import { useState, useRef, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { 
  Bot, Send, ChevronRight, Edit2, Check, X, Sparkles, Brain, Zap, Settings, 
  PlusCircle, Trash2, MessageSquare, MoreVertical, Menu, X as CloseIcon
} from "lucide-react";
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
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [isEditingChatTitle, setIsEditingChatTitle] = useState(false);
  const [chatTitleInput, setChatTitleInput] = useState("");
  const [editingChatId, setEditingChatId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const newChatInputRef = useRef<HTMLInputElement>(null);
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
    if (isCreatingChat && newChatInputRef.current) {
      newChatInputRef.current.focus();
    }
    if (isEditingChatTitle && editChatInputRef.current) {
      editChatInputRef.current.focus();
    }
  }, [isEditingName, isCreatingChat, isEditingChatTitle]);
  
  const handleSaveName = () => {
    if (nameInput.trim()) {
      setAICompanionName(nameInput);
      setIsEditingName(false);
      
      // Show toast on name change
      toast({
        title: "AI Companion Updated",
        description: `Your AI companion is now named ${nameInput}`,
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

  const handleCreateChat = () => {
    if (newChatTitle.trim()) {
      const newChat = createChatSession(newChatTitle);
      setActiveChatSession(newChat.id);
      setNewChatTitle("");
      setIsCreatingChat(false);
      // Auto-close sidebar on mobile after selection
      if (isMobile) {
        setSidebarOpen(false);
      }
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
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && activeChatSessionId) {
      sendMessageInSession(activeChatSessionId, inputText);
      setInputText("");
      
      // Show loading indicator
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
      }, 1000);
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
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* AI Companion Header with integrated hamburger menu */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-primary/20">
        <div className="flex items-center">
          {/* Hamburger Menu for mobile - static in header */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="sm:hidden mr-2 p-0 h-9 w-9 text-primary hover:bg-primary/10"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mr-3">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          
          <div>
            <h1 className="text-xl font-sans text-foreground mb-1">AI Companion</h1>
            
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
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNameInput(aiCompanionName);
                    setIsEditingName(false);
                  }}
                  className="h-7 w-7 p-0 text-[#7DAAB2] hover:bg-red-500/20 ml-1"
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
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 rounded-full p-0 text-muted-foreground hover:text-foreground hover:bg-card/70"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Main Chat Area with Collapsible Sidebar */}
      <div className="flex-grow flex flex-col sm:flex-row relative">
        {/* Backdrop overlay for mobile - only visible when sidebar is open */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-10 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Left Sidebar - Chat Sessions & Quick Prompts - Collapsible */}
        <div className={`
          fixed sm:static inset-y-0 left-0 z-20
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'} 
          transition-transform duration-200 ease-in-out
          flex flex-col w-[280px] sm:w-72 h-[calc(100vh-140px)]
          bg-background sm:bg-transparent border-r border-primary/20 
          pt-12 sm:pt-0 px-4 sm:px-1 sm:mr-4
          overflow-y-auto
        `}>
          {/* Chat Sessions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Chats</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full"
                onClick={() => setIsCreatingChat(true)}
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
            
            {isCreatingChat ? (
              <div className="flex items-center mb-2">
                <Input
                  ref={newChatInputRef}
                  value={newChatTitle}
                  onChange={(e) => setNewChatTitle(e.target.value)}
                  className="h-8 text-sm bg-slate-700/30 border-primary/30 focus-visible:ring-primary/30 mr-2"
                  placeholder="New chat name"
                  maxLength={30}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateChat();
                    } else if (e.key === 'Escape') {
                      setIsCreatingChat(false);
                      setNewChatTitle("");
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCreateChat}
                  className="h-7 w-7 p-0 text-primary hover:bg-primary/20"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsCreatingChat(false);
                    setNewChatTitle("");
                  }}
                  className="h-7 w-7 p-0 text-[#7DAAB2] hover:bg-red-500/20 ml-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            
            <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
              {chatSessions.map((chat) => (
                <div key={chat.id} className="relative group">
                  {isEditingChatTitle && editingChatId === chat.id ? (
                    <div className="flex items-center mb-1">
                      <Input
                        ref={editChatInputRef}
                        value={chatTitleInput}
                        onChange={(e) => setChatTitleInput(e.target.value)}
                        className="h-8 text-sm bg-slate-700/30 border-primary/30 focus-visible:ring-primary/30 mr-2"
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
                        <Check className="h-4 w-4" />
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
                        className="h-7 w-7 p-0 text-[#7DAAB2] hover:bg-red-500/20 ml-1"
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
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-card/50 rounded-full"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
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
          
          {/* Quick Prompts Section */}
          <h3 className="text-sm font-semibold mb-3 text-foreground">Quick Prompts</h3>
          
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm h-auto py-2 px-3 bg-primary/10 border border-primary/20 hover:bg-primary/20"
              onClick={() => {
                setInputText("Analyze my day and suggest focus areas.");
                if (activeChatSessionId) {
                  sendMessageInSession(activeChatSessionId, "Analyze my day and suggest focus areas.");
                }
                if (isMobile) {
                  setSidebarOpen(false);
                }
              }}
            >
              <Brain className="h-4 w-4 mr-2 text-primary" />
              <span className="text-left">Analyze my day</span>
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm h-auto py-2 px-3 bg-card/30 hover:bg-card/50"
              onClick={() => {
                setInputText("Generate 3 creative ideas for my current challenge.");
                if (activeChatSessionId) {
                  sendMessageInSession(activeChatSessionId, "Generate 3 creative ideas for my current challenge.");
                }
                if (isMobile) {
                  setSidebarOpen(false);
                }
              }}
            >
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              <span className="text-left">Generate creative ideas</span>
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm h-auto py-2 px-3 bg-card/30 hover:bg-card/50"
              onClick={() => {
                setInputText("Optimize my schedule to maximize productivity.");
                if (activeChatSessionId) {
                  sendMessageInSession(activeChatSessionId, "Optimize my schedule to maximize productivity.");
                }
                if (isMobile) {
                  setSidebarOpen(false);
                }
              }}
            >
              <Zap className="h-4 w-4 mr-2 text-primary" />
              <span className="text-left">Optimize my schedule</span>
            </Button>
          </div>
        </div>
        
        {/* Main Chat Window */}
        <div className="flex-1 flex flex-col glassmorphic rounded-xl p-4 neon-border h-full ml-0 sm:ml-4 md:ml-6 mt-12 sm:mt-0 relative min-w-0">
          {/* Messages area */}
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
            {!activeChat || activeChat.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">Welcome to {aiCompanionName}</h3>
                <p className="text-muted-foreground max-w-md mb-8">Your AI companion is ready to assist with insights, ideas, and optimizations for your life.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl">
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-primary/30 hover:bg-primary/10 text-foreground py-3"
                    onClick={() => setInputText("Analyze my calendar and suggest optimizations.")}
                  >
                    <span className="text-left">Analyze my calendar</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-primary" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-primary/30 hover:bg-primary/10 text-foreground py-3"
                    onClick={() => setInputText("Give me 3 creative ideas for solving my current challenge.")}
                  >
                    <span className="text-left">Generate creative ideas</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-primary" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-primary/30 hover:bg-primary/10 text-foreground py-3"
                    onClick={() => setInputText("Help me track my focus and energy levels today.")}
                  >
                    <span className="text-left">Track focus & energy</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-primary" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col space-y-6 pt-2">
                {activeChat.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[90%] lg:max-w-[70%]`}>
                      {message.sender === 'ai' && (
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      
                      <div className={`${message.sender === 'ai' 
                        ? 'ml-3 bg-card/70 border border-primary/30 rounded-2xl rounded-tl-sm text-foreground' 
                        : 'mr-0 bg-primary/10 border border-primary/30 rounded-2xl rounded-tr-sm text-foreground'} p-4 shadow-sm`}
                      >
                        {message.sender === 'ai' && (
                          <div className="text-xs text-primary mb-1 font-semibold">{aiCompanionName}</div>
                        )}
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs text-muted-foreground mt-2 text-right">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      
                      {message.sender === 'user' && (
                        <div className="h-10 w-10 rounded-full bg-card/60 ml-3 flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex max-w-[70%]">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      
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
            )}
          </div>
          
          {/* Input area */}
          <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-primary/20 relative">
            <div className="relative rounded-2xl border border-primary/30 bg-card/30 shadow-inner overflow-hidden">
              <Input 
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