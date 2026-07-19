# WebSocket & API Implementation Guide

## Overview

The system now separates API requests (REST) from real-time updates (WebSocket):

```
┌─ REST API (/api/v1/*)
│  └─ Port 8000
│     - CRUD operations
│     - File uploads
│     - Batch operations
│     - Stateless
│
└─ WebSocket (/ws)
   └─ Port 8001
      - Real-time updates
      - Bidirectional communication
      - Connection-based
      - Stateful
```

---

## Backend Architecture

### Services in Docker

```yaml
# docker-compose.prod.portainer.yml
backend-python:       # REST API
  build: target=api-service
  port: 8000

websocket-service:    # Real-time
  build: target=websocket-service
  port: 8001
```

### Traefik Routing

```
https://api.parvagas.pt/api/*    → backend-python:8000
https://api.parvagas.pt/ws       → websocket-service:8001
```

---

## Frontend: Using WebSocket

### 1. Basic Connection

```typescript
import { WebSocketClient } from '@/lib/websocket';

const token = localStorage.getItem('auth_token');
const ws = new WebSocketClient(token);

await ws.connect();
console.log(ws.isConnected()); // true
```

### 2. Subscribe to Channel

```typescript
ws.subscribe('resume_updates');
```

### 3. Listen for Messages

```typescript
ws.on((message) => {
  console.log('Received:', message);
  
  if (message.type === 'resume_score_progress') {
    console.log(`Score progress: ${message.progress}%`);
  }
});
```

### 4. Disconnect

```typescript
ws.disconnect();
```

---

## React Hooks

### useWebSocket

Initialize WebSocket connection:

```typescript
const { client, isConnected, state } = useWebSocket(token, {
  autoConnect: true,
  onConnect: () => console.log('Connected'),
  onError: (error) => console.error(error),
});
```

**Returns:**
- `client`: WebSocketClient instance
- `isConnected`: boolean
- `state`: 'connecting' | 'connected' | 'disconnected' | 'error'
- `connect()`: Manual connect
- `disconnect()`: Manual disconnect

### useWebSocketMessages

Listen for specific message types:

```typescript
const updates = useWebSocketMessages(client, 'resume_score_progress');

// Now `updates` contains all messages of that type
updates.forEach((update) => {
  console.log(update.progress);
});
```

### useWebSocketSubscription

Subscribe to a channel and handle messages:

```typescript
useWebSocketSubscription(
  client,
  'resume_updates',
  (message) => {
    if (message.type === 'scored') {
      console.log('Resume scored!', message.score);
    }
  },
  true // enabled
);
```

### useWebSocketStats

Get real-time server statistics:

```typescript
const stats = useWebSocketStats(client, 5000); // Refresh every 5s

console.log(stats.total_users);
console.log(stats.total_connections);
```

### useWebSocketSend

Send messages to server:

```typescript
const send = useWebSocketSend(client);

send({
  type: 'custom_action',
  data: { /* ... */ },
});
```

---

## Example: Resume Scoring with Real-Time Progress

### Backend (Python)

```python
# backend-python/app/api/v1/resumes.py

@router.post("/score")
async def score_resume(
    resume_id: str,
    profile_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Score a resume with real-time progress updates."""
    
    # Store job ID in Redis
    job_id = str(uuid.uuid4())
    await redis.setex(f"score_job:{job_id}", 3600, "running")
    
    # Start background task
    task = score_resume_task.delay(resume_id, profile_id, job_id)
    
    return {"job_id": job_id, "task_id": task.id}


# backend-python/app/workers/tasks.py

@celery_app.task
def score_resume_task(resume_id: str, profile_id: str, job_id: str):
    """Background task for resume scoring."""
    
    # Simulate progress
    for progress in [10, 25, 50, 75, 100]:
        # Publish progress to Redis
        redis.publish(
            f"ws:resume_scores:{profile_id}",
            json.dumps({
                "type": "resume_score_progress",
                "job_id": job_id,
                "progress": progress,
                "timestamp": datetime.utcnow().isoformat(),
            })
        )
        time.sleep(1)
    
    # Final result
    result = score_resume(resume_id, profile_id)
    
    redis.publish(
        f"ws:resume_scores:{profile_id}",
        json.dumps({
            "type": "resume_scored",
            "job_id": job_id,
            "score": result["score"],
            "details": result["details"],
        })
    )
```

### Frontend (React)

```typescript
// components/ResumeScoringPanel.tsx

'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket, useWebSocketSubscription } from '@/hooks/useWebSocket';

export function ResumeScoringPanel() {
  const { token, user } = useAuth();
  const [score, setScore] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const ws = useWebSocket(token, { autoConnect: true });

  // Listen for scoring updates
  useWebSocketSubscription(
    ws.client,
    `resume_scores`,
    (message) => {
      if (message.type === 'resume_score_progress') {
        setProgress(message.progress);
      } else if (message.type === 'resume_scored') {
        setScore(message.score);
        setLoading(false);
      }
    },
    ws.isConnected
  );

  const handleScore = async () => {
    setLoading(true);
    setProgress(0);
    setScore(null);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/resumes/score`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resume_id: 'current-resume',
          profile_id: user?.id,
        }),
      }
    );

    // Scoring starts, progress updates come via WebSocket
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleScore}
        disabled={loading || !ws.isConnected}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {loading ? 'Scoring...' : 'Score Resume'}
      </button>

      {loading && (
        <div className="space-y-2">
          <div className="bg-gray-200 rounded h-2">
            <div
              className="bg-blue-500 h-2 rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">{progress}% complete</p>
        </div>
      )}

      {score !== null && (
        <div className="p-4 bg-green-50 rounded">
          <p className="font-bold text-lg">Score: {score}/100</p>
        </div>
      )}
    </div>
  );
}
```

---

## Backend: Publishing Updates

### From REST Endpoint

```python
from app.websocket_app import manager
from app.core.database import redis_client

@router.post("/resumes/{resume_id}/update")
async def update_resume(resume_id: str, data: dict):
    """Update resume and notify connected clients."""
    
    # Update database
    resume = await db.update_resume(resume_id, data)
    
    # Publish to WebSocket
    await manager.broadcast_to_channel(
        'resume_updates',
        {
            'type': 'resume_updated',
            'resume_id': resume_id,
            'data': resume.dict(),
        }
    )
    
    return resume
```

### From Celery Task

```python
import json
from app.core.database import redis_client

@celery_app.task
def process_cv(cv_id: str, user_id: str):
    """Process CV and publish progress."""
    
    # Progress: 25%
    redis_client.publish(
        f'ws:cv_processing:{user_id}',
        json.dumps({
            'type': 'cv_processing_progress',
            'cv_id': cv_id,
            'progress': 25,
            'status': 'Parsing...',
        })
    )
    
    # Do work...
    
    # Progress: 50%
    redis_client.publish(
        f'ws:cv_processing:{user_id}',
        json.dumps({
            'type': 'cv_processing_progress',
            'cv_id': cv_id,
            'progress': 50,
            'status': 'Extracting...',
        })
    )
    
    # Complete
    redis_client.publish(
        f'ws:cv_processing:{user_id}',
        json.dumps({
            'type': 'cv_processed',
            'cv_id': cv_id,
            'result': { /* parsed data */ },
        })
    )
```

---

## Performance & Scaling

### Single Server (Current)

```
API :8000 (stateless)      → Scale: ✓ Easy (add load balancer)
WebSocket :8001 (stateful) → Scale: ✓ Easy (sticky sessions + Redis)
Redis                      → Shared state
```

### Multiple Servers (Future)

```
Load Balancer
    ├─ API Server 1 :8000
    ├─ API Server 2 :8000
    └─ API Server 3 :8000

Load Balancer (sticky sessions)
    ├─ WebSocket Server 1 :8001
    ├─ WebSocket Server 2 :8001
    └─ WebSocket Server 3 :8001

Shared Redis (pub/sub for cross-instance messaging)
```

---

## Monitoring WebSocket

### In Portainer

1. Go to **Containers** → **websocket-service**
2. **Stats** tab: CPU, Memory, Network usage
3. **Logs** tab: Connection events

### Health Checks

```bash
# API Health
curl https://api.parvagas.pt/health
# { "status": "ok", "service": "api" }

# WebSocket Health
curl https://api.parvagas.pt/health
# { "status": "ok", "service": "websocket" }

# WebSocket Stats
curl https://api.parvagas.pt/stats
# {
#   "total_users": 42,
#   "total_connections": 58,
#   "timestamp": "2026-07-08T10:30:00"
# }
```

---

## Troubleshooting

### WebSocket Connection Fails

```typescript
const ws = new WebSocketClient(token);

// Check: Token is valid
// Check: Server is running: curl https://api.parvagas.pt/stats
// Check: Browser console for errors

ws.onStateChange((state) => {
  console.log('State:', state); // 'connecting' → 'connected' or 'error'
});
```

### Messages Not Received

```typescript
// 1. Check subscription
ws.subscribe('my_channel');

// 2. Check backend is publishing
// Backend should publish to: ws:my_channel

// 3. Check listener is registered
ws.on((message) => {
  console.log('Received:', message);
});
```

### Reconnection Issues

```typescript
// Automatic reconnection with exponential backoff
// After 5 failed attempts, gives up
// Check browser console for error details

// Manual reconnect
await ws.connect();
```

---

## Files

**Backend:**
- [app/websocket_app.py](backend-python/app/websocket_app.py) — WebSocket server
- [wsgi_websocket.py](backend-python/wsgi_websocket.py) — Entry point
- [Dockerfile](backend-python/Dockerfile) — Multi-stage build (api-service + websocket-service)
- [docker-compose.prod.portainer.yml](docker-compose.prod.portainer.yml) — Production stack with WebSocket service

**Frontend:**
- [lib/websocket.ts](src/lib/websocket.ts) — WebSocket client
- [hooks/useWebSocket.ts](src/hooks/useWebSocket.ts) — React hooks
- [components/WebSocketExamples.tsx](src/components/WebSocketExamples.tsx) — Example components

---

## Deployment Checklist

- [ ] Dockerfile multi-stage build with `api-service` and `websocket-service` targets
- [ ] docker-compose.prod.portainer.yml updated with websocket-service
- [ ] Traefik labels configured for WebSocket routing (/ws path)
- [ ] Frontend WebSocket client imported and working
- [ ] React hooks integrated in components
- [ ] Test WebSocket connection: `wss://api.parvagas.pt/ws?token=...`
- [ ] Monitor both services separately in Portainer
- [ ] Backend publishing updates to Redis channels
- [ ] Frontend listening for real-time messages
