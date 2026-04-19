// EX6-D.1: Wake confirmation dialog for locked sessions
// @see docs/phases/phase-ex6.md
//
// Renders a single AlertDialog and registers an activation guard with
// `useSessionsStore`. When activate() is called for a locked hibernated
// session, the guard awaits user confirmation (Wake / Cancel).

import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { registerActivationGuard } from '../../store/sessions-store';
import { useAppStore } from '../../store/app-store';

export function WakeConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [serverId, setServerId] = useState<string | null>(null);
  const resolveRef = useRef<((allowed: boolean) => void) | null>(null);
  const servers = useAppStore((s) => s.servers);

  useEffect(() => {
    registerActivationGuard((id: string) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setServerId(id);
        setOpen(true);
      });
    });
    // Restore default on unmount
    return () => {
      registerActivationGuard(() => true);
    };
  }, []);

  const serverName = serverId
    ? servers.find((s) => s.id === serverId)?.name ?? serverId
    : '';

  const finish = (allowed: boolean) => {
    setOpen(false);
    resolveRef.current?.(allowed);
    resolveRef.current = null;
    setServerId(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && finish(false)}>
      <AlertDialogContent data-testid="wake-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Wake locked session?</AlertDialogTitle>
          <AlertDialogDescription>
            The session for <strong>{serverName}</strong> is marked as locked.
            Waking it will reconnect SSH and restore the saved desktop layout.
            Continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)} data-testid="wake-cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)} data-testid="wake-confirm">
            Wake session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
