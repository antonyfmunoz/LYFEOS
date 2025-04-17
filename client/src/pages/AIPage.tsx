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
        className: "bg-[#001E26] border border-purple-500 text-white",
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
      {/* App Header - Clean, minimal like OpenAI */}
      <div className="flex items-center justify-between py-3 px-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0F1923]">
        <div className="flex items-center">
          {/* Hamburger Menu for mobile - static in header */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="sm:hidden mr-2 p-0 h-9 w-9 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <div className="flex items-center">
            <Bot className="h-5 w-5 text-gray-700 dark:text-gray-300 mr-2" />
            <h1 className="text-base font-medium text-gray-700 dark:text-gray-300">
              {aiCompanionName} <span className="text-xs font-normal text-gray-500">4.0</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Rename button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditingName(true)}
            className="h-8 px-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            Rename
          </Button>

          {/* Saved memory indicator - like in OpenAI */}
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
            <span>Saved memory</span>
            <span className="ml-1 text-gray-400 dark:text-gray-500">full</span>
          </div>

          {/* Temporary button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            Temporary
          </Button>
        </div>
      </div>

      {/* Name Editor Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1E2A35] rounded-lg shadow-lg w-80 p-4">
            <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-white">Rename AI companion</h3>
            <Input
              ref={nameInputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="mb-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700"
              placeholder="Enter AI name"
              maxLength={20}
            />
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNameInput(aiCompanionName);
                  setIsEditingName(false);
                }}
                className="text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveName}
                className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
      
      
      {/* Main Chat Area with Collapsible Sidebar */}
      <div className="flex-grow flex flex-col sm:flex-row relative">
        {/* Backdrop overlay for mobile - only visible when sidebar is open */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-10 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Left Sidebar - OpenAI style with Projects list */}
        <div className={`
          fixed sm:static inset-y-0 left-0 z-20
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'} 
          transition-transform duration-200 ease-in-out
          flex flex-col w-[280px] sm:w-60 h-[calc(100vh-64px)]
          bg-white dark:bg-[#0F1923] border-r border-gray-200 dark:border-gray-800 
          pt-12 sm:pt-4 px-3
          overflow-y-auto
        `}>
          {/* Projects Section Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Projects</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              onClick={() => setIsCreatingChat(true)}
            >
              <PlusCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
          
          {/* New Project Input */}
          {isCreatingChat ? (
            <div className="flex items-center mb-2">
              <Input
                ref={newChatInputRef}
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
                className="h-8 text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 mr-2"
                placeholder="New project"
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
              <div className="flex space-x-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCreateChat}
                  className="h-6 w-6 p-0 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsCreatingChat(false);
                    setNewChatTitle("");
                  }}
                  className="h-6 w-6 p-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
          
          {/* Today Section */}
          <div className="mt-4 mb-2">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Today</h4>
            <div className="space-y-1">
              {chatSessions.map((chat) => (
                <div key={chat.id} className="relative group">
                  {isEditingChatTitle && editingChatId === chat.id ? (
                    <div className="flex items-center mb-1">
                      <Input
                        ref={editChatInputRef}
                        value={chatTitleInput}
                        onChange={(e) => setChatTitleInput(e.target.value)}
                        className="h-8 text-sm bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 mr-2"
                        placeholder="Project name"
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
                      <div className="flex space-x-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleUpdateChatTitle}
                          className="h-6 w-6 p-0 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          <Check className="h-3.5 w-3.5" />
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
                          className="h-6 w-6 p-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer ${
                        chat.id === activeChatSessionId 
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' 
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50'
                      }`}
                      onClick={() => handleChatSelect(chat.id)}
                    >
                      <div className="flex items-center flex-grow overflow-hidden">
                        <span className="text-xs truncate">{chat.title}</span>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditingChat(chat);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Yesterday Section - Placeholder with sample items */}
          <div className="mb-4">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Yesterday</h4>
            <div className="space-y-1">
              <div className="px-2 py-1.5 rounded-md text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer">
                Alternative Daily Note Names
              </div>
              <div className="px-2 py-1.5 rounded-md text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer">
                Indoor Outdoor Experience Design
              </div>
              <div className="px-2 py-1.5 rounded-md text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer">
                Image request for t-shirt
              </div>
            </div>
          </div>
          
          {/* View plans button */}
          <Button 
            variant="ghost" 
            className="w-full justify-start text-xs h-auto py-1.5 px-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900/50 mt-auto"
            onClick={() => {
              // Future functionality
            }}
          >
            <span className="text-left flex items-center">
              <CircleDot className="h-3 w-3 mr-2 text-gray-500 dark:text-gray-400" />
              View plans
            </span>
          </Button>
        </div>
        
        {/* Main Chat Window - OpenAI style */}
        <div className="flex-1 flex flex-col bg-white dark:bg-[#1E2A35] h-full relative min-w-0">
          {/* Messages area */}
          <div className="flex-grow overflow-y-auto custom-scrollbar">
            {!activeChat || activeChat.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <h3 className="text-2xl font-medium mb-2 text-gray-900 dark:text-white">What's on your mind today?</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mb-10">Ask anything...</p>
                
                <div className="flex flex-col space-y-3 w-full max-w-md">
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setInputText("Analyze my calendar and suggest optimizations.")}
                  >
                    <span className="text-left">Analyze my calendar and suggest optimizations</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setInputText("Give me 3 creative ideas for solving my current challenge.")}
                  >
                    <span className="text-left">Give me 3 creative ideas for solving my current challenge</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => setInputText("Help me track my focus and energy levels today.")}
                  >
                    <span className="text-left">Help me track my focus and energy levels today</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col py-4 px-4 md:px-8 lg:px-14">
                {activeChat.messages.map((message) => (
                  <div key={message.id} className="mb-6 last:mb-8">
                    <div className="flex items-start max-w-4xl mx-auto">
                      {message.sender === 'ai' ? (
                        <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1 mr-4">
                          <Bot className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1 mr-4">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                        </div>
                      )}
                      
                      <div className="flex-1">
                        {message.sender === 'ai' && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{aiCompanionName}</div>
                        )}
                        <div className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="mb-6">
                    <div className="flex items-start max-w-4xl mx-auto">
                      <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1 mr-4">
                        <Bot className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                      </div>
                      
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{aiCompanionName}</div>
                        <div className="flex space-x-2">
                          <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse"></div>
                          <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" style={{ animationDelay: "150ms" }}></div>
                          <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" style={{ animationDelay: "300ms" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          
          {/* Input area - OpenAI style */}
          <div className="border-t border-gray-200 dark:border-gray-800 p-4">
            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto">
              <div className="flex items-end bg-white dark:bg-[#1E2A35] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <Input 
                  placeholder={`Ask anything...`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="border-0 flex-1 py-3 px-3 min-h-[48px] focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-gray-800 dark:text-gray-200 bg-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (inputText.trim()) {
                        handleSendMessage(e);
                      }
                    }
                  }}
                />
                
                <div className="flex">
                  <Button 
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mr-1 h-9 w-9 p-0 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  
                  <Button 
                    type="submit"
                    disabled={!inputText.trim()}
                    className="h-9 mr-1 mb-1 px-3 rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center justify-center mt-2">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <span className="mr-1">Deep research</span>
                  <Button 
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 rounded-full"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}