{
  description = "Hermetic self-hosted GitHub Actions runner + rUv agent layer (FlexNetOS/lifeos)";

  # LATEST toolchain, pinned + reproducible: nixos-unstable locked in flake.lock (SPEC §3).
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;

        # ── Substrate: the runner environment, 100% from the Nix closure (zero OS deps).
        #    github-runner PACKAGE only — NOT services.github-runners (that is a root
        #    system systemd unit; forbidden by SPEC §1 "no system depths").
        #    nodejs_22 per ADR-033; bun for the repo's vitest archbp-* suite.
        substrateInputs = [
          pkgs.github-runner
          pkgs.nodejs_22
          pkgs.bun
          pkgs.git
          pkgs.cacert
          pkgs.coreutils
          pkgs.gnutar
          pkgs.gzip
          pkgs.gnused
          pkgs.nushell
        ];

        gha-runner-substrate = pkgs.symlinkJoin {
          name = "gha-runner-substrate";
          paths = substrateInputs;
          meta.description = "github-runner + nodejs_22 + bun + git + cacert (hermetic runner env)";
        };

        # ── Agent layer: rUv packages pinned by EXACT version (SRI-locked in
        #    agent-layer/package-lock.json). host-github-actions@0.1.2 emits the
        #    workflow+composite action (ADR-033); agentic-flow@2.1.0 is the runtime.
        #    npmDepsHash is captured by one `nix build .#agent-layer` (standard Nix flow;
        #    see README "Agent-layer hash capture"). fakeHash keeps eval + flake check
        #    green; realization fails-closed until the true hash is pasted (SPEC §4).
        agent-layer = pkgs.buildNpmPackage {
          pname = "lifeos-gha-agent-layer";
          version = "0.1.0";
          src = ./agent-layer;
          npmDepsHash = lib.fakeHash;   # capture: `nix build .#agent-layer` prints the real hash
          dontNpmBuild = true;          # these are prebuilt CLIs; no build step
          # Provide the CLIs on PATH: node_modules/.bin -> $out/bin
          postInstall = ''
            mkdir -p $out/bin
            for b in $out/lib/node_modules/lifeos-gha-agent-layer/node_modules/.bin/*; do
              [ -e "$b" ] && ln -sf "$b" $out/bin/ || true
            done
          '';
          meta.description = "host-github-actions@0.1.2 + agentic-flow@2.1.0 + kernel@0.1.2 (pinned)";
        };

        # ── Full closure: both layers, the literal "both layers from the closure".
        gha-runner-closure = pkgs.symlinkJoin {
          name = "gha-runner-closure";
          paths = [ gha-runner-substrate agent-layer ];
          meta.description = "substrate + agent layer — the complete hermetic runner closure";
        };

        runNu = name: script: pkgs.writeShellApplication {
          inherit name;
          runtimeInputs = [ pkgs.nushell gha-runner-substrate ];
          text = ''exec nu ${script} "$@"'';
        };
      in {
        packages = {
          inherit gha-runner-substrate agent-layer gha-runner-closure;
          default = gha-runner-closure;
        };

        apps = {
          register = { type = "app"; program = "${runNu "gha-register" ./register.nu}/bin/gha-register"; };
          runner   = { type = "app"; program = "${runNu "gha-runner" ./runner.nu}/bin/gha-runner"; };
          default  = self.apps.${system}.runner;
        };

        # `nix flake check` builds this — proves the substrate realizes from the cache.
        # (Hermeticity of the closure is verified OUTSIDE the sandbox by
        #  verify-hermetic-closure.mjs, which needs `nix path-info` — R gate.)
        checks.substrate = gha-runner-substrate;

        devShells.default = pkgs.mkShell {
          packages = substrateInputs;
          shellHook = ''echo "gha-runner devshell: github-runner + node22 + bun + nushell on PATH"'';
        };
      });
}
