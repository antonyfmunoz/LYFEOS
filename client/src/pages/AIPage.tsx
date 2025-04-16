import { useState, useRef, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { Bot, Send, ChevronRight, Edit2, Check, X, Sparkles, Brain, Zap, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function AIPage() {
  const { messages, sendMessage, aiCompanionName, setAICompanionName } = useLYFEOS();
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(aiCompanionName);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // Focus the name input field when editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);
  
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
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText("");
      
      // Show loading indicator
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
      }, 1000);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* AI Companion Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-purple-500/20">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center mr-3">
            <Bot className="h-5 w-5 text-purple-400" />
          </div>
          
          <div>
            <h1 className="text-xl font-orbitron text-white mb-1">AI Companion</h1>
            
            {/* AI Name Editor */}
            {isEditingName ? (
              <div className="flex items-center">
                <Input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-8 text-sm bg-slate-700/30 border-purple-500/30 focus-visible:ring-purple-500/30 mr-2 w-48"
                  placeholder="Enter AI name"
                  maxLength={20}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveName}
                  className="h-7 w-7 p-0 text-purple-400 hover:bg-purple-500/20"
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
                <p className="text-sm text-purple-400 mr-2">{aiCompanionName}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
                  className="h-6 w-6 p-0 text-[#7DAAB2] hover:text-purple-400 hover:bg-purple-500/20"
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
          className="h-9 w-9 rounded-full p-0 text-[#7DAAB2] hover:text-white hover:bg-slate-700"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Main Chat Area */}
      <div className="flex-grow flex">
        {/* Left Sidebar - Quick Prompts */}
        <div className="hidden lg:block w-60 mr-6 pr-4 border-r border-purple-500/20">
          <h3 className="text-sm font-semibold mb-3 text-[#D6F4FF]">Quick Prompts</h3>
          
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm h-auto py-2 px-3 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20"
            >
              <Brain className="h-4 w-4 mr-2 text-purple-400" />
              <span className="text-left">Analyze my day</span>
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm h-auto py-2 px-3 bg-slate-700/30 hover:bg-slate-700/50"
            >
              <Sparkles className="h-4 w-4 mr-2 text-purple-400" />
              <span className="text-left">Generate creative ideas</span>
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-sm h-auto py-2 px-3 bg-slate-700/30 hover:bg-slate-700/50"
            >
              <Zap className="h-4 w-4 mr-2 text-purple-400" />
              <span className="text-left">Optimize my schedule</span>
            </Button>
          </div>
        </div>
        
        {/* Main Chat Window */}
        <div className="flex-grow flex flex-col glassmorphic rounded-xl p-4 neon-border-purple h-full">
          {/* Messages area */}
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">Welcome to {aiCompanionName}</h3>
                <p className="text-[#7DAAB2] max-w-md mb-8">Your AI companion is ready to assist with insights, ideas, and optimizations for your life.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl">
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-purple-500/30 hover:bg-purple-500/10 text-white py-3"
                    onClick={() => setInputText("Analyze my calendar and suggest optimizations.")}
                  >
                    <span className="text-left">Analyze my calendar</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-purple-400" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-purple-500/30 hover:bg-purple-500/10 text-white py-3"
                    onClick={() => setInputText("Give me 3 creative ideas for solving my current challenge.")}
                  >
                    <span className="text-left">Generate creative ideas</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-purple-400" />
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="flex items-center justify-start border-purple-500/30 hover:bg-purple-500/10 text-white py-3"
                    onClick={() => setInputText("Help me track my focus and energy levels today.")}
                  >
                    <span className="text-left">Track focus & energy</span>
                    <ChevronRight className="h-4 w-4 ml-auto text-purple-400" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col space-y-6 pt-2">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-[90%] lg:max-w-[70%]`}>
                      {message.sender === 'ai' && (
                        <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="h-5 w-5 text-purple-400" />
                        </div>
                      )}
                      
                      <div className={`${message.sender === 'ai' 
                        ? 'ml-3 bg-slate-800/60 border border-purple-500/30 rounded-2xl rounded-tl-none' 
                        : 'mr-0 bg-purple-500/10 border border-purple-500/20 rounded-2xl rounded-tr-none'} p-4`}
                      >
                        {message.sender === 'ai' && (
                          <div className="text-xs text-purple-400 mb-1 font-semibold">{aiCompanionName}</div>
                        )}
                        <p className="text-sm text-white">{message.content}</p>
                        <p className="text-xs text-[#7DAAB2] mt-2 text-right">
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      
                      {message.sender === 'user' && (
                        <div className="h-10 w-10 rounded-full bg-surface ml-3 flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-purple-400">
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
                      <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="h-5 w-5 text-purple-400" />
                      </div>
                      
                      <div className="ml-3 bg-slate-800/60 border border-purple-500/30 rounded-2xl rounded-tl-none p-4">
                        <div className="text-xs text-purple-400 mb-1 font-semibold">{aiCompanionName}</div>
                        <div className="flex space-x-2">
                          <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                          <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Invisible div to scroll to */}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
          
          {/* Input area */}
          <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-purple-500/20">
            <div className="relative">
              <Input 
                placeholder={`Ask ${aiCompanionName} anything...`}
                className="bg-slate-800/30 border border-purple-500/30 rounded-lg text-sm py-6 pl-4 pr-12 focus-visible:ring-purple-500/30"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <Button 
                type="submit"
                size="icon"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-9 w-9 rounded-full bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-[#7DAAB2] mt-2 text-center">
              {aiCompanionName} is powered by the LYFEOS neural framework. Responses are generated to assist your personal growth.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
