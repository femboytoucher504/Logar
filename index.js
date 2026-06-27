var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

var logar_exports = {};
__export(logar_exports, {
  onLoad: () => onLoad,
  onUnload: () => onUnload
});
module.exports = __toCommonJS(logar_exports);
var import_metro = require("@revenge/metro");
var import_patcher = require("@revenge/patcher");
var import_plugin = require("@revenge/plugin");
var MessageStore = import_metro.metro.findByProps("getMessages", "getMessage");
var MessageActions = import_metro.metro.findByProps("sendMessage", "receiveMessage");
var LocalMessageHelper = import_metro.metro.findByProps("sendBotMessage", "createBotMessage");
async function syncToCloud(payload) {
  if (!import_plugin.storage.cloudToken || !import_plugin.storage.supabaseUrl || !import_plugin.storage.supabaseKey) return;
  try {
    const cleanUrl = import_plugin.storage.supabaseUrl.endsWith("/") ? import_plugin.storage.supabaseUrl : import_plugin.storage.supabaseUrl + "/";
    await fetch(`${cleanUrl}rest/v1/logar_backup?user_id=eq.${import_plugin.storage.cloudToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": import_plugin.storage.supabaseKey,
        "Authorization": `Bearer ${import_plugin.storage.supabaseKey}`,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        user_id: import_plugin.storage.cloudToken,
        filtered_words: payload.filteredWords,
        logs: payload.logs,
        updated_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error("[Logar Cloud Error]", err);
  }
}
function checkFilteredWords(text) {
  const filters = import_plugin.storage.filteredWords || [];
  return filters.some((word) => text.toLowerCase().includes(word.toLowerCase()));
}
var onLoad = () => {
  import_patcher.patcher.instead("sendMessage", MessageActions, (args, original) => {
    var _a;
    const [channelId, message] = args;
    const content = message.content;
    if (checkFilteredWords(content)) {
      const logEntry = {
        timestamp: Date.now(),
        content,
        channelId,
        type: "SENT",
        userId: (_a = import_metro.metro.findByProps("getCurrentUser").getCurrentUser()) == null ? void 0 : _a.id
      };
      if (!import_plugin.storage.logs) import_plugin.storage.logs = [];
      import_plugin.storage.logs.push(logEntry);
      syncToCloud({ logs: import_plugin.storage.logs, filteredWords: import_plugin.storage.filteredWords });
    }
    return original(...args);
  });
  import_patcher.patcher.before("dispatch", import_metro.metro.findByProps("dispatch"), (args) => {
    const [event] = args;
    if (event.type === "MESSAGE_DELETE") {
      const { id: messageId, channelId } = event;
      const originalMessage = MessageStore.getMessage(channelId, messageId);
      if (originalMessage) {
        const deleteLog = {
          type: "DELETED_MESSAGE",
          content: originalMessage.content,
          author: originalMessage.author.username,
          authorId: originalMessage.author.id,
          channelId,
          timestamp: Date.now()
        };
        if (!import_plugin.storage.logs) import_plugin.storage.logs = [];
        import_plugin.storage.logs.push(deleteLog);
        syncToCloud({ logs: import_plugin.storage.logs, filteredWords: import_plugin.storage.filteredWords });
        setTimeout(() => {
          LocalMessageHelper.sendBotMessage(channelId, {
            content: `⚠️ **Deleted (${originalMessage.author.username}):** ${originalMessage.content}\n*Sent at: ${new Date(originalMessage.timestamp).toLocaleTimeString()}*`,
            flags: 64
          });
        }, 500);
      }
    }
  });
};
var onUnload = () => {
  import_patcher.patcher.unpatchAll();
};
