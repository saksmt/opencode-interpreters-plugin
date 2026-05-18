{
  description = "opencode-interpreters-plugin dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs_22
            biome
          ];

          shellHook = ''
            export BIOME_BINARY=${pkgs.biome}/bin/biome

            mkdir -p .pkgs &>/dev/null
            rm -f .pkgs/{biome,bun,node} &>/dev/null
            ln -s ${pkgs.biome} .pkgs/biome
            ln -s ${pkgs.bun} .pkgs/bun
            ln -s ${pkgs.nodejs_22} .pkgs/node
          '';
        };
      }
    );
}
