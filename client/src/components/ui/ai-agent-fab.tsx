import React, { useState } from "react";
import { Bot, X, Send, Sparkles, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLYFEOS } from "@/lib/context";
import { motion, AnimatePresence } from "framer-motion";

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
        description: "LYFE OS AI has replied to your message",
        className: "bg-[#001E26] border border-purple-500 text-white",
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
              className="absolute bottom-16 right-0 bg-[#001E26]/90 backdrop-blur-lg border border-purple-500/40 rounded-lg shadow-xl w-[320px] overflow-hidden"
              style={{ 
                boxShadow: "0 0 20px rgba(156, 106, 222, 0.2), 0 0 10px rgba(156, 106, 222, 0.1)" 
              }}
            >
              <div className="p-4 bg-purple-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center mr-2">
                      <Bot className="h-4 w-4 text-purple-400" />
                    </div>
                    <h3 className="font-orbitron text-purple-400">LYFE OS AI</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-[#7DAAB2] hover:text-white hover:bg-purple-500/20"
                    onClick={toggleChat}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="p-3 h-[260px] overflow-y-auto flex flex-col space-y-3">
                {recentMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Sparkles className="text-purple-400 mb-2 h-6 w-6" />
                    <p className="text-[#7DAAB2]">How can I assist you today?</p>
                    <p className="text-xs text-[#7DAAB2] mt-1">Your LYFE OS AI assistant is here to help</p>
                  </div>
                ) : (
                  recentMessages.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`p-2 rounded-lg max-w-[85%] ${
                        msg.sender === "user" 
                          ? "bg-purple-500/10 border border-purple-500/20 ml-auto" 
                          : "bg-slate-700/30 border border-slate-700/50"
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-right text-xs text-[#7DAAB2] mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
                
                {isTyping && (
                  <div className="p-2 rounded-lg max-w-[85%] bg-slate-700/30 border border-slate-700/50">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                )}
              </div>
              
              <form onSubmit={handleSendMessage} className="p-3 border-t border-purple-500/20">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Ask me anything..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-slate-700/30 border-purple-500/30 focus-visible:ring-purple-500/30"
                  />
                  <Button 
                    type="submit"
                    size="icon"
                    className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          onClick={toggleChat}
          size="lg"
          className={`
            rounded-full w-14 h-14 shadow-lg transition-all duration-300
            ${isOpen
              ? "bg-purple-500 hover:bg-purple-600"
              : "bg-purple-500 hover:bg-purple-600"
            }
          `}
          style={{
            boxShadow: isOpen 
              ? "0 0 20px rgba(156, 106, 222, 0.3), 0 0 10px rgba(156, 106, 222, 0.2)" 
              : "0 0 15px rgba(156, 106, 222, 0.2)"
          }}
        >
          {isOpen ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        </Button>
      </div>
    </>
  );
}