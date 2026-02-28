import React, { useState, useEffect, useRef } from 'react';
import { Network, Activity, Send, TerminalSquare, UploadCloud, DownloadCloud, Bot, BookOpen } from 'lucide-react';
import './index.css';

interface Peer { id: string; ip: string; tcpPort: number; lastSeen: number }
interface LogEntry { type: string; payload: any; timestamp: number }
interface DhtEntry { manifestId: string; providers: string[] }

function App() {
  const [port, setPort] = useState('8777');
  const [hostname] = useState(window.location.hostname || 'localhost');
  const [connected, setConnected] = useState(false);
  const [nodeId, setNodeId] = useState<string>('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [files, setFiles] = useState<DhtEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'network' | 'files' | 'messages' | 'gemini'>('network');
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'ai', content: string }[]>([]);

  const [msgTarget, setMsgTarget] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [dlManifest, setDlManifest] = useState('');
  const [connectIp, setConnectIp] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (activeTab === 'gemini') {
      const win = document.getElementById('ai-chat-window');
      if (win) win.scrollTop = win.scrollHeight;
    }
  }, [aiChat, activeTab]);

  const connectWS = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const socket = new WebSocket(`ws://${hostname}:${port}`);

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = (e) => console.error('WebSocket Error', e);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT') {
        setNodeId(data.nodeId || '');
        setPeers(data.peers || []);
        setFiles(data.dht || []);
        setStats(data.stats || null);
        setLogs(data.logs || []);
      } else if (data.type === 'PEER_NEW' || data.type === 'PEER_LOST') {
        fetchPeers();
      } else if (data.type === 'DHT_UPDATE') {
        const { manifestId, providerId } = data.payload;
        setFiles(prev => {
          const existing = prev.find(f => f.manifestId === manifestId);
          if (existing) {
            if (existing.providers.includes(providerId)) return prev;
            return prev.map(f => f.manifestId === manifestId ? { ...f, providers: [...f.providers, providerId] } : f);
          }
          return [...prev, { manifestId, providers: [providerId] }];
        });
      } else if (data.type === 'TRANSFER_PROGRESS') {
        const { fileId, progress } = data.payload;
        setProgress(prev => ({ ...prev, [fileId]: progress }));
        if (progress >= 100) {
          setTimeout(() => {
            setProgress(prev => {
              const next = { ...prev };
              delete next[fileId];
              return next;
            });
          }, 3000);
        }
      }

      if (data.type === 'LOG' || data.timestamp) {
        setLogs(prev => [...prev.slice(-99), data]);
      }
    };
  };

  const fetchPeers = async () => {
    try {
      const res = await fetch(`http://${hostname}:${port}/api/peers`);
      const data = await res.json();
      setPeers(data);
    } catch (e) { }
  };

  const apiCall = async (endpoint: string, body: any) => {
    await fetch(`http://${hostname}:${port}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

  const handleAiSubmit = async () => {
    if (!aiPrompt) return;
    const userMsg = aiPrompt;
    setAiPrompt('');
    setAiChat(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAiLoading(true);

    try {
      const res = await fetch(`http://${hostname}:${port}/api/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg })
      });
      const data = await res.json();
      setAiChat(prev => [...prev, { role: 'ai', content: data.response || data.error }]);
    } catch (e) {
      setAiChat(prev => [...prev, { role: 'ai', content: "Erreur de connexion à l'IA local." }]);
    }
    setIsAiLoading(false);
  };

  const handleSummarize = async (manifestId: string) => {
    setActiveTab('gemini');
    setAiChat(prev => [...prev, { role: 'user', content: `Résume-moi le fichier : ${manifestId}` }]);
    setIsAiLoading(true);
    try {
      const res = await fetch(`http://${hostname}:${port}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifestId })
      });
      const data = await res.json();
      setAiChat(prev => [...prev, { role: 'ai', content: data.response || data.error }]);
    } catch (e) {
      setAiChat(prev => [...prev, { role: 'ai', content: "Erreur lors de la génération du résumé." }]);
    }
    setIsAiLoading(false);
  };

  // AUTO-CONNECT ON MOUNT
  useEffect(() => {
    if (port && hostname) {
      connectWS();
    }
  }, []);

  const renderLog = (log: LogEntry) => {
    if (log.type === 'LOG') {
      const str = String(log.payload);
      const isSec = str.includes('[SECURE]');
      const isErr = str.includes('[ERROR]') || str.includes('[LOST PEER]');
      const color = isSec ? 'var(--color-success)' : isErr ? 'var(--color-error)' : 'var(--neon-primary)';
      return <div style={{ color }}>{str}</div>;
    }
    return null;
  };

  if (!connected) {
    return (
      <div className="login-container">
        <div className="glass-panel login-box">
          <Activity size={56} className="icon-pulse" />
          <h1 className="glitch-text title-large">ARCHIPEL</h1>
          <p className="subtitle">Interface P2P Sécurisée — Hackathon</p>

          <form onSubmit={connectWS} className="login-form">
            <input
              type="text"
              value={port}
              onChange={e => setPort(e.target.value)}
              className="input-field"
              placeholder="Port de l'API (ex: 8777)"
            />
            <button type="submit" className="neon-button">
              CONNECTER AU NOEUD
            </button>
          </form>
          <p className="hint-text">Le port UI par défaut est "Port TCP + 1000" (ex: si le nœud roule sur 7777, tapez 8777).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="glass-panel dashboard-header">
        <div className="header-left">
          <Activity className="icon-pulse" size={28} />
          <h1 className="glitch-text uppercase">Archipel Dash</h1>
          <span className="badge badge-outline">ID: {nodeId.slice(0, 16)}...</span>
        </div>
        <div className="header-right">
          <div className="status-indicator" style={{ marginRight: '15px' }}>
            <span className="badge badge-primary">{peers.length + 1} nœuds dans l'archipel</span>
          </div>
          <div className="status-indicator">
            <div className="dot blink"></div>
            Direct WebSocket (Port {port})
          </div>
        </div>
      </header>

      <div className="dashboard-body">
        {/* LEFT COLUMN: Controls */}
        <div className="side-column">
          <div className="glass-panel control-card flex-grow shadow-lg">
            <div className="tabs-container">
              <button className={`tab-btn ${activeTab === 'network' ? 'active' : ''}`} onClick={() => setActiveTab('network')}>
                <Network size={16} /> RÉSEAU
              </button>
              <button className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
                <UploadCloud size={16} /> FICHIERS
              </button>
              <button className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>
                <Send size={16} /> MESSAGES
              </button>
              <button className={`tab-btn ${activeTab === 'gemini' ? 'active' : ''}`} onClick={() => setActiveTab('gemini')}>
                <Bot size={16} /> GEMINI
              </button>
            </div>

            <div className="tab-content scrollable">
              {activeTab === 'network' && (
                <div className="fade-in">
                  <div className="card-header">
                    <Network className="icon-purple" size={20} />
                    <h2 className="uppercase">Table de Routage ({peers.length})</h2>
                  </div>
                  <div className="peer-list">
                    {peers.length === 0 && <span className="empty-text">Recherche sur le Multicast...</span>}
                    {peers.map(p => (
                      <div key={p.id} className="peer-item">
                        <div className="peer-top">
                          <span className="peer-id">{p?.id ? p.id.slice(0, 16) : 'Unknown'}...</span>
                          <span className="badge badge-success">Actif</span>
                        </div>
                        <span className="peer-ip">{p.ip}:{p.tcpPort}</span>
                      </div>
                    ))}
                  </div>

                  {stats && (
                    <div className="stats-box" style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                      <h3 className="uppercase xsmall opacity-50 mb-10">Statistiques Locales</h3>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span className="small">Espace partagé</span>
                        <span className="badge badge-outline">{(stats.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="small">Connections Actives</span>
                        <span className="badge badge-primary">{stats.peersCount}</span>
                      </div>
                    </div>
                  )}

                  <div className="action-box box-primary" style={{ marginTop: '20px' }}>
                    <h3 className="uppercase text-primary small">Ajout Manuel (IP)</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input value={connectIp} onChange={e => setConnectIp(e.target.value)} placeholder="192.168.1..." className="input-field small" />
                      <button onClick={() => apiCall('connect', { ip: connectIp })} className="btn btn-primary small">
                        JOINDRE
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div className="fade-in">
                  <div className="card-header">
                    <DownloadCloud className="icon-emerald" size={20} />
                    <h2 className="uppercase">Réseau de Fichiers</h2>
                  </div>
                  <div className="peer-list" style={{ maxHeight: '200px' }}>
                    {files.length === 0 && <span className="empty-text">Aucun fichier partagé...</span>}
                    {files.map(f => {
                      const isLocal = f.providers.includes(nodeId);
                      return (
                        <div key={f.manifestId} className="peer-item">
                          <div className="peer-top">
                            <span className="peer-id" style={{ color: 'var(--color-emerald)', cursor: 'pointer' }} onClick={() => setDlManifest(f.manifestId)}>
                              {f.manifestId.slice(0, 16)}...
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {isLocal && (
                                <button
                                  className="badge badge-outline"
                                  title="Résumer avec Gemini"
                                  onClick={() => handleSummarize(f.manifestId)}
                                  style={{ padding: '2px 6px', display: 'flex', alignItems: 'center' }}
                                >
                                  <BookOpen size={12} />
                                </button>
                              )}
                              <span className="badge badge-outline">{f.providers.length} S</span>
                            </div>
                          </div>
                          {progress[f.manifestId] !== undefined && (
                            <div className="progress-container" style={{ marginTop: '8px' }}>
                              <div className="progress-bar" style={{ width: `${progress[f.manifestId]}%`, height: '4px', background: 'var(--color-emerald)' }}></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="action-box box-blue" style={{ marginTop: '20px' }}>
                    <h3 className="uppercase text-blue">Publier un fichier</h3>
                    <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="Chemin /file.zip" className="input-field small" />
                    <button onClick={() => apiCall('send', { filePath })} className="btn btn-blue justify-center">
                      GÉNÉRER MANIFESTE
                    </button>
                  </div>

                  <div className="action-box box-emerald">
                    <h3 className="uppercase text-emerald">Récupérer via ID</h3>
                    <input value={dlManifest} onChange={e => setDlManifest(e.target.value)} placeholder="ID Manifeste" className="input-field small" />
                    <button onClick={() => apiCall('download', { manifestId: dlManifest })} className="btn btn-emerald justify-center">
                      LANCER TÉLÉCHARGEMENT
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'messages' && (
                <div className="fade-in">
                  <div className="action-box box-purple">
                    <h3 className="uppercase text-purple">Message Direct (E2E)</h3>
                    <select value={msgTarget} onChange={e => setMsgTarget(e.target.value)} className="input-field small">
                      <option value="">Destinataire...</option>
                      {peers.map(p => <option key={p.id} value={p.id}>{p.id.slice(0, 12)}...</option>)}
                    </select>
                    <input value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Contenu du message..." className="input-field small" />
                    <button onClick={() => apiCall('msg', { targetId: msgTarget, content: msgContent })} className="btn btn-purple justify-center">
                      ENVOYER CHIFFRÉ
                    </button>
                  </div>

                  <div className="action-box">
                    <h3 className="uppercase text-dim">Broadcasting</h3>
                    <input value={broadcastContent} onChange={e => setBroadcastContent(e.target.value)} placeholder="Message global..." className="input-field small" />
                    <button onClick={() => { apiCall('broadcast', { content: broadcastContent }); setBroadcastContent(''); }} className="btn btn-secondary justify-center">
                      DIFFUSER À TOUS
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'gemini' && (
                <div className="fade-in">
                  <div className="chat-window" id="ai-chat-window">
                    {aiChat.length === 0 && (
                      <div className="empty-text" style={{ textAlign: 'center', marginTop: '40px' }}>
                        <Bot size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
                        <p>Je suis votre assistant décentralisé.<br />Comment puis-je vous aider ?</p>
                      </div>
                    )}
                    {aiChat.map((chat, i) => (
                      <div key={i} className={`chat-bubble ${chat.role === 'user' ? 'bubble-user' : 'bubble-ai'}`}>
                        {chat.role === 'ai' && (
                          <div className="ai-header">
                            <Bot size={12} /> Gemini Core
                          </div>
                        )}
                        {chat.content}
                      </div>
                    ))}
                    {isAiLoading && (
                      <div className="chat-bubble bubble-ai">
                        <div className="ai-header"><Bot size={12} /> Gemini Core</div>
                        <div className="blink">Réflexion en cours...</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <textarea
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAiSubmit();
                        }
                      }}
                      placeholder="Posez une question..."
                      className="input-field small"
                      style={{ minHeight: '44px', borderRadius: '22px', paddingLeft: '20px' }}
                    />
                    <button
                      onClick={handleAiSubmit}
                      className="btn btn-purple"
                      style={{ borderRadius: '50%', width: '44px', height: '44px', padding: 0 }}
                      disabled={isAiLoading || !aiPrompt}
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Secure Terminal */}
        <div className="glass-panel main-column terminal-panel flex-grow">
          <div className="terminal-header">
            <TerminalSquare className="text-primary" size={18} />
            <span className="terminal-title">TERMINAL SECURISE // ARCHIPEL STREAM</span>
          </div>
          <div className="terminal-body">
            {logs.map((L, i) => (
              <div key={i} className="log-line">
                <span className="log-time">[{new Date(L.timestamp).toLocaleTimeString()}]</span>
                {renderLog(L)}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
