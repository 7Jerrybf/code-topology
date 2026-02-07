/**
 * WebSocket hook for receiving live topology updates
 * Connects to CLI watch mode server
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import type { TopologySnapshot } from '@/types/topology';
import type { WsMessage } from '@topology/protocol';

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface UseWebSocketUpdatesOptions {
  /** WebSocket server URL (e.g., ws://localhost:8765) */
  url: string;
  /** Whether live updates are enabled */
  enabled: boolean;
  /** Callback when a new snapshot is received */
  onSnapshot: (snapshot: TopologySnapshot) => void;
  /** Callback when an error is received */
  onError?: (error: string) => void;
  /** Reconnect interval in ms (default: 3000, max: 30000) */
  reconnectInterval?: number;
}

export interface UseWebSocketUpdatesResult {
  /** Current connection status */
  connectionStatus: WsConnectionStatus;
  /** Whether we're attempting to reconnect */
  isReconnecting: boolean;
  /** Last error message */
  lastError: string | null;
}

const MIN_RECONNECT_INTERVAL = 1000;
const MAX_RECONNECT_INTERVAL = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;

/**
 * Hook for managing WebSocket connection to topology watch mode
 */
export function useWebSocketUpdates(
  options: UseWebSocketUpdatesOptions
): UseWebSocketUpdatesResult {
  const { url, enabled, onSnapshot, onError, reconnectInterval = 3000 } = options;

  const [connectionStatus, setConnectionStatus] = useState<WsConnectionStatus>('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentReconnectIntervalRef = useRef(reconnectInterval);
  const mountedRef = useRef(true);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Schedule reconnection with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    setIsReconnecting(true);

    const interval = Math.min(
      currentReconnectIntervalRef.current,
      MAX_RECONNECT_INTERVAL
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && enabled) {
        // Increase interval for next attempt
        currentReconnectIntervalRef.current = Math.min(
          currentReconnectIntervalRef.current * RECONNECT_BACKOFF_MULTIPLIER,
          MAX_RECONNECT_INTERVAL
        );
        connect();
      }
    }, interval);
  }, [enabled]);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    cleanup();
    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnectionStatus('connected');
        setIsReconnecting(false);
        setLastError(null);
        // Reset reconnect interval on successful connection
        currentReconnectIntervalRef.current = reconnectInterval;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const message: WsMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'snapshot':
              if (message.payload) {
                onSnapshot(message.payload);
              }
              break;

            case 'error':
              if (message.error) {
                setLastError(message.error);
                onError?.(message.error);
              }
              break;

            case 'connected':
              // Initial connection acknowledgment
              break;
          }
        } catch {
          console.warn('Failed to parse WebSocket message');
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        // Error details aren't available in the browser
        // onclose will be called after this
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        setConnectionStatus('disconnected');
        wsRef.current = null;

        // Schedule reconnection if still enabled
        if (enabled) {
          scheduleReconnect();
        }
      };
    } catch {
      setConnectionStatus('disconnected');
      setLastError('Failed to create WebSocket connection');

      if (enabled) {
        scheduleReconnect();
      }
    }
  }, [url, enabled, onSnapshot, onError, reconnectInterval, cleanup, scheduleReconnect]);

  // Main effect - handle enabled state changes
  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      // Reset reconnect interval when enabling
      currentReconnectIntervalRef.current = Math.max(reconnectInterval, MIN_RECONNECT_INTERVAL);
      connect();
    } else {
      cleanup();
      setConnectionStatus('disconnected');
      setIsReconnecting(false);
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, url]);

  return {
    connectionStatus,
    isReconnecting,
    lastError,
  };
}
