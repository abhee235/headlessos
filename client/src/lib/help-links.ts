// M15.14, M15.15: where the app sends someone who is stuck
// @see docs/phases/phase-15.md

const DOCS = 'https://headlessos.com/docs';

export const DOCS_URL = `${DOCS}/introduction`;
export const TROUBLESHOOTING_URL = `${DOCS}/troubleshooting`;
export const REPORT_ISSUE_URL = 'https://github.com/abhee235/headlessos/issues';

/** One section of the Troubleshooting page, by its heading's anchor */
export function troubleshootingSection(section: string): string {
  return `${TROUBLESHOOTING_URL}#${section}`;
}
