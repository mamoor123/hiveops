/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useRouter } from 'next/navigation';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ChatPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [channels, setChannels] = useState([{ channel: 'general', message_count: 0 }]);
  const [activeChannel, setActiveChannel] = useState('general');
  const [isTyping, setIsTyping] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }

    // Load agents
    api.getAgents().then(setAgents).catch(console.error);

    // Load channels
    api.getChannels?.().then(ch => {
      if (ch?.length) setChannels(ch);
    }).catch(() => {});

    // Connect socket
    const token = localStorage.getItem('token');
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-channel', 'general');
    });

    socket.on('message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('agent-typing', () => setIsTyping(true));
    socket.on('agent-stop-typing', () => setIsTyping(false));

    // Load existing messages
    loadMessages('general');

    return () => {
      socket.emit('leave-channel', activeChannel);
      socket.disconnect();
    };
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async (channel) => {
    try {
      const msgs = await api.getMessages(channel);
      setMessages(msgs || []);
    } catch { setMessages([]); }
  };

  const switchChannel = (channel) => {
    if (socketRef.current) {
      socketRef.current.emit('leave-channel', activeChannel);
      socketRef.current.emit('join-channel', channel);
    }
    setActiveChannel(channel);
    loadMessages(channel);
  };

  const sendMessage = () => {
    if (!input.trim() || !socketRef.current) return;

    if (selectedAgent) {
      // Send to agent
      socketRef.current.emit('agent-message', {
        channel: activeChannel,
        agentId: selectedAgent.id,
        content: input.trim(),
      });
    } else {
      // Send regular message
      socketRef.current.emit('message', {
        channel: activeChannel,
        content: input.trim(),
      });
    }
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 4rem)' }}>
      {/* Sidebar - Agents & Channels */}
      <div style={{
        width: 240, borderRight: '1px solid var(--border)', display: 'flex',
        flexDirection: 'column', flexShrink: 0
      }}>
        {/* Agents */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            AI Agents
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => setSelectedAgent(null)}
              style={{
                background: !selectedAgent ? '#1e1b4b' : 'transparent',
                border: 'none', borderRadius: 6, padding: '6px 8px',
                color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              💬 General Chat
            </button>
            {agents.filter(a => a.status === 'active').map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a)}
                style={{
                  background: selectedAgent?.id === a.id ? '#1e1b4b' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '6px 8px',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                🤖 {a.name}
              </button>
            ))}
          </div>
        </div>

        {/* Channels */}
        <div style={{ padding: '1rem', flex: 1 }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Channels
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {channels.map(c => (
              <button
                key={c.channel}
                onClick={() => switchChannel(c.channel)}
                style={{
                  background: activeChannel === c.channel ? '#1e1b4b' : 'transparent',
                  border: 'none', borderRadius: 6, padding: '6px 8px',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                  fontSize: '0.8rem'
                }}
              >
                # {c.channel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span>{selectedAgent ? '🤖' : '💬'}</span>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {selectedAgent ? selectedAgent.name : `#${activeChannel}`}
            </h3>
            {selectedAgent && (
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {selectedAgent.role} · {selectedAgent.department_name}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '1rem',
          display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {messages.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: '0.85rem'
            }}>
              {selectedAgent
                ? `Start chatting with ${selectedAgent.name}!`
                : 'No messages yet. Start the conversation!'
              }
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={msg.id || i} style={{
              display: 'flex', gap: '8px',
              background: msg.sender_type === 'agent' ? 'rgba(99,102,241,0.05)' : 'transparent',
              padding: '8px', borderRadius: 8
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: msg.sender_type === 'agent' ? '#4f46e5' : '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', flexShrink: 0
              }}>
                {msg.sender_type === 'agent' ? '🤖' : '👤'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {msg.sender_name || 'Unknown'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              🤖 {selectedAgent?.name || 'Agent'} is typing
              <span className="typing-dots">
                <span style={{ animation: 'blink 1.4s infinite 0.2s' }}>.</span>
                <span style={{ animation: 'blink 1.4s infinite 0.4s' }}>.</span>
                <span style={{ animation: 'blink 1.4s infinite 0.6s' }}>.</span>
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '0.75rem 1rem', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px'
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : `Message #${activeChannel}...`}
            style={{ flex: 1 }}
          />
          <button onClick={sendMessage} className="btn" style={{ padding: '0.5rem 1rem' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
