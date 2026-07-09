# Separating API and WebSocket Requests

## Architecture Options

### Option 1: Single FastAPI Service (Current - Simple)
```
Client (Browser)
    ↓
    ├─→ HTTP API (REST)  → FastAPI :8000
    └─→ WebSocket        → FastAPI :8000
```

**Pros:**
- Simple deployment
- Single container
- Works for small-medium traffic

**Cons:**
- Single point of failure
- Can't scale independently
- Long-running WebSocket blocks other requests (if not async)

---

### Option 2: Separate Containers (Recommended)
```
Client (Browser)
    ↓
    ├─→ HTTP API         → API Service :8000
    │
    └─→ WebSocket        → WebSocket Service :8001
```

**Pros:**
- Independent scaling
- Separate resource limits
- Isolated failure domains
- Better performance
- Easier debugging

**Cons:**
- More complex deployment (2 containers)
- Shared database/Redis

---

### Option 3: API Gateway + Separate Services (Enterprise)
```
Client (Browser)
    ↓
    Traefik (Port 443 - HTTPS)
    ├─→ https://api.parvagas.pt/api/*          → API Service :8000
    ├─→ https://api.parvagas.pt/ws             → WebSocket Service :8001
    └─→ https://api.parvagas.pt/socket.io/*    → Socket.io Service :8002
```

**Pros:**
- Single domain/port for clients
- Traefik handles routing
- Horizontal scaling with multiple instances
- Better load balancing

**Cons:**
- Most complex
- Requires load balancer awareness

---

## Recommended: Option 2 (Separate Containers)

### Architecture

```yaml
Services:
  1. api-service (FastAPI REST)
     - Port: 8000
     - Endpoints: /api/v1/*
     - Purpose: Regular HTTP/REST requests
     - Scaling: Can run multiple instances

  2. websocket-service (FastAPI WebSocket)
     - Port: 8001
     - Endpoints: /ws, /socket.io
     - Purpose: Real-time bidirectional communication
     - Scaling: Can run multiple instances (with Redis adapter)

  3. Shared Services:
     - PostgreSQL: Database (shared)
     - Redis: Message broker (shared) + caching
     - Traefik: Reverse proxy routing

  4. Load Balancing:
     - API requests → Round-robin to api-service instances
     - WebSocket → Sticky session to websocket-service
```

---

## Implementation

### Step 1: Create WebSocket Service

Create `backend-python/app/websocket_app.py`:

```python
"""WebSocket server for real-time updates."""
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_async_db
from app.core.auth import verify_token

logger = logging.getLogger(__name__)

app = FastAPI(title="Parvagas WebSocket Service")

# CORS for WebSocket
app.add_middleware(
    CORSMiddleware,
    allow_origins=(settings.CORS_ORIGIN or settings.FRONTEND_URL).split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Global connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.redis_client = None

    async def init_redis(self):
        """Initialize Redis for pub/sub."""
        self.redis_client = await redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )

    async def connect(self, user_id: str, websocket: WebSocket):
        """Accept WebSocket connection and add to manager."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected. Active: {len(self.active_connections[user_id])}")

    async def disconnect(self, user_id: str, websocket: WebSocket):
        """Remove WebSocket connection."""
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"User {user_id} disconnected")

    async def broadcast_to_user(self, user_id: str, message: dict):
        """Send message to all connections of a user."""
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending to {user_id}: {e}")

    async def publish_to_redis(self, channel: str, message: dict):
        """Publish message to Redis for cross-instance communication."""
        if self.redis_client:
            await self.redis_client.publish(channel, json.dumps(message))

    async def subscribe_to_channel(self, channel: str, callback):
        """Subscribe to Redis channel."""
        if self.redis_client:
            pubsub = self.redis_client.pubsub()
            await pubsub.subscribe(channel)
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await callback(json.loads(message["data"]))


manager = ConnectionManager()


@app.on_event("startup")
async def startup():
    """Initialize WebSocket manager on startup."""
    await manager.init_redis()


@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    WebSocket endpoint for real-time updates.
    
    Usage:
        ws = new WebSocket('wss://api.parvagas.pt/ws/your-jwt-token')
        ws.onmessage = (event) => console.log(JSON.parse(event.data))
        ws.send(JSON.stringify({type: 'subscribe', channel: 'profile_updates'}))
    """
    try:
        # Verify JWT token
        payload = verify_token(token)
        user_id = payload.get("sub")
        
        if not user_id:
            await websocket.close(code=1008, reason="Invalid token")
            return

        # Connect user
        await manager.connect(user_id, websocket)

        # Listen for messages from client
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "ping":
                # Keep-alive ping
                await websocket.send_json({"type": "pong"})

            elif message_type == "subscribe":
                # Subscribe to channel
                channel = data.get("channel")
                logger.info(f"User {user_id} subscribing to {channel}")
                # Subscribe to Redis channel for this user
                async def handle_channel_message(msg):
                    msg["user_id"] = user_id
                    await manager.broadcast_to_user(user_id, msg)
                await manager.subscribe_to_channel(f"{channel}:{user_id}", handle_channel_message)

            elif message_type == "unsubscribe":
                # Handle unsubscribe
                pass

    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
        logger.info(f"User {user_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await websocket.close(code=1011, reason="Internal server error")


@app.get("/health")
async def health_check():
    """Health check for WebSocket service."""
    return {"status": "ok", "service": "websocket"}
```

### Step 2: Modify Main API Service

Modify `backend-python/app/main.py` to NOT include WebSocket (keep pure REST):

```python
"""FastAPI REST API service."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# ... other imports ...

app = FastAPI(title="Parvagas API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=(settings.CORS_ORIGIN or settings.FRONTEND_URL).split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Include routers (all REST endpoints only)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(profiles.router, prefix="/api/v1/profiles", tags=["profiles"])
app.include_router(resumes.router, prefix="/api/v1/resumes", tags=["resumes"])
# ... etc - NO WebSocket routes here ...

@app.get("/health")
async def health():
    return {"status": "ok", "service": "api"}
```

### Step 3: Create WebSocket Entry Point

Create `backend-python/wsgi_websocket.py`:

```python
"""WSGI entry point for WebSocket service."""
from app.websocket_app import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
```

### Step 4: Update Dockerfile for Multi-Service Build

Update `backend-python/Dockerfile`:

```dockerfile
# Build stage (same as before)
FROM python:3.11-slim as builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Runtime stage for API service (default)
FROM python:3.11-slim as api-service
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV SERVICE_TYPE=api
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Runtime stage for WebSocket service
FROM python:3.11-slim as websocket-service
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV SERVICE_TYPE=websocket
EXPOSE 8001
CMD ["python", "-m", "uvicorn", "app.websocket_app:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Step 5: Update docker-compose.prod.yml

Add WebSocket service alongside API:

```yaml
services:
  # ─ API Service ─────────────────────────────────────────────────────────
  backend-python:
    build:
      context: ./backend-python
      target: api-service  # Use api-service target
    container_name: parvagas-api
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment: *backend-env
    networks:
      - traefik-net
      - default
    labels:
      traefik.enable: "true"
      traefik.http.routers.parvagas-api.rule: Host(`api.parvagas.pt`)
      traefik.http.routers.parvagas-api.entrypoints: websecure
      traefik.http.routers.parvagas-api.tls: "true"
      traefik.http.routers.parvagas-api.tls.certresolver: letsencrypt
      traefik.http.services.parvagas-api.loadbalancer.server.port: "8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  # ─ WebSocket Service ─────────────────────────────────────────────────────
  websocket-service:
    build:
      context: ./backend-python
      target: websocket-service  # Use websocket-service target
    container_name: parvagas-websocket
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment: *backend-env
    networks:
      - traefik-net
      - default
    labels:
      traefik.enable: "true"
      traefik.http.routers.parvagas-ws.rule: "Host(`api.parvagas.pt`) && PathPrefix(`/ws`)"
      traefik.http.routers.parvagas-ws.entrypoints: websecure
      traefik.http.routers.parvagas-ws.tls: "true"
      traefik.http.routers.parvagas-ws.tls.certresolver: letsencrypt
      traefik.http.services.parvagas-ws.loadbalancer.server.port: "8001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    environment:
      # Same as backend-env
      <<: *backend-env
```

---

## Frontend Integration

### Connect to WebSocket

```typescript
// lib/websocket.ts
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;

  constructor(private token: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${this.token}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect();
      };
    });
  }

  private handleMessage(data: any) {
    if (data.type === 'pong') {
      // Keep-alive response
      return;
    }

    // Dispatch custom event for listeners
    window.dispatchEvent(
      new CustomEvent('websocket:message', { detail: data })
    );
  }

  subscribe(channel: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ type: 'subscribe', channel })
      );
    }
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      );
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }

  // Keep-alive ping every 30 seconds
  startHeartbeat() {
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }
}
```

### Use in React Component

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { WebSocketClient } from '@/lib/websocket';

export function useWebSocket(token: string, channel: string) {
  const wsRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocketClient(token);
    wsRef.current = ws;

    ws.connect()
      .then(() => {
        ws.subscribe(channel);
        ws.startHeartbeat();
      })
      .catch((error) => console.error('Failed to connect:', error));

    return () => ws.disconnect();
  }, [token, channel]);

  return wsRef.current;
}
```

### Use in Component

```typescript
// components/ResumeUpdates.tsx
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';

export function ResumeUpdates() {
  const { token } = useAuth();
  const [updates, setUpdates] = useState<any[]>([]);

  useWebSocket(token, 'resume_updates');

  useEffect(() => {
    const handleMessage = (event: CustomEvent) => {
      const data = event.detail;
      if (data.type === 'resume_updated') {
        setUpdates((prev) => [data, ...prev]);
      }
    };

    window.addEventListener('websocket:message', handleMessage as EventListener);
    return () =>
      window.removeEventListener('websocket:message', handleMessage as EventListener);
  }, []);

  return (
    <div>
      <h2>Resume Updates</h2>
      {updates.map((update, i) => (
        <div key={i}>
          <p>{update.message}</p>
          <small>{new Date(update.timestamp).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}
```

---

## Traefik Routing Configuration

The Traefik labels route differently:

```yaml
# API requests: /api/* → api-service:8000
traefik.http.routers.parvagas-api.rule: Host(`api.parvagas.pt`)

# WebSocket requests: /ws → websocket-service:8001
traefik.http.routers.parvagas-ws.rule: "Host(`api.parvagas.pt`) && PathPrefix(`/ws`)"
```

---

## Benefits of This Approach

| Aspect | Benefit |
|--------|---------|
| **Scalability** | Scale API and WebSocket independently |
| **Performance** | API requests don't wait for WebSocket connections |
| **Reliability** | If WebSocket service fails, API still works |
| **Resource Management** | Allocate more resources to WebSocket if needed |
| **Monitoring** | Track API and WebSocket metrics separately |
| **Maintenance** | Update services independently |

---

## Deployment Checklist

- [ ] Create `backend-python/app/websocket_app.py`
- [ ] Create `backend-python/wsgi_websocket.py`
- [ ] Update `backend-python/Dockerfile` with multi-stage build
- [ ] Update `docker-compose.prod.yml` with websocket-service
- [ ] Update Traefik labels for WebSocket routing
- [ ] Deploy frontend WebSocket client code
- [ ] Test WebSocket connection: `wss://api.parvagas.pt/ws/your-token`
- [ ] Monitor both services in Portainer

---

## Monitoring

### View WebSocket Service Logs

```bash
# In Portainer: Containers → websocket-service → Logs
# Or via CLI:
docker logs -f parvagas-websocket
```

### Metrics to Track

- Active WebSocket connections
- Message throughput
- Connection duration
- Error rates per service
- Resource usage (CPU, Memory) per service

Set up in Portainer:
1. Go to **Containers** → **websocket-service** → **Stats** tab
2. Monitor CPU, Memory, Network in real-time
