// M0.5: React Entry Point
// @see docs/phases/phase-0.md

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { markPlatform } from './lib/platform.js';
import './styles.css';

markPlatform();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
