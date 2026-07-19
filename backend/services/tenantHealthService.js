'use strict';

function calculateTenantHealth(tenant, usage = {}, now = new Date()) {
  let score = 100;
  const signals = [];
  const subtract = (points, code, label, severity) => { score -= points; signals.push({ code, label, severity, points }); };

  if (tenant.status !== 'active') subtract(40, 'tenant_inactive', 'Tenant is not active', 'critical');
  const subscriptionStatus = tenant.billing?.subscriptionStatus || tenant.subscription?.status;
  if (['past_due', 'grace'].includes(subscriptionStatus)) subtract(30, 'billing_past_due', 'Subscription payment is past due', 'critical');
  if (subscriptionStatus === 'cancelled') subtract(40, 'subscription_cancelled', 'Subscription is cancelled', 'critical');
  if (!(tenant.domains || []).some(domain => domain.active && domain.verified)) subtract(10, 'domain_unverified', 'No verified active domain', 'warning');
  if (Number(usage.activeAdmins || 0) === 0) subtract(25, 'no_active_admin', 'No active tenant administrator', 'critical');
  if (Number(usage.activeProducts || 0) === 0) subtract(10, 'no_active_products', 'No active products', 'warning');
  if (usage.lastOrderAt) {
    const inactiveDays = Math.floor((now.getTime() - new Date(usage.lastOrderAt).getTime()) / 86400000);
    if (inactiveDays > 30) subtract(5, 'sales_inactive', `No order in ${inactiveDays} days`, 'info');
  }
  if (tenant.management?.archivedAt) subtract(50, 'tenant_archived', 'Tenant is archived', 'critical');

  score = Math.max(0, Math.min(100, score));
  const band = score >= 85 ? 'healthy' : score >= 65 ? 'attention' : score >= 40 ? 'at-risk' : 'critical';
  return { score, riskScore: 100 - score, band, signals };
}

module.exports = { calculateTenantHealth };
