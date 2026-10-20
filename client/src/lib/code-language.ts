// EX8.8: Monaco language id for a file name (syntax colouring in the code editor).
// @see docs/phases/phase-ex8.md
//
// Covers the files a server admin opens: source code, config formats, and
// extension-less names (Dockerfile, .bashrc, nginx.conf…). Anything unknown is
// 'plaintext', so the editor still opens it, just without colours.

/** Exact base names (lower-cased) that carry no useful extension */
const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'shell',
  gnumakefile: 'shell',
  vagrantfile: 'ruby',
  gemfile: 'ruby',
  rakefile: 'ruby',
  jenkinsfile: 'java', // Groovy has no Monaco grammar; Java's is close
  caddyfile: 'shell',
  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.bash_aliases': 'shell',
  '.bash_logout': 'shell',
  '.profile': 'shell',
  '.zshrc': 'shell',
  '.zprofile': 'shell',
  '.env': 'ini',
  '.gitconfig': 'ini',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.gitignore': 'shell',
  '.dockerignore': 'shell',
  crontab: 'shell',
  hosts: 'shell',
  fstab: 'shell',
  sshd_config: 'shell',
  ssh_config: 'shell',
};

const BY_EXT: Record<string, string> = {
  // web + scripting
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', json5: 'json', webmanifest: 'json',
  html: 'html', htm: 'html', xhtml: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', mdx: 'mdx', rst: 'restructuredtext',
  py: 'python', pyw: 'python', pyi: 'python',
  rb: 'ruby', php: 'php', pl: 'perl', pm: 'perl', lua: 'lua', r: 'r',
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell', fish: 'shell',
  ps1: 'powershell', psm1: 'powershell', bat: 'bat', cmd: 'bat',
  // systems
  go: 'go', rs: 'rust', c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', swift: 'swift',
  cs: 'csharp', fs: 'fsharp', dart: 'dart', ex: 'elixir', exs: 'elixir', clj: 'clojure',
  // data + config
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'shell',
  cnf: 'ini', properties: 'ini', service: 'ini', timer: 'ini', socket: 'ini',
  mount: 'ini', target: 'ini', network: 'ini', desktop: 'ini',
  env: 'ini', xml: 'xml', xsd: 'xml', svg: 'xml', plist: 'xml', csproj: 'xml',
  sql: 'sql', psql: 'pgsql', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
  tf: 'hcl', tfvars: 'hcl', hcl: 'hcl', nomad: 'hcl',
  dockerfile: 'dockerfile', redis: 'redis', pug: 'pug', hbs: 'handlebars',
  twig: 'twig', liquid: 'liquid',
};

export function languageForFile(path: string): string {
  const base = (path.split('/').pop() ?? path).toLowerCase();
  if (BY_NAME[base]) return BY_NAME[base];
  // Dockerfile.dev, docker-compose.override.yml handled by the extension below
  if (base.startsWith('dockerfile.') || base.endsWith('.dockerfile')) return 'dockerfile';
  if (base.startsWith('.env.')) return 'ini';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return 'plaintext';
  return BY_EXT[base.slice(dot + 1)] ?? 'plaintext';
}

/** Display name for the toolbar chip */
const LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', json: 'JSON', html: 'HTML',
  css: 'CSS', scss: 'SCSS', less: 'Less', markdown: 'Markdown', mdx: 'MDX',
  python: 'Python', ruby: 'Ruby', php: 'PHP', perl: 'Perl', lua: 'Lua', r: 'R',
  shell: 'Shell', powershell: 'PowerShell', bat: 'Batch', go: 'Go', rust: 'Rust',
  cpp: 'C/C++', java: 'Java', kotlin: 'Kotlin', scala: 'Scala', swift: 'Swift',
  csharp: 'C#', fsharp: 'F#', dart: 'Dart', elixir: 'Elixir', clojure: 'Clojure',
  yaml: 'YAML', ini: 'INI', xml: 'XML', sql: 'SQL', pgsql: 'PostgreSQL',
  graphql: 'GraphQL', protobuf: 'Protobuf', hcl: 'HCL', dockerfile: 'Dockerfile',
  redis: 'Redis', pug: 'Pug', handlebars: 'Handlebars', twig: 'Twig', liquid: 'Liquid',
  restructuredtext: 'reStructuredText', plaintext: 'Plain text',
};

export function languageLabel(id: string): string {
  return LABELS[id] ?? id;
}

/** Config files borrow the shell grammar (# comments) but aren't shell scripts */
const CONFIG_NAMES = new Set(['crontab', 'hosts', 'fstab', 'sshd_config', 'ssh_config', 'caddyfile']);
const CONFIG_EXTS = new Set(['conf']);

/** Toolbar label for a file: its language, or "Config" for config files */
export function fileLanguageLabel(path: string): string {
  const base = (path.split('/').pop() ?? path).toLowerCase();
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  if (CONFIG_NAMES.has(base) || CONFIG_EXTS.has(ext)) return 'Config';
  return languageLabel(languageForFile(path));
}
