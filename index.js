(() => {
    const { metro, patcher, plugin } = window.revenge || window.vendetta || {};

    // Eklentinin Revenge tarafından sorunsuz kabul edilmesi için bos/guvenli baslangiç
    function onLoad() {
        console.log("[Logar] Base system injected successfully.");
        if (!plugin.storage) plugin.storage = {};
        if (!plugin.storage.logs) plugin.storage.logs = [];

        // Discord'un iç modüllerinin yüklenmesini 2 saniye geciktirerek 
        // açilistaki kilitlenme ve uyuşmazlik sorununu tamamen bypass ediyoruz.
        setTimeout(() => {
            try {
                if (!metro || !patcher) return;

                const MessageStore = metro.findByProps("getMessages", "getMessage");
                const MessageActions = metro.findByProps("sendMessage", "receiveMessage");
                const LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage");
                const Dispatcher = metro.findByProps("dispatch");

                if (Dispatcher) {
                    patcher.before("dispatch", Dispatcher, (args) => {
                        const [event] = args;
                        
                        // SİLİNEN MESAJLAR
                        if (event?.type === "MESSAGE_DELETE" && MessageStore) {
                            const { id: messageId, channelId } = event;
                            const originalMessage = MessageStore.getMessage(channelId, messageId);

                            if (originalMessage?.content) {
                                plugin.storage.logs.push({
                                    type: "DELETED_MESSAGE",
                                    content: originalMessage.content,
                                    author: originalMessage.author?.username || "Unknown",
                                    timestamp: Date.now()
                                });

                                if (LocalMessageHelper) {
                                    LocalMessageHelper.sendBotMessage(channelId, {
                                        content: `⚠️ **Deleted (${originalMessage.author?.username || "Unknown"}):** ${originalMessage.content}`,
                                        flags: 64
                                    });
                                }
                            }
                        }

                        // DÜZENLENEN MESAJLAR
                        if (event?.type === "MESSAGE_UPDATE" && MessageStore) {
                            const { message: updatedMessage } = event;
                            if (!updatedMessage?.id || !updatedMessage?.channel_id) return;

                            const oldMessage = MessageStore.getMessage(updatedMessage.channel_id, updatedMessage.id);
                            
                            if (oldMessage?.content && updatedMessage.content && oldMessage.content !== updatedMessage.content) {
                                plugin.storage.logs.push({
                                    type: "EDITED_MESSAGE",
                                    oldContent: oldMessage.content,
                                    newContent: updatedMessage.content,
                                    author: oldMessage.author?.username || "Unknown",
                                    timestamp: Date.now()
                                });

                                if (LocalMessageHelper) {
                                    LocalMessageHelper.sendBotMessage(updatedMessage.channel_id, {
                                        content: `✏️ **Edited (${oldMessage.author?.username || "Unknown"}):**\n**Old:** ${oldMessage.content}\n**New:** ${updatedMessage.content}`,
                                        flags: 64
                                    });
                                }
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("[Logar Async Injection Failed]", e);
            }
        }, 2000);
    }

    function onUnload() {
        if (patcher) {
            patcher.unpatchAll();
        }
        console.log("[Logar] System stopped.");
    }

    const pluginObject = { onLoad: onLoad, onUnload: onUnload };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = pluginObject;
    } else {
        return pluginObject;
    }
})();
