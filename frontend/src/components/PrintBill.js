import React, { useEffect, useState } from 'react';
import API from '../utils/api';

export default function PrintBill({ order, trigger }) {
  const [storeSettings, setStoreSettings] = useState(null);

  useEffect(() => {
    API.get('/settings', { skipCache: true }).then(r => setStoreSettings(r.data)).catch(() => {});
  }, []);

  const handlePrint = () => {
    if (!order || !storeSettings) return;

    const s = storeSettings;
    const storeName    = s.storeName    || 'StoreKit';
    const storeTagline = s.storeTagline || '';
    const storeEmail   = s.storeEmail   || '';
    const storePhone   = s.storePhone   || s.phone || '';
    const storeAddress = s.storeAddress || '';
    const logoUrl      = String(s.logoUrl || s.storeLogo || s.logo || '').replace(/^http:\/\//i, 'https://');
    const primaryColor = s.primaryColor || '#4f46e5';

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' });
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
    const fmtCurrency = (n) => 'Rs.\u00a0' + Number(n || 0).toLocaleString('en-LK');

    // Safe accessors — no mixed && / ||
    const b = order.billing  || {};
    const sh = order.shipping || {};

    const billingName  = ((b.firstName || '') + ' ' + (b.lastName || '')).trim();
    const shippingName = (((sh.firstName || b.firstName || '') + ' ' + (sh.lastName || b.lastName || '')).trim());
    const billingAddr  = [b.street, b.city, b.country].filter(Boolean).join(', ');
    const shippingAddr = [(sh.street || b.street), (sh.city || b.city), (sh.country || b.country)].filter(Boolean).join(', ');
    const shippingPhone = sh.phone || '';

    const itemRows = (order.items || []).map(function(item) {
      return '<tr>'
        + '<td class="td-item">'
        + '<div class="item-name">' + (item.name || '') + '</div>'
        + (item.sku ? '<div class="item-sub">SKU: ' + item.sku + '</div>' : '')
        + (item.variant ? '<div class="item-sub">Variant: ' + item.variant + '</div>' : '')
        + '</td>'
        + '<td class="td-center">' + (item.quantity || 1) + '</td>'
        + '<td class="td-right">' + fmtCurrency(item.price) + '</td>'
        + '<td class="td-right td-bold">' + fmtCurrency(item.subtotal || (item.price * item.quantity)) + '</td>'
        + '</tr>';
    }).join('');

    const paymentMethodLabel = order.paymentMethod === 'bank_transfer' ? 'Bank Transfer'
      : order.paymentMethod === 'cod' ? 'Cash on Delivery'
      : (order.paymentMethod || '').replace(/_/g, ' ');

    const payBadgeColor = order.paymentStatus === 'paid' ? '#16a34a'
      : order.paymentStatus === 'pending' ? '#d97706' : '#dc2626';
    const payBadgeBg = order.paymentStatus === 'paid' ? '#dcfce7'
      : order.paymentStatus === 'pending' ? '#fef3c7' : '#fee2e2';
    const payBadgeLabel = (order.paymentStatus || '').toUpperCase();

    const couponHtml = order.couponDiscount > 0
      ? '<div class="tot-row discount"><span>Coupon' + (order.couponCode ? ' (' + order.couponCode + ')' : '') + '</span><span>-' + fmtCurrency(order.couponDiscount) + '</span></div>'
      : '';
    const giftHtml = ((order.giftCardDeduction || 0) + (order.giftCardDiscount || 0)) > 0
      ? '<div class="tot-row discount gift"><span>Gift Card</span><span>-' + fmtCurrency(order.giftCardDeduction || order.giftCardDiscount) + '</span></div>'
      : '';
    const trackingHtml = order.trackingNumber
      ? '<div class="pay-detail"><span>Tracking</span><strong class="mono">' + order.trackingNumber + '</strong></div>'
      : '';
    const courierHtml = order.deliveryPartner
      ? '<div class="pay-detail"><span>Courier</span><strong>' + order.deliveryPartner + '</strong></div>'
      : '';
    const notesHtml = order.notes
      ? '<div class="note-box"><div class="note-label">Customer Note</div><p class="note-text">' + order.notes + '</p></div>'
      : '';
    const logoHtml = logoUrl
      ? '<div class="logo-panel"><img src="' + logoUrl + '" alt="' + storeName + '" class="logo-img" onerror="this.hidden=true;this.nextElementSibling.hidden=false"/><div class="logo-fallback" hidden>' + storeName + '</div></div>'
      : '<div class="logo-panel"><div class="logo-fallback">' + storeName + '</div></div>';
    const watermarkCss = order.paymentStatus !== 'paid'
      ? '.wm{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-38deg);font-size:100px;font-weight:900;color:rgba(239,68,68,0.055);pointer-events:none;z-index:0;white-space:nowrap;letter-spacing:10px;user-select:none;}'
      : '';
    const watermarkHtml = order.paymentStatus !== 'paid' ? '<div class="wm">UNPAID</div>' : '';

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>'
      + '<title>Invoice \u2013 ' + order.orderNumber + '</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>'
      + '<style>'
      + '*{margin:0;padding:0;box-sizing:border-box;}'
      + 'body{font-family:"Inter",sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '.page{max-width:820px;margin:0 auto;padding:0;}'

      /* Header gradient strip */
      + '.header{background:linear-gradient(135deg,' + primaryColor + ' 0%,' + primaryColor + 'cc 100%);padding:32px 40px;display:flex;justify-content:space-between;align-items:center;}'
      + '.logo-panel{min-width:120px;min-height:72px;max-width:320px;padding:8px 14px;border-radius:10px;background:rgba(255,255,255,.94);display:inline-flex;align-items:center;justify-content:flex-start;}'
      + '.logo-img{display:block;height:84px;object-fit:contain;object-position:left center;max-width:290px;filter:none;}'
      + '.logo-fallback{font-size:30px;font-weight:900;color:#0f172a;letter-spacing:-1px;line-height:1.05;}'
      + '.store-tagline{font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;}'
      + '.inv-title{text-align:right;}'
      + '.inv-word{font-size:36px;font-weight:900;color:#fff;letter-spacing:-1px;text-transform:uppercase;line-height:1;}'
      + '.inv-num{font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);margin-top:6px;letter-spacing:1px;}'
      + '.inv-date{font-size:11px;color:rgba(255,255,255,0.65);margin-top:3px;}'

      /* Info grid */
      + '.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:1px solid #e2e8f0;}'
      + '.info-box{padding:22px 26px;border-right:1px solid #e2e8f0;}'
      + '.info-box:last-child{border-right:none;}'
      + '.info-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:' + primaryColor + ';margin-bottom:10px;}'
      + '.info-name{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:5px;}'
      + '.info-detail{font-size:12px;color:#64748b;line-height:1.9;}'

      /* Table */
      + '.table-wrap{padding:28px 32px;}'
      + 'table{width:100%;border-collapse:collapse;}'
      + 'thead tr{border-bottom:2px solid ' + primaryColor + ';}'
      + 'thead th{padding:10px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:' + primaryColor + ';text-align:left;}'
      + 'thead th.th-c{text-align:center;}'
      + 'thead th.th-r{text-align:right;}'
      + 'tbody tr{border-bottom:1px solid #f1f5f9;transition:background 0.1s;}'
      + 'tbody tr:last-child{border-bottom:none;}'
      + '.td-item{padding:13px 10px;}'
      + '.item-name{font-size:13px;font-weight:600;color:#0f172a;}'
      + '.item-sub{font-size:11px;color:#94a3b8;margin-top:2px;}'
      + '.td-center{padding:13px 10px;text-align:center;font-size:13px;color:#475569;}'
      + '.td-right{padding:13px 10px;text-align:right;font-size:13px;color:#475569;}'
      + '.td-bold{font-weight:700;color:#0f172a;}'

      /* Totals */
      + '.totals-section{display:flex;justify-content:flex-end;padding:0 32px 28px;}'
      + '.totals{width:300px;background:#f8faff;border-radius:12px;padding:18px 20px;border:1px solid #e2e8f0;}'
      + '.tot-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#64748b;border-bottom:1px solid #e9ecf5;}'
      + '.tot-row:last-child{border-bottom:none;}'
      + '.discount{color:#16a34a;}'
      + '.gift{color:#7c3aed;}'
      + '.tot-grand{display:flex;justify-content:space-between;padding:12px 0 0;font-size:17px;font-weight:800;color:#0f172a;border-top:2px solid ' + primaryColor + ';margin-top:6px;}'

      /* Payment strip */
      + '.pay-strip{margin:0 32px 24px;background:#f8faff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}'
      + '.pay-method-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px;}'
      + '.pay-method-val{font-size:14px;font-weight:700;color:#0f172a;}'
      + '.pay-badge{padding:5px 14px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:0.8px;background:' + payBadgeBg + ';color:' + payBadgeColor + ';}'
      + '.pay-detail{font-size:12px;color:#64748b;display:flex;gap:8px;}'
      + '.pay-detail span{color:#94a3b8;}'
      + '.mono{font-family:monospace;color:#0f172a;}'

      /* Note */
      + '.note-box{margin:0 32px 24px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;}'
      + '.note-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#b45309;margin-bottom:5px;}'
      + '.note-text{font-size:13px;color:#78350f;line-height:1.6;}'

      /* Footer */
      + '.footer{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:24px 40px;display:flex;justify-content:space-between;align-items:center;}'
      + '.footer-thanks{font-size:16px;font-weight:800;color:#fff;}'
      + '.footer-sub{font-size:11px;color:#94a3b8;margin-top:3px;}'
      + '.footer-contact{text-align:right;font-size:11px;color:#94a3b8;line-height:2;}'

      + watermarkCss
      + '@media print{.no-print{display:none!important;}}'
      + '</style></head><body>'
      + watermarkHtml

      /* Print controls */
      + '<div class="no-print" style="padding:14px 32px;background:#f8faff;border-bottom:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;">'
      + '<button onclick="window.print()" style="background:' + primaryColor + ';color:#fff;border:none;padding:10px 26px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.3px;">Print / Save PDF</button>'
      + '<button onclick="window.close()" style="background:#fff;color:#64748b;border:1px solid #e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Close</button>'
      + '</div>'

      + '<div class="page">'

      /* HEADER */
      + '<div class="header">'
      + '<div>' + logoHtml + (storeTagline ? '<div class="store-tagline">' + storeTagline + '</div>' : '') + '</div>'
      + '<div class="inv-title"><div class="inv-word">Invoice</div><div class="inv-num"># ' + order.orderNumber + '</div><div class="inv-date">' + fmtDate(order.createdAt) + ' &nbsp; ' + fmtTime(order.createdAt) + '</div></div>'
      + '</div>'

      /* INFO GRID */
      + '<div class="info-grid">'
      + '<div class="info-box"><div class="info-label">Billed To</div><div class="info-name">' + billingName + '</div><div class="info-detail">' + (b.email ? b.email + '<br/>' : '') + (b.phone ? b.phone + '<br/>' : '') + billingAddr + '</div></div>'
      + '<div class="info-box"><div class="info-label">Shipped To</div><div class="info-name">' + shippingName + '</div><div class="info-detail">' + shippingAddr + (shippingPhone ? '<br/>' + shippingPhone : '') + '</div></div>'
      + '<div class="info-box"><div class="info-label">From</div><div class="info-name">' + storeName + '</div><div class="info-detail">' + (storeEmail ? storeEmail + '<br/>' : '') + (storePhone ? storePhone + '<br/>' : '') + storeAddress + '</div></div>'
      + '</div>'

      /* ITEMS TABLE */
      + '<div class="table-wrap">'
      + '<table><thead><tr><th>Description</th><th class="th-c">Qty</th><th class="th-r">Unit Price</th><th class="th-r">Amount</th></tr></thead>'
      + '<tbody>' + itemRows + '</tbody></table>'
      + '</div>'

      /* TOTALS */
      + '<div class="totals-section"><div class="totals">'
      + '<div class="tot-row"><span>Subtotal</span><span>' + fmtCurrency(order.subtotal) + '</span></div>'
      + couponHtml
      + giftHtml
      + '<div class="tot-row"><span>Shipping</span><span>' + fmtCurrency(order.shippingCost) + '</span></div>'
      + '<div class="tot-grand"><span>Total</span><span>' + fmtCurrency(order.total) + '</span></div>'
      + '</div></div>'

      /* PAYMENT STRIP */
      + '<div class="pay-strip">'
      + '<div><div class="pay-method-label">Payment Method</div><div class="pay-method-val">' + paymentMethodLabel + '</div></div>'
      + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;"><span class="pay-badge">' + payBadgeLabel + '</span>' + trackingHtml + courierHtml + '</div>'
      + '</div>'

      + notesHtml

      /* FOOTER */
      + '<div class="footer">'
      + '<div><div class="footer-thanks">Thank You for Your Order!</div><div class="footer-sub">We appreciate your business &amp; hope to see you again.</div></div>'
      + '<div class="footer-contact">' + (storeEmail ? storeEmail + '<br/>' : '') + (storePhone ? storePhone + '<br/>' : '') + storeAddress + '</div>'
      + '</div>'

      + '</div></body></html>';

    const win = window.open('', '_blank', 'width=880,height=960,scrollbars=yes');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  if (!trigger) {
    return (
      <button
        onClick={handlePrint}
        disabled={!storeSettings}
        title="Print Invoice"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-40"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        Bill
      </button>
    );
  }

  return React.cloneElement(trigger, { onClick: handlePrint, disabled: !storeSettings });
}
