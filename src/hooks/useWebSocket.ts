/**
 * React hooks for WebSocket communication.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketClient } from '@/lib/websocket';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to manage WebSocket connection lifecycle.
 *
 * Usage:
 *   const ws = useWebSocket(token, {
 *     autoConnect: true,
 *     onConnect: () => console.log('Connected'),
 *   });
 *   ws?.subscribe('my_channel');
 */
export function useWebSocket(
  token: string | null | undefined,
  options: UseWebSocketOptions = {}
) {
  const {
    autoConnect = true,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const clientRef = useRef<WebSocketClient | null>(null);
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  // Initialize and manage connection
  useEffect(() => {
    if (!token) {
      clientRef.current = null;
      setClient(null);
      setIsConnected(false);
      setState('disconnected');
      return;
    }

    const nextClient = new WebSocketClient(token);
    clientRef.current = nextClient;
    setClient(nextClient);

    // Track state changes
    const handleStateChange = (newState: typeof state) => {
      setState(newState);
      setIsConnected(newState === 'connected');

      if (newState === 'connected' && onConnect) {
        onConnect();
      } else if (newState === 'disconnected' && onDisconnect) {
        onDisconnect();
      } else if (newState === 'error' && onError) {
        onError(new Error('WebSocket connection error'));
      }
    };

    nextClient.onStateChange(handleStateChange);

    // Connect if auto-connect is enabled
    if (autoConnect) {
      nextClient.connect().catch((error) => {
        console.error('Failed to connect WebSocket:', error);
        if (onError) onError(error);
      });
    }

    // Cleanup on unmount
    return () => {
      nextClient.disconnect();
      if (clientRef.current === nextClient) {
        clientRef.current = null;
      }
      setClient((current) => (current === nextClient ? null : current));
    };
  }, [token, autoConnect, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => client?.connect(), [client]);
  const disconnect = useCallback(() => client?.disconnect(), [client]);

  return {
    client,
    isConnected,
    state,
    connect,
    disconnect,
  };
}

/**
 * Hook to listen for WebSocket messages of a specific type.
 *
 * Usage:
 *   const messages = useWebSocketMessages(ws, 'resume_updated');
 */
export function useWebSocketMessages<T extends Record<string, any> = any>(
  client: WebSocketClient | null | undefined,
  messageType?: string
) {
  const [messages, setMessages] = useState<T[]>([]);

  useEffect(() => {
    if (!client) return;

    const handleMessage = (data: any) => {
      // Filter by type if specified
      if (messageType && data.type !== messageType) {
        return;
      }

      setMessages((prev) => [data as T, ...prev]);
    };

    client.on(handleMessage);

    return () => {
      client.off(handleMessage);
    };
  }, [client, messageType]);

  return messages;
}

/**
 * Hook to manage subscription to a WebSocket channel.
 *
 * Usage:
 *   useWebSocketSubscription(ws, 'my_channel', (message) => {
 *     console.log('Received:', message);
 *   });
 */
export function useWebSocketSubscription(
  client: WebSocketClient | null | undefined,
  channel: string,
  onMessage?: (message: any) => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!client || !enabled) return;

    // Wait for connection before subscribing
    if (!client.isConnected()) {
      const checkConnection = setInterval(() => {
        if (client.isConnected()) {
          client.subscribe(channel);
          clearInterval(checkConnection);
        }
      }, 500);

      return () => clearInterval(checkConnection);
    }

    client.subscribe(channel);

    if (onMessage) {
      client.on(onMessage);
    }

    // Cleanup: unsubscribe on unmount
    return () => {
      if (onMessage) {
        client.off(onMessage);
      }
      client.unsubscribe(channel);
    };
  }, [client, channel, onMessage, enabled]);
}

/**
 * Hook to get real-time statistics about WebSocket connections.
 *
 * Usage:
 *   const stats = useWebSocketStats(ws, 5000); // Refresh every 5 seconds
 */
export function useWebSocketStats(
  client: WebSocketClient | null | undefined,
  refreshInterval: number = 10000
) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (!client || !client.isConnected()) return;

    // Request stats immediately
    client.send({ type: 'get_stats' });

    // Set up periodic refresh
    const interval = setInterval(() => {
      if (client.isConnected()) {
        client.send({ type: 'get_stats' });
      }
    }, refreshInterval);

    // Listen for stats responses
    const handleMessage = (data: any) => {
      if (data.type === 'stats') {
        setStats(data);
      }
    };

    client.on(handleMessage);

    return () => {
      clearInterval(interval);
      client.off(handleMessage);
    };
  }, [client, refreshInterval]);

  return stats;
}

/**
 * Hook to manually send messages over WebSocket.
 *
 * Usage:
 *   const send = useWebSocketSend(ws);
 *   send({ type: 'custom_action', data: {} });
 */
export function useWebSocketSend(
  client: WebSocketClient | null | undefined
) {
  return useCallback(
    (message: any) => {
      if (!client) {
        console.warn('WebSocket client not available');
        return;
      }
      client.send(message);
    },
    [client]
  );
}
