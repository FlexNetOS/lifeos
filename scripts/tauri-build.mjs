import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

const env = { ...process.env };

if (process.platform === "linux") {
  const profileToolBin = "/home/flexnetos/meta/var/bin";
  if (existsSync(join(profileToolBin, "patchelf"))) {
    env.PATH = [profileToolBin, env.PATH ?? ""].filter(Boolean).join(delimiter);
  }

  const pkgConfigPaths = (env.PKG_CONFIG_PATH ?? "")
    .split(delimiter)
    .filter(Boolean);
  const profilePkgConfig = "/home/flexnetos/meta/var/lib/lifeos/pkgconfig";
  if (existsSync(join(profilePkgConfig, "librsvg-2.0.pc"))) {
    pkgConfigPaths.push(profilePkgConfig);
  }

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

  pkgConfigPaths.push(
    "/usr/lib/x86_64-linux-gnu/pkgconfig",
    "/usr/share/pkgconfig",
    "/usr/lib/pkgconfig",
  );
  env.PKG_CONFIG_PATH = [...new Set(pkgConfigPaths)].join(delimiter);

  // linuxdeploy scans PATH. Remove only a path entry containing an unreadable
  // executable, which otherwise makes its filesystem walk fail on profile hosts.
  env.PATH = (env.PATH ?? "")
    .split(delimiter)
    .filter((directory) => {
      const marker = join(directory, "yazelix-gpu-verify-install.sh");
      try {
        accessSync(marker, constants.R_OK);
        return true;
      } catch (error) {
        try {
          lstatSync(marker);
          return false;
        } catch {
          return error?.code === "ENOENT";
        }
      }
    })
    .join(delimiter);

  // The profile's volatile runtime cache contains the downloaded AppImage
  // tools. Force their extract-and-run path so FUSE availability cannot turn
  // an otherwise complete bundle into a false linuxdeploy failure.
  env.APPIMAGE_EXTRACT_AND_RUN = "1";
}

const localCli = join(
  env.CARGO_TARGET_DIR ?? "/home/flexnetos/meta/var/cargo-target",
  "release/cargo-tauri",
);
const tauriCli = env.TAURI_CLI_BIN ?? (existsSync(localCli) ? localCli : null);
const command = tauriCli ?? process.execPath;
const args = tauriCli
  ? ["build", "--bundles", "deb", "rpm"]
  : ["x", "tauri", "build", "--bundles", "deb", "rpm"];

const result = spawnSync(command, args, {
  env: { ...env, BUN_EXEC: process.execPath },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
