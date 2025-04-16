import { useState, useRef, useEffect } from "react";
import { useLYFEOS } from "../../lib/context";
import { Edit2, Check, X } from "lucide-react";

export default function AICompanionPanel() {
  const { messages, sendMessage, aiCompanionName, setAICompanionName } = useLYFEOS();
  const [inputText, setInputText] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(aiCompanionName);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  // Focus the name input field when entering edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);
  
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-orbitron text-lg">AI COMPANION</h2>
          <button className="material-icons text-[#7DAAB2] text-sm hover:text-primary transition">settings</button>
        </div>
        
        {/* AI Companion Name Editor */}
        <div className="flex items-center">
          {isEditingName ? (
            <div className="flex items-center w-full">
              <input
                ref={nameInputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="bg-transparent border border-primary border-opacity-20 rounded-lg py-1 px-2 mr-2 outline-none flex-grow text-sm placeholder:text-[#7DAAB2] focus:border-opacity-50 transition"
                placeholder="Enter AI name"
                maxLength={20}
              />
              <button
                type="button"
                onClick={() => {
                  if (nameInput.trim()) {
                    setAICompanionName(nameInput);
                  }
                  setIsEditingName(false);
                }}
                className="p-1 text-[#36F1CD] hover:bg-[#36F1CD]/10 rounded"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameInput(aiCompanionName);
                  setIsEditingName(false);
                }}
                className="p-1 text-red-400 hover:bg-red-400/10 rounded ml-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                <span className="material-icons text-primary mr-2 text-sm">smart_toy</span>
                <span className="text-[#36F1CD] font-semibold">{aiCompanionName}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="p-1 text-[#7DAAB2] hover:text-primary transition"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            </div>
          )}
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
                {message.sender === 'ai' && (
                  <div className="text-xs text-[#36F1CD] mb-1 font-semibold">{aiCompanionName}</div>
                )}
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
            placeholder={`Ask ${aiCompanionName}...`}
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
