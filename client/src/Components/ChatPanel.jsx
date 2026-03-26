import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const SUGGESTED = [
  'Find the journal entry linked to billing document 91150187',
  'Show all cancelled billing documents',
  'Which sales orders have the highest total amount?',
  'List payments made in April 2025',
  'Show business partners and their sales orders',
  'Which products appear in most sales order items?',
]

function SqlBlock({ sql }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="sql-block-wrap">
      <button className="sql-toggle" onClick={() => setOpen(o => !o)}>
        <span className="sql-icon">⌗</span>
        {open ? 'Hide SQL' : 'Show SQL'}
      </button>
      {open && <pre className="sql-code">{sql}</pre>}
    </div>
  )
}

function ResultTable({ columns, rows }) {
  if (!columns?.length || !rows?.length) return null
  const truncated = rows.slice(0, 10)
  return (
    <div className="result-wrap">
      <div className="result-scroll">
        <table className="result-table">
          <thead>
            <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {truncated.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} title={String(cell ?? '')}>{String(cell ?? '—').slice(0, 25)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <div className="result-more">+{rows.length - 10} more rows</div>
      )}
    </div>
  )
}

export default function ChatPanel({ apiBase, onHighlight }) {
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      content: 'Hi! I can help you analyze the **Order to Cash** process. Ask me anything about sales orders, billing documents, journal entries, payments, and more.',
      sql: null, columns: [], rows: [], highlight_ids: [],
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([]) // API message history
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  console.log("UPDATED FILE 🔥");
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text) {
    const q = (text || input).trim()
    if (!q || loading) return
    setInput('')

    const userMsg = { role: 'user', content: q }
    setMessages(m => [...m, userMsg])
    setLoading(true)

    const newHistory = [...history, { role: 'user', content: q }]

    try {
      const { data } = await axios.post(`${apiBase}/api/chat`, { messages: newHistory })
      const { answer, sql, columns, rows, highlight_ids = [] } = data

      setMessages(m => [...m, {
        role: 'agent',
        content: answer,
        sql, columns, rows, highlight_ids,
      }])

      setHistory([...newHistory, { role: 'assistant', content: answer }])

      if (highlight_ids.length) onHighlight(highlight_ids)
    } catch (err) {
      setMessages(m => [...m, {
        role: 'agent',
        content: `Error: ${err.response?.data?.error || err.message}`,
        sql: null, columns: [], rows: [],
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function renderContent(content) {
    // Bold markdown
    return content.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
      part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
    )
  }

  return (
    <aside className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-title">Chat with Graph</div>
        <div className="chat-header-sub">Order to Cash</div>
      </div>
      <div className="agent-row">
        <div className="agent-avatar">G</div>
        <div>
          <div className="agent-name">Graph Agent</div>
        </div>
        <div className="agent-status">
          <span className="status-dot-sm" />
          Ready
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg msg-${msg.role}`}>
            {msg.role === 'agent' && (
              <div className="msg-meta">
                <span className="msg-meta-dot" />
                Graph Agentefvdscx
              </div>
            )}
            <div className="msg-bubble">
              <div className="msg-text">{renderContent(msg.content)}</div>
              {msg.sql && <SqlBlock sql={msg.sql} />}
              {msg.columns?.length > 0 && (
                <ResultTable columns={msg.columns} rows={msg.rows} />
              )}
              {console.log(msg, "msg")}
              {msg.highlight_ids?.length > 0 && (
                <div className="highlight-notice">
                  ✦ {msg.highlight_ids.length} node{msg.highlight_ids.length > 1 ? 's' : ''} highlighted on graph
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg msg-agent">
            <div className="msg-meta"><span className="msg-meta-dot" />Graph Agent</div>
            <div className="msg-bubble">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        {/* Suggested prompts */}
        {messages.length === 1 && !loading && (
          <div className="suggestions">
            <div className="suggestions-title">Try asking:</div>
            {SUGGESTED.map((s, i) => (
              <button key={i} className="suggestion-chip" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="status-row">
          <span className="status-dot-sm pulsing" />
          <span className="status-text">Graph Agent is awaiting instructions</span>
        </div>
        <div className="input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Analyze anything..."
            rows={2}
            disabled={loading}
          />
          <button
            className={`send-btn ${loading ? 'disabled' : ''}`}
            onClick={() => send()}
            disabled={loading || !input.trim()}
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </aside>
  )
}