import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, User } from 'lucide-react';
import { aiAPI } from '../../lib/api';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../context/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
}

const PREDEFINED_PROMPTS = [
  "💰 Analyze my spending",
  "📉 How can I save more next month?",
  "🎯 Help me reach my savings goal",
  "🔍 Where am I overspending?"
];

const WELCOME_MESSAGE: Message = {
  id: '1',
  role: 'ai',
  content: "Hey there! 👋 I'm **SpendWise AI** — your personal finance assistant.\n\nI can help you with:\n- 💰 **Spending analysis** — where your money goes\n- 📊 **Budget tracking** — are you on track?\n- 💡 **Savings tips** — practical ways to save more\n- 🧠 **General questions** — ask me anything!\n\nYou can ask in English, Hindi, or Hinglish — whatever feels natural!"
};

interface AskSpendWiseAIProps {
  position: { top: number; left: number } | null;
  onPositionChange: (pos: { top: number; left: number } | null) => void;
}

/** Default bottom-right position: 24px inset, 64px button */
const DEFAULT_BOTTOM = 24;
const DEFAULT_RIGHT = 24;
const BTN_SIZE = 64;
const DRAG_THRESHOLD = 5; // px — below this, treat as click

export function AskSpendWiseAI({ position, onPositionChange }: AskSpendWiseAIProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);

  // Clear messages when user changes (login/logout/demo switch)
  useEffect(() => {
    setMessages([WELCOME_MESSAGE]);
  }, [user?.id]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Drag state (kept in refs to avoid re-renders during drag) ──
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ px: number; py: number; bx: number; by: number } | null>(null);
  const didDragRef = useRef(false);

  /** Convert the stored top/left position to bottom/right for the button style. */
  const getButtonStyle = (): React.CSSProperties => {
    if (position) {
      return { top: position.top, left: position.left };
    }
    return { bottom: DEFAULT_BOTTOM, right: DEFAULT_RIGHT };
  };

  /** Clamp a top/left position so the 64px button stays fully inside the viewport. */
  const clampToViewport = useCallback((top: number, left: number) => {
    const maxTop = window.innerHeight - BTN_SIZE;
    const maxLeft = window.innerWidth - BTN_SIZE;
    return {
      top: Math.max(0, Math.min(top, maxTop)),
      left: Math.max(0, Math.min(left, maxLeft)),
    };
  }, []);

  // ── Pointer-event drag handlers ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only left button
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Capture pointer so we receive events even outside the button
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    dragStartRef.current = {
      px: e.clientX,
      py: e.clientY,
      bx: rect.left,
      by: rect.top,
    };
    didDragRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;

    const dx = e.clientX - start.px;
    const dy = e.clientY - start.py;

    // Only start visually dragging after exceeding threshold
    if (!isDraggingRef.current) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      isDraggingRef.current = true;
      didDragRef.current = true;
    }

    const clamped = clampToViewport(start.by + dy, start.bx + dx);
    onPositionChange(clamped);
  }, [clampToViewport, onPositionChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStartRef.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }

    const wasDrag = didDragRef.current;
    isDraggingRef.current = false;
    dragStartRef.current = null;
    didDragRef.current = false;

    // If user didn't drag (or barely moved), treat as a click to open chat
    if (!wasDrag) {
      setIsOpen(true);
    }
  }, []);

  // ── Viewport resize: clamp position so button stays visible ──
  useEffect(() => {
    const handleResize = () => {
      if (!position) return;
      const clamped = clampToViewport(position.top, position.left);
      if (clamped.top !== position.top || clamped.left !== position.left) {
        onPositionChange(clamped);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, clampToViewport, onPositionChange]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Send conversation history for multi-turn context
      const historyToSend = messages.slice(-6).map(m => ({
        role: m.role as 'user' | 'ai',
        content: m.content
      }));
      const response = await aiAPI.chat(text, historyToSend);
      const aiMsg: Message = { 
        id: crypto.randomUUID(), 
        role: 'ai', 
        content: response.data.response 
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
        const errorMsg: Message = { 
          id: crypto.randomUUID(), 
          role: 'ai', 
          content: "Sorry, I couldn't process that right now. Please try again in a moment! 🔄" 
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button — draggable */}
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`fixed z-50 flex items-center justify-center w-16 h-16 bg-black text-white rounded-full shadow-lg hover:scale-105 hover:bg-gray-800 transition-[opacity,transform] duration-300 touch-none select-none ${
          isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
        }`}
        style={getButtonStyle()}
      >
        <img src="/chatbot.png" alt="Chatbot" className="w-full h-full object-cover rounded-full pointer-events-none" />
      </button>

      {/* Chat Window */}
      <div className={`fixed bottom-6 right-6 w-[380px] h-[600px] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-black/10 flex flex-col overflow-hidden z-50 transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-50 opacity-0 pointer-events-none'}`}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-violet-800 p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm overflow-hidden shrink-0">
              <img src="/chatbot.png" alt="SpendWise AI" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div>
              <h3 className="font-bold text-white tracking-tight">Ask SpendWise AI</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[10px] text-white/80 font-medium uppercase tracking-widest">Online</span>
              </div>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F9FA]">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-[#F5F5F5] border border-black/5' : 'bg-violet-100 text-violet-600 overflow-hidden'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4 text-black/50" /> : <img src="/chatbot.png" alt="SpendWise AI" className="w-full h-full object-cover rounded-full" />}
                </div>
                <div className={`p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-black text-white rounded-tr-sm' : 'bg-white border border-black/5 text-black/80 rounded-tl-sm shadow-sm'}`}>
                  {msg.role === 'ai' ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc list-inside mb-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-1">{children}</ol>,
                        li: ({ children }) => <li className="ml-1">{children}</li>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[85%] flex-row">
                <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 overflow-hidden">
                  <img src="/chatbot.png" alt="SpendWise AI" className="w-full h-full object-cover rounded-full" />
                </div>
                <div className="p-4 rounded-2xl bg-white border border-black/5 rounded-tl-sm shadow-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-black/30 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-black/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-black/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts */}
        {messages.length === 1 && (
          <div className="px-4 pb-3 bg-[#F8F9FA]">
            <p className="text-[10px] text-black/30 font-medium uppercase tracking-wider mb-2">Try asking</p>
            <div className="grid grid-cols-2 gap-2">
              {PREDEFINED_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="text-left text-[11px] leading-snug text-black/70 bg-white hover:bg-violet-50 hover:text-violet-700 border border-black/5 hover:border-violet-200 px-3 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-black/5 shrink-0">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="flex items-center gap-2 bg-[#F5F5F5] p-1.5 rounded-full border border-black/5 focus-within:border-black/20 focus-within:bg-white transition-all shadow-sm"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              className="flex-1 bg-transparent px-3 text-sm focus:outline-none text-black placeholder:text-black/40"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
            >
              <Send className="w-3.5 h-3.5 -ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
