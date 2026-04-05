// M6.11: App Shell — Routes between Lock/Login/Desktop screens
// @see docs/phases/phase-6.md

import { useAppStore } from './store/app-store';
import { LockScreen } from './components/Login/LockScreen';
import { LoginScreen } from './components/Login/LoginScreen';
import { DesktopLayout } from './components/Desktop/DesktopLayout';

export function App() {
  const screen = useAppStore(s => s.screen);

  switch (screen) {
    case 'lock':
      return <LockScreen />;
    case 'login':
      return <LoginScreen />;
    case 'desktop':
      return <DesktopLayout />;
    default:
      return <LockScreen />;
  }
}
