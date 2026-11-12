import "./team-chat-search.js";
import { nextTick } from "vue";
import { teamApi } from "/src/stores/teamChatStore.js";
let pluginUrl = "",
  fullData = false;
const base = teamApi.defaults.adapter;
window.setupCopies = [];
window.setupShares = [];
window.setupWrites = [];
window.setupCopyFails = false;
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText(text) {
      if (window.setupCopyFails) return Promise.reject(Error("denied"));
      window.setupCopies.push(text);
      return Promise.resolve();
    },
  },
});
Object.defineProperty(navigator, "share", {
  configurable: true,
  value: window.fixtureShare
    ? async (data) => {
        if (window.setupShareError)
          throw Object.assign(Error("share failed"), {
            name: window.setupShareError,
          });
        window.setupShares.push(data);
      }
    : undefined,
});
Object.defineProperty(navigator, "canShare", {
  configurable: true,
  value: () => !window.setupShareUnavailable,
});
teamApi.defaults.adapter = async (config) => {
  if (config.method !== "get") window.setupWrites.push(config.url);
  if (config.url === "/mcp/connection")
    return {
      status: 200,
      data: {
        serverUrl: "https://api.index12.com/team-mcp",
        pluginUrl,
        fullData,
        connections: [],
      },
    };
  return base(config);
};
window.searchChat.me = {
  ...window.searchChat.me,
  owner: false,
  role: "employee",
};
window.searchChat.tab = "mcp";
window.setupFixture = {
  async publish() {
    pluginUrl = "https://chatgpt.com/plugins/plugin_fixture";
    fullData = true;
    window.searchChat.tab = "messages";
    await nextTick();
    window.searchChat.tab = "mcp";
  },
};
