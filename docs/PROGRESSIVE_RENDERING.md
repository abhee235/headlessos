# Progressive Incremental Rendering — Vision & Architecture

> **The Magical Feature**: Views build up **live**, section by section, right in front of the user's eyes.  
> The user doesn't wait for the entire generation to finish — they see the skeleton appear, then each section fills in with real data as the agent works.  
> **People should _feel_ it.**

---

## What Makes It Magical

1. **Instant feedback** — The window opens immediately with a sidebar skeleton. The user knows something is happening.
2. **Progressive fill** — Each sidebar section (System, Docker, Network) fills in independently as the agent gathers data. The user can click around the sidebar and watch sections populate.
3. **No waiting wall** — Instead of a blank screen → sudden complete view, users see a living, breathing UI that grows organically.
4. **Sidebar navigation during generation** — Users can navigate between sections even before all sections are complete. Empty sections show elegant skeleton placeholders.

---

## Architecture: How It Works

### The `update_view` Tool

The key innovation: **`update_view` is a non-terminal agent tool**. The agent calls it multiple times during execution to send partial views to the frontend.

```
Agent Loop:
  1. get_server_context()           → understand the server
  2. update_view(sidebar skeleton)  → window opens with empty sidebar
  3. exec_command(system data)      → gather system info
  4. update_view(+system section)   → system section fills in live
  5. exec_command(docker data)      → gather docker info
  6. update_view(+docker section)   → docker section fills in live
  7. exec_command(network data)     → gather network info
  8. update_view(+network section)  → network section fills in live
  9. generate_schema(final)         → terminal call, Zod validated
```

### Event Flow

```
Backend (executor)                    Frontend (store → component)
─────────────────                     ──────────────────────────
update_view tool called
  → yield { type: 'partial_view',     → store.updatePartialView()
            view: DeepPartial<View> }   → DynamicAppWindow re-renders
  → loop continues                      → skeleton → real content

generate_schema tool called
  → yield { type: 'generation_complete', → store.completeSession()
            view: DynamicView }            → final validated view, loading=false
```

### Key Design Decisions

1. **`update_view` is an explicit tool** — works with FakeLLM AND real LLMs (no streaming dependency)
2. **Sidebar layout** is the default for complex views — most impactful progressive fill
3. **`generate_schema` remains the terminal call** — Zod validation exit gate
4. **WebSocket route + UIAgent need ZERO changes** — event pass-through works automatically
5. **Window opens on first `partial_view`** — not on `complete`
6. **DeepPartial<DynamicView>** already exists — DynamicViewRenderer already shows skeletons for missing data

---

## File Change Map

| File | Change |
|------|--------|
| `server/src/agent/tools/update-view.ts` | NEW — `update_view` tool (local tier, non-terminal) |
| `server/src/agent/tools/index.ts` | Register `update_view` (10 tools total) |
| `server/src/agent/executor.ts` | Add `partial_view` event type, detect `update_view` calls, update system prompt |
| `server/src/llm/providers/fake-scenarios.ts` | New `PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO` with sidebar layout |
| `server/src/index.ts` | Switch to progressive scenario |
| `client/src/store/agent-store.ts` | Add `partialView` field + `updatePartialView` action |
| `client/src/hooks/useUIAgent.ts` | Handle `partial_view` message type |
| `client/src/components/Agent/AgentPanel.tsx` | Add `partial_view` to `AgentEventType` |
| `client/src/components/Agent/UIAgentView.tsx` | Open window on first `partial_view`, wire to live store data |
| `client/src/components/DynamicUI/layouts/SidebarLayout.tsx` | Skeleton placeholders for empty sections |

---

## The 9-Turn Progressive Scenario

| Turn | Tool Call | What User Sees |
|------|-----------|----------------|
| 1 | `get_server_context()` | "Thinking..." |
| 2 | `update_view(sidebar skeleton)` | **Window opens!** Sidebar with 3 items, all sections empty/skeleton |
| 3 | `exec_command(uname, free, df, top)` | Sidebar visible, System section loading... |
| 4 | `update_view(+system section)` | **System section fills in!** Stats, progress bars appear |
| 5 | `exec_command(docker ps, docker stats)` | Docker section still skeleton |
| 6 | `update_view(+docker section)` | **Docker section fills in!** Container table appears |
| 7 | `exec_command(ss -tlnp, ip addr)` | Network section still skeleton |
| 8 | `update_view(+network section)` | **Network section fills in!** Ports table appears |
| 9 | `generate_schema(final complete view)` | Loading indicator gone, fully validated |

---

## Objective

> Build an agent pipeline where AI-generated UIs appear **progressively** — the window opens instantly with a scaffold, and each section populates live as the agent gathers data. The experience should feel magical and alive, not like waiting for a loading spinner to finish.
