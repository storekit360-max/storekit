'use strict';

const express = require('express');
const { adminAuth } = require('../middleware/auth');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const KnowledgeArticle = require('../models/KnowledgeArticle');
const { createTicket, addMessage } = require('../services/supportService');
const supportRealtime = require('../services/supportRealtimeService');

const router = express.Router();
function tenantId(req) { return req.tenant?._id || req.tenantId || req.user?.tenantId; }
router.get('/knowledge', adminAuth, async (_req, res, next) => { try { res.json(await KnowledgeArticle.find({ status: 'published' }).select('slug title summary body category publishedAt updatedAt').sort({ updatedAt: -1 }).lean()); } catch (error) { next(error); } });
router.get('/stream', adminAuth, (req, res) => supportRealtime.connect(req, res, { tenantId: tenantId(req), userId: req.user._id }));
router.get('/tickets', adminAuth, async (req, res, next) => { try { res.json(await SupportTicket.find({ tenant: tenantId(req) }).populate('assignee', 'firstName lastName').sort({ lastMessageAt: -1 }).lean()); } catch (error) { next(error); } });
router.post('/tickets', adminAuth, async (req, res, next) => { try { if (!req.body?.subject || !req.body?.body) return res.status(400).json({ message: 'Subject and message are required' }); const ticket = await createTicket({ tenant: tenantId(req), requester: req.user._id, subject: String(req.body.subject), body: String(req.body.body), category: req.body.category, priority: req.body.priority }); res.status(201).json(ticket); } catch (error) { next(error); } });
router.get('/tickets/:id', adminAuth, async (req, res, next) => { try { const ticket = await SupportTicket.findOne({ _id: req.params.id, tenant: tenantId(req) }).populate('assignee', 'firstName lastName').lean(); if (!ticket) return res.status(404).json({ message: 'Ticket not found' }); const messages = await SupportMessage.find({ ticket: ticket._id, kind: { $ne: 'internal_note' } }).populate('author', 'firstName lastName role').sort({ createdAt: 1 }).lean(); res.json({ ticket, messages }); } catch (error) { next(error); } });
router.post('/tickets/:id/messages', adminAuth, async (req, res, next) => { try { const ticket = await SupportTicket.findOne({ _id: req.params.id, tenant: tenantId(req) }); if (!ticket) return res.status(404).json({ message: 'Ticket not found' }); if (['resolved','closed'].includes(ticket.status)) return res.status(409).json({ message: 'Reopen the ticket before replying' }); if (!req.body?.body) return res.status(400).json({ message: 'Message is required' }); const message = await addMessage(ticket, { author: req.user._id, body: String(req.body.body) }); res.status(201).json(message); } catch (error) { next(error); } });
router.post('/tickets/:id/reopen', adminAuth, async (req, res, next) => { try { const ticket = await SupportTicket.findOneAndUpdate({ _id: req.params.id, tenant: tenantId(req), status: { $in: ['resolved','closed'] } }, { $set: { status: 'open', resolvedAt: null } }, { new: true }); if (!ticket) return res.status(409).json({ message: 'Only resolved or closed tickets can be reopened' }); res.json(ticket); } catch (error) { next(error); } });
module.exports = router;
