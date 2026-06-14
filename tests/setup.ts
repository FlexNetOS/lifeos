// LifeOS — Vitest a11y setup (separate from setup.js which handles data fixtures).
// Extends the Vitest `expect` with the `toHaveNoViolations` matcher from vitest-axe.
// Imported only by vitest.a11y.config.ts — never added to the main test setupFiles.

import { toHaveNoViolations } from "vitest-axe/matchers";
import { expect } from "vitest";

expect.extend({ toHaveNoViolations });
