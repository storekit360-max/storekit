import React, { useEffect, useState } from 'react';
import API from '../utils/api';

export default function PrintWaybill({ order, trigger }) {
  const [storeSettings, setStoreSettings] = useState(null);

  useEffect(() => {
    API.get('/settings', { cacheTTL: 5 * 60 * 1000 }).then(r => setStoreSettings(r.data)).catch(() => {});
  }, []);

  const handlePrint = () => {
    if (!order || !storeSettings) return;

    const s = storeSettings;
    const storeName    = s.storeName    || 'StoreKit';
    const storeEmail   = s.storeEmail   || '';
    const storePhone   = s.storePhone   || '';
    const storeAddress = s.storeAddress || '';
    const logoUrl      = s.logoUrl      || '';
    const primaryColor = s.primaryColor || '#4f46e5';

    const fmtDate = (d) => new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' });

    // Safe accessors — no mixed && / ||
    const b  = order.billing  || {};
    const sh = order.shipping || {};

    const recipientName  = ((sh.firstName || b.firstName || '') + ' ' + (sh.lastName || b.lastName || '')).trim();
    const recipientPhone = sh.phone || b.phone || '';
    const recipientEmail = b.email || '';
    const recipientAddr  = [(sh.street || b.street), (sh.city || b.city), (sh.country || b.country)].filter(Boolean).join(', ');

    const totalQty = (order.items || []).reduce(function(a, i) { return a + (i.quantity || 1); }, 0);
    const totalFormatted = 'Rs. ' + Number(order.total || 0).toLocaleString('en-LK');
    const itemSummary = (order.items || []).map(function(i) { return (i.name || '') + ' x' + (i.quantity || 1); }).join(', ');

    const paymentLabel = order.paymentMethod === 'cod' ? 'CASH ON DELIVERY'
      : order.paymentMethod === 'bank_transfer' ? 'BANK TRANSFER'
      : (order.paymentMethod || '').toUpperCase().replace(/_/g, ' ');

    const isPaid = order.paymentStatus === 'paid';
    const barcodeText = (order.orderNumber || 'STOREKIT').replace(/[^A-Z0-9]/gi, '').toUpperCase();

    const logoHtml = logoUrl
      ? '<img src="' + logoUrl + '" alt="' + storeName + '" style="height:100px;object-fit:contain;max-width:300px;filter:brightness(0) invert(1);"/>'
      : '<div style="font-size:36px;font-weight:900;color:#fff;letter-spacing:-1px;">' + storeName + '</div>';

    const codBadgeHtml = isPaid
      ? '<div style="background:linear-gradient(135deg,#16a34a,#15803d);border-radius:10px;padding:10px 18px;text-align:center;color:#fff;min-width:150px;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;margin-bottom:4px;">PREPAID</div>'
        + '<div style="font-size:18px;font-weight:900;letter-spacing:-0.5px;">' + totalFormatted + '</div>'
        + '</div>'
      : '<div style="background:linear-gradient(135deg,#dc2626,#b91c1c);border-radius:10px;padding:10px 18px;text-align:center;color:#fff;min-width:150px;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;margin-bottom:4px;">COLLECT ON DELIVERY</div>'
        + '<div style="font-size:18px;font-weight:900;letter-spacing:-0.5px;">' + totalFormatted + '</div>'
        + '</div>';

    const trackingHtml = order.trackingNumber
      ? '<div style="margin-top:10px;text-align:right;"><div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Tracking No.</div><div style="font-size:15px;font-weight:800;font-family:monospace;color:#0f172a;margin-top:3px;">' + order.trackingNumber + '</div></div>'
      : '';
    const courierHtml = order.deliveryPartner
      ? '<div style="margin-top:10px;text-align:right;"><div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;">Courier</div><div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:3px;">' + order.deliveryPartner + '</div></div>'
      : '';

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>'
      + '<title>Waybill \u2013 ' + order.orderNumber + '</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Libre+Barcode+128&display=swap" rel="stylesheet"/>'
      + '<style>'
      + '*{margin:0;padding:0;box-sizing:border-box;}'
      + 'body{font-family:"Inter",sans-serif;color:#0f172a;background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
      + '.outer{max-width:700px;margin:24px auto;}'
      + '.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);}'

      /* Header */
      + '.wb-header{background:linear-gradient(135deg,' + primaryColor + ' 0%,' + primaryColor + 'cc 100%);padding:28px 32px;display:flex;justify-content:space-between;align-items:center;}'
      + '.wb-right{text-align:right;}'
      + '.wb-title{font-size:32px;font-weight:900;color:#fff;letter-spacing:3px;text-transform:uppercase;line-height:1;}'
      + '.wb-ordno{font-size:13px;font-weight:600;color:rgba(255,255,255,0.8);margin-top:6px;letter-spacing:1px;font-family:monospace;}'

      /* Hazard stripe */
      + '.hazard{background:repeating-linear-gradient(45deg,#f59e0b,#f59e0b 8px,#1e293b 8px,#1e293b 16px);padding:6px 0;text-align:center;}'
      + '.hazard-text{font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.6);}'

      /* Address section */
      + '.addr-grid{display:grid;grid-template-columns:1fr 1fr;}'
      + '.addr-cell{padding:24px 28px;}'
      + '.addr-cell-left{border-right:2px dashed #e2e8f0;background:#fafbff;}'
      + '.addr-badge{display:inline-flex;align-items:center;gap:6px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.8px;color:#fff;background:' + primaryColor + ';padding:4px 12px;border-radius:20px;margin-bottom:12px;}'
      + '.addr-name{font-size:20px;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:8px;}'
      + '.addr-detail{font-size:12.5px;color:#475569;line-height:2;}'
      + '.addr-phone{font-size:15px;font-weight:700;color:#0f172a;}'

      /* Details strip */
      + '.details-strip{display:grid;grid-template-columns:repeat(4,1fr);background:#f8faff;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;}'
      + '.dc{padding:14px 18px;border-right:1px solid #e2e8f0;}'
      + '.dc:last-child{border-right:none;}'
      + '.dc-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:5px;}'
      + '.dc-value{font-size:13px;font-weight:700;color:#0f172a;line-height:1.3;}'

      /* Contents */
      + '.contents{padding:18px 28px;border-bottom:1px dashed #e2e8f0;}'
      + '.contents-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:' + primaryColor + ';margin-bottom:7px;}'
      + '.contents-text{font-size:12.5px;color:#334155;line-height:1.7;}'

      /* Barcode + badge row */
      + '.scan-row{display:flex;align-items:center;justify-content:space-between;padding:20px 28px;}'
      + '.barcode-wrap{}'
      + '.barcode-font{font-family:"Libre Barcode 128",monospace;font-size:56px;color:#0f172a;line-height:1;letter-spacing:2px;}'
      + '.barcode-num{font-size:11px;color:#64748b;margin-top:4px;text-align:center;font-family:monospace;letter-spacing:2px;}'
      + '.badge-col{display:flex;flex-direction:column;align-items:flex-end;gap:10px;}'

      /* Footer */
      + '.wb-footer{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:20px 32px;display:flex;align-items:center;justify-content:space-between;}'
      + '.wf-thanks{font-size:15px;font-weight:800;color:#fff;}'
      + '.wf-sub{font-size:11px;color:#64748b;margin-top:3px;}'
      + '.wf-contact{font-size:11px;color:#64748b;text-align:right;line-height:2;}'

      + '@media print{'
      + 'body{background:#fff;}'
      + '.outer{margin:0;max-width:100%;}'
      + '.card{border-radius:0;box-shadow:none;}'
      + '.no-print{display:none!important;}'
      + '}'
      + '</style></head><body>'

      /* Controls */
      + '<div class="no-print" style="max-width:700px;margin:0 auto;padding:14px 4px 10px;display:flex;justify-content:flex-end;gap:10px;">'
      + '<button onclick="window.print()" style="background:' + primaryColor + ';color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.3px;">Print Waybill</button>'
      + '<button onclick="window.close()" style="background:#fff;color:#64748b;border:1px solid #e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Close</button>'
      + '</div>'

      + '<div class="outer"><div class="card">'

      /* HEADER */
      + '<div class="wb-header">'
      + '<div>' + logoHtml + '</div>'
      + '<div class="wb-right"><div class="wb-title">Waybill</div><div class="wb-ordno">' + order.orderNumber + '</div></div>'
      + '</div>'

      /* HAZARD STRIPE */
      + '<div class="hazard"><div class="hazard-text">Handle With Care &nbsp;&#9679;&nbsp; Keep Dry &nbsp;&#9679;&nbsp; Do Not Bend</div></div>'

      /* ADDRESSES */
      + '<div class="addr-grid">'
      + '<div class="addr-cell addr-cell-left">'
      + '<div class="addr-badge">From &mdash; Sender</div>'
      + '<div class="addr-name">' + storeName + '</div>'
      + '<div class="addr-detail">'
      + (storeAddress ? storeAddress + '<br/>' : '')
      + (storePhone   ? '<span class="addr-phone">' + storePhone + '</span><br/>' : '')
      + (storeEmail   ? storeEmail : '')
      + '</div></div>'
      + '<div class="addr-cell">'
      + '<div class="addr-badge">To &mdash; Recipient</div>'
      + '<div class="addr-name">' + recipientName + '</div>'
      + '<div class="addr-detail">'
      + (recipientAddr  ? recipientAddr + '<br/>' : '')
      + (recipientPhone ? '<span class="addr-phone">' + recipientPhone + '</span><br/>' : '')
      + (recipientEmail ? recipientEmail : '')
      + '</div></div>'
      + '</div>'

      /* DETAILS STRIP */
      + '<div class="details-strip">'
      + '<div class="dc"><div class="dc-label">Order Date</div><div class="dc-value">' + fmtDate(order.createdAt) + '</div></div>'
      + '<div class="dc"><div class="dc-label">Pieces</div><div class="dc-value">' + totalQty + ' pcs</div></div>'
      + '<div class="dc"><div class="dc-label">Order Value</div><div class="dc-value">' + totalFormatted + '</div></div>'
      + '<div class="dc"><div class="dc-label">Payment</div><div class="dc-value" style="font-size:11px;">' + paymentLabel + '</div></div>'
      + '</div>'

      /* CONTENTS */
      + '<div class="contents"><div class="contents-label">Package Contents</div><div class="contents-text">' + (itemSummary || 'See attached invoice') + '</div></div>'

      /* BARCODE + BADGE */
      + '<div class="scan-row">'
      + '<div class="barcode-wrap"><div class="barcode-font">' + barcodeText + '</div><div class="barcode-num">' + order.orderNumber + '</div></div>'
      + '<div class="badge-col">' + codBadgeHtml + trackingHtml + courierHtml + '</div>'
      + '</div>'

      /* FOOTER */
      + '<div class="wb-footer">'
      + '<div><div class="wf-thanks">Thank You for Your Order!</div><div class="wf-sub">We appreciate your business.</div></div>'
      + '<div class="wf-contact">' + (storeEmail ? storeEmail + '<br/>' : '') + (storePhone ? storePhone : '') + '</div>'
      + '</div>'

      + '</div></div></body></html>';

    const win = window.open('', '_blank', 'width=780,height=860,scrollbars=yes');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  if (!trigger) {
    return (
      <button
        onClick={handlePrint}
        disabled={!storeSettings}
        title="Print Waybill"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors disabled:opacity-40"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
        </svg>
        Waybill
      </button>
    );
  }

  return React.cloneElement(trigger, { onClick: handlePrint, disabled: !storeSettings });
}