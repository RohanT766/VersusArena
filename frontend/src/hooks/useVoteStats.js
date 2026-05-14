import { useState, useEffect, useCallback } from 'react';
import { getBackendUrl } from '../utils/networkUtils';

const useVoteStats = (gameId) => {
  const [voteStats, setVoteStats] = useState({
    gpt_4o: 0,
    claude: 0,
    total: 0,
    percentages: { gpt_4o: 0, claude: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVoteStats = useCallback(async () => {
    try {
      const backendUrl = getBackendUrl();
      const url = `${backendUrl}/api/vote/stats?gameId=${gameId}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch vote stats');
      
      const data = await response.json();
      setVoteStats(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    let ws = null;
    let reconnectInterval = null;
    let isConnected = false;

    const connectWebSocket = () => {
      try {
        const backendUrl = getBackendUrl();
        const wsUrl = backendUrl.replace('http://', 'ws://').replace('https://', 'wss://');
        ws = new WebSocket(`${wsUrl}/api/vote/ws/${gameId}`);
        
        ws.onopen = () => {
          isConnected = true;
          setError(null);
          if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'vote_update' && message.data) {
              setVoteStats({
                gpt_4o: message.data.votes?.['gpt-4o'] || 0,
                claude: message.data.votes?.claude || 0,
                total: message.data.total || 0,
                percentages: message.data.percentages || { gpt_4o: 0, claude: 0 }
              });
              setIsLoading(false);
            }
          } catch (_) {}
        };

        ws.onerror = () => {
          setError('WebSocket connection error');
        };

        ws.onclose = () => {
          isConnected = false;
          if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
              if (!isConnected) connectWebSocket();
            }, 3000);
          }
        };
      } catch (_) {
        setError('Failed to connect to real-time updates');
      }
    };

    fetchVoteStats();
    connectWebSocket();

    const pollInterval = setInterval(() => {
      if (!isConnected) fetchVoteStats();
    }, 2000);

    return () => {
      if (ws) ws.close();
      if (reconnectInterval) clearInterval(reconnectInterval);
      clearInterval(pollInterval);
    };
  }, [gameId, fetchVoteStats]);

  return { voteStats, isLoading, error, refetch: fetchVoteStats };
};

export { useVoteStats };
export default useVoteStats;
