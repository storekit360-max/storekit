'use strict';

const crypto = require('crypto');
const SupportMessage = require('../models/SupportMessage');
const SupportTicket = require('../models/SupportTicket');

const POLL_MS = 1500;
const HEARTBEAT_MS = 15000;
const MAX_CLIENTS = 500;
const MAX_PER_USER = 3;
const clients = new Map();
let pollTimer = null;
let polling = false;
let messageCursor = { at: new Date(), id: null };
let ticketCursor = { at: new Date(), id: null };

function cursorFilter(cursor) {
  if (!cursor.id) return { updatedAt: { $gt: cursor.at } };
  return { $or: [{ updatedAt: { $gt: cursor.at } }, { updatedAt: cursor.at, _id: { $gt: cursor.id } }] };
}

function visibleToClient(client, event) {
  if (client.platform) return true;
  return event.kind !== 'internal_note' && String(event.tenantId || '') === String(client.tenantId || '');
}

function writeEvent(client, event, payload) {
  if (!visibleToClient(client, payload)) return;
  try {
    client.res.write(`id: ${payload.eventId}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    client.res.flush?.();
  } catch (_) { removeClient(client.id); }
}

function broadcast(event, payload) {
  for (const client of clients.values()) writeEvent(client, event, payload);
}

async function pollCollection(Model, cursor, type) {
  const rows = await Model.find(cursorFilter(cursor)).select('_id tenant ticket kind updatedAt').sort({ updatedAt: 1, _id: 1 }).limit(500).lean();
  for (const row of rows) {
    const payload = { eventId: `${type}:${row._id}:${new Date(row.updatedAt).getTime()}`, type, resourceId: String(row._id), ticketId: String(row.ticket || row._id), tenantId: String(row.tenant), kind: row.kind || '', committedAt: row.updatedAt };
    broadcast(type, payload);
    cursor.at = new Date(row.updatedAt); cursor.id = row._id;
  }
}

async function poll() {
  if (polling || !clients.size) return;
  polling = true;
  try {
    await Promise.all([pollCollection(SupportMessage, messageCursor, 'support.message'), pollCollection(SupportTicket, ticketCursor, 'support.ticket')]);
  } catch (error) {
    console.error('[SUPPORT_REALTIME_POLL_FAILED]', error.message);
  } finally { polling = false; }
}

function startPolling() {
  if (pollTimer) return;
  // Small overlap closes the race between endpoint authentication and timer start.
  // Duplicate notifications are harmless because clients refetch authoritative state.
  messageCursor = { at: new Date(Date.now() - 1000), id: null }; ticketCursor = { at: new Date(Date.now() - 1000), id: null };
  pollTimer = setInterval(poll, POLL_MS); pollTimer.unref?.();
}

function stopPollingIfIdle() {
  if (!clients.size && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function removeClient(id) {
  const client = clients.get(id);
  if (!client) return;
  clearInterval(client.heartbeat); clients.delete(id); stopPollingIfIdle();
}

function connect(req, res, { platform = false, tenantId = null, userId }) {
  const sameUser = Array.from(clients.values()).filter(client => String(client.userId) === String(userId)).length;
  if (clients.size >= MAX_CLIENTS || sameUser >= MAX_PER_USER) return res.status(429).json({ message: 'Too many realtime support connections' });
  res.status(200);
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const id = crypto.randomUUID();
  const client = { id, res, platform, tenantId: tenantId ? String(tenantId) : '', userId: String(userId), heartbeat: null };
  clients.set(id, client); startPolling();
  res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ connectionId: id, pollMs: POLL_MS })}\n\n`); res.flush?.();
  client.heartbeat = setInterval(() => { try { res.write(`: heartbeat ${Date.now()}\n\n`); res.flush?.(); } catch (_) { removeClient(id); } }, HEARTBEAT_MS);
  client.heartbeat.unref?.();
  req.on('close', () => removeClient(id));
  return undefined;
}

function health() { return { transport: 'sse', durability: 'mongodb_polling', connectedClients: clients.size, maxClients: MAX_CLIENTS, maxPerUser: MAX_PER_USER, pollMs: POLL_MS, polling: Boolean(pollTimer) }; }

module.exports = { HEARTBEAT_MS, MAX_CLIENTS, MAX_PER_USER, POLL_MS, connect, health, visibleToClient };
