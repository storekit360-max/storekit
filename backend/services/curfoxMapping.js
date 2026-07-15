'use strict';

function normalizeSriLankanPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Phone number is required');
  if ((raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+')) || (raw.match(/-/g) || []).length > 2) {
    throw new Error('Invalid phone format');
  }
  let digits = raw.replace(/[\s()\-]/g, '').replace(/^\+/, '');
  if (!/^\d{8,13}$/.test(digits)) throw new Error('Phone must contain 8 to 13 digits');
  if (digits.startsWith('0094')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('94')) digits = '0' + digits.slice(2);
  if (!/^0\d{9}$/.test(digits)) throw new Error('Enter a valid Sri Lankan phone number');
  return digits;
}

function providerRows(responseData) {
  const body = responseData?.data ?? responseData;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

const GENERIC_ADDRESS = /^(sri lanka|lk|other|road|rd|street|st|lane|ln|junction|building|floor|no\.?\s*\d*|\d+[a-z\/-]*)$/i;
function clean(value) { return String(value || '').trim().replace(/\s+/g, ' '); }

function resolveDestinationCity(savedCity, fullAddress, cities) {
  const valid = (cities || []).filter(c => c?.name && c?.state?.name);
  const matchExact = value => {
    const sought = clean(value).toLocaleLowerCase('en');
    if (!sought || sought === 'other') return null;
    const matches = valid.filter(c => clean(c.name).toLocaleLowerCase('en') === sought);
    if (matches.length === 1) return { city: matches[0].name, state: matches[0].state.name, cityId: matches[0].id, stateId: matches[0].state.id };
    if (matches.length > 1) return { ambiguous: true, matches: matches.map(c => ({ city: c.name, state: c.state.name, cityId: c.id })) };
    return null;
  };
  const saved = matchExact(savedCity);
  if (saved) return saved;
  const segments = clean(fullAddress).split(',').map(clean).filter(Boolean).reverse();
  for (const segment of segments) {
    if (GENERIC_ADDRESS.test(segment) || /\b(road|rd|street|st|lane|avenue|mawatha|house|floor|building)\b/i.test(segment)) continue;
    const match = matchExact(segment);
    if (match) return match;
  }
  return { city: '', state: '', unresolved: true };
}

function calculatePackageWeight(orderItems, products, defaultWeight, override) {
  if (override != null && override !== '') {
    const weight = Number(override);
    if (!(weight > 0)) throw new Error('Package weight must be greater than zero');
    return weight;
  }
  const byId = new Map((products || []).map(p => [String(p._id), Number(p.weight)]));
  let total = 0;
  let complete = true;
  for (const item of orderItems || []) {
    const weight = byId.get(String(item.product));
    if (!(weight > 0)) { complete = false; break; }
    total += weight * Number(item.quantity || 0);
  }
  if (complete && total > 0) return total;
  const fallback = Number(defaultWeight);
  if (!(fallback > 0)) throw new Error('Configure a Curfox default package weight greater than zero');
  return fallback;
}

function curfoxCodAmount(order) { return order?.paymentMethod === 'cod' ? Number(order.total || 0) : 0; }
function applyManualWaybill(row, enabled, value) { const waybill=String(value||'').trim();if(enabled&&waybill)row.waybill_number=waybill;return row; }
function canSubmitToCurfox(order) { return String(order?.deliveryService||'').toLowerCase()==='curfox'&&['confirmed','processing'].includes(order?.orderStatus); }
function shouldSyncCurfoxOrder(order) { return String(order?.deliveryService||'').toLowerCase()==='curfox'&&['shipped','out_for_delivery'].includes(order?.orderStatus)&&order?.courier?.provider==='curfox'&&order?.courier?.submissionState==='submitted'&&order?.courier?.dryRun!==true&&Boolean(order?.courier?.waybill); }

function compactStatusHistory(history) {
  const compacted = [];
  for (const row of history || []) {
    const previous = compacted[compacted.length - 1];
    if (previous && previous.status === row.status) {
      const notes = [previous.note, row.note].filter(Boolean);
      previous.note = [...new Set(notes.flatMap(n => String(n).split(' • ')).map(n => n.trim()).filter(Boolean))].join(' • ');
      if (new Date(row.updatedAt || 0) > new Date(previous.updatedAt || 0)) previous.updatedAt = row.updatedAt;
    } else compacted.push(typeof row.toObject === 'function' ? row.toObject() : { ...row });
  }
  return compacted;
}

function mergeCourierIntoProcessing(history, note, updatedBy = 'system') {
  const rows = (history || []).map(row => typeof row.toObject === 'function' ? row.toObject() : { ...row });
  const last = rows[rows.length - 1];
  if (last?.status === 'processing') {
    last.note = [...new Set([last.note, note].filter(Boolean))].join(' • ');
    return rows;
  }
  rows.push({ status: 'processing', note, updatedBy, updatedAt: new Date() });
  return rows;
}

const RANK = { pending: 0, confirmed: 1, processing: 2, shipped: 3, out_for_delivery: 4, delivered: 5 };
function mapCurfoxStatus(externalStatus, localStatus) {
  const status = String(externalStatus || '').trim().toUpperCase().replace(/_/g, ' ');
  if (status === 'CANCELLED') return 'cancelled';
  if (['DELIVERED','DELIVERED BY PICKUP RIDER'].includes(status)) return 'delivered';
  if (status === 'PARTIALLY DELIVERED') return localStatus;
  if (status === 'ASSIGNED TO DESTINATION RIDER') return RANK[localStatus] > RANK.out_for_delivery ? localStatus : 'out_for_delivery';
  if (['PICKED UP','DISPATCH TO ORIGIN WAREHOUSE','DISPATCHED FROM ORIGIN WAREHOUSE','RECEIVED AT DESTINATION WAREHOUSE'].includes(status)) return RANK[localStatus] >= RANK.shipped ? localStatus : 'shipped';
  if (status && !['DRAFT','CONFIRMED'].includes(status)) return RANK[localStatus] >= RANK.processing ? localStatus : 'processing';
  return localStatus;
}

module.exports = { normalizeSriLankanPhone, providerRows, resolveDestinationCity, calculatePackageWeight, curfoxCodAmount, applyManualWaybill, canSubmitToCurfox, shouldSyncCurfoxOrder, compactStatusHistory, mergeCourierIntoProcessing, mapCurfoxStatus };
