{
  # LifeOS web build — hermetic Nix packaging of the Svelte 5 + Vite app
  # (post phase-3 Svelte cutover; Pinia/vue-router remain runtime deps).
  #
  # Scope: the WEB BUILD ONLY (`bun run build` => svelte-check && vite build,
  # packaged as the dist/ directory). The Tauri native shell is intentionally out
  # of scope for this flake.
  #
  # HERMETIC DEPS — how node_modules is pinned:
  #   `node-modules` is a fixed-output derivation (FOD) that runs
  #   `bun install --frozen-lockfile --ignore-scripts` against the committed
  #   bun.lock (v1 text lockfile, every package carries an SRI sha512). The FOD
  #   gets network only because its output NAR hash is pinned below
  #   (outputHash); any drift in what the registry serves fails the build
  #   instead of silently changing the closure. `--ignore-scripts` keeps the
  #   output deterministic (no lifecycle-script side effects) — nothing the web
  #   build needs has a required postinstall. `--backend=copyfile` avoids
  #   hardlink/cache-layout variance.
  #
  #   The FOD's src is package.json + bun.lock ONLY (lib.fileset), so app-code
  #   changes never invalidate the deps derivation. Its hash is valid for
  #   x86_64-linux (bun installs platform-matched optional deps), which is why
  #   this flake exposes a single system.
  #
  # The `lifeos` build derivation is fully sandboxed (no network): it copies the
  # store node_modules into a writable tree and runs the app's own build script
  # verbatim (`bun run build`) with nodejs on PATH for `#!/usr/bin/env node`
  # bins. The remote Google-Fonts @import in colors_and_type.css is left as-is
  # by Vite (fetched by the browser at runtime, never at build time), and
  # fonts/Rigelstar.ttf is bundled as a local asset.
  #
  # NOTE: the flake adapts to the app — package.json, vite.config.ts, and app
  # source are not modified for packaging (no-downgrade constraint).
  description = "LifeOS web app (Svelte 5 + Vite + bun) — hermetic dist/ build";

  inputs = {
    # Same pin as nix/gha-runner: a nixos-unstable rev whose toolchain closure
    # is prebuilt in cache.nixos.org. Provides bun 1.3.13 + nodejs 22.
    nixpkgs.url = "github:NixOS/nixpkgs/241313f4e8e508cb9b13278c2b0fa25b9ca27163";
  };

  outputs = { self, nixpkgs }:
    let
      # Single system: the node-modules FOD hash below encodes the
      # platform-matched optional deps bun installs on x86_64-linux.
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      inherit (pkgs) lib;
      fs = lib.fileset;
      version = "0.1.0"; # keep in sync with package.json

      # Deps derivation sees the lockfile surface only.
      depsSrc = fs.toSource {
        root = ./.;
        fileset = fs.unions [ ./package.json ./bun.lock ];
      };

      # Build derivation sees exactly what `bun run build` consumes:
      # index.html entry, src/, the root-level content/style layer imported by
      # src/main.ts (data.js + 3 CSS files), fonts/ (Rigelstar.ttf via CSS
      # url()), public/ (copied verbatim into dist/), and the TS/Vite/Svelte
      # configs.
      appSrc = fs.toSource {
        root = ./.;
        fileset = fs.unions [
          ./index.html
          ./package.json
          ./bun.lock
          ./tsconfig.json
          ./vite.config.ts
          ./svelte.config.js
          ./src
          ./public
          ./fonts
          ./data.js
          ./colors_and_type.css
          ./lifeos_app.css
          ./styles.css
        ];
      };

      node-modules = pkgs.stdenvNoCC.mkDerivation {
        pname = "lifeos-node-modules";
        inherit version;
        src = depsSrc;

        nativeBuildInputs = [ pkgs.bun pkgs.cacert ];
        dontConfigure = true;

        buildPhase = ''
          runHook preBuild
          export HOME=$TMPDIR
          export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache
          bun install --frozen-lockfile --ignore-scripts --no-progress --backend=copyfile
          # Drop anything cache-like that could vary between runs.
          rm -rf node_modules/.cache
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mv node_modules $out
          runHook postInstall
        '';

        # Fixed-output: network is allowed, the result is pinned. Recompute
        # after a bun.lock change with:
        #   set outputHash = lib.fakeHash; nix build .#node-modules  -> "got:"
        outputHashMode = "recursive";
        outputHashAlgo = "sha256";
        outputHash = lib.fakeHash;

        meta.description = "LifeOS pinned node_modules (bun install --frozen-lockfile, FOD)";
      };

      lifeos = pkgs.stdenvNoCC.mkDerivation {
        pname = "lifeos";
        inherit version;
        src = appSrc;

        # bun runs the package script verbatim; nodejs backs the
        # `#!/usr/bin/env node` shebangs in node_modules/.bin (svelte-check,
        # vite).
        nativeBuildInputs = [ pkgs.bun pkgs.nodejs ];
        dontConfigure = true;

        buildPhase = ''
          runHook preBuild
          export HOME=$TMPDIR
          # Writable copy: Vite/rolldown expect a real (non-store-symlinked)
          # node_modules so module paths keep matching the vendor-chunk
          # [\\/]node_modules[\\/] tests in vite.config.ts.
          cp -a ${node-modules} node_modules
          chmod -R u+w node_modules
          bun run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          cp -r dist $out
          runHook postInstall
        '';

        meta.description = "LifeOS web app dist/ (svelte-check && vite build)";
      };

      # Cheap standalone type gate (same inputs, no bundling).
      svelte-check = pkgs.stdenvNoCC.mkDerivation {
        pname = "lifeos-svelte-check";
        inherit version;
        src = appSrc;
        nativeBuildInputs = [ pkgs.bun pkgs.nodejs ];
        dontConfigure = true;
        buildPhase = ''
          runHook preBuild
          export HOME=$TMPDIR
          cp -a ${node-modules} node_modules
          chmod -R u+w node_modules
          ./node_modules/.bin/svelte-check
          runHook postBuild
        '';
        installPhase = "touch $out";
        meta.description = "LifeOS svelte-check type/diagnostic gate";
      };
    in
    {
      packages.${system} = {
        inherit node-modules lifeos;
        default = lifeos;
      };

      checks.${system} = {
        # Building dist/ IS the primary check; svelte-check runs standalone too.
        lifeos = lifeos;
        svelte-check = svelte-check;
      };
    };
}
