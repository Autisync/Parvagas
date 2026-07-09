"""WebSocket server for real-time updates."""
import json
import logging
from typing import Dict, List, Set
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as redis
from app.core.config import get_settings
from app.core.auth import verify_token

settings = get_settings()

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Parvagas WebSocket Service",
    version="1.0.0",
    docs_url=None,  # Disable Swagger UI for production
)

# CORS configuration
_allowed_origins = sorted({
    origin.strip()
    for source in (settings.CORS_ORIGIN, settings.FRONTEND_URL)
    for origin in (source or "").split(",")
    if origin.strip()
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


class WebSocketConnectionManager:
    """Manages WebSocket connections and messaging."""

    def __init__(self):
        """Initialize connection manager."""
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_channels: Dict[str, Set[str]] = {}
        self.redis_client: redis.Redis = None
        self.pubsub_tasks = {}

    async def init_redis(self):
        """Initialize Redis for pub/sub and caching."""
        try:
            self.redis_client = await redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_keepalive=True,
                health_check_interval=30,
            )
            await self.redis_client.ping()
            logger.info("✓ Redis connected for WebSocket pub/sub")
        except Exception as e:
            logger.error(f"✗ Redis connection failed: {e}")
            self.redis_client = None

    async def connect(self, user_id: str, websocket: WebSocket):
        """Accept and register WebSocket connection."""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
            self.user_channels[user_id] = set()
        
        self.active_connections[user_id].append(websocket)
        
        # Send connection acknowledgment
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
        })
        
        logger.info(
            f"✓ User {user_id} connected (total: {len(self.active_connections[user_id])})"
        )

    async def disconnect(self, user_id: str, websocket: WebSocket):
        """Unregister and close WebSocket connection."""
        if user_id in self.active_connections:
            try:
                self.active_connections[user_id].remove(websocket)
            except ValueError:
                pass
            
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                if user_id in self.user_channels:
                    del self.user_channels[user_id]
        
        logger.info(f"✓ User {user_id} disconnected")

    async def broadcast_to_user(self, user_id: str, message: dict):
        """Send message to all WebSocket connections of a user."""
        if user_id not in self.active_connections:
            return
        
        dead_connections = []
        for idx, connection in enumerate(self.active_connections[user_id]):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to {user_id}: {e}")
                dead_connections.append(idx)
        
        # Remove dead connections
        for idx in reversed(dead_connections):
            try:
                self.active_connections[user_id].pop(idx)
            except IndexError:
                pass

    async def broadcast_to_channel(self, channel: str, message: dict):
        """Broadcast message to all users subscribed to a channel."""
        if not self.redis_client:
            logger.warning("Redis not available for channel broadcast")
            return
        
        try:
            await self.redis_client.publish(
                f"ws:{channel}",
                json.dumps(message)
            )
        except Exception as e:
            logger.error(f"Error publishing to channel {channel}: {e}")

    async def subscribe_user_to_channel(
        self,
        user_id: str,
        channel: str,
        callback,
    ):
        """Subscribe user to a Redis channel."""
        if not self.redis_client:
            logger.warning("Redis not available for subscription")
            return
        
        if user_id not in self.user_channels:
            self.user_channels[user_id] = set()
        
        self.user_channels[user_id].add(channel)
        
        try:
            pubsub = self.redis_client.pubsub()
            await pubsub.subscribe(f"ws:{channel}")
            
            logger.info(f"✓ User {user_id} subscribed to channel: {channel}")
            
            # Listen for messages
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await callback(data)
                    except json.JSONDecodeError:
                        logger.error(f"Invalid JSON in channel {channel}")
                    except Exception as e:
                        logger.error(f"Error processing channel message: {e}")
        except Exception as e:
            logger.error(f"Subscription error for {user_id} on {channel}: {e}")

    async def get_connection_count(self) -> dict:
        """Get current connection statistics."""
        total_connections = sum(
            len(conns) for conns in self.active_connections.values()
        )
        return {
            "total_users": len(self.active_connections),
            "total_connections": total_connections,
            "timestamp": datetime.utcnow().isoformat(),
        }


# Global connection manager
manager = WebSocketConnectionManager()


@app.on_event("startup")
async def startup_event():
    """Initialize connections on startup."""
    await manager.init_redis()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    if manager.redis_client:
        await manager.redis_client.close()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "websocket",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/stats")
async def get_stats():
    """Get WebSocket statistics."""
    return await manager.get_connection_count()


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time updates.

    Query Parameters:
        token: JWT authentication token (required)

    Client Usage:
        const ws = new WebSocket('wss://api.parvagas.pt/ws?token=your-jwt-token');
        
        // Subscribe to channel
        ws.send(JSON.stringify({
            type: 'subscribe',
            channel: 'resume_updates'
        }));
        
        // Handle messages
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log(data);
        };

    Message Types:
        - connected: Acknowledgment of successful connection
        - subscribed: Confirmation of channel subscription
        - pong: Response to ping
        - <custom>: Application-specific messages from server
    """
    user_id = None
    try:
        # Verify JWT token
        try:
            payload = verify_token(token)
            user_id = payload.get("sub")
            
            if not user_id:
                await websocket.close(code=1008, reason="Invalid token: no subject")
                logger.warning("WebSocket connection attempted with invalid token")
                return
        except Exception as e:
            await websocket.close(code=1008, reason="Invalid or expired token")
            logger.warning(f"WebSocket token verification failed: {e}")
            return

        # Connect user
        await manager.connect(user_id, websocket)

        # Listen for client messages
        while True:
            try:
                data = await websocket.receive_json()
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "error": "Invalid JSON format",
                })
                continue

            message_type = data.get("type")
            logger.debug(f"User {user_id} sent message type: {message_type}")

            if message_type == "ping":
                # Keep-alive ping
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.utcnow().isoformat(),
                })

            elif message_type == "subscribe":
                # Subscribe to channel
                channel = data.get("channel")
                if not channel:
                    await websocket.send_json({
                        "type": "error",
                        "error": "Channel name required for subscribe",
                    })
                    continue

                async def handle_message(msg):
                    """Handle incoming channel message."""
                    msg["user_id"] = user_id
                    msg["timestamp"] = datetime.utcnow().isoformat()
                    await manager.broadcast_to_user(user_id, msg)

                # Start subscription in background
                import asyncio
                asyncio.create_task(
                    manager.subscribe_user_to_channel(
                        user_id,
                        channel,
                        handle_message,
                    )
                )

                await websocket.send_json({
                    "type": "subscribed",
                    "channel": channel,
                    "timestamp": datetime.utcnow().isoformat(),
                })

            elif message_type == "unsubscribe":
                # Handle unsubscribe
                channel = data.get("channel")
                if user_id in manager.user_channels:
                    manager.user_channels[user_id].discard(channel)
                
                await websocket.send_json({
                    "type": "unsubscribed",
                    "channel": channel,
                    "timestamp": datetime.utcnow().isoformat(),
                })

            elif message_type == "get_stats":
                # Send statistics
                stats = await manager.get_connection_count()
                await websocket.send_json({
                    "type": "stats",
                    **stats,
                })

            else:
                logger.warning(f"Unknown message type: {message_type}")
                await websocket.send_json({
                    "type": "error",
                    "error": f"Unknown message type: {message_type}",
                })

    except WebSocketDisconnect:
        if user_id:
            await manager.disconnect(user_id, websocket)

    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass
