/**
 * WebSocket server for live topology updates
 * Broadcasts topology snapshots to connected clients
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { TopologySnapshot, WsMessage, GitEvent, ConflictWarning } from '@topology/protocol';

export interface TopologyWsServerOptions {
  /** Port to listen on (default: 8765) */
  port?: number;
}

/**
 * WebSocket server for broadcasting topology updates
 */
export class TopologyWsServer {
  private server: WebSocketServer | null = null;
  private port: number;
  private currentSnapshot: TopologySnapshot | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor(options: TopologyWsServerOptions = {}) {
    this.port = options.port ?? 8765;
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port: this.port });

      this.server.on('listening', () => {
        console.log(`   WebSocket server listening on ws://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('WebSocket server error:', error);
        reject(error);
      });

      this.server.on('connection', (ws) => {
        this.handleConnection(ws);
      });
    });
  }

  /**
   * Handle a new client connection
   */
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`   Client connected (${this.clients.size} total)`);

    // Send connected message
    this.sendToClient(ws, {
      type: 'connected',
      timestamp: Date.now(),
    });

    // Send current snapshot if available
    if (this.currentSnapshot) {
      this.sendToClient(ws, {
        type: 'snapshot',
        payload: this.currentSnapshot,
        timestamp: Date.now(),
      });
    }

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`   Client disconnected (${this.clients.size} remaining)`);
    });

    ws.on('error', (error) => {
      console.error('Client WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  /**
   * Send a message to a specific client
   */
  private sendToClient(ws: WebSocket, message: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  private broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * Broadcast a new topology snapshot to all clients
   */
  broadcastSnapshot(snapshot: TopologySnapshot): void {
    this.currentSnapshot = snapshot;
    const message: WsMessage = {
      type: 'snapshot',
      payload: snapshot,
      timestamp: Date.now(),
    };
    this.broadcast(message);
    console.log(`   Broadcast snapshot to ${this.clients.size} client(s)`);
  }

  /**
   * Broadcast a git event to all clients
   */
  broadcastGitEvent(gitEvent: GitEvent): void {
    const message: WsMessage = {
      type: 'git_event',
      gitEvent,
      timestamp: Date.now(),
    };
    this.broadcast(message);
    console.log(`   Broadcast git_event (${gitEvent.eventType}) to ${this.clients.size} client(s)`);
  }

  /**
   * Broadcast conflict warnings to all clients
   */
  broadcastConflictWarnings(warnings: ConflictWarning[]): void {
    if (warnings.length === 0) return;
    const message: WsMessage = {
      type: 'conflict_warning',
      conflictWarnings: warnings,
      timestamp: Date.now(),
    };
    this.broadcast(message);
    console.log(`   Broadcast ${warnings.length} conflict warning(s) to ${this.clients.size} client(s)`);
  }

  /**
   * Broadcast an error to all clients
   */
  broadcastError(error: string): void {
    const message: WsMessage = {
      type: 'error',
      error,
      timestamp: Date.now(),
    };
    this.broadcast(message);
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get the server port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();

      // Close the server
      this.server!.close(() => {
        this.server = null;
        this.currentSnapshot = null;
        resolve();
      });
    });
  }
}
