import { execFileSync } from "node:child_process";
export function appReleasePlugin() {
  let version =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.INDEX12_RELEASE_VERSION;
  if (!/^[a-f\d]{40}$/i.test(version || "")) {
    try {
      version = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
    } catch {
      version = "0".repeat(40);
    }
  }
  const manifest = {
    version: version.toLowerCase(),
    builtAt: new Date().toISOString(),
  };
  return {
    name: "index12-app-release",
    config: () => ({
      define: { __INDEX12_BUILD_VERSION__: JSON.stringify(manifest.version) },
    }),
    configureServer(server) {
      server.middlewares.use("/app-release.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(manifest));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app-release.json",
        source: JSON.stringify(manifest),
      });
    },
  };
}
