import React, { useState, useEffect } from 'react';
import { SkipForward } from 'lucide-react';
import QRCodeVote from './QRCodeVote';
import { useVoteStats } from '../hooks/useVoteStats';

const SidebarVote = ({ gameId, onGameStart }) => {
  const [votingPhase, setVotingPhase] = useState('waiting');
  const [timeLeft, setTimeLeft] = useState(30);
  const [isVisible, setIsVisible] = useState(false);
  
  const { voteStats, isLoading, error } = useVoteStats(gameId);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVotingPhase('voting');
      setIsVisible(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (votingPhase !== 'voting') return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setVotingPhase('completed');
          setTimeout(() => {
            setIsVisible(false);
            onGameStart?.();
          }, 1500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [votingPhase, onGameStart]);

  const handleSkip = () => {
    setVotingPhase('completed');
    setTimeout(() => {
      setIsVisible(false);
      onGameStart?.();
    }, 300);
  };

  const totalVotes = voteStats.total || 0;

  if (!isVisible && votingPhase === 'waiting') return null;

  return (
    <>
      {isVisible && (
        <div style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000',
          zIndex: 9999,
          overflow: 'hidden',
          fontFamily: "'VT323', monospace",
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Top bar: timer + skip */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 32px',
            borderBottom: '1px solid #333',
          }}>
            <div style={{ fontSize: '28px', color: '#fff', letterSpacing: '2px' }}>
              AUDIENCE VOTE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {votingPhase === 'voting' && (
                <>
                  <div style={{
                    fontSize: '48px',
                    color: timeLeft <= 5 ? '#ef4444' : '#4ade80',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                    transition: 'color 0.3s',
                  }}>
                    {timeLeft}
                  </div>
                  <button
                    onClick={handleSkip}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      background: 'transparent',
                      border: '2px solid #555',
                      color: '#aaa',
                      fontSize: '18px',
                      fontFamily: "'VT323', monospace",
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.target.style.borderColor = '#fff'; e.target.style.color = '#fff'; }}
                    onMouseLeave={e => { e.target.style.borderColor = '#555'; e.target.style.color = '#aaa'; }}
                  >
                    <SkipForward size={18} />
                    SKIP
                  </button>
                </>
              )}
              {votingPhase === 'completed' && (
                <div style={{ fontSize: '28px', color: '#a78bfa', letterSpacing: '2px' }}>
                  STARTING GAME...
                </div>
              )}
            </div>
          </div>

          {/* Main content */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '80px',
            padding: '40px',
          }}>
            {/* QR Code side */}
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
                <QRCodeVote gameId={gameId} size={280} />
              </div>
            )}

            {/* Vote results side */}
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
                  {/* GPT bar */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '22px', color: '#10b981' }}>GPT-4o</span>
                      <span style={{ fontSize: '22px', color: '#ccc' }}>{voteStats.gpt_4o || 0}</span>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: '#222', borderRadius: '2px' }}>
                      <div style={{
                        width: `${voteStats.percentages?.gpt_4o || 0}%`,
                        height: '100%',
                        background: '#10b981',
                        borderRadius: '2px',
                        transition: 'width 0.5s',
                      }} />
                    </div>
                  </div>
                  {/* Claude bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '22px', color: '#8b5cf6' }}>Claude</span>
                      <span style={{ fontSize: '22px', color: '#ccc' }}>{voteStats.claude || 0}</span>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: '#222', borderRadius: '2px' }}>
                      <div style={{
                        width: `${voteStats.percentages?.claude || 0}%`,
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

          {/* Completed overlay */}
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
                {(voteStats.gpt_4o || 0) > (voteStats.claude || 0) ? (
                  <span style={{ color: '#10b981' }}>GPT-4o WINS THE VOTE</span>
                ) : (voteStats.claude || 0) > (voteStats.gpt_4o || 0) ? (
                  <span style={{ color: '#8b5cf6' }}>CLAUDE WINS THE VOTE</span>
                ) : (
                  <span style={{ color: '#fbbf24' }}>IT'S A TIE</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default SidebarVote;
