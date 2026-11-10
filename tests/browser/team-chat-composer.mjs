import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
export async function verifyStaffComposer({
  browser,
  employeePage,
  ownerContext,
  base,
  origin,
  token,
  output,
}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: await employeePage.context().storageState(),
  });
  await context.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        window.__dictation = this;
        if (window.__denyDictation) this.onerror?.({ error: "not-allowed" });
      }
      stop() {
        if (this.finalText)
          this.onresult?.({ results: [[{ transcript: this.finalText }]] });
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    };
  });
  const ids = [];
  try {
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/team/" + token, { waitUntil: "domcontentloaded" });
    const frame = page.getByRole("dialog", {
      name: "Чат Сотрудники",
      exact: true,
    });
    await frame.waitFor();
    const setup = page.getByRole("dialog", { name: "Chat", exact: true });
    if (await setup.isVisible())
      await setup
        .getByRole("button", { name: "Продолжить", exact: true })
        .click();
    const composer = frame.locator(".codex-input-container"),
      wrapper = composer.locator(".codex-input-wrapper"),
      field = composer.getByRole("textbox"),
      plus = composer.getByRole("button", {
        name: "Добавить в чат",
        exact: true,
      }),
      mic = composer.getByRole("button", {
        name: "Голосовой ввод",
        exact: true,
      });
    assert.equal(
      await composer
        .getByRole("button", { name: "Начать голосовой диалог", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await composer
        .getByRole("button", { name: "Отправить", exact: true })
        .isDisabled(),
      true,
    );
    for (const width of [390, 820]) {
      await page.setViewportSize({ width, height: width === 820 ? 1180 : 844 });
      await field.fill("");
      await field.blur();
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".codex-input-container")
            .classList.contains("expanded"),
      );
      const box = await wrapper.boundingBox(),
        p = await plus.boundingBox(),
        m = await mic.boundingBox(),
        f = await field.boundingBox();
      assert.ok(box.height <= 60);
      assert.ok(Math.abs(p.y + p.height / 2 - m.y - m.height / 2) < 2);
      assert.ok(Math.abs(f.y + f.height / 2 - m.y - m.height / 2) < 2);
      await field.focus();
      await page.waitForFunction(() =>
        document
          .querySelector(".codex-input-container")
          .classList.contains("expanded"),
      );
      const expanded = await wrapper.boundingBox();
      assert.ok(expanded.height >= 94 && expanded.height <= 120);
      await field.fill("Текст для редактирования");
      await composer
        .getByRole("button", { name: "Отправить", exact: true })
        .waitFor();
      assert.equal(await field.inputValue(), "Текст для редактирования");
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        await page.screenshot({
          path: `${output}/staff-composer-${width}-${theme}.png`,
          animations: "disabled",
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await field.fill("Согласовать");
    await mic.click();
    assert.equal(await mic.getAttribute("aria-pressed"), "true");
    await page.evaluate(() => {
      window.__dictation.onresult({
        results: [[{ transcript: "покупку лампочек" }]],
      });
      window.__lateDictation = window.__dictation.onresult;
    });
    await field.waitFor();
    assert.equal(await field.inputValue(), "Согласовать покупку лампочек");
    await field.fill("Исправленный вручную текст");
    await page.waitForFunction(
      () =>
        document
          .querySelector(".codex-mic-btn")
          .getAttribute("aria-pressed") === "false",
    );
    await page.evaluate(() =>
      window.__lateDictation({
        results: [[{ transcript: "старый результат" }]],
      }),
    );
    assert.equal(await field.inputValue(), "Исправленный вручную текст");
    await page.evaluate(() => {
      window.__denyDictation = true;
    });
    await mic.click();
    await frame
      .getByRole("alert")
      .filter({ hasText: "Разрешите доступ к микрофону" })
      .waitFor();
    assert.equal(await field.inputValue(), "Исправленный вручную текст");
    await page.evaluate(() => {
      window.__denyDictation = false;
    });
    await field.fill("Подготовить");
    await mic.click();
    await page.evaluate(() => {
      window.__dictation.onresult({ results: [[{ transcript: "договор" }]] });
      window.__dictation.finalText = "договор сегодня";
      window.__lateDictation = window.__dictation.onresult;
    });
    await mic.click();
    assert.equal(await field.inputValue(), "Подготовить договор сегодня");
    await plus.click();
    const chooser = page.waitForEvent("filechooser");
    await frame
      .getByRole("menuitem", { name: "Загрузить файл или фото", exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "recording.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF fixture audio"),
    });
    await frame
      .getByRole("button", { name: "Убрать файл recording.wav", exact: true })
      .waitFor();
    const mediaBox = await composer
        .locator(".codex-composer-media")
        .boundingBox(),
      textBox = await field.boundingBox();
    assert.ok(
      mediaBox.y + mediaBox.height <= textBox.y + 1,
      "Attachments and text occupy separate rows inside the composer",
    );
    const send = composer.getByRole("button", {
      name: "Отправить",
      exact: true,
    });
    await page.waitForFunction(
      () => !document.querySelector(".codex-send-btn").disabled,
    );
    const delivered = page.waitForResponse(
      (r) =>
        r.url().endsWith("/team-chat/messages") &&
        r.request().method() === "POST",
    );
    await send.click();
    const message = (await (await delivered).json()).message;
    ids.push(message._id);
    assert.equal(message.text, "Подготовить договор сегодня");
    assert.equal(message.attachments[0].name, "recording.wav");
    await field.fill("Следующий черновик");
    await page.evaluate(() =>
      window.__lateDictation({
        results: [[{ transcript: "поздний результат" }]],
      }),
    );
    assert.equal(await field.inputValue(), "Следующий черновик");
    await field.fill("");
    await field.blur();
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--safe-area-bottom", "34px"),
    );
    const bounds = await frame.boundingBox(),
      pill = await wrapper.boundingBox();
    assert.ok(
      Math.abs(bounds.y + bounds.height - pill.y - pill.height - 46) < 2,
      "Composer clears the system safe area plus its own 12px margin",
    );
    await page.evaluate(() =>
      document.documentElement.style.removeProperty("--safe-area-bottom"),
    );
    await field.focus();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", {
        configurable: true,
        value: 360,
      });
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#team-chat-public")
        .classList.contains("keyboard-open"),
    );
    const keyboardFrame = await frame.boundingBox(),
      keyboardPill = await wrapper.boundingBox();
    assert.ok(
      Math.abs(
        keyboardFrame.y +
          keyboardFrame.height -
          keyboardPill.y -
          keyboardPill.height -
          10,
      ) < 2,
    );
    assert.equal(await mic.isVisible(), true);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: staff compact/expanded phone and tablet input, dictation/manual edits/final transcript, audio file, send handoff, late result protection and home/keyboard insets",
    );
  } finally {
    for (const id of ids)
      await ownerContext.request.delete(
        origin + "/api/team-chat/messages/" + id,
      );
    await context.close();
  }
}
