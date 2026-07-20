'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const KnowledgeArticle = require('../models/KnowledgeArticle');
const User = require('../models/User');
const { createTicket, addMessage, tenantTicketView, tenantMessageView } = require('../services/supportService');
const supportRealtime = require('../services/supportRealtimeService');

const router = express.Router();
function tenantId(req) { return req.tenant?._id || req.tenantId || req.user?.tenantId; }
router.get('/knowledge', adminAuth, async (_req, res, next) => { try { res.json(await KnowledgeArticle.find({ status: 'published' }).select('slug title summary body category publishedAt updatedAt').sort({ updatedAt: -1 }).lean()); } catch (error) { next(error); } });
router.get('/stream', adminAuth, (req, res) => supportRealtime.connect(req, res, { tenantId: tenantId(req), userId: req.user._id }));
router.get('/tickets', adminAuth, async (req, res, next) => { try { const tickets = await SupportTicket.find({ tenant: tenantId(req) }).sort({ lastMessageAt: -1 }).lean(); res.json(tickets.map(tenantTicketView)); } catch (error) { next(error); } });
router.post('/tickets', adminAuth, async (req, res, next) => { try { if (!req.body?.subject || !req.body?.body) return res.status(400).json({ message: 'Subject and message are required' }); const ticket = await createTicket({ tenant: tenantId(req), requester: req.user._id, subject: String(req.body.subject), body: String(req.body.body), category: req.body.category, priority: req.body.priority }); res.status(201).json(ticket); } catch (error) { next(error); } });
router.get('/tickets/:id', adminAuth, async (req, res, next) => { try { const activeTenantId = tenantId(req); const ticket = await SupportTicket.findOne({ _id: req.params.id, tenant: activeTenantId }).lean(); if (!ticket) return res.status(404).json({ message: 'Ticket not found' }); const messages = await SupportMessage.find({ ticket: ticket._id, kind: { $ne: 'internal_note' } }).sort({ createdAt: 1 }).lean(); const authorIds = Array.from(new Set(messages.map(item => String(item.author || '')).filter(Boolean))); const tenantUsers = await User.find({ _id: { $in: authorIds }, tenantId: activeTenantId }).select('firstName lastName').lean(); const tenantAuthors = new Map(tenantUsers.map(item => [String(item._id), item])); res.json({ ticket: tenantTicketView(ticket), messages: messages.map(item => tenantMessageView(item, tenantAuthors)) }); } catch (error) { next(error); } });
router.post('/tickets/:id/messages', adminAuth, async (req, res, next) => { try { const ticket = await SupportTicket.findOne({ _id: req.params.id, tenant: tenantId(req) }); if (!ticket) return res.status(404).json({ message: 'Ticket not found' }); if (['resolved','closed'].includes(ticket.status)) return res.status(409).json({ message: 'Reopen the ticket before replying' }); if (!req.body?.body) return res.status(400).json({ message: 'Message is required' }); const message = await addMessage(ticket, { author: req.user._id, body: String(req.body.body) }); res.status(201).json(message); } catch (error) { next(error); } });
router.post('/tickets/:id/reopen', adminAuth, async (req, res, next) => { try { const ticket = await SupportTicket.findOneAndUpdate({ _id: req.params.id, tenant: tenantId(req), status: { $in: ['resolved','closed'] } }, { $set: { status: 'open', resolvedAt: null } }, { new: true }); if (!ticket) return res.status(409).json({ message: 'Only resolved or closed tickets can be reopened' }); res.json(tenantTicketView(ticket)); } catch (error) { next(error); } });
module.exports = router;
