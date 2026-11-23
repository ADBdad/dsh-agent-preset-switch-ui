/**
 * Browser half of the agent-preset switch UI bundle.
 *
 * It replaces the read-only "agent preset" chip in the session header with a
 * clickable dropdown. The list comes from the bundle's own Host API
 * (/api/agent-preset-switch), so the switch does not depend on any other
 * plugin.
 */
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-agent-preset-switch-ui",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const ReactDOM = require("react-dom");
    const createPortal =
      ReactDOM.createPortal ??
      (ReactDOM.default && ReactDOM.default.createPortal);

    const NS = "agent-preset-switch-ui";
    const API = "/api/agent-preset-switch";
    const inject = ["slots", "locale"];

    const DICT = {
      zh: {
        "menu.title": "切换 Agent 预设",
        "menu.pick": "选择预设",
        "menu.disabled": "预设切换已停用",
        "menu.loading": "加载中…",
        "menu.empty": "没有可用的预设",
        "menu.error": "读取预设列表失败",
        "menu.default": "默认",
        "menu.switching": "切换中…",
        "toast.switched": "已切换到",
        "toast.switchFailed": "切换失败",
        "preset.standard.name": "标准",
        "preset.standard.description": "完整工具集与默认 Agent 组合。",
        "preset.ptc.name": "PTC",
        "preset.ptc.description": "以 Program-Think-Compute 为核心的编排模式。",
        "preset.minimal.name": "极简",
        "preset.minimal.description": "只保留最小工具面，适合小任务。",
        "preset.cordis.name": "Cordis",
        "preset.cordis.description": "由 Cordis 组合直接驱动的预设。",
      },
      en: {
        "menu.title": "Switch agent preset",
        "menu.pick": "Choose a preset",
        "menu.disabled": "Preset switching is disabled",
        "menu.loading": "Loading…",
        "menu.empty": "No preset available",
        "menu.error": "Could not load presets",
        "menu.default": "default",
        "menu.switching": "Switching…",
        "toast.switched": "Switched to",
        "toast.switchFailed": "Switch failed",
        "preset.standard.name": "Standard",
        "preset.standard.description": "Full tool set with the default agent composition.",
        "preset.ptc.name": "PTC",
        "preset.ptc.description": "Orchestration mode built around Program-Think-Compute.",
        "preset.minimal.name": "Minimal",
        "preset.minimal.description": "Keeps only a minimal tool surface for small tasks.",
        "preset.cordis.name": "Cordis",
        "preset.cordis.description": "Preset driven straight by a Cordis composition.",
      },
    };

    /* ----------------------------------------------------------------- *
     * Shared roster cache (names + descriptions are global, the active
     * marker is computed per session from the projection).
     * ----------------------------------------------------------------- */
    const rosterCache = { at: 0, rows: null, inflight: null, enabled: true };
    const ROSTER_TTL_MS = 5000;

    // `sessionId` is optional: passing it lets the host mark which preset is
    // active for this exact session instead of relying only on the projection.
    function fetchRoster(sessionId, force) {
      const fresh =
        !force &&
        rosterCache.rows &&
        Date.now() - rosterCache.at < ROSTER_TTL_MS;
      if (fresh) return Promise.resolve(rosterCache.rows);
      if (rosterCache.inflight) return rosterCache.inflight;
      rosterCache.inflight = (async () => {
        try {
          const query = sessionId
            ? `?sessionId=${encodeURIComponent(sessionId)}`
            : "";
          const response = await fetch(`${API}/list${query}`, {
            headers: { accept: "application/json" },
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.ok === false) {
            throw new Error(data.error || `HTTP ${response.status}`);
          }
          const rows = Array.isArray(data.presets) ? data.presets : [];
          rosterCache.enabled = data.enabled !== false;
          rosterCache.rows = rows;
          rosterCache.at = Date.now();
          return rows;
        } finally {
          rosterCache.inflight = null;
        }
      })();
      return rosterCache.inflight;
    }

    function localized(t, key, fallback) {
      const text = t(key);
      return text === key ? fallback : text;
    }

    function displayName(row, t) {
      if (row.name) return row.name;
      return localized(t, `preset.${row.id}.name`, row.id);
    }

    function displayDescription(row, t) {
      if (row.description) return row.description;
      return localized(t, `preset.${row.id}.description`, "");
    }

    /* ----------------------------------------------------------------- *
     * Glyphs (original geometry).
     * ----------------------------------------------------------------- */
    function PresetGlyph(props) {
      const size = props.size || 14;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
          style: { opacity: 0.7, flex: "none" },
        },
        h("rect", { x: 2.25, y: 2.25, width: 11.5, height: 11.5, rx: 3 }),
        h("path", { d: "M5.6 6.6h4.6" }),
        h("path", { d: "M8.4 5 10.2 6.6 8.4 8.2" }),
        h("path", { d: "M10.4 9.4H5.8" }),
        h("path", { d: "M7.6 11 5.8 9.4 7.6 7.8" }),
      );
    }

    function CaretGlyph() {
      return h(
        "svg",
        {
          width: 10,
          height: 10,
          viewBox: "0 0 10 10",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.4,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
          style: { opacity: 0.6, flex: "none" },
        },
        h("path", { d: "M2.5 4 5 6.5 7.5 4" }),
      );
    }

    function CheckGlyph() {
      return h(
        "svg",
        {
          width: 12,
          height: 12,
          viewBox: "0 0 12 12",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
          style: { flex: "none" },
        },
        h("path", { d: "M2.5 6.3 4.8 8.6 9.5 3.6" }),
      );
    }

    /* ----------------------------------------------------------------- *
     * Styles (theme tokens only).
     * ----------------------------------------------------------------- */
    const LABEL_STYLE = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      height: "22px",
      maxWidth: "180px",
      padding: "0 4px 0 4px",
      border: "none",
      borderRadius: "var(--dsw-radius-xs, 4px)",
      background: "var(--dsw-alias-fill-tsp-secondary, rgba(127,127,127,0.16))",
      color: "var(--dsw-alias-label-tertiary, inherit)",
      fontFamily: "inherit",
      fontSize: "12px",
      lineHeight: "22px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      cursor: "pointer",
      appearance: "none",
      WebkitAppearance: "none",
    };

    const MENU_STYLE = {
      position: "fixed",
      zIndex: 10060,
      minWidth: "230px",
      maxWidth: "320px",
      maxHeight: "min(70vh, 460px)",
      overflowY: "auto",
      padding: "4px",
      borderRadius: "var(--dsw-radius-sm, 8px)",
      // bg-layer-2 is a near-opaque panel surface; bg-layer-3 is translucent
      // and would let the conversation bleed through the menu.
      background: "var(--dsw-alias-bg-layer-2, #232324)",
      backdropFilter: "blur(24px) saturate(1.4)",
      WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      border: "1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.10))",
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      color: "var(--dsw-alias-label-primary, inherit)",
      fontFamily: "inherit",
      fontSize: "12px",
      textAlign: "left",
    };

    const ITEM_STYLE = {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      width: "100%",
      padding: "6px 8px",
      border: "none",
      borderRadius: "var(--dsw-radius-xs, 4px)",
      background: "transparent",
      color: "inherit",
      fontFamily: "inherit",
      fontSize: "12px",
      textAlign: "left",
      cursor: "pointer",
      appearance: "none",
      WebkitAppearance: "none",
    };

    const TOAST_STYLE = {
      position: "fixed",
      left: "50%",
      bottom: "32px",
      transform: "translateX(-50%)",
      zIndex: 10070,
      maxWidth: "420px",
      padding: "8px 14px",
      borderRadius: "var(--dsw-radius-sm, 8px)",
      background: "var(--dsw-alias-bg-layer-2, #232324)",
      backdropFilter: "blur(24px) saturate(1.4)",
      WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      border: "1px solid var(--dsw-alias-border-l1, rgba(0,0,0,0.10))",
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      color: "var(--dsw-alias-label-primary, inherit)",
      fontFamily: "inherit",
      fontSize: "12px",
      textAlign: "center",
    };

    /* ----------------------------------------------------------------- *
     * The header control.
     * ----------------------------------------------------------------- */
    function AgentPresetSwitcher(props) {
      const sessionId = props.sessionId;
      const t = props.t || ((key) => key);
      const useSessions = props.useSessions;

      const [open, setOpen] = React.useState(false);
      const [rows, setRows] = React.useState(rosterCache.rows || []);
      const [loading, setLoading] = React.useState(false);
      const [loadError, setLoadError] = React.useState(null);
      const [busy, setBusy] = React.useState(null);
      const [toast, setToast] = React.useState(null);
      const [localPreset, setLocalPreset] = React.useState(null);
      const [enabled, setEnabled] = React.useState(rosterCache.enabled !== false);
      const [anchor, setAnchor] = React.useState(null);
      const buttonRef = React.useRef(null);
      const menuRef = React.useRef(null);
      const toastTimer = React.useRef(null);

      const selector = React.useCallback((state) => {
        const value = state && state.byId && state.byId[sessionId]
          ? state.byId[sessionId].projectionValues &&
            state.byId[sessionId].projectionValues.agentPreset
          : undefined;
        return typeof value === "string" ? value : undefined;
      }, [sessionId]);

      const projected = typeof useSessions === "function" ? useSessions(selector) : undefined;
      const presetId = localPreset || projected || null;

      const refresh = React.useCallback(() => {
        setLoading(true);
        return fetchRoster(sessionId, true)
          .then((next) => {
            setRows(next);
            setEnabled(rosterCache.enabled !== false);
            setLoadError(null);
          })
          .catch((error) => {
            setLoadError(String((error && error.message) || error));
          })
          .finally(() => setLoading(false));
      }, [sessionId]);

      React.useEffect(() => {
        let alive = true;
        fetchRoster(sessionId)
          .then((next) => {
            if (alive) {
              setRows(next);
              setEnabled(rosterCache.enabled !== false);
            }
          })
          .catch((error) => {
            if (alive) setLoadError(String((error && error.message) || error));
          });
        return () => {
          alive = false;
        };
      }, [sessionId]);

      const showToast = React.useCallback((text, kind) => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ text, kind });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
      }, []);

      React.useEffect(
        () => () => {
          if (toastTimer.current) clearTimeout(toastTimer.current);
        },
        [],
      );

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (buttonRef.current && buttonRef.current.contains(target)) return;
          if (menuRef.current && menuRef.current.contains(target)) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
          document.removeEventListener("mousedown", onPointerDown, true);
          document.removeEventListener("keydown", onKeyDown, true);
        };
      }, [open]);

      // A local override only describes the session we switched in this tab;
      // drop it when the header switches to another session.
      React.useEffect(() => {
        setLocalPreset(null);
      }, [sessionId]);

      const toggleMenu = React.useCallback(() => {
        if (!enabled) return;
        if (open) {
          setOpen(false);
          return;
        }
        const rect =
          buttonRef.current && buttonRef.current.getBoundingClientRect
            ? buttonRef.current.getBoundingClientRect()
            : null;
        if (rect) {
          const width = 240;
          const viewportWidth = window.innerWidth || 1024;
          const viewportHeight = window.innerHeight || 768;
          const left = Math.max(
            8,
            Math.min(rect.left, viewportWidth - width - 8),
          );
          // Keep the menu on screen: prefer below the button, otherwise slide it
          // up so the last entry stays reachable.
          const maxMenuHeight = Math.min(460, Math.round(viewportHeight * 0.7));
          const below = rect.bottom + 6;
          const top =
            below + maxMenuHeight <= viewportHeight - 8
              ? below
              : Math.max(8, viewportHeight - maxMenuHeight - 8);
          setAnchor({ left, top });
        }
        setOpen(true);
        refresh();
      }, [open, refresh, enabled]);

      const choose = React.useCallback(
        async (row) => {
          if (busy) return;
          setBusy(row.id);
          try {
            const response = await fetch(`${API}/switch`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId, preset: row.id }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) {
              throw new Error(data.error || `HTTP ${response.status}`);
            }
            setLocalPreset(row.id);
            setOpen(false);
            showToast(`${t("toast.switched")} ${displayName(row, t)}`, "success");
            rosterCache.at = 0;
            refresh();
          } catch (error) {
            showToast(
              `${t("toast.switchFailed")}: ${String((error && error.message) || error)}`,
              "error",
            );
          } finally {
            setBusy(null);
          }
        },
        [busy, refresh, sessionId, showToast, t],
      );

      // A session without a preset still needs a way to choose one: show the
      // control with a neutral label instead of hiding the entry point.
      if (!sessionId) return null;

      const activeRow = rows.find((row) => row.id === presetId);
      const labelText = activeRow
        ? displayName(activeRow, t)
        : presetId || localized(t, "menu.pick", "Choose a preset");
      const labelTitle = activeRow
        ? displayDescription(activeRow, t)
        : presetId || labelText;

      const menu = h(
        "div",
        {
          role: "menu",
          ref: menuRef,
          style: MENU_STYLE,
        },
        h(
          "div",
          {
            style: {
              padding: "6px 8px 4px",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              opacity: 0.6,
            },
          },
          t("menu.title"),
        ),
        loading ? h("div", { style: { padding: "6px 8px", opacity: 0.65 } }, t("menu.loading")) : null,
        loadError
          ? h(
              "div",
              {
                style: {
                  padding: "6px 8px",
                  color: "var(--dsw-alias-state-error-primary, #d03050)",
                },
              },
              `${t("menu.error")}: ${loadError}`,
            )
          : null,
        !loading && !loadError && rows.length === 0
          ? h("div", { style: { padding: "6px 8px", opacity: 0.65 } }, t("menu.empty"))
          : null,
        rows.map((row) => {
          const isActive = row.id === presetId;
          const broken = Boolean(row.broken);
          return h(
            "button",
            {
              key: row.id,
              type: "button",
              role: "menuitem",
              disabled: broken,
              style: {
                ...ITEM_STYLE,
                opacity: broken ? 0.5 : 1,
                cursor: broken ? "not-allowed" : "pointer",
              },
              onMouseEnter: (event) => {
                if (broken) return;
                event.currentTarget.style.background =
                  "var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.14))";
              },
              onMouseLeave: (event) => {
                event.currentTarget.style.background = "transparent";
              },
              onClick: () => choose(row),
            },
            h(
              "span",
              { style: { flex: "1 1 auto", minWidth: 0 } },
              h(
                "span",
                {
                  style: {
                    display: "block",
                    fontWeight: isActive ? 600 : 400,
                  },
                },
                `${displayName(row, t)}${row.isDefault ? ` · ${t("menu.default")}` : ""}`,
              ),
              displayDescription(row, t)
                ? h(
                    "span",
                    {
                      style: {
                        display: "block",
                        marginTop: "2px",
                        fontSize: "11px",
                        lineHeight: "14px",
                        whiteSpace: "normal",
                        opacity: 0.65,
                      },
                    },
                    displayDescription(row, t),
                  )
                : null,
              broken
                ? h(
                    "span",
                    { style: { display: "block", marginTop: "2px", fontSize: "11px", opacity: 0.8 } },
                    row.broken,
                  )
                : null,
            ),
            busy === row.id
              ? h(
                  "span",
                  { style: { flex: "none", fontSize: "11px", opacity: 0.7 } },
                  t("menu.switching"),
                )
              : isActive
                ? h(CheckGlyph, {})
                : null,
          );
        }),
      );

      const toastNode = toast
        ? h(
            "div",
            {
              role: "status",
              style: {
                ...TOAST_STYLE,
                borderColor:
                  toast.kind === "error"
                    ? "var(--dsw-alias-state-error-primary, #d03050)"
                    : "var(--dsw-alias-border-l1, rgba(0,0,0,0.10))",
              },
            },
            toast.text,
          )
        : null;

      const menuNode = open
        ? h(
            "div",
            {
              style: {
                position: "fixed",
                left: anchor ? anchor.left : 8,
                top: anchor ? anchor.top : 8,
              },
            },
            menu,
          )
        : null;

      return h(
        React.Fragment,
        null,
        h(
          "button",
          {
            type: "button",
            ref: buttonRef,
            style: enabled
              ? LABEL_STYLE
              : { ...LABEL_STYLE, opacity: 0.5, cursor: "not-allowed" },
            title: enabled
              ? labelTitle
              : localized(t, "menu.disabled", "Preset switching is disabled"),
            disabled: !enabled,
            "aria-disabled": enabled ? undefined : "true",
            "aria-haspopup": "menu",
            "aria-expanded": open ? "true" : "false",
            onClick: toggleMenu,
          },
          h(PresetGlyph, { size: 14 }),
          h(
            "span",
            {
              style: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            labelText,
          ),
          h(CaretGlyph, {}),
        ),
        menuNode && createPortal && document.body
          ? createPortal(menuNode, document.body)
          : menuNode,
        toastNode && createPortal && document.body
          ? createPortal(toastNode, document.body)
          : toastNode,
      );
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, DICT),
        "agent-preset-switch-ui: dictionaries",
      );
      ctx.slots.inject("conversation.session.header.actions", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.actions",
            id: "agent-preset",
            order: -10,
            priority: -1,
            locale: NS,
          },
          AgentPresetSwitcher,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
