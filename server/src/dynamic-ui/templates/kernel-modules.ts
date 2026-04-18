// EX3-B.3: Kernel Modules template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const kernelModulesTemplate: UITemplate = {
  id: 'kernel-modules',
  name: 'Kernel Modules',
  description: 'Loaded kernel modules with dependency information',
  tags: ['kernel', 'modules', 'lsmod', 'modprobe', 'driver'],
  layoutPattern: 'single-table',
  matchPatterns: [
    '^lsmod',
    '^modinfo\\s+',
    '^modprobe\\s+--show',
    '^cat\\s+/proc/modules',
  ],
  schema: {
    title: 'Kernel Modules',
    description: 'Loaded kernel modules and their dependencies',
    icon: 'Cpu',
    sidebarItems: [{ id: 'main', label: 'Modules' }],
    sections: {
      main: {
        layout: 'stack',
        gap: 'md',
        children: [
          {
            layout: 'grid',
            autoFit: true,
            minChildWidth: 180,
            children: [
              { type: 'stat-card', title: 'Loaded Modules', value: '87', icon: 'Cpu', trend: 'neutral' },
              { type: 'stat-card', title: 'Total Size', value: '42', unit: 'MB', icon: 'HardDrive', trend: 'neutral' },
              { type: 'stat-card', title: 'Kernel', value: '6.2.0', icon: 'Settings', trend: 'neutral' },
            ],
          },
          {
            type: 'table',
            title: 'Loaded Modules',
            columns: [
              { key: 'module', label: 'Module', sortable: true },
              { key: 'size', label: 'Size', sortable: true },
              { key: 'usedBy', label: 'Used By Count', sortable: true },
              { key: 'dependents', label: 'Dependents' },
              { key: 'category', label: 'Category', sortable: true },
            ],
            rows: [
              { module: 'ext4', size: '692K', usedBy: '1', dependents: 'mbcache, jbd2', category: 'Filesystem' },
              { module: 'ip_tables', size: '32K', usedBy: '3', dependents: 'iptable_filter, iptable_nat', category: 'Network' },
              { module: 'nf_conntrack', size: '172K', usedBy: '4', dependents: 'nf_nat, xt_conntrack', category: 'Network' },
              { module: 'veth', size: '28K', usedBy: '0', dependents: '-', category: 'Network' },
              { module: 'bridge', size: '180K', usedBy: '1', dependents: 'br_netfilter', category: 'Network' },
              { module: 'overlay', size: '140K', usedBy: '24', dependents: '-', category: 'Filesystem' },
              { module: 'nvidia', size: '42M', usedBy: '2', dependents: 'nvidia_modeset, nvidia_uvm', category: 'GPU' },
              { module: 'snd_hda_intel', size: '52K', usedBy: '0', dependents: '-', category: 'Audio' },
              { module: 'e1000e', size: '280K', usedBy: '0', dependents: '-', category: 'Network' },
              { module: 'dm_crypt', size: '40K', usedBy: '1', dependents: '-', category: 'Storage' },
            ],
            filters: {
              search: true,
              dropdowns: [
                { key: 'category', label: 'Category', options: [
                  { label: 'Filesystem', value: 'Filesystem' },
                  { label: 'Network', value: 'Network' },
                  { label: 'GPU', value: 'GPU' },
                  { label: 'Audio', value: 'Audio' },
                  { label: 'Storage', value: 'Storage' },
                ]},
              ],
            },
          },
        ],
      },
    },
  },
};
