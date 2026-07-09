/**
 * Example components using WebSocket for real-time updates.
 */

'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useWebSocket,
  useWebSocketMessages,
  useWebSocketSubscription,
  useWebSocketStats,
} from '@/hooks/useWebSocket';

/**
 * Example: Real-time resume scoring updates
 */
export function ResumeScoreUpdates() {
  const { token } = useAuth();
  const ws = useWebSocket(token, {
    autoConnect: true,
    onConnect: () => console.log('✓ Connected to resume scoring channel'),
    onError: (error) => console.error('✗ WebSocket error:', error),
  });

  const updates = useWebSocketMessages(
    ws.client,
    'resume_score_progress'
  );

  useWebSocketSubscription(
    ws.client,
    'resume_scores',
    undefined,
    ws.isConnected
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Resume Scoring Updates</h2>
      
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${ws.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm">
          {ws.state === 'connected' ? 'Connected' : `${ws.state}`}
        </span>
      </div>

      <div className="space-y-2">
        {updates.length === 0 ? (
          <p className="text-gray-500">No updates yet...</p>
        ) : (
          updates.map((update, idx) => (
            <div key={idx} className="p-3 bg-gray-100 rounded">
              <p className="font-medium">{update.message}</p>
              {update.progress && (
                <div className="mt-2 bg-gray-300 rounded h-2">
                  <div
                    className="bg-blue-500 h-2 rounded transition-all"
                    style={{ width: `${update.progress}%` }}
                  />
                </div>
              )}
              <small className="text-gray-600">
                {new Date(update.timestamp).toLocaleTimeString()}
              </small>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Example: Real-time profile view counter
 */
export function ProfileViewCounter() {
  const { token, user } = useAuth();
  const [viewCount, setViewCount] = useState(0);

  const ws = useWebSocket(token, { autoConnect: true });

  useWebSocketSubscription(
    ws.client,
    'profile_views',
    (message) => {
      if (message.type === 'profile_viewed') {
        setViewCount((prev) => prev + 1);
      }
    },
    ws.isConnected
  );

  return (
    <div className="p-4 bg-blue-50 rounded border border-blue-200">
      <h3 className="font-semibold">Profile Views Today</h3>
      <p className="text-3xl font-bold text-blue-600">{viewCount}</p>
    </div>
  );
}

/**
 * Example: WebSocket connection status dashboard
 */
export function WebSocketDashboard() {
  const { token } = useAuth();
  const ws = useWebSocket(token, { autoConnect: true });
  const stats = useWebSocketStats(ws.client, 5000);

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded">
      <h2 className="text-lg font-bold">WebSocket Status</h2>

      <div className="grid grid-cols-2 gap-4">
        {/* Connection State */}
        <div>
          <p className="text-sm text-gray-600">Status</p>
          <p className={`font-bold ${ws.isConnected ? 'text-green-600' : 'text-red-600'}`}>
            {ws.state.toUpperCase()}
          </p>
        </div>

        {/* Connection Count */}
        {stats && (
          <>
            <div>
              <p className="text-sm text-gray-600">Active Users</p>
              <p className="font-bold">{stats.total_users}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Connections</p>
              <p className="font-bold">{stats.total_connections}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => ws.connect()}
          disabled={ws.isConnected}
          className="px-3 py-1 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Connect
        </button>
        <button
          onClick={() => ws.disconnect()}
          disabled={!ws.isConnected}
          className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

/**
 * Example: Collaborative editing with real-time cursor positions
 */
export function CollaborativeEditor() {
  const { token, user } = useAuth();
  const [cursorPosition, setCursorPosition] = useState(0);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, number>>({});

  const ws = useWebSocket(token, { autoConnect: true });

  // Subscribe to cursor updates
  useWebSocketSubscription(
    ws.client,
    'editor_cursors',
    (message) => {
      if (message.type === 'cursor_position') {
        setRemoteCursors((prev) => ({
          ...prev,
          [message.user_id]: message.position,
        }));
      }
    },
    ws.isConnected
  );

  const handleCursorChange = (position: number) => {
    setCursorPosition(position);
    
    // Broadcast cursor position
    if (ws.client?.isConnected()) {
      ws.client.send({
        type: 'update_cursor',
        position,
        user_id: user?.id,
      });
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Collaborative Editor</h3>
      
      <textarea
        value=""
        onChange={(e) => handleCursorChange(e.currentTarget.selectionStart)}
        className="w-full h-48 p-2 border rounded font-mono"
        placeholder="Type here..."
      />

      <div className="text-sm text-gray-600">
        <p>Your cursor: {cursorPosition}</p>
        {Object.entries(remoteCursors).map(([userId, position]) => (
          <p key={userId}>
            {userId}&apos;s cursor: {position}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Example: Real-time notifications
 */
export function RealtimeNotifications() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);

  const ws = useWebSocket(token, { autoConnect: true });

  useWebSocketSubscription(
    ws.client,
    'notifications',
    (message) => {
      if (['notification', 'alert', 'message'].includes(message.type)) {
        setNotifications((prev) => [message, ...prev].slice(0, 10));
      }
    },
    ws.isConnected
  );

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Notifications ({notifications.length})</h3>
      
      <div className="max-h-80 overflow-y-auto space-y-2">
        {notifications.map((notif, idx) => (
          <div
            key={idx}
            className="p-2 bg-blue-50 border border-blue-200 rounded text-sm"
          >
            <p className="font-medium">{notif.title}</p>
            <p className="text-gray-600">{notif.message}</p>
            <small className="text-gray-500">
              {new Date(notif.timestamp).toLocaleTimeString()}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
