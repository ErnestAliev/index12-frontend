// The first HTML response must describe Chat. Replacing the main manifest in
// client-side JavaScript is too late for browsers discovering an install target.
export function teamToken(pathname) {
  return pathname.match(/^\/team\/([A-Za-z0-9_-]{20,100})\/?$/)?.[1] || null;
}

export function renderTeamEntry(html, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(token))
    throw new Error("Invalid chat invitation");
  const path = "/team/" + token;
  return html
    .replace('href="/manifest.webmanifest"', `href="/team-manifest/${token}"`)
    .replace('href="/apple-touch-icon.png"', 'href="/chat-180.png"')
    .replace("<title>INDEX12</title>", "<title>Chat</title>")
    .replace(
      'property="og:url" content="https://index12.com/"',
      `property="og:url" content="https://index12.com${path}"`,
    )
    .replace(
      'property="og:title" content="INDEX12"',
      'property="og:title" content="Chat"',
    )
    .replace(
      "</head>",
      `<meta name="apple-mobile-web-app-title" content="Chat" />
  <script>
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      window.index12ChatInstalled = false;
      window.index12InstallPrompt = event;
    });
    window.addEventListener('appinstalled', function () {
      window.index12ChatInstalled = true;
      window.index12InstallPrompt = null;
    });
  </script>
</head>`,
    );
}

export function teamEntryPlugin() {
  return {
    name: "index12-team-entry",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const pathname = (context.originalUrl || context.path).split(/[?#]/)[0];
        const token = teamToken(pathname);
        return token ? renderTeamEntry(html, token) : html;
      },
    },
  };
}
