import { useEffect, useRef, useState } from 'react';

export default function AIChatPanel({ trip, stops, onApplyActions, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm your trip copilot for **${trip?.name || 'this trip'}**. Ask me to add stops, fill time gaps, swap places, or rearrange your day — I can edit the itinerary directly.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          destination: trip?.destination || '',
          tripName: trip?.name || '',
          stops: stops.map((s) => ({
            id: s.id,
            name: s.name,
            day: s.day,
            category: s.category,
            address: s.address,
            stop_time: s.stop_time,
            notes: s.notes,
          })),
          history,
        }),
      });

      const data = await response.json();
      const reply = data.reply || "I couldn't process that request.";
      const actions = data.actions || [];

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, actions },
      ]);

      if (actions.length > 0 && onApplyActions) {
        onApplyActions(actions);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function renderMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  }

  return (
    <section className="panel-card copilot-panel">
      <div className="copilot-header">
        <div>
          <div className="sidebar-label">AI Copilot</div>
          <div className="panel-title">Trip assistant</div>
        </div>
        <button className="shell-btn shell-btn-ghost shell-btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="copilot-messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`copilot-msg copilot-msg-${msg.role}`}>
            <div className="copilot-msg-avatar">
              {msg.role === 'assistant' ? '✦' : '→'}
            </div>
            <div className="copilot-msg-body">
              <div
                className="copilot-msg-text"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
              {msg.actions?.length > 0 && (
                <div className="copilot-actions-badge">
                  {msg.actions.length} change{msg.actions.length !== 1 ? 's' : ''} applied
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="copilot-msg copilot-msg-assistant">
            <div className="copilot-msg-avatar">✦</div>
            <div className="copilot-msg-body">
              <div className="copilot-typing">Thinking…</div>
            </div>
          </div>
        )}
      </div>

      <div className="copilot-input-row">
        <input
          ref={inputRef}
          className="form-input copilot-input"
          placeholder="Ask me to change the itinerary…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={loading}
        />
        <button
          className="shell-btn shell-btn-sm"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </section>
  );
}
