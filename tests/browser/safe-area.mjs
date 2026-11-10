// Real components; synthetic API and browser-supplied inset fixtures only.
import assert from "node:assert/strict";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = `
import '/src/assets/main.css';
import {createApp,h,ref,nextTick} from 'vue';
import {createPinia} from 'pinia';
import Frame from '/src/components/ChatWindowFrame.vue';
import Composer from '/src/components/CodexComposer.vue';
import Voice from '/src/components/CodexVoicePanel.vue';
import Navigation from '/src/components/mobile/MobileActionPanel.vue';
import Calendar from '/src/components/BusinessCalendar.vue';
import UserMenu from '/src/components/mobile/MobileUserMenu.vue';
import Editor from '/src/components/EditorModal.vue';
import Contractors from '/src/components/ContractorEditorModal.vue';
import Universal from '/src/components/UniversalEditModal.vue';
import Theme from '/src/components/ThemeSettingsPanel.vue';
import Dialog from '/src/components/TeamChatDialog.vue';
import Task from '/src/components/CalendarTaskPopover.vue';
const mode=ref('chat'),text=ref(''),voice=ref(false);
window.showSafe=async name=>{mode.value='';await nextTick();mode.value=name;await nextTick();};
window.safeVoice=()=>{voice.value=!voice.value;};
createApp({setup(){return()=>h('main',{id:'surface',style:'position:fixed;inset:0;background:var(--color-background)'},[
mode.value==='chat'?h(Frame,{open:true,mobile:true,title:'Проверка'},()=>h('section',{class:'desktop-assistant',style:'flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end'},[voice.value?h(Voice,{status:'Слушаю'}):h(Composer,{mobile:true,modelValue:text.value,'onUpdate:modelValue':v=>text.value=v,speechSupported:true,attachmentsEnabled:true})])):null,
mode.value==='nav'?h('div',{style:'position:absolute;bottom:0;left:0;right:0'},[h(Navigation)]):null,
mode.value==='calendar'?h(Calendar):null,
mode.value==='user'?h(UserMenu):null,
mode.value==='editor'?h(Editor):null,
mode.value==='contractors'?h(Contractors):null,
mode.value==='universal'?h(Universal):null,
mode.value==='theme'?h(Theme,{open:true}):null,
mode.value==='dialog'?h(Dialog,{title:'Заявка'},()=>h('form',{style:'display:flex;flex-direction:column;flex:1;overflow:auto;min-height:0;padding:12px'},[h('textarea',{style:'min-height:1200px'}),h('button','Отправить на согласование')])):null,
mode.value==='task'?h(Task,{date:'2026-11-07',task:{_id:'fixture',title:'Подготовить договор',dueDate:'2026-11-07',status:'open',allDay:true,version:1}}):null
]);}}).use(createPinia()).mount('#app');
`;
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5196, strictPort: true },
  plugins: [
    {
      name: "safe-area-test",
      resolveId(id) {
        if (id === "virtual:safe-area") return "\0safe-area";
      },
      load(id) {
        if (id === "\0safe-area") return fixture;
      },
      configureServer(server) {
        server.middlewares.use("/__safe-area-test", (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(
            '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><div id="app"></div><script type="module" src="/@id/__x00__safe-area"></script>',
          );
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath:
      process.env.SCROLL_TEST_CHROME ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  await mkdir(root + "output/playwright", { recursive: true });
  for (const variant of [
    { name: "iphone", width: 390, height: 844, bottom: 34, top: 47 },
    { name: "small", width: 320, height: 640, bottom: 0, top: 0 },
    {
      name: "landscape",
      width: 844,
      height: 390,
      bottom: 21,
      top: 0,
      left: 44,
      right: 44,
    },
    { name: "tablet", width: 820, height: 1180, bottom: 20, top: 24 },
  ]) {
    const page = await browser.newPage({
        viewport: { width: variant.width, height: variant.height },
        isMobile: true,
        hasTouch: true,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          tasks: [],
          companies: [],
          items: [],
          templates: [],
          events: [],
          total: 0,
        },
      }),
    );
    await page.goto("http://127.0.0.1:5196/__safe-area-test");
    await page.waitForFunction(() => !!window.showSafe);
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none!important;transition:none!important}",
    });
    await page.evaluate((v) => {
      for (const edge of ["top", "right", "bottom", "left"])
        document.documentElement.style.setProperty(
          "--safe-area-" + edge,
          (v[edge] || 0) + "px",
        );
    }, variant);
    const full = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      assert.ok(
        Math.abs(box.x) < 1 &&
          Math.abs(box.y) < 1 &&
          Math.abs(box.width - variant.width) < 1 &&
          Math.abs(box.height - variant.height) < 1,
        `${variant.name} background remains full screen: ${selector}`,
      );
    };
    const bottomGap = async (selector, min = variant.bottom + 12) => {
      const box = await page.locator(selector).boundingBox();
      assert.ok(
        variant.height - box.y - box.height >= min - 1,
        `${variant.name} ${selector} clears system inset + margin: ${JSON.stringify(box)}`,
      );
    };
    await full("#surface");
    await full(".codex-chat-window");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await bottomGap(".codex-input-wrapper");
      assert.equal(
        await page
          .locator(".codex-input-wrapper")
          .evaluate((el) => getComputedStyle(el.parentElement).paddingBottom),
        variant.bottom + 12 + "px",
      );
      if (
        process.env.NO_SCREENSHOTS !== "1" &&
        process.env.INDEX12_NO_SCREENSHOTS !== "1"
      )
        await page.screenshot({
          path:
            root +
            "output/playwright/safe-area-" +
            variant.name +
            "-" +
            theme +
            ".png",
        });
    }
    await page.evaluate(() => window.safeVoice());
    await bottomGap(".codex-voice-controls");
    await page.evaluate(() => window.safeVoice());
    const keyboardHeight = Math.min(300, variant.height - 180);
    await page.evaluate((height) => {
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: height,
      });
      window.visualViewport.dispatchEvent(new Event("resize"));
    }, keyboardHeight);
    await page.waitForFunction(() => document.querySelector(".keyboard-open"));
    const input = await page.locator(".codex-input-wrapper").boundingBox();
    assert.ok(
      Math.abs(keyboardHeight - input.y - input.height - 10) < 1,
      "Keyboard margin does not count the device bottom inset twice",
    );
    await page.evaluate(() => {
      delete window.visualViewport.height;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    for (const [mode, selector] of [
      ["nav", ".chart-controls-row button:first-child"],
      ["user", ".menu-item.logout"],
      ["theme", ".theme-save-actions"],
    ]) {
      await page.evaluate((mode) => window.showSafe(mode), mode);
      await page.locator(selector).waitFor();
      if (mode === "user")
        await page
          .locator(".modal-body")
          .evaluate((el) => (el.scrollTop = el.scrollHeight));
      await full("#surface");
      await bottomGap(selector);
      if (mode === "nav") {
        const first = await page.locator(selector).boundingBox(),
          last = await page
            .locator(".chart-controls-row button")
            .last()
            .boundingBox();
        assert.ok(first.x >= (variant.left || 0) + 7);
        assert.ok(
          last.x + last.width <= variant.width - (variant.right || 0) - 7,
        );
        assert.ok(first.width >= 36 && first.height >= 44);
        const rows = await page
          .locator(".chart-controls-row>button")
          .evaluateAll((items) =>
            items.map((el) => el.getBoundingClientRect().y),
          );
        assert.equal(rows.length, 7);
        assert.equal(new Set(rows).size, 1);
      }
    }
    if (variant.width <= 700) {
      await page.evaluate(() => window.showSafe("calendar"));
      await page.locator(".mobile-agenda").waitFor();
      await full(".calendar-window");
      assert.equal(
        await page
          .locator(".mobile-agenda")
          .evaluate((el) => getComputedStyle(el).paddingBottom),
        variant.bottom + 12 + "px",
      );
    }
    for (const [mode, body, header] of [
      ["editor", ".editor-modal .modal-body", ".editor-modal .modal-header"],
      ["contractors", ".popup-footer", ".popup-header"],
      ["universal", ".modal-footer", ".modal-header"],
    ]) {
      await page.evaluate((mode) => window.showSafe(mode), mode);
      await page.locator(body).waitFor();
      if (variant.width <= (mode === "contractors" ? 900 : 768)) {
        assert.equal(
          await page
            .locator(body)
            .evaluate((el) => getComputedStyle(el).paddingBottom),
          variant.bottom + 12 + "px",
        );
        const box = await page
          .locator(header + " button")
          .first()
          .boundingBox();
        assert.ok(
          box.y >= variant.top,
          mode + " header is below the status area",
        );
      }
    }
    await page.evaluate(() => window.showSafe("dialog"));
    const dialog = page.locator(".team-create-dialog");
    await dialog.waitFor();
    await bottomGap(".team-create-dialog");
    const dialogBox = await dialog.boundingBox();
    assert.ok(dialogBox.y >= variant.top + 11);
    await page.evaluate(() => window.showSafe("task"));
    await page.locator(".task-popover").waitFor();
    await bottomGap(".task-popover");
    assert.deepEqual(errors, []);
    console.log(
      "PASS " +
        variant.name +
        ": full-screen backgrounds, inset-aware controls, keyboard, voice, nav, calendar, menus and dialogs",
    );
    await page.close();
  }
  // The shipping shell, also used by the invitation entry function, must opt in.
  assert.match(
    await (await fetch("http://127.0.0.1:5196/")).text(),
    /viewport-fit=cover/,
  );
} finally {
  await browser?.close();
  await server.close();
}
