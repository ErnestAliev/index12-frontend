// Shared account state for isolated browser contexts. Financial API traffic stays synthetic.
export function createAppearanceAPI() {
  const libraries = new Map(),
    writes = [];
  let offline = false;
  const library = (actor) => {
    if (!libraries.has(actor))
      libraries.set(actor, {
        themes: [],
        activeThemeId: null,
        selectionSet: false,
        importedIds: [],
      });
    return libraries.get(actor);
  };
  async function handle(route, actor) {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (!path.includes("/user/appearance-templates")) return false;
    if (offline) {
      await route.abort("failed");
      return true;
    }
    const state = library(actor),
      method = req.method(),
      body = req.postDataJSON();
    let data,
      status = 200;
    if (method !== "GET") writes.push({ actor, path, method, body });
    if (method === "GET")
      data = {
        themes: state.themes,
        activeThemeId: state.activeThemeId,
        legacyThemes: [],
      };
    else if (path.endsWith("/active")) {
      state.activeThemeId = body.id;
      state.selectionSet = true;
      data = { activeThemeId: body.id };
    } else if (method === "POST") {
      const importing = path.endsWith("/import"),
        existing = state.themes.find((t) => t.id === body.id);
      if (existing || (importing && state.importedIds.includes(body.id)))
        data = { theme: existing || null, activeThemeId: state.activeThemeId };
      else {
        const { activate, ...input } = body,
          item = {
            ...input,
            revision: 1,
            deviceRevisions: { desktop: 1, tablet: 1, mobile: 1 },
          };
        state.themes.push(item);
        if (importing) state.importedIds.push(item.id);
        if (!importing || (activate && !state.selectionSet)) {
          state.activeThemeId = item.id;
          state.selectionSet = true;
        }
        data = { theme: item, activeThemeId: state.activeThemeId };
      }
    } else {
      const segments = path.split("/"),
        id = decodeURIComponent(
          method === "PATCH" ? segments.at(-3) : segments.at(-1),
        ),
        item = state.themes.find((t) => t.id === id),
        device = segments.at(-1);
      if (!item) {
        status = 404;
        data = { error: "Тема удалена на другом устройстве." };
      } else if (
        method === "PATCH"
          ? item.deviceRevisions[device] !== body.revision ||
            (body.name && body.templateRevision !== item.revision)
          : item.revision !== body.revision
      ) {
        status = 409;
        data = { error: "Этот вариант темы изменён на другом устройстве." };
      } else if (method === "PATCH") {
        item.config.devices[device] = body.values;
        item.revision++;
        item.deviceRevisions[device]++;
        if (body.name) item.name = body.name;
        state.activeThemeId = item.id;
        state.selectionSet = true;
        data = { theme: item, activeThemeId: item.id };
      } else {
        state.themes = state.themes.filter((t) => t.id !== id);
        if (state.activeThemeId === id) state.activeThemeId = null;
        state.selectionSet = true;
        data = { ok: true, activeThemeId: state.activeThemeId };
      }
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
    return true;
  }
  return {
    handle,
    library,
    writes,
    setOffline: (value) => {
      offline = value;
    },
  };
}
