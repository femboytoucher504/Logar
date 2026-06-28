(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher, plugin, logger } = globalContext;

    const log = logger ? logger.log : console.log;
    const logError = logger ? logger.error : console.error;

    if (!metro || !patcher || !plugin) {
        console.error("[Logar-Core] Critical APIs missing.");
        return;
    }

    // --- ENTEGRE REVENGE/VENDETTA AYARLAR PANELİ ---
    function SettingsPanel() {
        const React = metro.findByProps("createElement", "useState");
        const RN = metro.findByProps("ScrollView", "Text", "TextInput", "Button", "View");
        const { useProxy } = metro.findByProps("useProxy") || {};
        
        if (!React || !RN) return null;
        if (plugin.storage && useProxy) useProxy(plugin.storage);

        const [url, setUrl] = React.useState(plugin.storage?.supabaseUrl || "");
        const [key, setKey] = React.useState(plugin.storage?.supabaseKey || "");
        const [token, setToken] = React.useState(plugin.storage?.cloudToken || "");
        const [word, setWord] = React.useState("");

        const saveConfig = () => {
            if (!plugin.storage) plugin.storage = {};
            plugin.storage.supabaseUrl = url;
            plugin.storage.supabaseKey = key;
            plugin.storage.cloudToken = token;
        };

        const addWord = () => {
            if (!plugin.storage) plugin.storage = {};
            if (!plugin.storage.filteredWords) plugin.storage.filteredWords = [];
            if (word.trim() && !plugin.storage.filteredWords.includes(word.trim())) {
                plugin.storage.filteredWords.push(word.trim());
                setWord("");
            }
        };

        return React.createElement(RN.ScrollView, { style: { flex: 1, padding: 16, backgroundColor: "#1e1e1e" } },
            React.createElement(RN.Text, { style: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 } }, "Logar Cloud Settings"),
            React.createElement(RN.View, { style: { marginBottom: 24, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#ddd", marginBottom: 6 } }, "Supabase URL"),
                React.createElement(RN.TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: url, onChangeText: setUrl, placeholder: "https://your-project.supabase.co" }),
                React.createElement(RN.Text, { style: { color: "#ddd", marginBottom: 6 } }, "Supabase API Key"),
                React.createElement(RN.TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: key, onChangeText: setKey, placeholder: "anon-key", secureTextEntry: true }),
                React.createElement(RN.Text, { style: { color: "#ddd", marginBottom: 6 } }, "Cloud User Token"),
                React.createElement(RN.TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: token, onChangeText: setToken, placeholder: "unique-user-token" }),
                React.createElement(RN.Button, { title: "Save Cloud Settings", onPress: saveConfig })
            ),
            React.createElement(RN.View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { fontSize: 16, color: "#fff", marginBottom: 8 } }, "Word Filter"),
                React.createElement(RN.TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: word, onChangeText: setWord, placeholder: "Add word..." }),
                React.createElement(RN.Button, { title: "Add Word", onPress: addWord }),
                React.createElement(RN.Text, { style: { color: "#aaa", marginTop: 12, fontSize: 14 } }, `Active: ${plugin.storage?.filteredWords?.join(", ") || "None"}`)
            )
        );
    }

    // --- SENİN TAM SÜRÜM LOGLAMA MOTORUN ---
    let MessageStore, MessageActions, LocalMessageHelper, Dispatcher;
    let isSyncing = false;
    let syncQueue = [];
    let patchInjected = false;

    function resolveModules() {
        try { MessageStore = metro.findByProps("getMessages", "getMessage"); } catch(e) {}
        try { MessageActions = metro.findByProps("sendMessage", "receiveMessage"); } catch(e) {}
        try { LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage"); } catch(e) {}
        try { Dispatcher = metro.findByProps("dispatch") || metro.findByProps("_dispatch"); } catch(e) {}
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
        } finally {
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

    function injectPatches() {
        if (patchInjected) return;
        patchInjected = true;
        log("[Logar-Core] Modülleri yakaladım, kancalar enjekte ediliyor...");

        // 1. OUTBOUND TRAFFIC INTERCEPTION (Giden Mesaj Filtresi)
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

        // 2. INBOUND CORE GATEWAY HOOK (Silme ve Düzenleme Yakalayıcı)
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

                            if (LocalMessageHelper) {
                                LocalMessageHelper.sendBotMessage(event.channelId, {
                                    content: `⚠️ **[Logar] Deleted Message**\n**User:** ${cachedMsg.author?.username}\n**Content:** ${cachedMsg.content}`,
                                    flags: 64
                                });
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

                            if (LocalMessageHelper) {
                                LocalMessageHelper.sendBotMessage(partialMsg.channel_id, {
                                    content: `✏️ **[Logar] Edited Message**\n**User:** ${oldMsg.author?.username}\n**Before:** ${oldMsg.content}\n**After:** ${partialMsg.content}`,
                                    flags: 64
                                });
                            }
                        }
                    }
                });
            } catch (err) { logError(err); }
        }
    }

    function onLoad() {
        log("[Logar-Core] Döngü başlatıldı.");
        
        if (!plugin.storage) plugin.storage = {};
        if (!plugin.storage.logs) plugin.storage.logs = [];
        if (!plugin.storage.filteredWords) plugin.storage.filteredWords = [];
        
        resolveModules();
        if (MessageStore && Dispatcher) {
            injectPatches();
        }

        const checkInterval = setInterval(() => {
            resolveModules();
            if (MessageStore && Dispatcher) {
                injectPatches();
                clearInterval(checkInterval);
            }
        }, 1000);
    }

    function onUnload() {
        if (patcher) patcher.unpatchAll();
        syncQueue = [];
        patchInjected = false;
    }

    // En kritik nokta: Revenge motorunun ayarlar çarkını yakalayabilmesi için objeyi bu formatta export ediyoruz.
    const moduleExport = { 
        onLoad: onLoad, 
        onUnload: onUnload,
        settings: SettingsPanel
    };

    if (typeof module !== "undefined" && module.exports) module.exports = moduleExport;
    else return moduleExport;
})();
