'use strict';

const crypto = require('crypto');
const SupportTicket = require('../models/SupportTicket');
const SupportMessage = require('../models/SupportMessage');
const { withoutTenantScope } = require('../middleware/tenantContext');

const SLA = { low: [24, 120], normal: [8, 72], high: [2, 24], urgent: [1, 8] };
function deadlines(priority, now = new Date()) { const [responseHours, resolutionHours] = SLA[priority] || SLA.normal; return { firstResponseDueAt: new Date(now.getTime() + responseHours * 3600000), resolutionDueAt: new Date(now.getTime() + resolutionHours * 3600000) }; }
function ticketNumber() { return `SK-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }

function tenantTicketView(ticket) {
  const row = ticket?.toObject ? ticket.toObject() : { ...ticket };
  delete row.assignee;
  return row;
}

function tenantMessageView(message, tenantAuthors = new Map()) {
  const row = message?.toObject ? message.toObject() : { ...message };
  const authorId = String(row.author?._id || row.author || '');
  const tenantAuthor = tenantAuthors.get(authorId);
  row.author = tenantAuthor
    ? { firstName: tenantAuthor.firstName || 'Store', lastName: tenantAuthor.lastName || 'Admin', role: 'admin' }
    : { firstName: 'StoreKit', lastName: 'Support', role: 'support' };
  return row;
}

async function createTicket({ tenant, requester, subject, category, priority = 'normal', body }) {
  const now = new Date(); const due = deadlines(priority, now);
  const ticket = await SupportTicket.create({ number: ticketNumber(), tenant, requester, subject, category, priority, ...due, lastMessageAt: now, messageCount: 1 });
  try { await SupportMessage.create({ ticket: ticket._id, tenant, author: requester, kind: 'reply', body }); }
  catch (error) { await SupportTicket.deleteOne({ _id: ticket._id }); throw error; }

  // Create a platform-level notification for super admins
  try {
    const Notification = require('../models/index').Notification;
    const User = require('../models/User');
    const requesterUser = await User.findById(requester).select('firstName lastName email').lean();
    const tenantDoc = await require('../models/Tenant').findById(tenant).select('storeName').lean();
    await withoutTenantScope(() => Notification.create({
      tenantId: null,
      type: 'support_ticket',
      title: `New Support Ticket: ${subject}`,
      message: `${tenantDoc?.storeName || 'A store'} — ${requesterUser?.firstName || 'Admin'} ${requesterUser?.lastName || ''} opened ticket #${ticket.number}`,
      link: `/superadmin/support-center?ticket=${ticket._id}`,
      data: { ticketId: String(ticket._id), tenantId: String(tenant), requesterId: String(requester), ticketNumber: ticket.number },
    }));
  } catch (error) {
    console.error('[SUPPORT_NOTIFICATION_FAILED]', error.message);
  }

  // Create a tenant-level notification for admin users
  try {
    const Notification = require('../models/index').Notification;
    const User = require('../models/User');
    const requesterUser = await User.findById(requester).select('firstName lastName email').lean();
    await Notification.create({
      tenantId: tenant, // tenant-level notification
      type: 'support_ticket',
      title: `New Support Ticket: ${subject}`,
      message: `${requesterUser?.firstName || 'Customer'} ${requesterUser?.lastName || ''} opened ticket #${ticket.number}`,
      link: `/admin/support?ticket=${ticket._id}`,
      data: { ticketId: String(ticket._id), tenantId: String(tenant), requesterId: String(requester), ticketNumber: ticket.number },
    });
  } catch (error) {
    console.error('[SUPPORT_TENANT_NOTIFICATION_FAILED]', error.message);
  }

  return ticket;
}

async function addMessage(ticket, { author, body, kind = 'reply', platformAgent = false }) {
  const message = await SupportMessage.create({ ticket: ticket._id, tenant: ticket.tenant, author, body, kind });
  const update = { $set: { lastMessageAt: message.createdAt }, $inc: { messageCount: 1 } };
  if (platformAgent && kind !== 'internal_note' && !ticket.firstRespondedAt) update.$set.firstRespondedAt = message.createdAt;
  if (kind !== 'internal_note') update.$set.status = platformAgent ? 'pending_customer' : 'open';
  await SupportTicket.updateOne({ _id: ticket._id }, update);

  // Create a tenant-level notification for admin when super admin replies
  if (platformAgent && kind === 'reply') {
    try {
      const Notification = require('../models/index').Notification;
      await Notification.create({
        tenantId: ticket.tenant, // tenant-level notification
        type: 'support_reply',
        title: `Support Reply: ${ticket.subject}`,
        message: `StoreKit Support replied to ticket #${ticket.number}`,
        link: `/admin/support?ticket=${ticket._id}`,
        data: { ticketId: String(ticket._id), ticketNumber: ticket.number },
      });
    } catch (error) {
      console.error('[SUPPORT_REPLY_TENANT_NOTIFICATION_FAILED]', error.message);
    }
  }

  // Create platform-level notification for super admin when admin replies
  if (!platformAgent && kind === 'reply') {
    try {
      const Notification = require('../models/index').Notification;
      const User = require('../models/User');
      const adminUser = await User.findById(author).select('firstName lastName').lean();
      const tenantDoc = await require('../models/Tenant').findById(ticket.tenant).select('storeName').lean();
      await withoutTenantScope(() => Notification.create({
        tenantId: null,
        type: 'support_reply',
        title: `Support Reply: ${ticket.subject}`,
        message: `${tenantDoc?.storeName || 'A store'} — ${adminUser?.firstName || 'Admin'} ${adminUser?.lastName || ''} replied to ticket #${ticket.number}`,
        link: `/superadmin/support-center?ticket=${ticket._id}`,
        data: { ticketId: String(ticket._id), tenantId: String(ticket.tenant), adminId: String(author), ticketNumber: ticket.number },
      }));
    } catch (error) {
      console.error('[SUPPORT_REPLY_PLATFORM_NOTIFICATION_FAILED]', error.message);
    }
  }

  return message;
}

module.exports = { SLA, deadlines, createTicket, addMessage, tenantTicketView, tenantMessageView };
