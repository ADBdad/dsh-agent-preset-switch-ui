/**
 * Host half of the agent-preset switch UI bundle.
 *
 * It owns the switch engine:
 *   - GET  /api/agent-preset-switch/list?sessionId=...  -> roster + which one is active
 *   - GET  /api/agent-preset-switch/status              -> enabled flag
 *   - POST /api/agent-preset-switch/switch              -> { sessionId, preset }
 *
 * The switch itself is a forced, in-place rebind of the live agent's
 * composition (`agentPresets.recompose`) plus a session-log record
 * (`agent-preset/selected`), which is the only truth source the rest of the
 * product reads. Optionally the registry's `selectedDefault` is updated so
 * freshly created sessions start with the same preset.
 *
 * Only loopback callers are served.
 */
import z from "@deepseek-ai/schemastery";

export const name = "dsh-agent-preset-switch-ui";

/** Only the web server is a hard dependency; everything else is optional. */
export const inject = ["webServer"];

// Both fields are volatile: the config editor updates them in place without
// restarting the plugin, and `config.<field>.get()` always reads the live value.
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  syncDefault: z.boolean().default(true).volatile(),
});

const API_PREFIX = "/api/agent-preset-switch";
const AGENT_PRESET_NS = "agent-preset-registry";
const MAX_BODY_BYTES = 64 * 1024;

const isLoopback = (hostname) =>
  hostname === "localhost" ||
  hostname === "::1" ||
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(hostname ?? ""));

function hostnameOf(hostHeader) {
  const raw = String(hostHeader ?? "").trim();
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end === -1 ? raw.slice(1) : raw.slice(1, end);
  }
  const colon = raw.lastIndexOf(":");
  return colon === -1 ? raw : raw.slice(0, colon);
}

/** Same guard the shipped preset tooling uses: loopback host, loopback origin. */
function guardLocal(req) {
  if (!isLoopback(hostnameOf(req.headers?.host))) return false;
  const origin = req.headers?.origin;
  if (origin && origin !== "null") {
    try {
      if (!isLoopback(new URL(origin).hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("request body too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw Object.assign(new Error("invalid JSON body"), { statusCode: 400 });
  }
}

/** Per-session switch queues, so two clicks can never race each other. */
const switchQueues = new Map();

/** Serialise switches per session so two clicks can never race each other. */
function enqueueSwitch(key, fn) {
  const previous = switchQueues.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  switchQueues.set(key, next);
  const cleanup = () => {
    if (switchQueues.get(key) === next) switchQueues.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

export function apply(ctx, config) {
  // `enabled` / `syncDefault` are volatile config fields: the loader updates the
  // reference in place, so we must read the live value on every use instead of
  // caching it. Tolerate a plain literal config for direct apply() callers.
  const readVolatile = (value, fallback) => {
    if (value && typeof value.get === "function") {
      try {
        return value.get();
      } catch {
        return fallback;
      }
    }
    return value === undefined || value === null ? fallback : value;
  };
  const enabledNow = () => readVolatile(config?.enabled, true);
  const syncDefaultNow = () => readVolatile(config?.syncDefault, true);

  const presetsOf = () => ctx.get("agentPresets");
  const agentsOf = () => ctx.get("agents");

  async function roster(sessionId) {
    const presets = presetsOf();
    if (!presets) {
      return { status: 503, body: { ok: false, error: "agent preset registry is unavailable" } };
    }
    let rows;
    try {
      rows = await presets.list();
    } catch (error) {
      return {
        status: 500,
        body: { ok: false, error: String(error?.message ?? error) },
      };
    }
    let active = null;
    if (sessionId) {
      const agent = agentsOf()?.get?.(sessionId);
      if (agent) {
        try {
          active = presets.presetForSession?.(agent.session) ?? null;
        } catch {
          active = null;
        }
        if (!active) {
          try {
            active = presets.composedPreset?.(agent.ctx) ?? null;
          } catch {
            active = null;
          }
        }
      }
    }
    return {
      status: 200,
      body: {
        ok: true,
        default: presets.defaultId ?? null,
        active: active ?? null,
        presets: rows.map((row) => ({
          id: row.id,
          name: row.name ?? null,
          description: row.description ?? null,
          broken: row.broken ?? null,
          isDefault: row.id === presets.defaultId,
          active: active != null && row.id === active,
        })),
      },
    };
  }

  async function writeDefaultPreset(presetId) {
    const service = ctx.get("settings");
    if (!service) {
      return { ok: false, skipped: true, error: "settings service is unavailable" };
    }
    try {
      const descriptors = await service.describe?.();
      const row = Array.isArray(descriptors)
        ? descriptors.find((item) => item?.ns === AGENT_PRESET_NS)
        : undefined;
      const result = await service.update(
        AGENT_PRESET_NS,
        { selectedDefault: presetId },
        row?.revision,
      );
      if (result && result.ok === false) {
        return { ok: false, error: result.error?.message ?? "settings update was rejected" };
      }
      return { ok: true, namespace: AGENT_PRESET_NS, selectedDefault: presetId };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  async function switchPreset(sessionId, presetId) {
    const presets = presetsOf();
    if (!presets) {
      throw Object.assign(new Error("agent preset registry is unavailable"), {
        statusCode: 503,
      });
    }
    const agent = agentsOf()?.get?.(sessionId);
    if (!agent?.ctx) {
      throw Object.assign(
        new Error(`live agent not found for session ${sessionId}`),
        { statusCode: 404 },
      );
    }
    let rows;
    try {
      rows = await presets.list();
    } catch (error) {
      throw Object.assign(new Error(String(error?.message ?? error)), { statusCode: 500 });
    }
    const target = rows.find((row) => row.id === presetId);
    if (!target) {
      throw Object.assign(new Error(`unknown agent preset "${presetId}"`), {
        statusCode: 404,
        available: rows.map((row) => row.id),
      });
    }
    if (target.broken) {
      throw Object.assign(
        new Error(`agent preset "${presetId}" is broken: ${target.broken}`),
        { statusCode: 409 },
      );
    }

    // Rebind the live composition of this agent. From here on the agent runs
    // the new preset; calls made before this point keep the old composition.
    await presets.recompose(agent.ctx, presetId);

    let recorded = false;
    let recordError = null;
    try {
      agent.session?.append?.("agent-preset/selected", { agentPreset: presetId });
      recorded = true;
    } catch (error) {
      recordError = String(error?.message ?? error);
      console.warn(`[agent-preset-switch-ui] could not record the preset: ${recordError}`);
    }

    const defaultSync = syncDefaultNow()
      ? await writeDefaultPreset(presetId)
      : { ok: false, skipped: true };

    return {
      ok: true,
      agentPreset: presetId,
      sessionId,
      recorded,
      recordError,
      defaultSync,
      effectiveFrom: "now",
    };
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
          const send = (code, payload) => {
            try {
              res.writeHead(code, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              });
              res.end(JSON.stringify(payload));
            } catch {
              /* client already gone */
            }
          };
          if (!guardLocal(req)) {
            send(403, { ok: false, error: "forbidden origin" });
            return;
          }
          const url = new URL(req.url ?? "/", "http://localhost");
          const route = url.pathname.slice(API_PREFIX.length) || "/";
          const method = String(req.method ?? "GET").toUpperCase();
          try {
            if (method === "GET" && route === "/status") {
              send(200, { ok: true, enabled: enabledNow(), syncDefault: syncDefaultNow() });
              return;
            }
            if (method === "GET" && (route === "/list" || route === "/")) {
              const sessionId = url.searchParams.get("sessionId") ?? undefined;
              const result = await roster(sessionId);
              send(result.status, result.body);
              return;
            }
            if (method === "POST" && route === "/default") {
              const contentType = String(req.headers?.["content-type"] ?? "");
              if (!/^application\/json\b/i.test(contentType)) {
                send(415, {
                  ok: false,
                  error: "content-type must be application/json",
                });
                return;
              }
              const body = await readBody(req);
              const presetId =
                typeof body.preset === "string" ? body.preset.trim() : "";
              if (!presetId) {
                send(400, { ok: false, error: "preset is required" });
                return;
              }
              const presets = presetsOf();
              let rows = [];
              if (presets) {
                try {
                  rows = await presets.list();
                } catch {
                  rows = [];
                }
              }
              if (presets && !rows.some((row) => row.id === presetId)) {
                send(404, {
                  ok: false,
                  error: `unknown agent preset "${presetId}"`,
                  available: rows.map((row) => row.id),
                });
                return;
              }
              const result = await writeDefaultPreset(presetId);
              send(result.ok ? 200 : 500, {
                ok: Boolean(result.ok),
                namespace: result.namespace,
                selectedDefault: result.selectedDefault,
                error: result.error,
              });
              return;
            }
            if (method === "POST" && route === "/switch") {
              const contentType = String(req.headers?.["content-type"] ?? "");
              if (!/^application\/json\b/i.test(contentType)) {
                send(415, {
                  ok: false,
                  error: "content-type must be application/json",
                });
                return;
              }
              const body = await readBody(req);
              const sessionId =
                typeof body.sessionId === "string" ? body.sessionId.trim() : "";
              const presetId =
                typeof body.preset === "string" ? body.preset.trim() : "";
              if (!sessionId || !presetId) {
                send(400, {
                  ok: false,
                  error: "sessionId and preset are required",
                });
                return;
              }
              if (!enabledNow()) {
                send(403, { ok: false, error: "preset switching is disabled" });
                return;
              }
              const result = await enqueueSwitch(sessionId, () =>
                switchPreset(sessionId, presetId),
              );
              send(200, result);
              return;
            }
            send(404, { ok: false, error: `unknown route ${method} ${route}` });
          } catch (error) {
            send(Number(error?.statusCode) || 500, {
              ok: false,
              error: String(error?.message ?? error),
              available: error?.available,
            });
          }
        },
      }),
    "agent-preset-switch-ui: http api",
  );
}
