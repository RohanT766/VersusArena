import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Settings } from 'lucide-react';

const QRCodeVote = ({ gameId, className = '', size = 280 }) => {
  const [displayUrl, setDisplayUrl] = useState('');
  const [showIpConfig, setShowIpConfig] = useState(false);
  const [manualIP, setManualIP] = useState('');
  const [detectedIP, setDetectedIP] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const detectNetworkIP = async () => {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return hostname;
    }

    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        let resolved = false;
        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        pc.onicecandidate = (ice) => {
          if (!ice || !ice.candidate || !ice.candidate.candidate || resolved) return;
          const ipMatch = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(ice.candidate.candidate);
          if (ipMatch) {
            const ip = ipMatch[1];
            if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
              pc.close();
              resolved = true;
              resolve(ip);
            }
          }
        };
        
        setTimeout(() => {
          if (!resolved) {
            pc.close();
            resolve('10.56.123.217');
          }
        }, 2000);
      } catch (error) {
        resolve('10.56.123.217');
      }
    });
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const storedIP = localStorage.getItem('versus_network_ip');
      if (storedIP) {
        setManualIP(storedIP);
        setDetectedIP(storedIP);
        setDisplayUrl(`http://${storedIP}:5174/vote?gameId=${gameId}`);
        setIsLoading(false);
        return;
      }
      const networkIP = await detectNetworkIP();
      setDetectedIP(networkIP);
      setDisplayUrl(`http://${networkIP}:5174/vote?gameId=${gameId}`);
      setIsLoading(false);
    };
    init();
  }, [gameId]);

  const handleIPSave = () => {
    if (manualIP) {
      localStorage.setItem('versus_network_ip', manualIP);
      setDisplayUrl(`http://${manualIP}:5174/vote?gameId=${gameId}`);
      setDetectedIP(manualIP);
    }
    setShowIpConfig(false);
  };

  const handleAutoDetect = async () => {
    setIsLoading(true);
    const networkIP = await detectNetworkIP();
    setDetectedIP(networkIP);
    setManualIP(networkIP);
    setDisplayUrl(`http://${networkIP}:5174/vote?gameId=${gameId}`);
    localStorage.setItem('versus_network_ip', networkIP);
    setIsLoading(false);
    setShowIpConfig(false);
  };

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* QR Code */}
      <div style={{
        background: '#fff',
        padding: '16px',
        borderRadius: '8px',
        lineHeight: 0,
      }}>
        <QRCodeSVG
          value={displayUrl || `http://10.56.123.217:5174/vote?gameId=${gameId}`}
          size={size}
          level="M"
          includeMargin={false}
          fgColor="#000000"
          bgColor="#ffffff"
        />
      </div>

      {/* URL + gear icon */}
      <div style={{
        marginTop: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{
          fontSize: '14px',
          color: '#666',
          fontFamily: "'VT323', monospace",
          letterSpacing: '1px',
        }}>
          {isLoading ? 'DETECTING...' : 'SCAN WITH PHONE'}
        </span>
        <button
          onClick={() => setShowIpConfig(!showIpConfig)}
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            padding: '2px',
          }}
          title="Network settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* IP config panel (hidden by default) */}
      {showIpConfig && (
        <div style={{
          marginTop: '16px',
          padding: '16px',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '320px',
          fontFamily: "'VT323', monospace",
        }}>
          <div style={{ fontSize: '16px', color: '#aaa', marginBottom: '12px' }}>
            NETWORK IP
          </div>
          {detectedIP && (
            <div style={{ fontSize: '14px', color: '#4ade80', marginBottom: '8px' }}>
              Detected: {detectedIP}
            </div>
          )}
          <input
            type="text"
            placeholder={detectedIP || "e.g. 192.168.1.100"}
            value={manualIP}
            onChange={(e) => setManualIP(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#000',
              border: '1px solid #444',
              color: '#fff',
              fontSize: '16px',
              fontFamily: "'VT323', monospace",
              borderRadius: '2px',
              marginBottom: '12px',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleIPSave}
              disabled={!manualIP}
              style={{
                padding: '6px 16px',
                background: manualIP ? '#3b82f6' : '#333',
                border: 'none',
                color: '#fff',
                fontSize: '16px',
                fontFamily: "'VT323', monospace",
                cursor: manualIP ? 'pointer' : 'default',
                borderRadius: '2px',
              }}
            >
              SAVE
            </button>
            <button
              onClick={handleAutoDetect}
              style={{
                padding: '6px 16px',
                background: '#059669',
                border: 'none',
                color: '#fff',
                fontSize: '16px',
                fontFamily: "'VT323', monospace",
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              AUTO
            </button>
            <button
              onClick={() => setShowIpConfig(false)}
              style={{
                padding: '6px 16px',
                background: 'transparent',
                border: '1px solid #444',
                color: '#aaa',
                fontSize: '16px',
                fontFamily: "'VT323', monospace",
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRCodeVote;
