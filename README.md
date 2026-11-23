# Agent preset switcher (session header)

Turns the session header's **agent preset** label into a clickable dropdown.
Picking a preset rebinds the live session's composition right away — the agent
runs the new preset from the next call onwards.

The bundle is self-contained: it ships its own switch engine (Host half) and
does not depend on any other preset-switching plugin. Disable the old
`dsh-preset-switch` bundle when using this one, so both don't claim the same
header slot.

## What it does

| Piece | Location | Job |
| --- | --- | --- |
| Host engine | `lib/index.js` | Owns the switch API, the loopback guard and the settings sync. |
| Browser half | `lib/client.js` | Renders the dropdown in the session header, menus and toasts. |

### Host API

All routes are served under `/api/agent-preset-switch` and only accept
loopback callers (loopback `Host` header; loopback `Origin` when present).

| Method | Route | Response |
| --- | --- | --- |
| `GET` | `/status` | `{ ok, enabled, syncDefault }` |
| `GET` | `/list?sessionId=…` | `{ ok, default, active, presets: [{ id, name, description, broken, isDefault, active }] }` |
| `POST` | `/switch` | body `{ sessionId, preset }` → `{ ok, agentPreset, sessionId, recorded, recordError, defaultSync, effectiveFrom: "now" }` |

`POST /switch` performs, in this order:

1. `agentPresets.recompose(agent.ctx, preset)` — rebinds the live composition.
2. `agent.session.append("agent-preset/selected", { agentPreset })` — records the
   choice in the session log, which is the truth source every other surface
   reads. Recording is best-effort: a failure is reported in `recordError`.
3. `settings.update("agent-preset-registry", { selectedDefault })` — makes new
   sessions start with the same preset (CAS on the namespace revision). Off by
   default; enable it with `syncDefault: true`.

### Semantics

The switch is **"from this moment on"**. Earlier tool calls of the session
were made under the previous composition and are not replayed.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | When `false`, the header control is disabled and `POST /switch` answers `403 preset switching is disabled`. |
| `syncDefault` | `false` | Also write `selectedDefault` so new sessions use the preset. |

Both are volatile config fields. They can be edited at runtime with the config
editor (`ctx.get("configEditor").edit(ctx.fiber.entry, …)`) and take effect
immediately without restarting the plugin. The Host half reads them with
`config.<field>.get()` on every use.

## Install

Install as a DSH bundle/plugin, for example:

```
dsh plugin install github:ADBdad/dsh-agent-preset-switch-ui
```

Then make sure the bundle is selected/enabled in the profile. If an older
`dsh-preset-switch` bundle is enabled, disable it to avoid two dropdowns on the
same header slot.

## Requirements

- DSH `0.2.x`, Node `>= 18`.
- A profile that already runs `agent-preset-registry` (all official presets
  come from there).

> The npm package name keeps the `@dsh-external` scope used by the local
> profile that this bundle was developed against. It is distributed here as a
> GitHub bundle; publishing to npm is not required to install it.

## Development

```
node test/config.mjs && node test/client.mjs
```

The tests are zero-dependency static regression checks: they read the source
and assert the invariants that previously broke (volatile config, roster
sessionId + TTL, missing-preset entry point, module id == package name).

## License

MIT.
