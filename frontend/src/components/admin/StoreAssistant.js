import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../../utils/api';

const QUICK_PROMPTS = [
  'How do I add a product?',
  'What are my fast moving items?',
  'Show low stock products',
  'stock adu products monawada?',
  'How do I upload a payment slip?',
  'How do I configure SEO?',
];

function AssistantIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" fill="currentColor"/>
      <path d="M5 14.5h14a2 2 0 012 2V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-1.5a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M8.5 18h.01M15.5 18h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '86%',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 12px',
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          color: isUser ? '#fff' : '#0f172a',
          background: isUser ? 'var(--color-primary, #15803d)' : '#f8fafc',
          border: isUser ? 'none' : '1px solid #e2e8f0',
          boxShadow: isUser ? '0 10px 24px rgba(21,128,61,0.22)' : 'none',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

export default function StoreAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState([]);
  const [messages, setMessages] = useState(() => ([
    {
      role: 'assistant',
      content: 'Hi, I am your StoreKit assistant. You can ask in English, Sinhala, Singlish, or mixed language about admin panel work and live store data.',
    },
  ]));
  const listRef = useRef(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  const sendMessage = async (text) => {
    const question = String(text || input).trim();
    if (!question || loading) return;

    const userMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setActions([]);

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const { data } = await API.post('/ai/assistant', {
        message: question,
        history,
        currentRoute: location.pathname,
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || 'I could not create an answer for that question.',
      }]);
      setActions(Array.isArray(data.actions) ? data.actions : []);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.message || 'Assistant is unavailable right now. Please try again in a moment.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage();
  };

  const goToAction = (path) => {
    if (!path) return;
    setOpen(false);
    navigate(path);
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 70,
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
      }}
    >
      {open && (
        <section
          className="bg-white border border-gray-200 shadow-2xl"
          style={{
            width: 'min(390px, calc(100vw - 24px))',
            height: 'min(620px, calc(100vh - 92px))',
            borderRadius: 18,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 12,
          }}
          aria-label="Store assistant"
        >
          <div
            style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #0f172a, #166534)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <AssistantIcon size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm leading-tight truncate">Store Assistant</p>
                <p className="text-xs text-white/70 truncate">English, Sinhala, Singlish</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center"
              aria-label="Close assistant"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#ffffff',
            }}
          >
            {messages.map((message, index) => <MessageBubble key={`${message.role}-${index}`} message={message} />)}
            {loading && (
              <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl self-start">
                Checking StoreKit knowledge and tenant data...
              </div>
            )}
          </div>

          {actions.length > 0 && (
            <div className="px-3 pt-2 border-t border-gray-100 flex gap-2 flex-wrap">
              {actions.map((action, index) => (
                <button
                  key={`${action.path || action.label}-${index}`}
                  type="button"
                  onClick={() => goToAction(action.path)}
                  className="text-xs font-semibold rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  style={{ padding: '6px 10px' }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <div className="px-3 pt-3 pb-2 border-t border-gray-100">
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {QUICK_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="text-xs rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 whitespace-nowrap"
                  style={{ padding: '6px 10px' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-100 bg-white">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                rows={1}
                placeholder="Ask in English, Sinhala, or Singlish..."
                className="form-input"
                style={{ resize: 'none', minHeight: 42, maxHeight: 96, fontSize: 13 }}
              />
              <button
                type="submit"
                disabled={!canSend}
                className="btn-primary flex items-center justify-center"
                style={{ width: 42, height: 42, padding: 0, opacity: canSend ? 1 : 0.55 }}
                aria-label="Send message"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="shadow-2xl flex items-center justify-center"
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          color: '#fff',
          background: 'linear-gradient(135deg, var(--color-primary, #15803d), #0f172a)',
          border: '1px solid rgba(255,255,255,0.22)',
        }}
        aria-label={open ? 'Close Store Assistant' : 'Open Store Assistant'}
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <AssistantIcon size={25} />
        )}
      </button>
    </div>
  );
}
