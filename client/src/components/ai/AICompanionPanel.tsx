import { useState } from "react";
import { useLifeOS } from "../../lib/context";

export default function AICompanionPanel() {
  const { messages, sendMessage } = useLifeOS();
  const [inputText, setInputText] = useState("");
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText("");
    }
  };
  
  return (
    <div className="hidden xl:flex xl:flex-col w-80 border-l border-opacity-20 border-primary glassmorphic">
      <div className="p-4 border-b border-opacity-20 border-primary">
        <div className="flex items-center justify-between">
          <h2 className="font-orbitron text-lg">AI COMPANION</h2>
          <button className="material-icons text-[#7DAAB2] text-sm hover:text-primary transition">settings</button>
        </div>
      </div>
      
      <div className="p-4 h-[calc(100vh-180px)] overflow-y-auto">
        <div className="flex flex-col space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex items-start ${message.sender === 'user' ? 'justify-end' : ''}`}>
              {message.sender === 'ai' && (
                <div className="w-8 h-8 rounded-full bg-primary bg-opacity-20 flex items-center justify-center flex-shrink-0">
                  <span className="material-icons text-sm text-primary">smart_toy</span>
                </div>
              )}
              
              <div className={`${message.sender === 'ai' ? 'ml-3 bg-surface bg-opacity-50 rounded-lg rounded-tl-none' : 
                'mr-3 bg-primary bg-opacity-10 rounded-lg rounded-tr-none'} p-3 text-sm`}>
                <p>{message.content}</p>
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
      
      <form onSubmit={handleSendMessage} className="p-4 border-t border-opacity-20 border-primary">
        <div className="flex items-center">
          <input 
            type="text" 
            placeholder="Ask your AI companion..." 
            className="bg-transparent border border-primary border-opacity-20 rounded-lg py-2 px-3 outline-none flex-grow text-sm placeholder:text-[#7DAAB2] focus:border-opacity-50 transition"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button 
            type="submit"
            className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-primary text-background hover:bg-opacity-80 transition"
          >
            <span className="material-icons text-sm">send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
