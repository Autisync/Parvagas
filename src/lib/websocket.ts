/**
 * WebSocket client for real-time communication with the backend.
 *
 * Usage:
 *   const ws = new WebSocketClient(token);
 *   await ws.connect();
 *   ws.subscribe('resume_updates');
 *   ws.on('message', (data) => console.log(data));
 */

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

type MessageListener = (message: WebSocketMessage) => void;
type StateListener = (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private messageListeners: Set<MessageListener> = new Set();
  private stateListeners: Set<StateListener> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isManualClose = false;

  constructor(
    token: string,
    options?: {
      maxReconnectAttempts?: number;
      reconnectDelay?: number;
      url?: string;
    }
  ) {
    this.token = token;
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? 5;
    this.reconnectDelay = options?.reconnectDelay ?? 3000;

    // Construct WebSocket URL
    if (options?.url) {
      this.url = options.url;
    } else {
      const protocol = typeof window !== 'undefined' 
        ? window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        : 'wss:';
      const host = typeof window !== 'undefined'
        ? window.location.host
        : 'api.parvagas.pt';
      this.url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;
    }
  }

  /**
   * Connect to the WebSocket server.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.emitStateChange('connecting');
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('✓ WebSocket connected');
          this.reconnectAttempts = 0;
          this.emitStateChange('connected');
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as WebSocketMessage;
            this.handleMessage(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error: Event) => {
          console.error('✗ WebSocket error:', error);
          this.emitStateChange('error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('✗ WebSocket disconnected');
          this.stopHeartbeat();
          this.emitStateChange('disconnected');
          
          if (!this.isManualClose) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        this.emitStateChange('error');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.isManualClose = true;
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to a channel for real-time updates.
   */
  subscribe(channel: string): void {
    if (!this.isConnected()) {
      console.warn('WebSocket not connected. Cannot subscribe to channel:', channel);
      return;
    }

    this.send({
      type: 'subscribe',
      channel,
    });
  }

  /**
   * Unsubscribe from a channel.
   */
  unsubscribe(channel: string): void {
    if (!this.isConnected()) {
      console.warn('WebSocket not connected. Cannot unsubscribe from channel:', channel);
      return;
    }

    this.send({
      type: 'unsubscribe',
      channel,
    });
  }

  /**
   * Send a message to the server.
   */
  send(data: WebSocketMessage): void {
    if (!this.isConnected()) {
      console.warn('WebSocket not connected. Cannot send message:', data);
      return;
    }

    try {
      this.ws!.send(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
    }
  }

  /**
   * Register a listener for incoming messages.
   */
  on(listener: MessageListener): void {
    this.messageListeners.add(listener);
  }

  /**
   * Unregister a message listener.
   */
  off(listener: MessageListener): void {
    this.messageListeners.delete(listener);
  }

  /**
   * Register a listener for connection state changes.
   */
  onStateChange(listener: StateListener): void {
    this.stateListeners.add(listener);
  }

  /**
   * Unregister a state listener.
   */
  offStateChange(listener: StateListener): void {
    this.stateListeners.delete(listener);
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state.
   */
  getState(): 'connecting' | 'connected' | 'disconnected' | 'error' | 'unknown' {
    if (!this.ws) return 'unknown';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  /**
   * Handle incoming messages.
   */
  private handleMessage(data: WebSocketMessage): void {
    const { type } = data;

    switch (type) {
      case 'connected':
        console.log('✓ Connected to WebSocket:', data.user_id);
        break;

      case 'subscribed':
        console.log(`✓ Subscribed to channel: ${data.channel}`);
        break;

      case 'unsubscribed':
        console.log(`✓ Unsubscribed from channel: ${data.channel}`);
        break;

      case 'pong':
        // Keep-alive response, silently ignore
        break;

      case 'error':
        console.error('✗ WebSocket error:', data.error);
        break;

      default:
        // Emit to all listeners
        this.messageListeners.forEach((listener) => {
          try {
            listener(data);
          } catch (error) {
            console.error('Error in message listener:', error);
          }
        });
    }
  }

  /**
   * Emit state change to all listeners.
   */
  private emitStateChange(state: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    this.stateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('✗ Max reconnection attempts reached. Giving up.');
      this.emitStateChange('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(
      `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts}) ` +
      `in ${delay}ms`
    );

    setTimeout(() => {
      this.isManualClose = false;
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Start sending keep-alive pings every 30 seconds.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  /**
   * Stop sending keep-alive pings.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
