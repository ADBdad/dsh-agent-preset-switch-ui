# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-11-23

### Added

- Clickable agent-preset switcher in the session header (replaces the read-only chip).
- Self-contained switch engine: `GET /api/agent-preset-switch/list|status` and
  `POST /api/agent-preset-switch/{switch,default}`. No dependency on other plugins.
- Mid-session switching via `agentPresets.recompose()` plus an
  `agent-preset/selected` session event, effective from this moment on.
- Optional `syncDefault` writes the registry's `selectedDefault` so new sessions
  start with the chosen preset.
- Loopback-only HTTP API, per-session switch queue, and broken-preset guards.
- Zero-dependency regression tests (`test/config.mjs`, `test/client.mjs`); CI on
  Node 18/20/22.

### Fixed

- Configuration now uses volatile config fields read with `config.field.get()`;
  the old legacy `settings.register` namespace threw on hot reload and silently
  dropped user settings.
- Roster requests now carry `sessionId` so the host can mark the active preset.
- The roster cache now has a 5-second freshness window.
- Sessions without a preset still show a "Choose a preset" control instead of
  hiding the entry point.
