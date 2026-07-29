// LifeOS — types for the surface density resolver.
//
// surface.svelte.js stays plain JS because Svelte's rune compiler owns the
// `.svelte.js` extension and the repo's other rune module (pinia-bridge.svelte.js)
// follows the same convention. main.ts is TypeScript and type-checks its imports,
// so the public surface is declared here rather than inferred.

export type Surface = "mobile" | "workstation" | "tv-10ft" | "ai-glasses";

export declare const SURFACES: readonly Surface[];
export declare const DEFAULT_SURFACE: Surface;
export declare const MOBILE_MAX_WIDTH: number;

export declare function isSurface(value: unknown): value is Surface;

export declare function resolveSurface(input?: {
  pinned?: string;
  search?: string;
  env?: string;
  width?: number;
}): Surface;

export interface SurfaceHandle {
  readonly current: Surface;
  /** Pin a surface explicitly; pass undefined to fall back to auto-resolution. */
  set(surface: Surface | undefined): Surface;
  refresh(): Surface;
  destroy(): void;
}

export declare function createSurface(options?: {
  target?: Element | null;
  view?: Window | (Record<string, any> & { innerWidth?: number }) | null;
  env?: string;
  pinned?: Surface;
}): SurfaceHandle;
