// EX10.8: read actions return structured data from the deterministic parsers; selection
// lets request words beat the core set when slots are few; cpu/traffic sample twice
// @see docs/phases/phase-ex10.md §9a
// Outputs captured from the dev SSH container (Ubuntu 22.04) on 2026-10-25.

import { describe, it, expect, vi } from 'vitest';
import { cpuData, diskData, interfacesData, loadData, memoryData, portsData, processData, trafficData, PROCESS_ROWS } from '../../../src/agent/actions/catalog/parsed.js';
import { dfParser } from '../../../src/parsers/deterministic/df.js';
import { ActionRunner } from '../../../src/agent/actions/runner.js';
import { getDefaultCatalog } from '../../../src/agent/actions/catalog/index.js';
import { CORE_ACTIONS, formatForModel, selectActions } from '../../../src/agent/actions/tools.js';

const DF_HT = `Filesystem     Type     Size  Used Avail Use% Mounted on
overlay        overlay 1007G   49G  908G   6% /
tmpfs          tmpfs     64M     0   64M   0% /dev
/dev/sdd       ext4    1007G   49G  908G   6% /etc/hosts`;
const FREE = `               total        used        free      shared  buff/cache   available
Mem:           15515        1873       11240           4        2401       13396
Swap:           4096           0        4096`;
const STAT_1 = `cpu  348672 1823 380036 136622104 20038 0 64106 0 0 0
cpu0 32103 132 36576 11368426 2471 0 28573 0 0 0
cpu1 27204 161 27861 11391075 2851 0 13123 0 0 0`;
// one second later: 100 more jiffies per core, cpu0 half busy, cpu1 idle
const STAT_2 = `cpu  348722 1823 380036 136622254 20038 0 64106 0 0 0
cpu0 32153 132 36576 11368476 2471 0 28573 0 0 0
cpu1 27204 161 27861 11391175 2851 0 13123 0 0 0`;
const NET_1 = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:       0       0    0    0    0     0          0         0        0       0    0    0    0     0       0          0
  eth0: 25582428  314139    0    0    0     0          0         0 66673212  242752    0    0    0     0       0          0`;
const NET_2 = NET_1.replace('25582428', '25682428').replace('66673212', '66675212');

describe('structured data for read actions (EX10.8)', () => {
  it('memory: free -m plus the percentages', () => {
    expect(memoryData(FREE)).toEqual({ totalMb: 15515, usedMb: 1873, freeMb: 11240, availableMb: 13396, swapTotalMb: 4096, swapUsedMb: 0, usedPercent: 12.1, swapUsedPercent: 0 });
  });

  it('disk: df -hT, reading the Type column (it was misread as the size)', () => {
    expect(diskData(DF_HT)[0]).toEqual({ filesystem: 'overlay', type: 'overlay', size: '1007G', used: '49G', available: '908G', usePercent: 6, mountPoint: '/' });
    expect(diskData(DF_HT)).toHaveLength(3);
    // plain df -h, as the Dashboard runs it, is unchanged
    expect(dfParser.parse('Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 50G 12G 35G 26% /')).toEqual([{ filesystem: '/dev/sda1', size: '50G', used: '12G', available: '35G', usePercent: 26, mountPoint: '/' }]);
  });

  it('processes: the first rows only', () => {
    const header = 'USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND';
    const rows = Array.from({ length: 40 }, (_, i) => `root ${i + 1} 0.${i} 0.1 1000 500 ? S 10:00 0:00 worker-${i}`);
    const data = processData([header, ...rows].join('\n'));
    expect(data).toHaveLength(PROCESS_ROWS);
    expect(data[0]).toMatchObject({ pid: 1, user: 'root', command: 'worker-0' });
  });

  it('load average', () => {
    expect(loadData('0.07 0.10 0.08 1/492 44816\n')).toEqual({ load1: 0.07, load5: 0.1, load15: 0.08, running: 1, total: 492 });
    expect(() => loadData('nonsense')).toThrow();
  });

  it('cpu: usage between two samples, or since boot when they are the same', () => {
    expect(cpuData(STAT_2, STAT_1)).toEqual({ overallPercent: 25, cores: [{ id: 0, percent: 50 }, { id: 1, percent: 0 }], basis: '1 s' });
    expect(cpuData(STAT_1, STAT_1)).toMatchObject({ basis: 'since boot' });
    expect(cpuData(STAT_1)).toMatchObject({ basis: 'since boot' });
  });

  it('traffic: bytes per second per interface, loopback left out', () => {
    expect(trafficData(NET_2, NET_1)).toEqual([{ interface: 'eth0', rxBytesPerSec: 100_000, txBytesPerSec: 2_000, rxTotalBytes: 25682428, txTotalBytes: 66675212 }]);
  });

  it('ports and interfaces come from the ss and ip parsers', () => {
    const ss = `Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*    users:(("sshd",pid=1,fd=3))`;
    expect(portsData(ss)).toEqual([expect.objectContaining({ protocol: 'tcp', localPort: 22, process: 'sshd' })]);
    expect(interfacesData('lo               UNKNOWN        127.0.0.1/8 ::1/128\neth0@if9         UP             172.19.0.2/16')).toEqual([
      { name: 'lo', status: 'UNKNOWN', ipAddresses: ['127.0.0.1/8', '::1/128'] },
      expect.objectContaining({ status: 'UP', ipAddresses: ['172.19.0.2/16'] }),
    ]);
  });
});

describe('two samples, no shell (EX10.8)', () => {
  it('cpu_usage runs cat /proc/stat twice, a second apart, and reports the interval', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: STAT_1, stderr: '', exitCode: 0, durationMs: 1 })
      .mockResolvedValueOnce({ stdout: STAT_2, stderr: '', exitCode: 0, durationMs: 1 });
    const started = Date.now();
    const result = await new ActionRunner({ ssh: { exec, getSftp: vi.fn() } as never }).run('srv', 'cpu_usage', {});
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    expect(exec.mock.calls.map((c) => c[1])).toEqual(['cat /proc/stat', 'cat /proc/stat']);
    expect(result).toMatchObject({ ok: true, command: 'cat /proc/stat', data: { overallPercent: 25, basis: '1 s' } });
    expect(formatForModel(result)).toBe('{"overallPercent":25,"cores":[{"id":0,"percent":50},{"id":1,"percent":0}],"basis":"1 s"}');
  });

  it('a failed first sample still gives a since-boot figure', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: '', stderr: 'boom', exitCode: 1, durationMs: 1 })
      .mockResolvedValueOnce({ stdout: STAT_1, stderr: '', exitCode: 0, durationMs: 1 });
    const result = await new ActionRunner({ ssh: { exec, getSftp: vi.fn() } as never }).run('srv', 'cpu_usage', {});
    expect(result).toMatchObject({ ok: true, data: { basis: 'since boot' } });
  });
});

describe('selection: request words beat the core set when slots are few (EX10.8)', () => {
  const ids = (request: string, max: number) => selectActions(request, { max }).map((a) => a.id);

  it('a network request at 8 slots gets network actions, not the whole core set', () => {
    const picked = ids('show network traffic and open ports', 8);
    expect(picked).toEqual(expect.arrayContaining(['network_traffic', 'listening_ports', 'network_interfaces', 'network_connections']));
    expect(picked).toHaveLength(8);
    // before EX10.8 the nine core actions (+100 each) took every slot
    expect(picked.filter((id) => CORE_ACTIONS.includes(id)).length).toBeLessThanOrEqual(2);
  });

  it('cpu usage is offered for a cpu request', () => {
    expect(ids('what is my cpu usage right now', 8)).toContain('cpu_usage');
  });

  it('with room to spare the core set is still there', () => {
    const picked = ids('show network traffic and open ports', 30);
    for (const id of CORE_ACTIONS) expect(picked, id).toContain(id);
  });

  it('a vague request falls back to the core set', () => {
    expect(ids('hello', 9)).toEqual(getDefaultCatalog().list({ risk: 'read' }).map((a) => a.id).filter((id) => CORE_ACTIONS.includes(id)));
  });
});
