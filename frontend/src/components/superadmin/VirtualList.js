import React, { useMemo, useState } from 'react';

export default function VirtualList({ items, itemHeight = 76, maxHeight = 620, overscan = 5, renderItem, ariaLabel }) {
  const [scrollTop, setScrollTop] = useState(0);
  const totalHeight = items.length * itemHeight;
  const viewportHeight = Math.min(maxHeight, Math.max(itemHeight, totalHeight));
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visible = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    return { start, end: Math.min(items.length, start + visible) };
  }, [itemHeight, items.length, overscan, scrollTop, viewportHeight]);
  return <div role="list" aria-label={ariaLabel} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} style={{ height: viewportHeight, overflowY: 'auto', position: 'relative' }}><div style={{ height: totalHeight, position: 'relative' }}>{items.slice(range.start, range.end).map((item, offset) => renderItem(item, range.start + offset, { position: 'absolute', top: (range.start + offset) * itemHeight, left: 0, right: 0, height: itemHeight }))}</div></div>;
}
