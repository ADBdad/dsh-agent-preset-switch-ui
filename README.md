# Agent 预设切换器（会话标题栏） / Agent preset switcher (session header)

把会话标题栏里的 **Agent 预设**标签变成一个可点击的下拉菜单。选中预设后，当前会话立刻按新预设重组——下一次调用起，Agent 就跑在新预设下。

Turns the session header's **agent preset** label into a clickable dropdown. Picking a preset rebinds the live session's composition right away — the agent runs the new preset from the next call onwards.

这个插件**自带切换引擎**（Host 半），不依赖任何其它预设切换插件。

The bundle is **self-contained**: it ships its own switch engine (Host half) and does not depend on any other preset-switching plugin.

## 它做什么 / What it does

| 部件 Piece | 位置 Location | 职责 Job |
| --- | --- | --- |
| Host 引擎 Host engine | `lib/index.js` | 切换 API、loopback 校验、设置同步 / switch API, loopback guard, settings sync |
| 浏览器半 Browser half | `lib/client.js` | 标题栏下拉、菜单、提示 / dropdown in header, menus, toasts |

### Host API

所有路由都在 `/api/agent-preset-switch` 下，只接受本机回环调用（回环 `Host` 头；有 `Origin` 时也必须是回环）。

All routes are served under `/api/agent-preset-switch` and only accept loopback callers (loopback `Host` header; loopback `Origin` when present).

| 方法 Method | 路由 Route | 响应 Response |
| --- | --- | --- |
| `GET` | `/status` | `{ ok, enabled, syncDefault }` |
| `GET` | `/list?sessionId=…` | `{ ok, enabled, default, active, presets: [{ id, name, description, broken, isDefault, active }] }` |
| `POST` | `/default` | body `{ preset }` → `{ ok, namespace, selectedDefault, error }`（直接写全局默认，不受 `enabled` 限制）/ writes the global default directly, not gated by `enabled` |
| `POST` | `/switch` | body `{ sessionId, preset }` → `{ ok, agentPreset, sessionId, recorded, recordError, defaultSync, effectiveFrom: "now" }` |

`POST /switch` 按顺序做三件事 / performs these steps in order：

1. `agentPresets.recompose(agent.ctx, preset)` —— 重组当前 Agent 的实时 composition，必做。/ rebinds the live composition (always).
2. `agent.session.append("agent-preset/selected", { agentPreset })` —— 把选择记进会话日志，其它界面都以它为准。记录是尽力而为，失败只记在 `recordError`。/ records the choice in the session log, which other surfaces treat as the truth source. Best-effort: a failure is only reported in `recordError`.
3. 仅当 `syncDefault: true` 时，`settings.update("agent-preset-registry", { selectedDefault })` 更新全局默认（按 namespace revision 做 CAS）。默认关闭。/ only when `syncDefault: true`, updates the global default via `settings.update("agent-preset-registry", { selectedDefault })` (CAS on the namespace revision). Off by default.

### 切换语义 / Semantics

切换是**从这一刻起生效**。本次会话更早的工具调用仍在旧 composition 下完成，不会重放。

The switch is **"from this moment on"**. Earlier tool calls of the session were made under the previous composition and are not replayed.

## 配置 / Configuration

| 键 Key | 默认 Default | 含义 Meaning |
| --- | --- | --- |
| `enabled` | `true` | 为 `false` 时标题栏控件禁用置灰，`POST /switch` 返回 `403 preset switching is disabled`。/ when `false`, the header control is disabled/greyed and `POST /switch` answers `403 preset switching is disabled`. |
| `syncDefault` | `false` | 为 `true` 时，切换也写 `selectedDefault`，让新会话用同一个预设。/ when `true`, also writes `selectedDefault` so new sessions use the preset. |

两个字段都是 volatile 配置，可以用配置编辑器在运行时改（`ctx.get("configEditor").edit(ctx.fiber.entry, …)`），无需重启插件；Host 每次使用时通过 `config.<field>.get()` 读实时值。

Both are volatile config fields. They can be edited at runtime with the config editor (`ctx.get("configEditor").edit(ctx.fiber.entry, …)`) and take effect immediately without restarting. The Host reads them with `config.<field>.get()` on every use.

## 安装 / Install

作为 DSH bundle/plugin 安装，例如 / Install as a DSH bundle/plugin, for example：

```
dsh plugin install github:ADBdad/dsh-agent-preset-switch-ui
```

然后在 profile 里选中/启用这个 bundle。

Then make sure the bundle is selected/enabled in the profile.

## 运行环境 / Requirements

- DSH `0.2.x`、Node `>= 18`。/ DSH `0.2.x`, Node `>= 18`.
- 一个已经跑着 `agent-preset-registry` 的 profile（所有官方预设都来自那里）。/ A profile that already runs `agent-preset-registry` (all official presets come from there).

> npm 包名保留了开发时本地 profile 用的 `@dsh-external` scope。这里以 GitHub bundle 形式分发，安装不需要发布到 npm。
> The npm package name keeps the `@dsh-external` scope used by the local profile this bundle was developed against. It is distributed here as a GitHub bundle; publishing to npm is not required to install it.

## 开发 / Development

```
node test/config.mjs && node test/client.mjs
```

测试是零依赖的静态回归检查：读源码断言那些曾经出过 bug 的不变量（volatile 配置、roster 的 sessionId + TTL、无预设时的入口、模块 id == 包名、禁用态）。

The tests are zero-dependency static regression checks: they read the source and assert the invariants that previously broke (volatile config, roster sessionId + TTL, missing-preset entry point, module id == package name, disabled state).

## 许可 / License

MIT.
