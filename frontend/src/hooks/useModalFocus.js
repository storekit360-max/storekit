import { useEffect, useRef } from 'react';

const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function useModalFocus(active, onClose) {
  const modalRef = useRef(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement; const priorOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => { const target = modalRef.current?.querySelector(selector) || modalRef.current; target?.focus(); }, 0);
    const handler = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); return; }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll(selector)).filter(node => node.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); modalRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener('keydown', handler); document.body.style.overflow = priorOverflow; if (previous?.isConnected) previous.focus(); };
  }, [active]);
  return modalRef;
}
