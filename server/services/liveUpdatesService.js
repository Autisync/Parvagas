const clients = new Map();

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerLiveUpdatesClient(req, res) {
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  clients.set(clientId, res);
  writeSse(res, "ready", { ts: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    if (!clients.has(clientId)) return;
    writeSse(res, "heartbeat", { ts: new Date().toISOString() });
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
  });
}

export function publishLiveUpdate(update = {}) {
  if (!clients.size) return;

  const payload = {
    scope: update.scope || "global",
    entity: update.entity || "app",
    action: update.action || "changed",
    path: update.path || "",
    ts: new Date().toISOString(),
  };

  for (const [id, res] of clients.entries()) {
    try {
      writeSse(res, "invalidate", payload);
    } catch {
      clients.delete(id);
    }
  }
}
