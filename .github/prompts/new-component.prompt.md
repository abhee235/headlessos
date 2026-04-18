---
description: "Create a new React component following project patterns"
mode: "agent"
---

# New React Component

Create a new React component for HeadlessOS.

## File locations
- App component: `client/src/components/{AppName}/{ComponentName}.tsx`
- Reusable UI primitive: `client/src/components/ui/{name}.tsx`
- Test: `client/tests/components/{Name}.test.tsx`
- Store (if needed): `client/src/store/{name}-store.ts`

## Component pattern
```tsx
export function SomeView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={...} />;
  if (!data) return <EmptyState message="..." />;

  return <div className="...">{/* render data */}</div>;
}
```

## Rules
- Functional components with hooks — no class components
- TailwindCSS only — no CSS files, no inline styles
- Use CSS variables: `text-[rgb(var(--foreground))]` (see `client/src/styles.css`)
- Use `cn()` from `@/lib/utils` for className merging
- Dialogs/overlays MUST use `AppWindow` — see [docs/UI_DESIGN.md](../../docs/UI_DESIGN.md)
- Icons from Lucide React
- Handle loading/error/empty states
- Write component + interaction tests with @testing-library/react

## Component to create

{input}
