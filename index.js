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

// Revenge / Vendetta global kütüphanelerini güvenli şekilde çekiyoruz
const { metro, patcher, plugin } = window.revenge || window.vendetta || {};

if (!metro || !patcher || !plugin) {
  console.error("[Logar] Revenge/Vendetta API bulunamadı!");
}

var MessageStore = metro?.findByProps("getMessages", "getMessage");
var MessageActions = metro?.findByProps("sendMessage", "receiveMessage");
var LocalMessageHelper = metro?.findByProps("sendBotMessage", "createBotMessage");

async function syncToCloud(payload) {
  if (!plugin?.storage?.cloudToken || !plugin?.storage?.supabaseUrl || !plugin?.storage?.supabaseKey) return;
  try {
    const cleanUrl = plugin.storage.supabaseUrl.endsWith("/") ? plugin.storage.supabaseUrl : plugin.storage.supabaseUrl + "/";
    await fetch(`${cleanUrl}rest/v1/logar_backup?user_id=eq.${plugin.storage.cloudToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": plugin.storage.supabaseKey,
        "Authorization": `Bearer ${plugin.storage.supabaseKey}`,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        user_id: plugin.storage.cloudToken,
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
  const filters = plugin?.storage?.filteredWords || [];
  return filters.some((word) => text?.toLowerCase().includes(word.toLowerCase()));
}

var onLoad = () => {
  if (!patcher || !metro) return;

  patcher.instead("sendMessage", MessageActions, (args, original) => {
    var _a;
    const [channelId, message] = args;
    const content = message?.content;
    if (content && checkFilteredWords(content)) {
      const logEntry = {
        timestamp: Date.now(),
        content,
        channelId,
        type: "SENT",
        userId: metro.findByProps("getCurrentUser")?.getCurrentUser()?.id
      };
      if (!plugin.storage.logs) plugin.storage.logs = [];
      plugin.storage.logs.push(logEntry);
      syncToCloud({ logs: plugin.storage.logs, filteredWords: plugin.storage.filteredWords });
    }
    return original(...args);
  });

  patcher.before("dispatch", metro.findByProps("dispatch"), (args) => {
    const [event] = args;
    if (event?.type === "MESSAGE_DELETE") {
      const { id: messageId, channelId } = event;
      const originalMessage = MessageStore?.getMessage(channelId, messageId);
      if (originalMessage && originalMessage.content) {
        const deleteLog = {
          type: "DELETED_MESSAGE",
          content: originalMessage.content,
          author: originalMessage.author?.username,
          authorId: originalMessage.author?.id,
          channelId,
          timestamp: Date.now()
        };
        if (!plugin.storage.logs) plugin.storage.logs = [];
        plugin.storage.logs.push(deleteLog);
        syncToCloud({ logs: plugin.storage.logs, filteredWords: plugin.storage.filteredWords });
        setTimeout(() => {
          LocalMessageHelper?.sendBotMessage(channelId, {
            content: `⚠️ **Deleted (${originalMessage.author?.username}):** ${originalMessage.content}\n*Sent at: ${new Date(originalMessage.timestamp).toLocaleTimeString()}*`,
            flags: 64
          });
        }, 500);
      }
    }
  });
};

var onUnload = () => {
  patcher?.unpatchAll();
};
