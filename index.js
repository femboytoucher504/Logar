(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher, plugin, logger } = globalContext;

    const log = logger ? logger.log : console.log;
    const logError = logger ? logger.error : console.error;

    if (!metro || !patcher || !plugin) {
        console.error("[Logar-Core] Critical APIs missing.");
        return;
    }

    let MessageStore, MessageActions, LocalMessageHelper, Dispatcher, SelectedChannelStore;
    let isSyncing = false;
    let syncQueue = [];

    function resolveModules() {
        try { MessageStore = metro.findByProps("getMessages", "getMessage"); } catch(e) {}
        try { MessageActions = metro.findByProps("sendMessage", "receiveMessage"); } catch(e) {}
        try { LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage"); } catch(e) {}
        try { Dispatcher = metro.findByProps("dispatch") || metro.findByProps("_dispatch"); } catch(e) {}
        try { SelectedChannelStore = metro.findByProps("getChannelId", "getLastSelectedChannelId"); } catch(e) {}
    }

    async function processQueue() {
        if (isSyncing || syncQueue.length === 0) return;
        isSyncing = true;

        const currentPayload = syncQueue.shift();
        const { supabaseUrl, supabaseKey, cloudToken } = plugin.storage || {};
        
        if (!supabaseUrl || !supabaseKey || !cloudToken) {
            isSyncing = false;
            return processQueue();
        }

        try {
            const endpoint = supabaseUrl.endsWith("/") ? `${supabaseUrl}rest/v1/logar_backup` : `${supabaseUrl}/rest/v1/logar_backup`;
            await fetch(`${endpoint}?user_id=eq.${encodeURIComponent(cloudToken)}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": supabaseKey,
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify({
                    user_id: cloudToken,
                    filtered_words: currentPayload.filteredWords || [],
                    logs: currentPayload.logs || [],
                    updated_at: new Date().toISOString()
                })
            });
        } catch (err) {
            logError("[Logar-Cloud] Telemetry push failed", err);
        } {
            isSyncing = false;
            setTimeout(processQueue, 300);
        }
    }

    function pushToCloudSync() {
        syncQueue.push({
            logs: plugin.storage.logs || [],
            filteredWords: plugin.storage.filteredWords || []
        });
        processQueue();
    }

    function isTextMatchingFilters(text) {
        if (!text || typeof text !== "string") return false;
        const targetText = text.toLowerCase();
        const filters = plugin.storage?.filteredWords || [];
        return filters.some(word => word && typeof word === "string" && targetText.includes(word.toLowerCase()));
    }

    function onLoad() {
        log("[Logar-Core] Structural synchronization online.");
        
        if (!plugin.storage) plugin.storage = {};
        if (!plugin.storage.logs) plugin.storage.logs = [];
        if (!plugin.storage.filteredWords) plugin.storage.filteredWords = [];
        
        resolveModules();

        // 1. OUTBOUND FILTER CHECK (Giden Mesaj Blokaj / Log)
        if (MessageActions) {
            try {
                patcher.instead("sendMessage", MessageActions, (args, original) => {
                    const [channelId, messageStruct] = args;
                    const content = messageStruct?.content;

                    if (content && isTextMatchingFilters(content)) {
                        plugin.storage.logs.push({
                            id: Math.random().toString(36).substr(2, 9),
                            type: "OUTBOUND_INTERCEPTED",
                            channelId: channelId,
                            content: content,
                            timestamp: Date.now()
                        });
                        pushToCloudSync();
                    }
                    return original(...args);
                });
            } catch (err) { logError(err); }
        }

        // 2. INBOUND CORE GATEWAY interner (Silme ve Düzenleme Yakalama)
        if (Dispatcher) {
            try {
                patcher.before("dispatch", Dispatcher, (args) => {
                    const event = args[0];
                    if (!event || !event.type) return;

                    if (event.type === "MESSAGE_DELETE" && MessageStore) {
                        const cachedMsg = MessageStore.getMessage(event.channelId, event.id);
                        if (cachedMsg?.content) {
                            const isAlreadyLogged = plugin.storage.logs.some(l => l.messageId === event.id && l.type === "MESSAGE_DELETED");
                            if (isAlreadyLogged) return;

                            plugin.storage.logs.push({
                                messageId: event.id,
                                type: "MESSAGE_DELETED",
                                channelId: event.channelId,
                                content: cachedMsg.content,
                                authorName: cachedMsg.author?.username || "Unknown",
                                timestamp: Date.now()
                            });
                            pushToCloudSync();

                            if (LocalMessageHelper && SelectedChannelStore && SelectedChannelStore.getChannelId() === event.channelId) {
                                setTimeout(() => {
                                    LocalMessageHelper.sendBotMessage(event.channelId, {
                                        content: `⚠️ **[Logar] Deleted Message**\n**User:** ${cachedMsg.author?.username}\n**Content:** ${cachedMsg.content}`,
                                        flags: 64
                                    });
                                }, 150);
                            }
                        }
                    }

                    if (event.type === "MESSAGE_UPDATE" && MessageStore) {
                        const { message: partialMsg } = event;
                        if (!partialMsg?.id || !partialMsg?.channel_id || !partialMsg?.content) return;

                        const oldMsg = MessageStore.getMessage(partialMsg.channel_id, partialMsg.id);
                        if (oldMsg?.content && oldMsg.content !== partialMsg.content) {
                            const lastLog = plugin.storage.logs[plugin.storage.logs.length - 1];
                            if (lastLog && lastLog.messageId === partialMsg.id && lastLog.newContent === partialMsg.content) return;

                            plugin.storage.logs.push({
                                messageId: partialMsg.id,
                                type: "MESSAGE_EDITED",
                                channelId: partialMsg.channel_id,
                                oldContent: oldMsg.content,
                                newContent: partialMsg.content,
                                authorName: oldMsg.author?.username || "Unknown",
                                timestamp: Date.now()
                            });
                            pushToCloudSync();

                            if (LocalMessageHelper && SelectedChannelStore && SelectedChannelStore.getChannelId() === partialMsg.channel_id) {
                                setTimeout(() => {
                                    LocalMessageHelper.sendBotMessage(partialMsg.channel_id, {
                                        content: `✏️ **[Logar] Edited Message**\n**User:** ${oldMsg.author?.username}\n**Before:** ${oldMsg.content}\n**After:** ${partialMsg.content}`,
                                        flags: 64
                                    });
                                }, 150);
                            }
                        }
                    }
                });
            } catch (err) { logError(err); }
        }
    }

    function onUnload() {
        if (patcher) patcher.unpatchAll();
        syncQueue = [];
    }

    const moduleExport = { onLoad: onLoad, onUnload: onUnload };
    if (typeof module !== "undefined" && module.exports) module.exports = moduleExport;
    else return moduleExport;
})();
