// M9.12: First-Run Onboarding — Welcome dialog for new users
// @see docs/phases/phase-9.md

import { useState } from 'react';
import {
  Server,
  Shield,
  Terminal,
  MonitorSmartphone,
  ArrowRight,
  Keyboard,
  Rocket,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePreferencesStore } from '../../store/preferences-store';
import { useAppStore } from '../../store/app-store';

const STEPS = [
  {
    icon: Rocket,
    iconBg: 'bg-blue-500',
    title: 'Welcome to HeadlessOS',
    description:
      'A desktop-style interface for managing your Linux servers. Connect via SSH and control everything from your browser — no agents installed on your servers.',
  },
  {
    icon: Server,
    iconBg: 'bg-emerald-500',
    title: 'Add Your First Server',
    description:
      'Click the "Add Server" button on the login screen to connect to your VPS. HeadlessOS uses SSH — just provide host, port, and credentials.',
  },
  {
    icon: MonitorSmartphone,
    iconBg: 'bg-violet-500',
    title: 'Your Apps',
    description:
      'Dashboard, File Explorer, Terminal, Docker, Services, Task Manager, and Server Admin — all accessible from the Start Menu or Taskbar.',
  },
  {
    icon: Keyboard,
    iconBg: 'bg-amber-500',
    title: 'Keyboard Shortcuts',
    description:
      'Ctrl+Space opens the Start Menu. Ctrl+K opens the Command Palette. Ctrl+Arrow snaps windows. Check Settings → Keyboard Shortcuts for the full list.',
  },
  {
    icon: Shield,
    iconBg: 'bg-rose-500',
    title: 'Security First',
    description:
      'HeadlessOS runs entirely on localhost. SSH credentials are stored locally. Nothing is installed on your servers — they remain untouched.',
  },
];

export function WelcomeDialog() {
  const hasSeenOnboarding = usePreferencesStore(s => s.hasSeenOnboarding);
  const markOnboardingSeen = usePreferencesStore(s => s.markOnboardingSeen);
  const servers = useAppStore(s => s.servers);
  const [step, setStep] = useState(0);

  // Don't show if already seen or if servers exist (returning user)
  if (hasSeenOnboarding || servers.length > 0) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  const handleNext = () => {
    if (isLast) {
      markOnboardingSeen();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    markOnboardingSeen();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleSkip(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-border">
        {/* Header visual */}
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-8 pt-10 pb-6 flex flex-col items-center text-center">
          <div className={`w-14 h-14 rounded-2xl ${current.iconBg} flex items-center justify-center mb-4 shadow-lg`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">{current.description}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-background">
          {/* Step dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : 'bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isLast && (
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                Skip
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="gap-1">
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
