import { useState } from "react";
import { useLYFEOS } from "../../lib/context";
import { Link } from "wouter";

export default function AICompanionPreview() {
  const { messages, sendMessage } = useLYFEOS();
  const [inputText, setInputText] = useState("");
  
  // Get the latest AI message for preview
  const latestAIMessage = messages
    .filter(msg => msg.sender === "ai")
    .slice(-1)[0];
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText("");
    }
  };
  
  return (
    <div className="glassmorphic rounded-xl p-4 neon-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">AI Companion</h2>
        <Link href="/ai" className="text-xs text-primary font-medium hover:text-opacity-80 transition">
          OPEN CHAT
        </Link>
      </div>
      
      <div className="space-y-3 mb-3">
        <div className="flex items-start">
          <div className="w-8 h-8 rounded-full bg-primary bg-opacity-20 flex items-center justify-center flex-shrink-0">
            <span className="material-icons text-sm text-primary">smart_toy</span>
          </div>
          <div className="ml-3 p-3 bg-surface bg-opacity-50 rounded-lg rounded-tl-none text-sm">
            <p>{latestAIMessage?.content || "How can I assist you today?"}</p>
          </div>
        </div>
      </div>
      
      <form onSubmit={handleSendMessage} className="flex items-center border border-primary border-opacity-20 rounded-lg p-2">
        <input 
          type="text" 
          placeholder="Ask your AI companion..." 
          className="bg-transparent border-none outline-none flex-grow text-sm text-primary placeholder:text-primary/60"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button 
          type="submit"
          className="ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-primary bg-opacity-10 text-primary hover:bg-opacity-20 transition"
        >
          <span className="material-icons text-sm">send</span>
        </button>
      </form>
    </div>
  );
}
