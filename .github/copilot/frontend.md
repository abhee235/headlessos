---
applyTo: "client/src/**/*.{ts,tsx}"
---

# Frontend Development Rules

## Code Style
- Functional React components with hooks — no class components
- TailwindCSS for ALL styling — no CSS files, no CSS-in-JS, no inline styles
- Zustand for state management — no Redux, no Context for global state
- TypeScript strict mode — no `any` types

## Component Pattern
```typescript
export function SomeView() {
  const { serverId } = useActiveServer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { /* fetch from backend */ }, [serverId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={...} />;
  if (!data) return <EmptyState message="..." />;

  return <Table columns={columns} data={data} />;
}
```

## State Management (Zustand)
- Global state in `client/src/store/`
- Single-instance tabs: some tabs only allow one per server

## Security
- NEVER use `dangerouslySetInnerHTML` with terminal output
- Terminal output goes through xterm.js only
- All data comes from the backend — frontend never calls remote servers directly
- No frontend polling — backend handles poll intervals and caching

## UI
- Reusable primitives → `client/src/components/ui/`
- App-specific components → `client/src/components/{AppName}/`
- Lucide React for icons
- Dark theme via TailwindCSS dark mode
- Context menus for all data views

## AppWindow (Modal Dialogs)
**All overlay/dialog/window UI MUST use `AppWindow`** from `@/components/ui/app-window`.
See `docs/UI_DESIGN.md` for full design system reference.

### When to Use
- Overlay dialogs (confirm, prompt, form, settings) → `AppWindow`
- Destructive confirmations → `ConfirmDialog` (pre-built)
- Non-modal desktop windows → `WindowFrame` (managed by window-store)

### Size Presets
| Size | Dimensions | Use Case |
|------|-----------|----------|
| `xs` | 380×260 | Single-input prompts: "New Folder", "Rename" |
| `sm` | 480×400 | Compact forms: "Properties", "About" |
| `md` | 680×520 | Medium single-pane: "Preferences" |
| `lg` | 900×620 | Full app with sidebar: "Settings", "Personalize" |
| `xl` | 1100×720 | Wide multi-pane: "Task Manager" |

### Compound API (slots as children)
```tsx
<AppWindow open={open} onOpenChange={setOpen} title="Title" icon={LucideIcon} size="lg">
  <AppWindow.Sidebar width={200}>
    <AppWindow.SidebarGroup label="Section">
      <AppWindow.SidebarItem id="item" icon={Icon} label="Label" active onClick={...} />
    </AppWindow.SidebarGroup>
  </AppWindow.Sidebar>
  <AppWindow.Toolbar>{/* action buttons */}</AppWindow.Toolbar>
  <AppWindow.Body>{/* main content, auto-scrollable */}</AppWindow.Body>
  <AppWindow.Footer>{/* status text or action buttons */}</AppWindow.Footer>
</AppWindow>
```

- Sidebar, Toolbar, Footer are **optional** — omit them for simple dialogs
- Body `noPadding` prop removes default padding (for terminal, grids)
- Body `noScroll` prop disables the ScrollArea wrapper
- Pass explicit `width`/`height` to override preset sizes

## File Locations
| Purpose | Path |
|---------|------|
| App entry | `client/src/App.tsx` |
| Layout | `client/src/components/Shell/` |
| Reusable UI | `client/src/components/ui/` |
| State | `client/src/store/` |
| Hooks | `client/src/hooks/` |
| Shared types | `shared/types.ts` |
