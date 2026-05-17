#!/bin/bash

# Script for Python backend operations

set -e

echo "🔄 Parvagas Python Backend Manager"
echo "=============================="
echo ""
echo "Legacy Node backend has been removed from Docker Compose."
echo ""
echo "Choose an option:"
echo ""
echo "1) Start Python backend stack"
echo "2) Start Python backend + beat scheduler"
echo "3) View backend status"
echo "4) Stop all services"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "🔵 Starting Python backend stack..."
        echo ""
        echo "1. Update frontend environment (local dev):"
        echo "   NEXT_PUBLIC_API_URL=http://localhost:8000"
        echo "   For Dockerized frontend: NEXT_PUBLIC_API_URL=http://backend-python:8000"
        echo ""
        echo "2. Start services:"
        echo "   docker compose up -d --build"
        echo ""
        echo "3. Test:"
        echo "   curl http://localhost:8000/health"
        ;;
    2)
        echo "🟡 Starting Python backend + beat scheduler..."
        echo ""
        echo "1. Update frontend environment (local dev):"
        echo "   NEXT_PUBLIC_API_URL=http://localhost:8000"
        echo "   For Dockerized frontend: NEXT_PUBLIC_API_URL=http://backend-python:8000"
        echo ""
        echo "2. Start services:"
        echo "   docker compose --profile python-backend-beat up -d --build"
        echo ""
        echo "3. Run migrations:"
        echo "   docker compose exec backend-python alembic upgrade head"
        echo ""
        echo "4. Test:"
        echo "   curl http://localhost:8000/health"
        ;;
    3)
        echo "📊 Backend Status"
        echo ""
        if docker compose ps | grep -q "backend-python.*Up"; then
            echo "✅ Python backend: Running on port 8000"
        else
            echo "❌ Python backend: Not running"
        fi
        echo ""
        if docker compose ps | grep -q "celery-worker.*Up"; then
            echo "✅ Celery worker: Running"
        else
            echo "❌ Celery worker: Not running"
        fi
        echo ""
        echo "All containers:"
        docker compose ps
        ;;
    4)
        echo "🛑 Stopping all services..."
        docker compose down
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "For more information, see:"
echo "  - PYTHON_BACKEND_MIGRATION_SUMMARY.md"
echo "  - backend-python/DOCKER_PYTHON_BACKEND.md"
echo "  - API_COMPATIBILITY.md"
