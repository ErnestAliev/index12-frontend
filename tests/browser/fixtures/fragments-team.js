import "./team-chat-search.js";
import { teamApi } from "/src/stores/teamChatStore.js";
import { nextTick } from 'vue';
const chat = window.searchChat,
  base = teamApi.defaults.adapter;
window.fixtureOpen.value = false;
await nextTick();
const rows = [
  {
    _id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    authorId: "other",
    authorName: "Коллега",
    text: "Первый абзац.\n\nВот **нужный** [фрагмент](https://example.invalid) длинного ответа.\n\nПоследний абзац.",
  },
  {
    _id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    authorId: "actor",
    authorName: "Эрнест",
    text: "Своё сообщение.\n\nЗдесь свой фрагмент для обсуждения.\n\nКонец сообщения.",
  },
].map((row) => ({
  ...row,
  contentVersion: 0,
  version: 0,
  createdAt: new Date().toISOString(),
  attachments: [],
  reactions: [],
  readCount: 0,
}));
chat.state.messages = [...rows];
chat.state.tasks = [];
chat.state.hasMore = false;
window.fragmentRequests = [];
teamApi.defaults.adapter = async (config) => {
  if (config.url === '/messages' && config.method === 'get') return { status: 200, data: { messages: [...rows], hasMore: false } };
  if (config.url === "/state")
    return {
      status: 200,
      data: {
        messages: [...rows],
        tasks: [],
        members: [],
        people: [],
        hasMore: false,
      },
    };
  if (config.url === "/messages" && config.method === "post") {
    const body = JSON.parse(config.data);
    window.fragmentRequests.push(body);
    const source = rows.find((row) => row._id === body.replyToId);
    const message = {
      _id: body.id,
      text: body.text,
      authorId: "actor",
      authorName: "Эрнест",
      createdAt: new Date().toISOString(),
      attachments: [],
      reactions: [],
      readCount: 0,
      replyTo: {
        messageId: source._id,
        authorName: source.authorName,
        text: body.replyExcerpt.text,
        fragment: body.replyExcerpt,
      },
    };
    rows.push(message);
    return { status: 201, data: { message } };
  }
  return base(config);
};
window.fixtureOpen.value = true;
