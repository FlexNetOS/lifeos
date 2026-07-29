import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

const env = { ...process.env };

if (process.platform === "linux") {
  const pkgConfigPaths = (env.PKG_CONFIG_PATH ?? "")
    .split(delimiter)
    .filter(Boolean);

  if (existsSync("/nix/store")) {
    for (const entry of readdirSync("/nix/store")) {
      if (!entry.includes("librsvg") || entry.endsWith(".drv")) continue;
      for (const relative of ["lib/pkgconfig", "share/pkgconfig"]) {
        const directory = join("/nix/store", entry, relative);
        if (existsSync(join(directory, "librsvg-2.0.pc"))) {
          pkgConfigPaths.push(directory);
        }
      }
    }
  }

  env.PKG_CONFIG_PATH = [...new Set(pkgConfigPaths)].join(delimiter);

  // linuxdeploy scans PATH. Remove only a path entry containing an unreadable
  // executable, which otherwise makes its filesystem walk fail on profile hosts.
  env.PATH = (env.PATH ?? "")
    .split(delimiter)
    .filter((directory) => {
      const marker = join(directory, "yazelix-gpu-verify-install.sh");
      if (!existsSync(marker)) return true;
      try {
        accessSync(marker, constants.R_OK);
        return true;
      } catch {
        return false;
      }
    })
    .join(delimiter);
}

const command = process.platform === "linux" ? "/bin/sh" : process.execPath;
const args = process.platform === "linux"
  ? ["-c", 'ulimit -n 524288 2>/dev/null || true; exec "$BUN_EXEC" x tauri build']
  : ["x", "tauri", "build"];

const result = spawnSync(command, args, {
  env: { ...env, BUN_EXEC: process.execPath },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
