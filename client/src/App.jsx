import React, { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import NodePalette from './components/NodePalette';
import Canvas from './components/Canvas';
import ConfigPanel from './components/ConfigPanel';
import DragGhost from './components/DragGhost';
import { usePipelineStore } from './store/usePipelineStore';

export default function App() {
  const { save } = usePipelineStore();

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // Cmd/Ctrl+S = save
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

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
