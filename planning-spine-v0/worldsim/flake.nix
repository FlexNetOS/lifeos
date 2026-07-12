{
  description =
    "LifeOS worldsim ingestion toolchain (LPS-030): OpenUSD Python API + usdchecker/usdcat/usdzip and headless MeshLab, pinned for reproducible workstation runs.";

  # Pinned to the exact nixpkgs revision whose openusd / meshlab / pymeshlab
  # derivations are already available from the configured substituters
  # (cache.nixos.org). This guarantees `nix develop` substitutes prebuilt
  # binaries instead of triggering a multi-hour OpenUSD source build.
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/b5aa0fbd538984f6e3d201be0005b4463d8b09f8";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          name = "lifeos-worldsim";

          packages = [
            # OpenUSD: provides the pxr Python API plus the usdchecker,
            # usdcat, and usdzip command-line tools used by the ingestion
            # and twin-acceptance gates (LPS-030, LPS-034, LPS-035).
            pkgs.openusd

            # MeshLab: GUI plus headless-capable CLI. `meshlab --help` runs
            # without a display; QT_QPA_PLATFORM=offscreen (set below) lets
            # full headless mesh operations run on the workstation.
            pkgs.meshlab

            # pymeshlab: the scripted headless MeshLab equivalent. Modern
            # MeshLab dropped the standalone `meshlabserver` binary; pymeshlab
            # loads the same .mlx filter scripts (LPS-031 mesh cleanup) from
            # Python without a GUI.
            pkgs.python3Packages.pymeshlab
          ];

          shellHook = ''
            # Force headless Qt so MeshLab and pymeshlab run without a display.
            export QT_QPA_PLATFORM="''${QT_QPA_PLATFORM:-offscreen}"
            echo "lifeos-worldsim dev shell — OpenUSD tools + headless MeshLab"
            echo "  usdchecker : $(command -v usdchecker)"
            echo "  usdcat     : $(command -v usdcat)"
            echo "  usdzip     : $(command -v usdzip)"
            echo "  meshlab    : $(command -v meshlab)"
          '';
        };
      });
}
