import React, { useState, useEffect, useRef } from 'react';
import { Network, Activity, Send, TerminalSquare, UploadCloud, DownloadCloud } from 'lucide-react';
import './index.css';

interface Peer { id: string; ip: string; tcpPort: number; lastSeen: number }
interface LogEntry { type: string; payload: any; timestamp: number }

function App() {
  const [port, setPort] = useState('8777');
  const [connected, setConnected] = useState(false);
  const [nodeId, setNodeId] = useState<string>('');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [msgTarget, setMsgTarget] = useState('');
  const [msgContent, setMsgContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [dlManifest, setDlManifest] = useState('');
  const [connectIp, setConnectIp] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [relayTargetId, setRelayTargetId] = useState('');
  const [relayContent, setRelayContent] = useState('');

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const connectWS = (e: React.FormEvent) => {
    e.preventDefault();
    const socket = new WebSocket(`ws://localhost:${port}`);

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = (e) => console.error('WebSocket Error', e);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT') {
        setNodeId(data.nodeId || '');
        setPeers(data.peers || []);
        setLogs(data.logs || []);
      } else if (data.type === 'PEER_NEW' || data.type === 'PEER_LOST') {
        fetchPeers();
      }

      if (data.type === 'LOG' || data.timestamp) {
        setLogs(prev => [...prev.slice(-99), data]);
      }
    };

  };

  const fetchPeers = async () => {
    try {
      const res = await fetch(`http://localhost:${port}/api/peers`);
      const data = await res.json();
      setPeers(data);
    } catch (e) { }
  };


  const apiCall = async (endpoint: string, body: any) => {
    await fetch(`http://localhost:${port}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  };

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

          {/* PEER TABLE */}
          <div className="glass-panel control-card peer-card">
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
                    <span className="badge badge-outline">ID: {nodeId ? nodeId.slice(0, 16) : '...'}...</span>
                    <span className="badge badge-success">Actif</span>
                  </div>
                  <span className="peer-ip">{p.ip}:{p.tcpPort}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ACTIONS */}
          <div className="glass-panel control-card scrollable flex-grow">

            <div className="action-box box-blue">
              <h3 className="uppercase text-blue">Partager un Fichier</h3>
              <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="Chemin absolu (ex: package.json)" className="input-field small" />
              <button onClick={() => apiCall('send', { filePath })} className="btn btn-blue justify-center">
                <UploadCloud size={16} /> Générer Manifeste & Partager
              </button>
            </div>

            <div className="action-box box-emerald">
              <h3 className="uppercase text-emerald">Télécharger un fichier</h3>
              <input value={dlManifest} onChange={e => setDlManifest(e.target.value)} placeholder="Manifest ID (Hex)" className="input-field small" />
              <button onClick={() => apiCall('download', { manifestId: dlManifest })} className="btn btn-emerald justify-center">
                <DownloadCloud size={16} /> Initier Transfert
              </button>
            </div>

            <div className="action-box box-purple">
              <h3 className="uppercase text-purple">Message Sécurisé direct</h3>
              <input value={msgTarget} onChange={e => setMsgTarget(e.target.value)} placeholder="ID du Noeud Destinataire" className="input-field small" />
              <input value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Message texte clair" className="input-field small" />
              <button onClick={() => apiCall('msg', { targetId: msgTarget, content: msgContent })} className="btn btn-purple justify-center">
                <Send size={16} /> Envoyer de façon chiffrée
              </button>
            </div>

            <div className="action-box box-primary push-bottom">
              <h3 className="uppercase text-primary">Diffusion de Masse</h3>
              <input value={broadcastContent} onChange={e => setBroadcastContent(e.target.value)} placeholder="Message pour tout l'Archipel..." className="input-field small" />
              <button
                onClick={() => { apiCall('broadcast', { content: broadcastContent }); setBroadcastContent(''); }}
                className="btn btn-secondary justify-center">
                <Network size={16} /> Diffuser à tous
              </button>
            </div>

            <div className="action-box box-primary push-bottom">
              <h3 className="uppercase text-primary">Message Sécurisé (Relais)</h3>
              <p className="text-muted small">Passera par vos voisins sans qu'ils puissent le lire.</p>
              <select
                value={relayTargetId}
                onChange={e => setRelayTargetId(e.target.value)}
                className="input-field small"
                style={{ marginBottom: '8px' }}
              >
                <option value="">Sélectionner un destinataire...</option>
                {peers.map(p => (
                  <option key={p.id} value={p.id}>{p.id.slice(0, 8)}... ({p.ip})</option>
                ))}
              </select>
              <input value={relayContent} onChange={e => setRelayContent(e.target.value)} placeholder="Message secret..." className="input-field small" />
              <button
                onClick={() => {
                  if (relayTargetId) {
                    apiCall('relay', { targetId: relayTargetId, content: relayContent });
                    setRelayContent('');
                  }
                }}
                className="btn btn-primary justify-center"
                disabled={!relayTargetId}
              >
                <Network size={16} /> Envoyer via Relais (E2E)
              </button>
            </div>

            <div className="action-box box-primary push-bottom">
              <h3 className="uppercase text-primary">Ajout Manuel (IP)</h3>
              <input value={connectIp} onChange={e => setConnectIp(e.target.value)} placeholder="Adresse IP LAN (ex: 192.168.1.181)" className="input-field small" />
              <button onClick={() => apiCall('connect', { ip: connectIp })} className="btn btn-primary justify-center">
                <Network size={16} /> Rejoindre manuellement
              </button>
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
