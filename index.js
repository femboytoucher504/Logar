(() => {
    const { metro, patcher, plugin } = window.revenge || window.vendetta || {};

    if (!metro || !patcher || !plugin) {
        console.error("[Logar] Required Revenge/Vendetta APIs are missing!");
        return;
    }

    const MessageStore = metro.findByProps("getMessages", "getMessage");
    const MessageActions = metro.findByProps("sendMessage", "receiveMessage");
    const LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage");

    async function syncToCloud(payload) {
        if (!plugin.storage?.cloudToken || !plugin.storage?.supabaseUrl || !plugin.storage?.supabaseKey) return;
        
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
                    filtered_words: payload.filteredWords || [],
                    logs: payload.logs || [],
                    updated_at: new Date().toISOString()
                })
            });
        } catch (err) {
            console.error("[Logar Cloud Error]", err);
        }
    }

    function checkFilteredWords(text) {
        if (!text) return false;
        const filters = plugin.storage?.filteredWords || [];
        return filters.some(word => text.toLowerCase().includes(word.toLowerCase()));
    }

    function onLoad() {
        console.log("[Logar] Message logger system activated.");

        if (!plugin.storage.logs) plugin.storage.logs = [];

        patcher.instead("sendMessage", MessageActions, (args, original) => {
            const [channelId, message] = args;
            const content = message?.content;

            if (content && checkFilteredWords(content)) {
                const logEntry = {
                    timestamp: Date.now(),
                    content: content,
                    channelId: channelId,
                    type: "SENT_FILTERED_WORD"
                };
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
                        author: originalMessage.author?.username || "Unknown User",
                        authorId: originalMessage.author?.id,
                        channelId: channelId,
                        timestamp: Date.now()
                    };

                    plugin.storage.logs.push(deleteLog);
                    syncToCloud({ logs: plugin.storage.logs, filteredWords: plugin.storage.filteredWords });

                    setTimeout(() => {
                        LocalMessageHelper?.sendBotMessage(channelId, {
                            content: `⚠️ **Deleted (${originalMessage.author?.username || "Unknown"}):** ${originalMessage.content}\n*Time: ${new Date().toLocaleTimeString()}*`,
                            flags: 64
                        });
                    }, 400);
                }
            }

            if (event?.type === "MESSAGE_UPDATE") {
                const { message: updatedMessage } = event;
                if (!updatedMessage || !updatedMessage.id || !updatedMessage.channel_id) return;

                const oldMessage = MessageStore?.getMessage(updatedMessage.channel_id, updatedMessage.id);
                
                if (oldMessage && oldMessage.content && updatedMessage.content && oldMessage.content !== updatedMessage.content) {
                    const editLog = {
                        type: "EDITED_MESSAGE",
                        oldContent: oldMessage.content,
                        newContent: updatedMessage.content,
                        author: oldMessage.author?.username || "Unknown User",
                        authorId: oldMessage.author?.id,
                        channelId: updatedMessage.channel_id,
                        timestamp: Date.now()
                    };

                    plugin.storage.logs.push(editLog);
                    syncToCloud({ logs: plugin.storage.logs, filteredWords: plugin.storage.filteredWords });

                    setTimeout(() => {
                        LocalMessageHelper?.sendBotMessage(updatedMessage.channel_id, {
                            content: `✏️ **Edited (${oldMessage.author?.username || "Unknown"}):**\n**Old:** ${oldMessage.content}\n**New:** ${updatedMessage.content}`,
                            flags: 64
                        });
                    }, 400);
                }
            }
        });
    }

    function onUnload() {
        if (patcher) {
            patcher.unpatchAll();
        }
        console.log("[Logar] Message logger system deactivated.");
    }

    const pluginObject = {
        onLoad: onLoad,
        onUnload: onUnload
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = pluginObject;
    } else {
        return pluginObject;
    }
})();
