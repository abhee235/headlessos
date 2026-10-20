// M8.5: Cron Section — cron job CRUD management
// EX8.6: LumenOS v3 — section header, glass form panel, crontab table cards, empty state.
// @see docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState } from 'react';
import { Clock, CalendarClock, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchCronInfo, addCronJob, deleteCronJob, editCronJob } from '@/lib/api';
import type { CronInfo } from '@/lib/api';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, TableCard, CardHeading, HeadRow, Th, Tr, Td,
  MonoChip, RoundIconButton, Panel, PanelTitle, FIELD_LABEL, EmptyState, ErrorState,
} from './admin-ui';

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
    return <LoadingView label="Loading cron jobs…" fullHeight={false} />;
  }

  if (error || !data) {
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  const isFormValid = form.schedule.trim() && form.command.trim();

  return (
    <SectionBody>
      {/* Header */}
      <SectionHeader
        icon={Clock}
        title="Scheduled jobs"
        badge={<Badge variant="secondary" className="tabular-nums">{data.jobs.length}</Badge>}
        subtitle={`crontab · ${userJobs.length} user · ${systemJobs.length} system`}
        actions={
          <>
            <Button
              variant="default"
              onClick={() => { closeForm(); setShowForm(true); }}
              disabled={busy}
            >
              <Plus strokeWidth={1.75} /> Add job
            </Button>
            <RefreshButton onClick={load} disabled={busy} />
          </>
        }
      />

      {/* Add/Edit form */}
      {showForm && (
        <Panel>
          <PanelTitle>
            {editIndex !== null ? 'Edit Cron Job' : 'Add Cron Job'}
          </PanelTitle>

          {/* Preset */}
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>Schedule Preset</Label>
            <Select value={form.preset} onValueChange={handlePreset}>
              <SelectTrigger className="w-72">
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
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>Schedule (cron expression)</Label>
            <Input
              value={form.schedule}
              onChange={e => setForm(f => ({ ...f, schedule: e.target.value, preset: '' }))}
              placeholder="* * * * *  or  @hourly"
              className="font-mono"
            />
            {form.schedule && (
              <p className="px-1 text-[12px] text-label-3">
                → {humanReadableSchedule(form.schedule.trim())}
              </p>
            )}
          </div>

          {/* Command */}
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>Command</Label>
            <Input
              value={form.command}
              onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
              placeholder="/usr/bin/myscript.sh --flag"
              className="font-mono"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className={FIELD_LABEL}>Description (optional)</Label>
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Backup database nightly"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSubmit} disabled={busy || !isFormValid}>
              {busy && <Spinner size={14} />}
              {editIndex !== null ? 'Update' : 'Add'}
            </Button>
            <Button variant="ghost" size="sm" onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}

      {/* User crontab jobs */}
      {userJobs.length > 0 && (
        <TableCard>
          <CardHeading title="User crontab" count={userJobs.length} />
          <Table>
            <TableHeader>
              <HeadRow>
                <Th className="w-52">Schedule</Th>
                <Th>Command</Th>
                <Th className="w-44">Description</Th>
                <Th className="w-24 text-right">Actions</Th>
              </HeadRow>
            </TableHeader>
            <TableBody>
              {userJobs.map((job, i) => (
                <Tr key={`user-${i}`}>
                  <Td>
                    <MonoChip>{job.schedule}</MonoChip>
                    <p className="mt-1 text-[12px] text-label-3">
                      {humanReadableSchedule(job.schedule)}
                    </p>
                  </Td>
                  <Td className="font-mono text-[13px] text-foreground" title={job.command}>
                    <div className="max-w-md truncate">{job.command}</div>
                  </Td>
                  <Td className="text-label-2">
                    {job.description || '—'}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <RoundIconButton
                        onClick={() => openEdit(i)}
                        disabled={busy}
                        title="Edit"
                      >
                        <Pencil strokeWidth={1.75} />
                      </RoundIconButton>
                      <RoundIconButton
                        tone="danger"
                        onClick={() => setDeleteIndex(i)}
                        disabled={busy}
                        title="Delete"
                      >
                        <Trash2 strokeWidth={1.75} />
                      </RoundIconButton>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {/* System crontab jobs (read-only) */}
      {systemJobs.length > 0 && (
        <TableCard>
          <CardHeading title="System crontab" count={systemJobs.length} caption="read-only" />
          <Table>
            <TableHeader>
              <HeadRow>
                <Th className="w-52">Schedule</Th>
                <Th>Command</Th>
                <Th className="w-44">Description</Th>
              </HeadRow>
            </TableHeader>
            <TableBody>
              {systemJobs.map((job, i) => (
                <Tr key={`sys-${i}`}>
                  <Td>
                    <MonoChip>{job.schedule}</MonoChip>
                    <p className="mt-1 text-[12px] text-label-3">
                      {humanReadableSchedule(job.schedule)}
                    </p>
                  </Td>
                  <Td className="font-mono text-[13px] text-foreground" title={job.command}>
                    <div className="max-w-md truncate">{job.command}</div>
                  </Td>
                  <Td className="text-label-2">
                    {job.description || '—'}
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {/* Empty state */}
      {data.jobs.length === 0 && !showForm && (
        <EmptyState
          icon={CalendarClock}
          title="No cron jobs found"
          description="Schedule backups, cleanups or reports to run automatically."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus strokeWidth={1.75} /> Add your first cron job
            </Button>
          }
        />
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
    </SectionBody>
  );
}
