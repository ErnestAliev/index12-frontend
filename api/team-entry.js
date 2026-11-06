/* global process */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderTeamEntry } from "../server/teamEntry.js";

export function createTeamEntryHandler(loadShell) {
  let shell;
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.statusCode = 405;
      res.end();
      return;
    }
    const token = req.query.token;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
      res.statusCode = 404;
      res.end("Приглашение не найдено");
      return;
    }
    try {
      // includeFiles in vercel.json bundles the shell from this exact Vite build.
      shell ||= await loadShell();
      const html = renderTeamEntry(shell, token);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(req.method === "HEAD" ? undefined : html);
    } catch {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(
        "Не удалось загрузить чат. Попробуйте открыть приглашение ещё раз.",
      );
    }
  };
}

export default createTeamEntryHandler(() =>
  readFile(join(process.cwd(), "dist/index.html"), "utf8"),
);
