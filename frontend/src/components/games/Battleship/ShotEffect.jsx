import React, { useEffect, useState } from 'react';

/**
 * Bomb drop → splash (miss) or explosion (hit).
 * @param {{ result: 'hit'|'miss', onComplete?: () => void }} props
 */
export function ShotEffect({ result, onComplete }) {
  const [phase, setPhase] = useState('falling');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('impact'), 420);
    const t2 = setTimeout(() => {
      onComplete?.();
    }, 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  return (
    <div className={`shot-effect shot-${phase} shot-${result}`}>
      {phase === 'falling' && (
        <>
          <div className="shot-bomb" />
          <div className="shot-shadow" />
        </>
      )}
      {phase === 'impact' && result === 'hit' && (
        <>
          <div className="shot-blast-core" />
          <div className="shot-blast-ring shot-blast-ring-1" />
          <div className="shot-blast-ring shot-blast-ring-2" />
          <div className="shot-smoke shot-smoke-1" />
          <div className="shot-smoke shot-smoke-2" />
        </>
      )}
      {phase === 'impact' && result === 'miss' && (
        <>
          <div className="shot-splash shot-splash-main" />
          <div className="shot-splash shot-splash-ring" />
          <div className="shot-splash-droplets" />
        </>
      )}
    </div>
  );
}
