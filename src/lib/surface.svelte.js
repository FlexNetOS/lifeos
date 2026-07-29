// LifeOS — surface density resolver.
//
// Four viewports from the LifeOS Multi-Surface UI/UX Specification: mobile,
// workstation, tv-10ft, ai-glasses. The density tokens themselves live in
// colors_and_type.css §9; this module only decides *which* surface is active and
// stamps it onto the document root as [data-surface].
//
// Precedence, highest first:
//   1. explicit pin        — setSurface("tv-10ft"), persisted by the caller
//   2. ?surface= query     — dev/QA override without a rebuild
//   3. VITE_LIFEOS_SURFACE — build-time target (Pi kiosk, TV build, glasses build)
//   4. auto by width       — <768px is mobile, otherwise workstation
//
// tv-10ft and ai-glasses are never auto-detected: a TV reports a desktop-sized
// viewport and glasses report an arbitrary one. They must be selected explicitly.

export const SURFACES = ["mobile", "workstation", "tv-10ft", "ai-glasses"];
export const DEFAULT_SURFACE = "workstation";
export const MOBILE_MAX_WIDTH = 767;

/** @param {unknown} value */
export function isSurface(value) {
  return typeof value === "string" && SURFACES.includes(value);
}

/**
 * Pure resolver — no DOM access, so it is directly testable.
 * @param {{ pinned?: string, search?: string, env?: string, width?: number }} input
 */
export function resolveSurface({ pinned, search, env, width } = {}) {
  if (isSurface(pinned)) return pinned;

  if (typeof search === "string" && search.length) {
    const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const requested = query.get("surface");
    if (isSurface(requested)) return requested;
  }

  if (isSurface(env)) return env;

  if (typeof width === "number" && Number.isFinite(width)) {
    return width <= MOBILE_MAX_WIDTH ? "mobile" : "workstation";
  }

  return DEFAULT_SURFACE;
}

/**
 * Reactive surface handle. Call once from the shell; read `.current` in components.
 * Returns a teardown so tests and HMR don't leak the resize listener.
 */
export function createSurface(options = {}) {
  // `env` is supplied by the caller (main.ts passes import.meta.env.VITE_LIFEOS_SURFACE)
  // so this module stays free of build-tool globals and is testable in isolation.
  const { target = globalThis.document?.documentElement, view = globalThis, env } = options;

  let pinned = isSurface(options.pinned) ? options.pinned : undefined;
  let current = $state(DEFAULT_SURFACE);

  const read = () =>
    resolveSurface({
      pinned,
      search: view?.location?.search,
      env,
      width: view?.innerWidth,
    });

  const apply = () => {
    const next = read();
    current = next;
    target?.setAttribute?.("data-surface", next);
    return next;
  };

  apply();
  view?.addEventListener?.("resize", apply);

  return {
    get current() {
      return current;
    },
    /** Pin a surface explicitly; pass undefined to fall back to auto-resolution. */
    set(surface) {
      pinned = isSurface(surface) ? surface : undefined;
      return apply();
    },
    refresh: apply,
    destroy() {
      view?.removeEventListener?.("resize", apply);
    },
  };
}
