"use client";

import { useRef, useState, type PointerEvent } from "react";

/**
 * Pointer-based drag-to-reorder for a vertical stack of rows — the shared
 * midpoint-swap logic used by the routine-step and list-entry editors.
 * The dragged row follows the pointer via a transform; when its live center
 * crosses a neighbor's midpoint the two swap places, and the pointer offset
 * rebases by that neighbor's height (+`gap`) so the row keeps following the
 * finger with no jump. Attach `rowRef(id)` to each row element and spread
 * `handleProps(id)` onto its drag handle. `onReorder` fires on release,
 * only when the order actually changed.
 */
export function useRowDrag(
  baseOrder: string[],
  onReorder: (order: string[]) => void,
  gap = 0
) {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowEls = useRef<Map<string, HTMLElement>>(new Map());
  const startClientY = useRef(0);
  const orderRef = useRef<string[]>([]);
  const order = dragOrder ?? baseOrder;

  const begin = (id: string, clientY: number) => {
    orderRef.current = order;
    startClientY.current = clientY;
    setDragOrder(order);
    setDraggingId(id);
  };

  const move = (id: string, clientY: number) => {
    const el = rowEls.current.get(id);
    if (!el) return;
    el.style.transform = `translateY(${clientY - startClientY.current}px)`;
    const current = orderRef.current;
    const idx = current.indexOf(id);
    const rect = el.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const swap = (withIdx: number, rebase: number) => {
      const next = [...current];
      [next[idx], next[withIdx]] = [next[withIdx], next[idx]];
      orderRef.current = next;
      setDragOrder(next);
      startClientY.current += rebase;
    };
    if (idx < current.length - 1) {
      const nextEl = rowEls.current.get(current[idx + 1]);
      if (nextEl) {
        const r = nextEl.getBoundingClientRect();
        if (center > r.top + r.height / 2) return swap(idx + 1, r.height + gap);
      }
    }
    if (idx > 0) {
      const prevEl = rowEls.current.get(current[idx - 1]);
      if (prevEl) {
        const r = prevEl.getBoundingClientRect();
        if (center < r.top + r.height / 2) swap(idx - 1, -(r.height + gap));
      }
    }
  };

  const end = (id: string) => {
    const el = rowEls.current.get(id);
    if (el) el.style.transform = "";
    setDraggingId(null);
    setDragOrder(null);
    if (orderRef.current.some((v, i) => v !== baseOrder[i])) onReorder(orderRef.current);
  };

  const rowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el);
    else rowEls.current.delete(id);
  };

  const handleProps = (id: string) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      begin(id, e.clientY);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (draggingId === id) move(id, e.clientY);
    },
    onPointerUp: () => {
      if (draggingId === id) end(id);
    },
    onPointerCancel: () => {
      if (draggingId === id) end(id);
    },
    onLostPointerCapture: () => {
      if (draggingId === id) end(id);
    },
  });

  return { order, draggingId, rowRef, handleProps };
}
