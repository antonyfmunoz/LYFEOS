import { useState, useRef, useEffect, useCallback } from "react";
import { useLYFEOS } from "../../lib/context";
import { Edit2, Check, X, Volume2, VolumeX, MessageCircle, Minimize2, Send, PlusCircle, Trash2, MessageSquare, MoreVertical, Menu, ImagePlus, Loader2, Mic } from "lucide-react";
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
import { ChatSession } from "../../lib/types";

export default function AICompanionPanel() {
  const {
    chatSessions,
    activeChatSessionId,
    sendMessageInSession,
    createChatSession,
    deleteChatSession,
    setActiveChatSession,
    updateChatSessionTitle,
    aiCompanionName,
    setAICompanionName,
    aiPanelOpen: isOpen,
    setAIPanelOpen: setIsOpen
  } = useLYFEOS();

  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(aiCompanionName);
  const [isEditingChatTitle, setIsEditingChatTitle] = useState(false);
  const [chatTitleInput, setChatTitleInput] = useState("");
  const [editingChatId, setEditingChatId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const editChatInputRef = useRef<HTMLInputElement>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const prevMessagesLengthRef = useRef<number>(0);
  const [attachedImageIds, setAttachedImageIds] = useState<number[]>([]);
  const [attachedImagePreviews, setAttachedImagePreviews] = useState<{id: number; name: string}[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const chatImageInputRef = useRef<HTMLInputElement>(null);

  const activeChat = chatSessions.find(chat => chat.id === activeChatSessionId);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
    if (isEditingChatTitle && editChatInputRef.current) {
      editChatInputRef.current.focus();
    }
  }, [isEditingName, isEditingChatTitle]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChat?.messages, isOpen]);

  useEffect(() => {
    if (activeChat?.messages) {
      const currentCount = activeChat.messages.length;
      const lastMessage = activeChat.messages[activeChat.messages.length - 1];
      if (currentCount > prevMessagesLengthRef.current &&
          lastMessage?.sender === 'ai' &&
          lastMessage?.content &&
          lastMessage.content.length > 0) {
        setIsLoading(false);
      }
      prevMessagesLengthRef.current = currentCount;
    }
  }, [activeChat?.messages]);

  const handleChatImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/inline-upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      setAttachedImageIds(prev => [...prev, data.id]);
      setAttachedImagePreviews(prev => [...prev, { id: data.id, name: file.name }]);
    } catch (error) {
      toast({ title: 'Failed to upload image', variant: 'destructive' });
    } finally {
      setIsUploadingImage(false);
      if (chatImageInputRef.current) chatImageInputRef.current.value = '';
    }
  }, [toast]);

  const removeAttachedImage = (id: number) => {
    setAttachedImageIds(prev => prev.filter(i => i !== id));
    setAttachedImagePreviews(prev => prev.filter(p => p.id !== id));
  };

  const toggleTTS = useCallback((messageId: string, text: string) => {
    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const plainText = text.replace(/[#*_~`>\-\[\]()!|]/g, '').replace(/\n+/g, '. ');
    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
      || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  }, [speakingMessageId]);

  useEffect(() => {
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if ((inputText.trim() || attachedImageIds.length > 0) && activeChatSessionId) {
      const currentChat = chatSessions.find(chat => chat.id === activeChatSessionId);
      const isFirstMessage = currentChat && currentChat.messages.length === 0;

      setIsLoading(true);

      const messageContent = attachedImageIds.length > 0 && !inputText.trim()
        ? "Please analyze these images."
        : inputText;
      sendMessageInSession(activeChatSessionId, messageContent, attachedImageIds.length > 0 ? attachedImageIds : undefined);
      setAttachedImageIds([]);
      setAttachedImagePreviews([]);

      if (isFirstMessage) {
        let newTitle = inputText.trim();
        const periodIndex = newTitle.indexOf('.');
        if (periodIndex > 0 && periodIndex < 30) {
          newTitle = newTitle.substring(0, periodIndex);
        } else if (newTitle.length > 30) {
          newTitle = newTitle.substring(0, 30) + '...';
        }
        updateChatSessionTitle(activeChatSessionId, newTitle);
      }

      setInputText("");
    }
  };

  const handleCreateChat = () => {
    createChatSession("New Chat");
    setSidebarOpen(false);
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      setAICompanionName(nameInput);
      setIsEditingName(false);
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

  const handleChatSelect = (chatId: string) => {
    setActiveChatSession(chatId);
    setSidebarOpen(false);
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="hidden lg:flex fixed bottom-6 right-6 z-50 w-14 h-14 items-center justify-center rounded-full bg-primary text-background shadow-lg hover:scale-105 transition-transform"
          style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}
          title={`Chat with ${aiCompanionName}`}
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {isOpen && (
        <div className="hidden lg:flex lg:flex-col fixed bottom-6 right-6 z-50 w-[480px] h-[700px] max-h-[85vh] rounded-xl border border-primary/20 glassmorphic shadow-2xl overflow-hidden"
          style={{ boxShadow: "0 0 30px var(--primary-glow-light)" }}
        >
          <div className="p-3 border-b border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="mr-2 p-0 h-7 w-7 text-primary hover:bg-primary/10"
                >
                  {sidebarOpen ? <X className="h-4 w-4 text-primary" /> : <Menu className="h-4 w-4 text-primary" />}
                </Button>
                <span className="material-icons text-primary text-xl mr-2">smart_toy</span>
                <h2 className="font-orbitron text-sm">AI Assistant</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition"
                title="Minimize"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>

            {isEditingName ? (
              <div className="flex items-center">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="bg-transparent border border-primary/30 rounded-lg py-1 px-2 mr-2 outline-none flex-grow text-sm text-foreground focus:border-primary/60 transition"
                  placeholder="Enter AI name"
                  maxLength={20}
                />
                <button onClick={handleSaveName} className="p-1 text-[#36F1CD] hover:bg-[#36F1CD]/10 rounded"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setNameInput(aiCompanionName); setIsEditingName(false); }} className="p-1 text-red-400 hover:bg-red-400/10 rounded ml-1"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex items-center">
                <span className="text-sm text-primary mr-2">{aiCompanionName}</span>
                <button onClick={() => setIsEditingName(true)} className="p-1 text-primary hover:bg-primary/10 transition rounded">
                  <Edit2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 flex min-h-0 relative">
            {sidebarOpen && (
              <div className="absolute inset-0 z-10 bg-background border-r border-primary/20 flex flex-col p-3 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Chats</h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-primary hover:bg-primary/10 rounded-full"
                      onClick={handleCreateChat}
                    >
                      <PlusCircle className="h-4 w-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:bg-primary/10 rounded-full"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                  {chatSessions.map((chat) => (
                    <div key={chat.id} className="relative group">
                      {isEditingChatTitle && editingChatId === chat.id ? (
                        <div className="flex items-center mb-1">
                          <input
                            ref={editChatInputRef}
                            value={chatTitleInput}
                            onChange={(e) => setChatTitleInput(e.target.value)}
                            className="h-8 text-sm bg-card/30 border border-primary/30 rounded px-2 flex-1 mr-2 outline-none focus:border-primary/60 text-foreground"
                            placeholder="Chat name"
                            maxLength={30}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateChatTitle();
                              else if (e.key === 'Escape') { setIsEditingChatTitle(false); setEditingChatId(""); setChatTitleInput(""); }
                            }}
                          />
                          <button onClick={handleUpdateChatTitle} className="p-1 text-primary hover:bg-primary/20 rounded"><Check className="h-4 w-4" /></button>
                          <button onClick={() => { setIsEditingChatTitle(false); setEditingChatId(""); setChatTitleInput(""); }} className="p-1 text-muted-foreground hover:bg-red-500/20 rounded ml-1"><X className="h-4 w-4" /></button>
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
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-primary hover:bg-primary/10 rounded-full" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-3 w-3 text-primary" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-background border border-primary/20">
                              <DropdownMenuItem className="text-foreground hover:bg-primary/10 focus:bg-primary/10 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleStartEditingChat(chat); }}>
                                <Edit2 className="h-3.5 w-3.5 mr-2 text-primary" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-400 cursor-pointer" onClick={async (e) => {
                                e.stopPropagation();
                                const success = await deleteChatSession(chat.id);
                                if (!success) toast({ title: "Delete Failed", description: "Could not delete the chat.", variant: "destructive" });
                              }}>
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div className="flex-grow overflow-y-auto p-3 custom-scrollbar">
                {activeChat && activeChat.messages.length > 0 ? (
                  <div className="flex flex-col space-y-4 pt-1">
                    {activeChat.messages.map((message) => (
                      <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="flex max-w-[90%]">
                          {message.sender === 'ai' && (
                            <span className="material-icons text-primary text-xl flex-shrink-0 mt-1">smart_toy</span>
                          )}
                          <div className={`${message.sender === 'ai'
                            ? 'ml-2 bg-card/70 border border-primary/30 rounded-2xl rounded-tl-sm text-white'
                            : 'mr-0 bg-primary/10 border border-primary/30 rounded-2xl rounded-tr-sm text-foreground'} p-3 shadow-sm`}
                          >
                            {message.sender === 'ai' && (
                              <div className="text-xs text-primary mb-1 font-semibold">{aiCompanionName}</div>
                            )}
                            {message.sender === 'ai' ? (
                              <div className="text-sm prose prose-sm prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-3 prose-headings:text-white prose-strong:text-white prose-hr:my-3 text-white">
                                <ReactMarkdown>{message.content}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="text-sm">{message.content}</p>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              {message.sender === 'ai' ? (
                                <button
                                  onClick={() => toggleTTS(message.id, message.content)}
                                  className="text-muted-foreground hover:text-primary transition-colors p-0.5"
                                  title={speakingMessageId === message.id ? "Stop reading" : "Read aloud"}
                                >
                                  {speakingMessageId === message.id ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                                </button>
                              ) : <span />}
                              <p className="text-xs text-muted-foreground text-right">
                                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          {message.sender === 'user' && (
                            <span className="material-icons text-primary text-xl ml-2 flex-shrink-0 mt-1">person</span>
                          )}
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="flex max-w-[90%]">
                          <span className="material-icons text-primary text-xl flex-shrink-0 mt-1">smart_toy</span>
                          <div className="ml-2 bg-card/70 border border-primary/30 rounded-2xl rounded-tl-sm p-3 shadow-sm">
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

              <form onSubmit={handleSendMessage} className="p-3 border-t border-primary/20 relative">
                {attachedImagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 px-1">
                    {attachedImagePreviews.map(img => (
                      <div key={img.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary">
                        <ImagePlus className="h-3 w-3" />
                        <span className="max-w-[80px] truncate">{img.name}</span>
                        <button type="button" onClick={() => removeAttachedImage(img.id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={chatImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleChatImageUpload(file); }}
                />
                <div className="relative rounded-2xl border border-primary/30 bg-card/30 shadow-inner overflow-hidden">
                  <Input
                    placeholder={`Message ${aiCompanionName}...`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="border-0 bg-transparent pr-24 py-5 min-h-[48px] focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-foreground"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (inputText.trim() || attachedImageIds.length > 0) handleSendMessage(e);
                      }
                    }}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (items) {
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.startsWith('image/')) {
                            e.preventDefault();
                            const file = items[i].getAsFile();
                            if (file) handleChatImageUpload(file);
                            break;
                          }
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => chatImageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="absolute right-[72px] bottom-1.5 h-7 w-7 rounded border bg-card/50 border-primary/30 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
                    title="Attach image"
                  >
                    {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-voice-control'))}
                    className="absolute right-10 bottom-1.5 h-7 w-7 rounded border bg-card/50 border-primary/30 text-primary hover:bg-primary/20 transition-colors inline-flex items-center justify-center"
                    title="Voice input"
                  >
                    <Mic className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="submit"
                    disabled={!inputText.trim() && attachedImageIds.length === 0}
                    className="absolute right-1.5 bottom-1.5 h-7 w-7 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
