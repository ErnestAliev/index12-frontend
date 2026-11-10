// Shared working-chat/Codex composer; synthetic state, no screenshots or API writes.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium, webkit } from "playwright-core";
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const fixture = `
import '/src/assets/main.css';
import {createApp,h,ref} from 'vue';
import Frame from '/src/components/ChatWindowFrame.vue';
import Composer from '/src/components/CodexComposer.vue';
const text=ref(''),files=ref(false),busy=ref(false),voice=ref(false),sent=ref(0);
window.composerFixture={text,files,busy,voice,sent};
createApp({render:()=>h(Frame,{open:true,title:'Проверка'},()=>h('section',{style:'display:flex;flex:1;min-height:0;flex-direction:column;justify-content:flex-end'},[h(Composer,{modelValue:text.value,'onUpdate:modelValue':v=>text.value=v,hasAttachments:files.value,busy:busy.value,liveVoice:voice.value,voiceAvailable:true,voiceSupported:true,speechSupported:true,attachmentsEnabled:true,onSend:()=>sent.value++},{attachments:()=>h('span','Документ.txt')})]))}).mount('#app');
`;
const server = await createServer({
  root: process.cwd(),
  envDir: "/private/tmp",
  server: { host: "127.0.0.1", port: 5217, strictPort: true },
  plugins: [
    {
      name: "composer-visibility-fixture",
      resolveId: (id) =>
        id === "virtual:composer-visibility"
          ? "\0composer-visibility"
          : undefined,
      load: (id) => (id === "\0composer-visibility" ? fixture : undefined),
      configureServer(server) {
        server.middlewares.use("/__composer-visibility", (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(
            '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="app"></div><script type="module" src="/@id/__x00__composer-visibility"></script>',
          );
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  for (const [width, height, touch] of [
    [320, 720, true],
    [390, 844, true],
    [844, 390, true],
    [768, 1024, true],
    [1024, 768, true],
    [1440, 900, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
    });
    const page = await context.newPage(),
      errors = [];
    context.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    await page.goto("http://127.0.0.1:5217/__composer-visibility");
    const send = page.getByRole("button", { name: "Отправить", exact: true }),
      field = page.getByRole("textbox");
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        ({ theme, touch }) => {
          document.documentElement.dataset.theme = theme;
          for (const side of ["top", "right", "bottom", "left"])
            document.documentElement.style.setProperty(
              "--safe-area-" + side,
              (touch
                ? side === "bottom"
                  ? 34
                  : side === "top"
                    ? 20
                    : 12
                : 0) + "px",
            );
          window.composerFixture.text.value = "";
          window.composerFixture.files.value = false;
          window.composerFixture.busy.value = false;
          window.composerFixture.voice.value = false;
        },
        { theme, touch },
      );
      await send.waitFor();
      assert.equal(
        await send.isDisabled(),
        true,
        "empty composer retains a visible disabled send button",
      );
      async function check() {
        await send.evaluate(async (el) => {
          for (const animation of el.getAnimations())
            await animation.finished.catch(() => {});
        });
        const appearance = await send.evaluate((el) => {
          const rgb = (value) => (value.match(/[\d.]+/g) || []).map(Number);
          const over = (fg, bg) =>
            fg
              .slice(0, 3)
              .map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
          const background = (node) =>
            node
              ? over(
                  rgb(getComputedStyle(node).backgroundColor),
                  background(node.parentElement),
                )
              : [255, 255, 255];
          const luminance = (c) =>
            c
              .map((v) => v / 255)
              .map((v) =>
                v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
              )
              .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
          const style = getComputedStyle(el),
            glyph = el.querySelector("svg"),
            rect = el.getBoundingClientRect(),
            pill = el.closest(".codex-input-wrapper").getBoundingClientRect(),
            a = luminance(rgb(getComputedStyle(glyph).color)),
            b = luminance(background(el));
          return {
            foreground: getComputedStyle(glyph).color,
            background: background(el),
            buttonColor: style.color,
            buttonBackground: style.backgroundColor,
            contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            opacity: style.opacity,
            glyph: !!glyph.querySelector("path[d]"),
            size: [rect.width, rect.height],
            inside:
              rect.x >= pill.x &&
              rect.right <= pill.right + 1 &&
              rect.y >= pill.y &&
              rect.bottom <= pill.bottom + 1,
            viewport:
              rect.x >= 0 &&
              rect.right <= innerWidth &&
              rect.y >= 0 &&
              rect.bottom <= innerHeight,
          };
        });
        assert.ok(
          appearance.contrast >= 3,
          JSON.stringify({ width, theme, appearance }),
        );
        assert.equal(appearance.opacity, "1");
        assert.ok(appearance.glyph && appearance.inside && appearance.viewport);
        assert.ok(appearance.size.every((v) => v >= (touch ? 44 : 36)));
      }
      await check();
      await field.fill("Проверка отправки");
      assert.equal(await send.isEnabled(), true);
      await check();
      const count = await page.evaluate(
        () => window.composerFixture.sent.value,
      );
      await (touch ? send.tap() : send.click());
      assert.equal(
        await page.evaluate(() => window.composerFixture.sent.value),
        count + 1,
        "intentional click/tap sends once",
      );
      await field.fill("");
      await page.evaluate(() => (window.composerFixture.files.value = true));
      await page.waitForFunction(
        () => !document.querySelector(".codex-send-btn").disabled,
      );
      await check();
      await page.evaluate(() => (window.composerFixture.busy.value = true));
      await page.waitForFunction(
        () => document.querySelector(".codex-send-btn").disabled,
      );
      await check();
      await page.evaluate(() => {
        window.composerFixture.busy.value = false;
        window.composerFixture.files.value = false;
        window.composerFixture.voice.value = true;
      });
      await page
        .getByRole("button", { name: "Начать голосовой диалог", exact: true })
        .waitFor();
      assert.equal(
        await send.count(),
        0,
        "Codex live voice keeps its existing empty-state action",
      );
      await field.fill("Вопрос Codex");
      await send.waitFor();
      await check();
      assert.deepEqual(errors, []);
      console.log(
        "PASS " +
          engine +
          " " +
          width +
          "×" +
          height +
          " " +
          theme +
          ": visible empty/text/attachment/busy send, contrast, bounds, touch/click, voice action",
      );
    }
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
