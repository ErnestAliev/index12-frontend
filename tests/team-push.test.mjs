import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { createServer } from "vite";
let vite, push, api, originalNavigator;
let ios = false,
  installed = false,
  requests = [],
  registrations = 0,
  permissionRequests = 0,
  subscription,
  unsubscribed = 0;
const key = Buffer.alloc(65, 1).toString("base64url");
const device = () => ({
  endpoint: "https://fcm.googleapis.com/test-device",
  options: { applicationServerKey: new Uint8Array(65).fill(1).buffer },
  toJSON() {
    return {
      endpoint: this.endpoint,
      keys: { p256dh: "x".repeat(65), auth: "x".repeat(24) },
    };
  },
  async unsubscribe() {
    unsubscribed++;
    return true;
  },
});
const registration = {
  active: { scriptURL: "http://localhost/team-sw.js" },
  pushManager: {
    async getSubscription() {
      return subscription;
    },
    async subscribe() {
      subscription = device();
      return subscription;
    },
  },
};
before(async () => {
  originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  globalThis.window = {
    location: { origin: "http://localhost" },
    matchMedia: () => ({ matches: installed }),
    PushManager: class {},
    Notification: {},
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      get userAgent() {
        return ios ? "iPhone" : "Chrome";
      },
      serviceWorker: {
        async register(path, options) {
          assert.equal(path, "/team-sw.js");
          assert.equal(options.scope, "/team/");
          registrations++;
          return registration;
        },
        async getRegistration() {
          return registration;
        },
      },
    },
  });
  globalThis.Notification = {
    permission: "default",
    async requestPermission() {
      permissionRequests++;
      return this.permission;
    },
  };
  vite = await createServer({
    server: { middlewareMode: true, ws: false },
    appType: "custom",
  });
  push = await vite.ssrLoadModule("/src/utils/teamPush.js");
  ({ teamApi: api } = await vite.ssrLoadModule("/src/stores/teamChatStore.js"));
  api.defaults.adapter = async (config) => {
    requests.push(config);
    return {
      status: 200,
      data:
        config.url === "/push/key"
          ? { configured: true, publicKey: key }
          : { enabled: true },
    };
  };
});
after(async () => {
  await vite.close();
  delete globalThis.window;
  delete globalThis.Notification;
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
});
test("login checks never trigger a permission dialog; enabling waits for server-bound subscription", async () => {
  assert.deepEqual(await push.bindChatPush("fixture"), { state: "permission" });
  assert.equal(permissionRequests, 0);
  assert.equal(registrations, 0);
  Notification.permission = "granted";
  const result = await push.bindChatPush("fixture");
  assert.equal(result.state, "enabled");
  assert.equal(result.endpoint, subscription.endpoint);
  assert.equal(JSON.parse(requests.at(-1).data).token, "fixture");
  assert.equal(permissionRequests, 0);
  assert.equal(registrations, 1);
});
test("only a user gesture requests permission, and iPhone browser requires home-screen installation first", async () => {
  Notification.permission = "denied";
  const waiting = push.bindChatPush("fixture", true);
  assert.equal(
    permissionRequests,
    1,
    "Permission request happens before waiting on a network request",
  );
  assert.deepEqual(await waiting, { state: "blocked" });
  ios = true;
  assert.deepEqual(await push.bindChatPush("fixture", true), {
    state: "install",
  });
  assert.equal(permissionRequests, 1);
  ios = false;
});
test("server rejection cannot report notifications enabled, and logout never unsubscribes the calendar worker", async () => {
  Notification.permission = "granted";
  const adapter = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    if (config.url === "/push/subscriptions") throw Error("Server unavailable");
    return adapter(config);
  };
  await assert.rejects(push.bindChatPush("fixture"), /Server unavailable/);
  api.defaults.adapter = adapter;
  registration.active.scriptURL = "http://localhost/calendar-sw.js";
  assert.equal(await push.chatPushEndpoint(), null);
  await push.unsubscribeChatPush();
  assert.equal(unsubscribed, 0);
  registration.active.scriptURL = "http://localhost/team-sw.js";
  await push.unsubscribeChatPush();
  assert.equal(unsubscribed, 1);
});
