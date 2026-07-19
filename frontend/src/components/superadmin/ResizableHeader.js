import React, { useCallback, useEffect, useState } from 'react';

const clamp = value => Math.min(Math.max(Number(value) || 120, 80), 800);

export function useResizableColumns(storageKey, defaults) {
  const [widths, setWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return Object.fromEntries(Object.entries(defaults).map(([key, width]) => [key, clamp(saved[key] ?? width)]));
    } catch (_) { return Object.fromEntries(Object.entries(defaults).map(([key, width]) => [key, clamp(width)])); }
  });
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch (_) {} }, [storageKey, widths]);
  const resize = useCallback((key, width) => setWidths(value => ({ ...value, [key]: clamp(width) })), []);
  const reset = useCallback(() => setWidths(Object.fromEntries(Object.entries(defaults).map(([key, width]) => [key, clamp(width)]))), [defaults]);
  return { widths, resize, reset };
}

export default function ResizableHeader({ columnKey, label, width, onResize, className = '' }) {
  function begin(event) {
    event.preventDefault();
    const startX = event.clientX; const startWidth = width;
    const move = moveEvent => onResize(columnKey, startWidth + moveEvent.clientX - startX);
    const end = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  }
  function keyboard(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault(); onResize(columnKey, event.key === 'Home' ? 120 : width + (event.key === 'ArrowRight' ? 10 : -10));
  }
  return <th scope="col" style={{ width }} className={`relative select-none p-3 pr-5 ${className}`}><span>{label}</span><span role="separator" aria-label={`Resize ${label} column`} aria-orientation="vertical" aria-valuemin="80" aria-valuemax="800" aria-valuenow={Math.round(width)} tabIndex="0" onMouseDown={begin} onKeyDown={keyboard} className="absolute inset-y-1 right-0 w-2 cursor-col-resize rounded focus:bg-blue-300 focus:outline-none" /></th>;
}
