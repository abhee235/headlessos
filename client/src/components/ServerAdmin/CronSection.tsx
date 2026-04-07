// M8.5: Cron Section — cron job CRUD management
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchCronInfo, addCronJob, deleteCronJob, editCronJob } from '@/lib/api';
import type { CronInfo } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Schedule presets ──────────────────────────────────────────────
const PRESETS: { label: string; value: string }[] = [
  { label: 'Custom', value: '' },
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every day at 3 AM', value: '0 3 * * *' },
  { label: 'Every Sunday midnight', value: '0 0 * * 0' },
  { label: 'Every 1st of month', value: '0 0 1 * *' },
  { label: 'On reboot', value: '@reboot' },
];

// ── Human-readable cron ──────────────────────────────────────────
function humanReadableSchedule(schedule: string): string {
  const specials: Record<string, string> = {
    '@reboot': 'On reboot',
    '@hourly': 'Every hour',
    '@daily': 'Every day at midnight',
    '@weekly': 'Every Sunday at midnight',
    '@monthly': '1st of every month at midnight',
    '@yearly': 'Every January 1st at midnight',
    '@annually': 'Every January 1st at midnight',
    '* * * * *': 'Every minute',
    '*/5 * * * *': 'Every 5 minutes',
    '*/15 * * * *': 'Every 15 minutes',
    '0 * * * *': 'Every hour',
    '0 */6 * * *': 'Every 6 hours',
    '0 0 * * *': 'Every day at midnight',
    '0 3 * * *': 'Every day at 3 AM',
    '0 0 * * 0': 'Every Sunday at midnight',
    '0 0 1 * *': '1st of every month',
  };
  return specials[schedule] || schedule;
}

// ── Form state ──────────────────────────────────────────────────
interface CronFormState {
  schedule: string;
  command: string;
  description: string;
  preset: string;
}

const emptyForm: CronFormState = { schedule: '', command: '', description: '', preset: '' };

export function CronSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<CronInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<CronFormState>(emptyForm);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCronInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch cron info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cron info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  // ── User-only jobs (editable) vs system jobs ────────────────────
  const userJobs = data?.jobs.filter(j => j.source === 'user') ?? [];
  const systemJobs = data?.jobs.filter(j => j.source !== 'user') ?? [];

  // ── Preset selection ────────────────────────────────────────────
  const handlePreset = (value: string) => {
    const preset = PRESETS.find(p => p.value === value);
    setForm(f => ({
      ...f,
      preset: value,
      schedule: preset?.value || f.schedule,
    }));
  };

  // ── Open edit form ──────────────────────────────────────────────
  const openEdit = (index: number) => {
    const job = userJobs[index];
    if (!job) return;
    setEditIndex(index);
    // Check if schedule matches a preset
    const matchingPreset = PRESETS.find(p => p.value === job.schedule);
    setForm({
      schedule: job.schedule,
      command: job.command,
      description: job.description || '',
      preset: matchingPreset?.value || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditIndex(null);
    setForm(emptyForm);
  };

  // ── Submit (add or edit) ────────────────────────────────────────
  const handleSubmit = async () => {
    const schedule = form.schedule.trim();
    const command = form.command.trim();
    if (!schedule || !command) {
      toast.error('Schedule and command are required');
      return;
    }

    setBusy(true);
    try {
      const body = {
        schedule,
        command,
        description: form.description.trim() || undefined,
      };

      const res = editIndex !== null
        ? await editCronJob(serverId, editIndex, body)
        : await addCronJob(serverId, body);

      if (res.success) {
        toast.success(editIndex !== null ? 'Cron job updated' : 'Cron job added');
        closeForm();
        await load();
      } else {
        toast.error(res.error || 'Failed to save cron job');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save cron job');
    } finally {
      setBusy(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (deleteIndex === null) return;
    setBusy(true);
    try {
      const res = await deleteCronJob(serverId, deleteIndex);
      if (res.success) {
        toast.success('Cron job deleted');
        setDeleteIndex(null);
        await load();
      } else {
        toast.error(res.error || 'Failed to delete cron job');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete cron job');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-foreground/40">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading cron jobs…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <AlertCircle size={24} />
        <p className="text-sm">{error || 'No data'}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  const isFormValid = form.schedule.trim() && form.command.trim();

  return (
    <div className="@container p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Clock size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Scheduled Jobs</h2>
          <span className="text-xs tabular-nums text-foreground/50 bg-foreground/5 px-2 py-0.5 rounded-full">{data.jobs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium border-border/50"
            onClick={() => { closeForm(); setShowForm(true); }}
            disabled={busy}
          >
            <Plus size={14} /> Add Job
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load} title="Refresh" disabled={busy}>
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-lg p-4 space-y-3 bg-muted/20">
          <h3 className="text-sm font-medium text-foreground/70">
            {editIndex !== null ? 'Edit Cron Job' : 'Add Cron Job'}
          </h3>

          {/* Preset */}
          <div className="space-y-1">
            <Label className="text-xs text-foreground/60">Schedule Preset</Label>
            <Select value={form.preset} onValueChange={handlePreset}>
              <SelectTrigger className="w-64 h-8 text-xs shadow-none">
                <SelectValue placeholder="Select a preset…" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map(p => (
                  <SelectItem key={p.label} value={p.value || '__custom__'}>
                    {p.label}{p.value ? ` (${p.value})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule */}
          <div className="space-y-1">
            <Label className="text-xs text-foreground/60">Schedule (cron expression)</Label>
            <Input
              value={form.schedule}
              onChange={e => setForm(f => ({ ...f, schedule: e.target.value, preset: '' }))}
              placeholder="* * * * *  or  @hourly"
              className="font-mono h-8 text-xs shadow-none"
            />
            {form.schedule && (
              <p className="text-xs text-foreground/40">
                → {humanReadableSchedule(form.schedule.trim())}
              </p>
            )}
          </div>

          {/* Command */}
          <div className="space-y-1">
            <Label className="text-xs text-foreground/60">Command</Label>
            <Input
              value={form.command}
              onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
              placeholder="/usr/bin/myscript.sh --flag"
              className="font-mono h-8 text-xs shadow-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs text-foreground/60">Description (optional)</Label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Backup database nightly"
              className="h-8 text-xs shadow-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSubmit} disabled={busy || !isFormValid}>
              {busy && <Loader2 size={14} className="animate-spin mr-1" />}
              {editIndex !== null ? 'Update' : 'Add'}
            </Button>
            <Button variant="ghost" size="sm" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* User crontab jobs */}
      {userJobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground/60">User Crontab</h3>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-44 text-xs font-medium text-foreground/40 h-9">Schedule</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Command</TableHead>
                <TableHead className="w-40 text-xs font-medium text-foreground/40 h-9">Description</TableHead>
                <TableHead className="w-20 text-right text-xs font-medium text-foreground/40 h-9">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userJobs.map((job, i) => (
                <TableRow key={`user-${i}`} className="border-0 hover:bg-muted/20 group">
                  <TableCell>
                    <code className="text-xs bg-muted/30 px-1.5 py-0.5 rounded font-mono">
                      {job.schedule}
                    </code>
                    <p className="text-xs text-foreground/40 mt-0.5">
                      {humanReadableSchedule(job.schedule)}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-md truncate" title={job.command}>
                    {job.command}
                  </TableCell>
                  <TableCell className="text-xs text-foreground/50">
                    {job.description || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(i)}
                        disabled={busy}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-foreground/30 hover:text-destructive"
                        onClick={() => setDeleteIndex(i)}
                        disabled={busy}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* System crontab jobs (read-only) */}
      {systemJobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground/60">System Crontab (read-only)</h3>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-44 text-xs font-medium text-foreground/40 h-9">Schedule</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Command</TableHead>
                <TableHead className="w-40 text-xs font-medium text-foreground/40 h-9">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systemJobs.map((job, i) => (
                <TableRow key={`sys-${i}`} className="border-0 hover:bg-muted/20 group">
                  <TableCell>
                    <code className="text-xs bg-muted/30 px-1.5 py-0.5 rounded font-mono">
                      {job.schedule}
                    </code>
                    <p className="text-xs text-foreground/40 mt-0.5">
                      {humanReadableSchedule(job.schedule)}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-md truncate" title={job.command}>
                    {job.command}
                  </TableCell>
                  <TableCell className="text-xs text-foreground/50">
                    {job.description || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty state */}
      {data.jobs.length === 0 && !showForm && (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/30">
          <Clock size={32} className="text-foreground/20 mb-2" />
          <p className="text-sm text-foreground/30">No cron jobs found</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowForm(true)}>
            <Plus size={14} className="mr-1" /> Add your first cron job
          </Button>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteIndex !== null}
        onOpenChange={(open) => { if (!open) setDeleteIndex(null); }}
        title="Delete Cron Job"
        description={
          deleteIndex !== null && userJobs[deleteIndex]
            ? `Delete: ${userJobs[deleteIndex]!.schedule} ${userJobs[deleteIndex]!.command}`
            : 'Are you sure you want to delete this cron job?'
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => { void handleDelete(); }}
      />
    </div>
  );
}
