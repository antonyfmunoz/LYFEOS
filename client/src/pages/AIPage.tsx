import { useState } from "react";
import { useLYFEOS } from "../lib/context";

export default function AIPage() {
  const { messages, sendMessage } = useLYFEOS();
  const [inputText, setInputText] = useState("");
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText("");
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">AI Companion</h1>
        <p className="text-[#7DAAB2]">Your personal AI assistant to optimize your life.</p>
      </div>
      
      <div className="glassmorphic rounded-xl p-4 mb-6 neon-border h-[calc(100vh-240px)] flex flex-col">
        {/* Messages area */}
        <div className="flex-grow overflow-y-auto mb-4 p-2">
          <div className="flex flex-col space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex items-start ${message.sender === 'user' ? 'justify-end' : ''}`}>
                {message.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-primary bg-opacity-20 flex items-center justify-center flex-shrink-0">
                    <span className="material-icons text-sm text-primary">smart_toy</span>
                  </div>
                )}
                
                <div className={`${message.sender === 'ai' ? 'ml-3 bg-surface bg-opacity-50 rounded-lg rounded-tl-none' : 
                  'mr-3 bg-primary bg-opacity-10 rounded-lg rounded-tr-none'} p-3 text-sm max-w-[70%]`}>
                  <p>{message.content}</p>
                  <p className="text-xs text-[#7DAAB2] mt-1 text-right">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                
                {message.sender === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <span className="material-icons text-primary">person</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Input area */}
        <form onSubmit={handleSendMessage} className="border-t border-primary border-opacity-20 pt-4">
          <div className="flex items-center">
            <input 
              type="text" 
              placeholder="Ask your AI companion..." 
              className="bg-transparent border border-primary border-opacity-20 rounded-lg py-3 px-4 outline-none flex-grow text-sm placeholder:text-[#7DAAB2] focus:border-opacity-50 transition"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button 
              type="submit"
              className="ml-3 w-12 h-12 flex items-center justify-center rounded-full bg-primary text-background hover:bg-opacity-80 transition"
            >
              <span className="material-icons">send</span>
            </button>
          </div>
        </form>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center mb-2">
            <span className="material-icons text-primary mr-2">psychology</span>
            <h3 className="font-orbitron text-[#D6F4FF]">ANALYZE DAY</h3>
          </div>
          <p className="text-xs text-[#7DAAB2]">Get insights on your productivity and energy patterns.</p>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center mb-2">
            <span className="material-icons text-secondary mr-2">lightbulb</span>
            <h3 className="font-orbitron text-[#D6F4FF]">IDEAS</h3>
          </div>
          <p className="text-xs text-[#7DAAB2]">Generate creative solutions to your current challenges.</p>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center mb-2">
            <span className="material-icons text-accent mr-2">calendar_today</span>
            <h3 className="font-orbitron text-[#D6F4FF]">SCHEDULE</h3>
          </div>
          <p className="text-xs text-[#7DAAB2]">Optimize your calendar based on your energy cycles.</p>
        </div>
      </div>
    </>
  );
}
