import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  renderTeamEntry,
  teamToken,
  teamEntryPlugin,
} from "../server/teamEntry.js";
import { createTeamEntryHandler } from "../api/team-entry.js";

const token = "a".repeat(43);
const shell = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("the initial invite HTML exposes only the chat install target before JavaScript runs", () => {
  const html = renderTeamEntry(shell, token);
  assert.match(
    html,
    new RegExp(`rel="manifest" href="/team-manifest/${token}"`),
  );
  assert.doesNotMatch(
    html,
    /manifest\.webmanifest|apple-touch-icon\.png|<title>INDEX12<|og:url" content="https:\/\/index12.com\/"/,
  );
  assert.match(html, /<title>Chat<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="Chat"/);
  assert.match(html, /apple-touch-icon"[^>]+href="\/chat-180.png"/);
  assert.match(shell, /rel="manifest" href="\/manifest.webmanifest"/);
});

test("invite paths, including trailing slashes, preserve tokens and exclude other routes", () => {
  assert.equal(teamToken("/team/" + token), token);
  assert.equal(teamToken("/team/" + token + "/"), token);
  for (const path of ["/", "/mobile", "/team/a", "/team/" + token + "/other"])
    assert.equal(teamToken(path), null);
  for (const value of [
    undefined,
    [token],
    "<script>alert(1)</script>",
    "../" + token,
  ])
    assert.throws(() => renderTeamEntry(shell, value));
});

test("development serves the same install metadata as the production entry function", () => {
  const transform = teamEntryPlugin().transformIndexHtml.handler;
  assert.equal(
    transform(shell, {
      path: "/index.html",
      originalUrl: "/team/" + token + "/?reset=secret",
    }),
    renderTeamEntry(shell, token),
  );
  assert.equal(transform(shell, { path: "/index.html" }), shell);
});

test("the deployed entry endpoint sends the built shell, never main registration as fallback", async () => {
  const handler = createTeamEntryHandler(async () =>
    shell.replace("/src/main.js", "/assets/index-fixture.js"),
  );
  const res = () => ({
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    },
  });
  const response = res();
  await handler({ method: "GET", query: { token } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.match(response.body, new RegExp(`href="/team-manifest/${token}"`));
  assert.match(response.body, /src="\/assets\/.+\.js"/);
  assert.doesNotMatch(response.body, /manifest\.webmanifest/);
  const invalid = res();
  await handler({ method: "GET", query: { token: [token, token] } }, invalid);
  assert.equal(invalid.statusCode, 404);
  const post = res();
  await handler({ method: "POST", query: { token } }, post);
  assert.equal(post.statusCode, 405);
  const unavailable = res();
  await createTeamEntryHandler(async () => {
    throw Error("Unavailable build");
  })({ method: "GET", query: { token } }, unavailable);
  assert.equal(unavailable.statusCode, 503);
  assert.doesNotMatch(unavailable.body, /INDEX12|\/index.html/);
});
