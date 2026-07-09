"""WSGI entry point for WebSocket service."""
import logging
from app.websocket_app import app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 Starting WebSocket Service")
    logger.info("   Listening on 0.0.0.0:8001")
    logger.info("   WebSocket endpoint: /ws")
    logger.info("   Health check: /health")
    logger.info("   Statistics: /stats")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info",
    )
