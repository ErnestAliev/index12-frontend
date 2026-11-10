// Static document rendering in an opaque sandbox; nothing is inserted into the app DOM.
export function htmlPreview(source, zoom = 100) {
  const template = document.createElement("template");
  template.innerHTML = source;
  const fragment = template.content;
  fragment
    .querySelectorAll(
      "script,noscript,template,iframe,frame,frameset,object,embed,applet,base,meta,link,input,button,textarea,select",
    )
    .forEach((node) => node.remove());
  fragment
    .querySelectorAll("form")
    .forEach((node) => node.replaceWith(...node.childNodes));
  for (const node of fragment.querySelectorAll("*")) {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (
        name.startsWith("on") ||
        [
          "srcdoc",
          "action",
          "formaction",
          "ping",
          "target",
          "download",
          "srcset",
        ].includes(name)
      )
        node.removeAttribute(attr.name);
      if (["href", "xlink:href"].includes(name) && !attr.value.startsWith("#"))
        node.removeAttribute(attr.name);
      if (
        ["src", "poster", "background"].includes(name) &&
        !/^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp);base64,/i.test(attr.value)
      )
        node.removeAttribute(attr.name);
    }
  }
  const policy = document.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const style = document.createElement("style");
  style.textContent = `html{zoom:${Math.max(80, Math.min(180, zoom)) / 100};background:#fff;color:#222;font:14px/1.5 Arial,sans-serif}body{margin:16px}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{padding:4px 6px}pre{white-space:pre-wrap;overflow-wrap:anywhere}`;
  return `<!doctype html><html><head>${policy.outerHTML}${style.outerHTML}</head><body>${template.innerHTML}</body></html>`;
}
