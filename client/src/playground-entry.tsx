// Standalone entry point for Dynamic UI Playground
// Access via: http://localhost:3000/playground.html

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { DynamicUIPlayground } from './components/DynamicUI';

function PlaygroundApp() {
  const [open, setOpen] = useState(true);

  return (
    <div className="w-screen h-screen bg-background text-foreground flex items-center justify-center">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          Open Playground
        </button>
      )}
      <DynamicUIPlayground open={open} onOpenChange={setOpen} />
    </div>
  );
}

createRoot(document.getElementById('playground-root')!).render(
  <StrictMode>
    <PlaygroundApp />
  </StrictMode>
);
