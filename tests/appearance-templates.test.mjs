import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultTheme,
  presetTheme,
  appearanceTokens,
} from "../src/utils/appearance.js";
import {
  defaultTemplate,
  resolveTemplate,
  setTemplateMode,
  sanitizeTemplate,
  parseTemplatePreferences,
  sanitizeSavedTemplate,
  detectAppearanceDevice,
} from "../src/utils/appearanceTemplates.js";
test("a template saves both palettes and device adjustments inherit untouched desktop values", () => {
  let config = defaultTemplate();
  config.devices.desktop = {
    light: presetTheme("warm", "light"),
    dark: presetTheme("crisp", "dark"),
  };
  const tablet = resolveTemplate(config, "tablet", "light");
  tablet.overrides.widgets.metrics.rowLabelSize = 17;
  config = setTemplateMode(config, "tablet", "light", tablet);
  assert.deepEqual(config.devices.tablet.light, {
    overrides: { widgets: { metrics: { rowLabelSize: 17 } } },
  });
  assert.deepEqual(config.devices.tablet.dark, {});
  config.devices.desktop.light.global.colors.income = "#123456";
  config.devices.desktop.light.overrides.widgets.colors.surface = "#ffeedd";
  config.devices.desktop.dark.global.colors.expense = "#abcdef";
  const reloaded = sanitizeTemplate(JSON.parse(JSON.stringify(config)));
  assert.equal(
    resolveTemplate(reloaded, "tablet", "light").overrides.widgets.metrics
      .rowLabelSize,
    17,
  );
  assert.equal(
    appearanceTokens(resolveTemplate(reloaded, "tablet", "light"))[
      "--widget-background"
    ],
    "#ffeedd",
  );
  assert.equal(
    resolveTemplate(reloaded, "tablet", "light").global.colors.income,
    "#123456",
  );
  assert.equal(
    resolveTemplate(reloaded, "tablet", "dark").global.colors.expense,
    "#abcdef",
  );
  assert.equal(
    resolveTemplate(reloaded, "mobile", "light").overrides.widgets.metrics
      .rowLabelSize,
    undefined,
  );
});
test("removing a section override on a device keeps that choice after reload", () => {
  let config = defaultTemplate();
  config.devices.desktop.light.overrides.widgets.colors.surface = "#abcdef";
  const mobile = resolveTemplate(config, "mobile", "light");
  delete mobile.overrides.widgets.colors.surface;
  config = setTemplateMode(config, "mobile", "light", mobile);
  assert.equal(
    config.devices.mobile.light.overrides.widgets.colors.surface,
    null,
  );
  assert.equal(
    resolveTemplate(sanitizeTemplate(config), "mobile", "light").overrides
      .widgets.colors.surface,
    undefined,
  );
  assert.equal(
    config.devices.desktop.light.overrides.widgets.colors.surface,
    "#abcdef",
  );
});
test("old active light and dark palettes migrate together and account caches retain template revisions", () => {
  const legacy = {
    version: 1,
    mode: "light",
    themes: {
      light: presetTheme("warm", "light"),
      dark: presetTheme("crisp", "dark"),
    },
    saved: [
      {
        id: "pc",
        name: "ПК",
        mode: "light",
        theme: presetTheme("warm", "light"),
        revision: 2,
      },
    ],
  };
  const pref = parseTemplatePreferences(null, JSON.stringify(legacy));
  assert.equal(pref.config.devices.desktop.light.global.colors.bg, "#f5f3ed");
  assert.equal(pref.config.devices.desktop.dark.global.colors.bg, "#161b24");
  assert.equal(pref.legacySaved.length, 1);
  const item = sanitizeSavedTemplate({
    id: "pc",
    name: "Шаблон",
    config: pref.config,
    revision: 4,
    deviceRevisions: { desktop: 2, tablet: 3, mobile: 1 },
  });
  const restored = parseTemplatePreferences({
    version: 2,
    config: pref.config,
    mode: "dark",
    selectedId: item.id,
    base: item,
    saved: [item],
  });
  assert.equal(restored.base.deviceRevisions.tablet, 3);
  assert.equal(restored.selectedId, "pc");
  assert.equal(restored.saved[0].name, "Шаблон");
  assert.equal(
    parseTemplatePreferences("broken").config.devices.desktop.light.enabled,
    false,
  );
});
test("device patch colours and font choices remain safe and bounded", () => {
  const config = defaultTemplate();
  config.devices.tablet.light = {
    global: {
      colors: { text: "red;display:none" },
      metrics: { fontFamily: "bad;display:none", fontSize: 999 },
    },
  };
  const safe = resolveTemplate(sanitizeTemplate(config), "tablet", "light");
  assert.equal(safe.global.metrics.fontSize, 20);
  assert.equal(safe.global.metrics.fontFamily, "system");
  assert.equal(
    safe.global.colors.text,
    defaultTheme("light").global.colors.text,
  );
});
test("device detection distinguishes iPad desktop identification and Android tablets", () => {
  for (const [input, device] of [
    [{ userAgent: "iPhone", width: 390 }, "mobile"],
    [{ userAgent: "iPad", width: 1024 }, "tablet"],
    [{ userAgent: "Macintosh", maxTouchPoints: 5, width: 1366 }, "tablet"],
    [{ userAgent: "Android 16", width: 1280 }, "tablet"],
    [{ userAgent: "Macintosh", maxTouchPoints: 0, width: 1512 }, "desktop"],
  ])
    assert.equal(detectAppearanceDevice(input), device);
});
