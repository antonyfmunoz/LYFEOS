import React, { useState } from "react";
import { Bot, X, Send, Sparkles, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLYFEOS } from "@/lib/context";
import { motion, AnimatePresence } from "framer-motion";
import { DynamicColorButton } from "@/components/ui/dynamic-color-button";

export function AIAgentFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const { toast } = useToast();
  const { messages, sendMessage, stats, aiCompanionName, setAICompanionName } = useLYFEOS();
  
  // Toggle the AI chat panel
  const toggleChat = () => {
    setIsOpen(!isOpen);
    // Initialize the name input when opening the panel
    if (!isOpen && !isEditingName) {
      setNameInput(aiCompanionName);
    }
  };
  
  // Handle name save
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
  
  // Handle sending a message to the AI
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    // Send message to the AI
    sendMessage(message);
    
    // Clear input
    setMessage("");
    
    // Simulate AI typing
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      
      // Show toast on completion
      toast({
        title: "AI Response",
        description: `${aiCompanionName} has replied to your message`,
        className: "bg-background border border-primary text-foreground",
      });
    }, 2000);
  };
  
  // Get the most recent messages (limited to 5)
  const recentMessages = [...messages]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5)
    .reverse();
  
  return (
    <>
      {/* Floating action button */}
      <div className="fixed right-6 bottom-20 z-50">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute bottom-16 right-0 bg-background/90 backdrop-blur-lg border border-primary/40 rounded-lg shadow-xl w-[320px] overflow-hidden"
              style={{ 
                boxShadow: "0 0 20px var(--primary-glow-medium), 0 0 10px var(--primary-glow-light)" 
              }}
            >
              <div className="p-4 bg-primary/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center mr-2">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-orbitron text-primary">LYFE OS AI ASSISTANT</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-primary/20"
                    onClick={toggleChat}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* AI Assistant Name Editor */}
                <div className="flex items-center mt-2">
                  {isEditingName ? (
                    <div className="flex items-center w-full">
                      <Input
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="bg-card/30 border-primary/30 focus-visible:ring-primary/30 py-1 text-sm h-8 mr-2"
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
                        className="h-7 w-7 p-0 text-muted-foreground hover:bg-red-500/20 ml-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center">
                        <span className="text-primary text-sm mr-1">AI Assistant:</span>
                        <span className="text-foreground font-semibold text-sm">{aiCompanionName}</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingName(true)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-primary hover:bg-primary/20"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-3 h-[260px] overflow-y-auto flex flex-col space-y-3">
                {recentMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Sparkles className="text-primary mb-2 h-6 w-6" />
                    <p className="text-muted-foreground">How can I assist you today?</p>
                    <p className="text-xs text-muted-foreground mt-1">Your LYFE OS AI assistant is here to help</p>
                  </div>
                ) : (
                  recentMessages.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`p-2 rounded-lg max-w-[85%] ${
                        msg.sender === "user" 
                          ? "bg-primary/10 border border-primary/20 ml-auto" 
                          : "bg-card/30 border border-primary/20"
                      }`}
                    >
                      {msg.sender === 'ai' && (
                        <div className="text-xs text-primary mb-1 font-semibold">{aiCompanionName}</div>
                      )}
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-right text-xs text-muted-foreground mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
                
                {isTyping && (
                  <div className="p-2 rounded-lg max-w-[85%] bg-card/30 border border-primary/20">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                )}
              </div>
              
              <form onSubmit={handleSendMessage} className="p-3 border-t border-primary/20">
                <div className="flex space-x-2">
                  <Input
                    placeholder={`Ask ${aiCompanionName} anything...`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-card/30 border-primary/30 focus-visible:ring-primary/30"
                  />
                  <DynamicColorButton 
                    type="submit"
                    size="icon"
                    className="border"
                    style={{
                      backgroundColor: "var(--primary-color)",
                      border: "none",
                      color: "#222"
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </DynamicColorButton>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <DynamicColorButton
          onClick={toggleChat}
          size="lg"
          className="rounded-full w-14 h-14 shadow-lg transition-all duration-300"
          style={{
            boxShadow: isOpen 
              ? "0 0 20px var(--primary-glow-strong), 0 0 10px var(--primary-glow-medium)" 
              : "0 0 15px var(--primary-glow-medium)",
            backgroundColor: "var(--primary-color)",
            border: "none"
          }}
        >
          {isOpen ? <X className="h-6 w-6 text-[#222]" /> : <Bot className="h-6 w-6 text-[#222]" />}
        </DynamicColorButton>
      </div>
    </>
  );
}