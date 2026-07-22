// ARCHBP-091 — Assertion preventing meta/var from being mounted into
// docker/containerd (invariant I15). Verifies the host-visible container
// mount surface unprivileged:
//   1. No overlay/containerd mount references meta/var in its lower/upper/
//      work layer dirs.
//   2. No host mount line binds meta/var into a container root
//      (/var/lib/docker or /var/lib/containerd).
//   3. Verification boundary recorded honestly: per-container in-namespace
//      bind tables need root; the T6 cutover (ARCHBP-089..092) retires the
//      container runtime entirely, closing the boundary for good.
// Fails (exit 1) on any violation. --mounts PATH substitutes the mount
// table for fixture testing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const mArg = args.indexOf("--mounts");
const mountsPath = mArg >= 0 ? resolve(process.cwd(), args[mArg + 1]) : "/proc/mounts";

const META_VAR = "/home/flexnetos/meta/var";
const CONTAINER_ROOTS = ["/var/lib/docker", "/var/lib/containerd"];

const lines = readFileSync(mountsPath, "utf8").trim().split("\n");
const violations = [];
let containerMounts = 0;

for (const line of lines) {
  const [source, target, fstype, options] = line.split(" ");
  const isContainerMount =
    CONTAINER_ROOTS.some((r) => target.startsWith(r)) || fstype === "overlay";
  if (isContainerMount) containerMounts += 1;
  // 1. Overlay layer dirs referencing meta/var.
  if (fstype === "overlay" && options.includes(META_VAR)) {
    violations.push(`overlay layers reference meta/var: ${target}`);
  }
  // 2. A bind of meta/var into a container root.
  if (source.startsWith(META_VAR) && CONTAINER_ROOTS.some((r) => target.startsWith(r))) {
    violations.push(`meta/var bound into container root: ${source} -> ${target}`);
  }
  // 3. A container-root path bound over meta/var (reverse direction).
  if (target.startsWith(META_VAR) && CONTAINER_ROOTS.some((r) => source.startsWith(r))) {
    violations.push(`container path bound over meta/var: ${source} -> ${target}`);
  }
}

for (const v of violations) console.error(`VIOLATION: ${v}`);
console.log(
  `metavar-not-in-containers guard: ${lines.length} mounts scanned, ${containerMounts} container-surface mounts, ${violations.length} violations -> ${violations.length ? "FAIL" : "PASS"}`,
);
console.log(
  "verification boundary: per-container in-namespace bind tables require root; retired entirely by the T6 docker/KVM cutover (ARCHBP-089..092).",
);
process.exit(violations.length ? 1 : 0);
