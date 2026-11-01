import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A bottom sheet in the spirit of vaul: slides up from the bottom, closes on Escape,
 * on a click on the backdrop, or by dragging the handle (or the sheet when scrolled to the top) down.
 */
export function Drawer({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label?: string }) {
  const [shown, setShown] = useState(false); // drives the enter/exit transition
  const [drag, setDrag] = useState(0);
  const dragging = useRef<{ y: number; t: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setShown(false);
    setDrag(0);
    window.setTimeout(onClose, 250);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const onHandle = !!target.closest('[data-drawer-handle]');
    // Inside the content, only start a drag when it is scrolled to the top and not on something interactive.
    if (!onHandle && ((scroller.current?.scrollTop ?? 0) > 0 || target.closest('button, a, input, textarea, select, code, [data-no-drag]'))) return;
    dragging.current = { y: e.clientY, t: Date.now() };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dy = e.clientY - dragging.current.y;
    if (dy > 4 && !sheet.current?.hasPointerCapture(e.pointerId)) sheet.current?.setPointerCapture(e.pointerId);
    // Resist upward drags, follow downward ones.
    setDrag(dy > 0 ? dy : dy / 6);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dy = e.clientY - dragging.current.y;
    const velocity = dy / Math.max(1, Date.now() - dragging.current.t);
    dragging.current = null;
    const height = sheet.current?.offsetHeight ?? 600;
    if (dy > height * 0.3 || (dy > 40 && velocity > 0.5)) close();
    else setDrag(0);
  }

  if (!open) return null;
  const isDragging = !!dragging.current;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div
        className="absolute inset-0 bg-stone-900/40 transition-opacity duration-300"
        style={{ opacity: shown ? Math.max(0, 1 - drag / 600) : 0 }}
        onMouseDown={close}
      />
      <div
        ref={sheet}
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[28px] bg-white shadow-[0_-8px_40px_rgba(28,25,23,0.12)] outline-none"
        style={{
          transform: shown ? `translateY(${drag}px)` : 'translateY(100%)',
          transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
          touchAction: 'pan-x',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div data-drawer-handle className="flex shrink-0 cursor-grab justify-center pb-2 pt-4 active:cursor-grabbing">
          <div className="h-1.5 w-12 rounded-full bg-stone-200" />
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: 'pan-y' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
