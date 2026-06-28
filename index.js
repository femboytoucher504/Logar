(() => {
    const { metro, patcher, plugin } = window.revenge || window.vendetta || {};

    function onLoad() {
        console.log("[Logar] Active");
        if (!plugin.storage) plugin.storage = {};
        if (!plugin.storage.logs) plugin.storage.logs = [];

        setTimeout(() => {
            try {
                const MessageStore = metro?.findByProps("getMessages", "getMessage");
                const LocalMessageHelper = metro?.findByProps("sendBotMessage", "createBotMessage");
                const Dispatcher = metro?.findByProps("dispatch");

                if (Dispatcher) {
                    patcher.before("dispatch", Dispatcher, (args) => {
                        const event = args[0];
                        
                        if (event?.type === "MESSAGE_DELETE" && MessageStore) {
                            const orig = MessageStore.getMessage(event.channelId, event.id);
                            if (orig?.content) {
                                plugin.storage.logs.push({ type: "DEL", text: orig.content, user: orig.author?.username });
                                LocalMessageHelper?.sendBotMessage(event.channelId, { content: `⚠️ **Deleted (${orig.author?.username}):** ${orig.content}`, flags: 64 });
                            }
                        }

                        if (event?.type === "MESSAGE_UPDATE" && MessageStore) {
                            const msg = event.message;
                            if (!msg?.id || !msg?.channel_id) return;
                            const orig = MessageStore.getMessage(msg.channel_id, msg.id);
                            if (orig?.content && msg.content && orig.content !== msg.content) {
                                plugin.storage.logs.push({ type: "EDIT", old: orig.content, next: msg.content, user: orig.author?.username });
                                LocalMessageHelper?.sendBotMessage(msg.channel_id, { content: `✏️ **Edited (${orig.author?.username}):**\n**Old:** ${orig.content}\n**New:** ${msg.content}`, flags: 64 });
                            }
                        }
                    });
                }
            } catch (e) { console.error(e); }
        }, 1500);
    }

    const pluginObject = { onLoad: onLoad, onUnload: () => patcher?.unpatchAll() };
    if (typeof module !== "undefined" && module.exports) module.exports = pluginObject;
    return pluginObject;
})();
