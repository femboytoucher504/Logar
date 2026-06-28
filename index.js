(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher, plugin, logger } = globalContext;

    const log = logger ? logger.log : console.log;
    const logError = logger ? logger.error : console.error;

    if (!metro || !patcher || !plugin) {
        console.error("[Logar-Core] Critical APIs missing.");
        return;
    }

    // --- INTEGRATED SETTINGS PANEL (AYARLAR ARAYÜZÜ) ---
    function SettingsPanel() {
        const { React } = metro;
        const { useProxy } = metro.findByProps("useProxy") || {};
        const { ScrollView, View, Text, TextInput, Button } = metro.findByProps("ScrollView", "TextInput") || {};

        if (!useProxy || !ScrollView) return null;
        if (plugin.storage) useProxy(plugin.storage);

        const [url, setUrl] = React.useState(plugin.storage?.supabaseUrl || "");
        const [key, setKey] = React.useState(plugin.storage?.supabaseKey || "");
        const [token, setToken] = React.useState(plugin.storage?.cloudToken || "");
        const [newWord, setNewWord] = React.useState("");

        const saveConfig = () => {
            plugin.storage.supabaseUrl = url;
            plugin.storage.supabaseKey = key;
            plugin.storage.cloudToken = token;
        };

        const addWord = () => {
            if (newWord.trim() && !plugin.storage.filteredWords.includes(newWord.trim())) {
                plugin.storage.filteredWords.push(newWord.trim());
                setNewWord("");
            }
        };

        const clearWords = () => {
            plugin.storage.filteredWords = [];
        };

        return React.createElement(ScrollView, { style: { flex: 1, padding: 16, backgroundColor: "#1e1e1e" } },
            React.createElement(Text, { style: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 } }, "Logar Configuration"),
            React.createElement(View, { style: { marginBottom: 24, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(Text, { style: { color: "#ddd", marginBottom: 6 } }, "Supabase URL"),
                React.createElement(TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: url, onChangeText: setUrl, placeholder: "https://your-project.supabase.co" }),
                React.createElement(Text, { style: { color: "#ddd", marginBottom: 6 } }, "Supabase API Key"),
                React.createElement(TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: key, onChangeText: setKey, placeholder: "anon-key", secureTextEntry: true }),
                React.createElement(Text, { style: { color: "#ddd", marginBottom: 6 } }, "Cloud User Token"),
                React.createElement(TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: token, onChangeText: setToken, placeholder: "unique-user-token" }),
                React.createElement(Button, { title: "Save Cloud Settings", onPress: saveConfig })
            ),
            React.createElement(View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(Text, { style: { fontSize: 16, color: "#fff", marginBottom: 8 } }, "Word Filter"),
                React.createElement(TextInput, { style: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 }, value: newWord, onChangeText: setNewWord, placeholder: "Add word..." }),
                React.createElement(View, { style: { flexDirection: "row", justifyContent: "space-between" } },
                    React.createElement(Button, { title: "Add Word", onPress: addWord }),
                    React.createElement(Button, { title: "Clear All", color: "#ff4444", onPress: clearWords })
                ),
                React.createElement(Text, { style: { color: "#aaa", marginTop: 12, fontSize: 14 } }, `Active Filters: ${plugin.storage?.filteredWords?.join(", ") || "None"}`)
            )
        );
    }

    // --- CORE LOGGING MATRIX (ESKİ KODUN BİREBİR ORİJİNAL MANTIĞI) ---
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
        } finally {
            // Sıkışmayı önleyen asıl blok yapısı
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
        
        // Açılışta modülleri bir kez çözmeyi deniyoruz
        resolveModules();

        // Modüllerin asenkron yüklenme ihtimaline karşı güvenli yedek döngü (Interval)
        const initInterval = setInterval(() => {
            resolveModules();
            if (MessageStore && Dispatcher) {
                clearInterval(initInterval);
                injectPatches();
            }
        }, 500);
    }

    function injectPatches() {
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

        // 2. INBOUND CORE GATEWAY INTERCEPTOR (Silme ve Düzenleme Yakalama)
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

    const moduleExport = { 
        onLoad: onLoad, 
        onUnload: onUnload,
        settingsView: SettingsPanel 
    };
    
    if (typeof module !== "undefined" && module.exports) module.exports = moduleExport;
    else return moduleExport;
})();
                                    
