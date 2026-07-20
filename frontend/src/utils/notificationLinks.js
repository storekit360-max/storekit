const objectIdPattern = /^[a-f0-9]{24}$/i;
const adminPathPattern = /^\/admin(?:[/?#]|$)/i;
const superAdminPathPattern = /^\/superadmin(?:[/?#]|$)/i;

function supportTicketId(notification) {
  const value = String(notification?.data?.ticketId || '');
  return objectIdPattern.test(value) ? value : '';
}

export function adminNotificationDestination(notification) {
  const link = String(notification?.link || '');
  if (adminPathPattern.test(link)) return link;

  const ticketId = supportTicketId(notification);
  if (ticketId && ['support_ticket', 'support_reply'].includes(notification?.type)) {
    return `/admin/support?ticket=${encodeURIComponent(ticketId)}`;
  }
  return '';
}

export function superAdminNotificationDestination(notification) {
  const link = String(notification?.link || '');
  if (superAdminPathPattern.test(link)) return link;

  const ticketId = supportTicketId(notification);
  if (ticketId && ['support_ticket', 'support_reply'].includes(notification?.type)) {
    return `/superadmin/support-center?ticket=${encodeURIComponent(ticketId)}`;
  }
  return '';
}
