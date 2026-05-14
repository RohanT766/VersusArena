import React, { useState, useEffect } from 'react';
import { SkipForward } from 'lucide-react';
import QRCodeVote from './QRCodeVote';
import { useVoteStats } from '../hooks/useVoteStats';
import './common/GameLayout.css';

const SidebarVote = ({ gameId, onGameStart, onBack, player1Label = 'Player 1', player2Label = 'Player 2' }) => {
  const [votingPhase, setVotingPhase] = useState('voting');
  const [timeLeft, setTimeLeft] = useState(30);
  const onGameStartRef = React.useRef(onGameStart);
  onGameStartRef.current = onGameStart;
  
  const { voteStats } = useVoteStats(gameId);

  useEffect(() => {
    if (votingPhase !== 'voting') return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setVotingPhase('completed');
          setTimeout(() => { onGameStartRef.current?.(); }, 1200);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [votingPhase]);

  const handleSkip = () => {
    onGameStartRef.current?.();
  };

  const totalVotes = voteStats.total || 0;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#0a0a0a',
      zIndex: 9999,
      overflow: 'hidden',
      fontFamily: "'VT323', monospace",
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid #1a1a1a',
        height: '52px',
        background: 'rgba(0, 0, 0, 0.6)',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {onBack && (
            <button
              onClick={onBack}
              className="game-layout-back"
              style={{ position: 'static' }}
            >
              ← BACK
            </button>
          )}
          <div style={{ fontSize: '22px', color: '#fff', letterSpacing: '2px' }}>
            AUDIENCE VOTE
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {votingPhase === 'voting' && (
            <>
              <div style={{
                fontSize: '36px',
                color: timeLeft <= 5 ? '#ef4444' : '#4ade80',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}>
                {timeLeft}
              </div>
              <button
                onClick={handleSkip}
                className="game-layout-back"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'static' }}
              >
                <SkipForward size={16} />
                SKIP
              </button>
            </>
          )}
          {votingPhase === 'completed' && (
            <div style={{ fontSize: '22px', color: '#a78bfa', letterSpacing: '2px' }}>
              STARTING GAME...
            </div>
          )}
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '80px',
        padding: '40px',
      }}>
        {votingPhase === 'voting' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}>
            <div style={{ fontSize: '24px', color: '#aaa', letterSpacing: '2px' }}>
              SCAN TO VOTE
            </div>
            <QRCodeVote gameId={gameId} player1Label={player1Label} player2Label={player2Label} size={280} />
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          minWidth: '320px',
        }}>
          <div style={{ fontSize: '24px', color: '#aaa', letterSpacing: '2px' }}>
            LIVE RESULTS
          </div>

          {totalVotes === 0 ? (
            <div style={{
              fontSize: '22px',
              color: '#555',
              textAlign: 'center',
              padding: '40px 0',
            }}>
              NO VOTES YET
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: '360px' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', color: '#10b981' }}>{player1Label}</span>
                  <span style={{ fontSize: '22px', color: '#ccc' }}>{voteStats.player1 || 0}</span>
                </div>
                <div style={{ width: '100%', height: '12px', background: '#222', borderRadius: '2px' }}>
                  <div style={{
                    width: `${voteStats.percentages?.player1 || 0}%`,
                    height: '100%',
                    background: '#10b981',
                    borderRadius: '2px',
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '22px', color: '#8b5cf6' }}>{player2Label}</span>
                  <span style={{ fontSize: '22px', color: '#ccc' }}>{voteStats.player2 || 0}</span>
                </div>
                <div style={{ width: '100%', height: '12px', background: '#222', borderRadius: '2px' }}>
                  <div style={{
                    width: `${voteStats.percentages?.player2 || 0}%`,
                    height: '100%',
                    background: '#8b5cf6',
                    borderRadius: '2px',
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: '20px', color: '#666' }}>
            TOTAL: <span style={{ color: '#fff', fontSize: '24px' }}>{totalVotes}</span>
          </div>
        </div>
      </div>

      {votingPhase === 'completed' && totalVotes > 0 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
        }}>
          <div style={{ fontSize: '36px', color: '#a78bfa', letterSpacing: '3px', marginBottom: '24px' }}>
            VOTES IN
          </div>
          <div style={{ fontSize: '28px', color: '#fff', textAlign: 'center' }}>
            {(voteStats.player1 || 0) > (voteStats.player2 || 0) ? (
              <span style={{ color: '#10b981' }}>{String(player1Label).toUpperCase()} WINS THE VOTE</span>
            ) : (voteStats.player2 || 0) > (voteStats.player1 || 0) ? (
              <span style={{ color: '#8b5cf6' }}>{String(player2Label).toUpperCase()} WINS THE VOTE</span>
            ) : (
              <span style={{ color: '#fbbf24' }}>IT'S A TIE</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SidebarVote;
