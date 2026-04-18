// EX3-B.3: SSL Certificates template
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

export const sslCertificatesTemplate: UITemplate = {
  id: 'ssl-certificates',
  name: 'SSL Certificates',
  description: 'TLS/SSL certificate inventory with expiry tracking',
  tags: ['ssl', 'tls', 'certificates', 'https', 'openssl', 'letsencrypt'],
  layoutPattern: 'single-table',
  matchPatterns: [
    '^openssl\\s+',
    '^certbot\\s+certificates',
    'ssl.*cert',
    'find.*\\.pem',
    'find.*\\.crt',
  ],
  schema: {
    title: 'SSL Certificates',
    description: 'TLS certificate inventory and expiry status',
    icon: 'ShieldCheck',
    sidebarItems: [{ id: 'main', label: 'Certificates' }],
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
              { type: 'stat-card', title: 'Total Certs', value: '5', icon: 'ShieldCheck', trend: 'neutral' },
              { type: 'stat-card', title: 'Valid', value: '4', icon: 'CheckCircle', trend: 'neutral' },
              { type: 'stat-card', title: 'Expiring Soon', value: '1', icon: 'AlertTriangle', trend: 'down' },
              { type: 'stat-card', title: 'Expired', value: '0', icon: 'XCircle', trend: 'neutral' },
            ],
          },
          {
            type: 'alert',
            title: 'Certificate Expiry Warning',
            message: 'api.example.com certificate expires in 14 days. Renew with: certbot renew',
            variant: 'warning',
          },
          {
            type: 'table',
            title: 'Certificate Inventory',
            columns: [
              { key: 'domain', label: 'Domain', sortable: true },
              { key: 'issuer', label: 'Issuer' },
              { key: 'validFrom', label: 'Valid From', sortable: true },
              { key: 'validTo', label: 'Valid To', sortable: true },
              { key: 'daysLeft', label: 'Days Left', sortable: true },
              { key: 'type', label: 'Type' },
              { key: 'status', label: 'Status' },
            ],
            rows: [
              { domain: 'example.com', issuer: "Let's Encrypt", validFrom: '2024-01-01', validTo: '2024-04-01', daysLeft: '76', type: 'RSA 2048', status: 'Valid' },
              { domain: 'www.example.com', issuer: "Let's Encrypt", validFrom: '2024-01-01', validTo: '2024-04-01', daysLeft: '76', type: 'RSA 2048', status: 'Valid' },
              { domain: 'api.example.com', issuer: "Let's Encrypt", validFrom: '2023-10-15', validTo: '2024-01-29', daysLeft: '14', type: 'ECDSA P-256', status: 'Expiring Soon' },
              { domain: 'mail.example.com', issuer: 'DigiCert', validFrom: '2023-06-01', validTo: '2025-06-01', daysLeft: '502', type: 'RSA 4096', status: 'Valid' },
              { domain: 'internal.example.com', issuer: 'Self-Signed', validFrom: '2024-01-10', validTo: '2025-01-10', daysLeft: '360', type: 'RSA 2048', status: 'Valid' },
            ],
            filters: {
              search: true,
              dropdowns: [
                { key: 'status', label: 'Status', options: [
                  { label: 'Valid', value: 'Valid' },
                  { label: 'Expiring Soon', value: 'Expiring Soon' },
                  { label: 'Expired', value: 'Expired' },
                ]},
                { key: 'issuer', label: 'Issuer', options: [
                  { label: "Let's Encrypt", value: "Let's Encrypt" },
                  { label: 'DigiCert', value: 'DigiCert' },
                  { label: 'Self-Signed', value: 'Self-Signed' },
                ]},
              ],
            },
          },
        ],
      },
    },
  },
};
