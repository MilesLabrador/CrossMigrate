import React, { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import NodePalette from './components/NodePalette';
import Canvas from './components/Canvas';
import ConfigPanel from './components/ConfigPanel';
import DragGhost from './components/DragGhost';
import { usePipelineStore } from './store/usePipelineStore';
import { recordGestureOrigin } from './lib/gestureTracker';

export default function App() {
  const { save, load } = usePipelineStore();

  // Auto-restore last saved pipeline on startup
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Stamp gesture origin in the capture phase, before any bubble-phase handler runs.
  // NodeShell reads this to decide whether to block canvas panning.
  useEffect(() => {
    window.addEventListener('wheel', recordGestureOrigin, { capture: true, passive: true });
    return () => window.removeEventListener('wheel', recordGestureOrigin, { capture: true });
  }, []);

  // Block horizontal scroll events that trigger browser back/forward navigation,
  // but allow them when the cursor is over a horizontally scrollable container.
  useEffect(() => {
    const preventHorizontalSwipe = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical-dominant, ignore

      // Walk up the DOM — if any ancestor can actually scroll horizontally, let it through
      let el = e.target;
      while (el && el !== document.body) {
        const { overflowX } = window.getComputedStyle(el);
        if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
          return;
        }
        el = el.parentElement;
      }

      e.preventDefault();
    };
    window.addEventListener('wheel', preventHorizontalSwipe, { passive: false });
    return () => window.removeEventListener('wheel', preventHorizontalSwipe);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <Canvas />
        <ConfigPanel />
      </div>
      {/* Floating ghost follows cursor during palette drag */}
      <DragGhost />
    </div>
  );
}
