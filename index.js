(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher, logger, plugins } = globalContext;

    const log = logger?.log ?? console.log;

    if (!metro || !patcher) {
        return { onLoad: () => {}, onUnload: () => {} }; 
    }

    const messageCache = new Map();
    let UserStore, ChannelStore;

    function getStorage() {
        if (!plugins) return {};
        const myKey = Object.keys(plugins).find(k => k.toLowerCase().includes("logar"));
        if (myKey && plugins[myKey]) {
            if (!plugins[myKey].storage) plugins[myKey].storage = { logs: [], filteredWords: [], whitelistedGuilds: [], logEverything: true };
            return plugins[myKey].storage;
        }
        if (!globalContext.LOGAR_TEMP_STORAGE) {
            globalContext.LOGAR_TEMP_STORAGE = { logs: [], filteredWords: [], whitelistedGuilds: [], logEverything: true };
        }
        return globalContext.LOGAR_TEMP_STORAGE;
    }

    async function sendToSupabase(logEntry) {
        const storage = getStorage();
        if (!storage.supabaseUrl || !storage.supabaseKey) return;
        const cleanUrl = storage.supabaseUrl.replace(/\/$/, "");

        try {
            await fetch(`${cleanUrl}/rest/v1/logar_backup`, {
                method: "POST",
                headers: {
                    "apikey": storage.supabaseKey,
                    "Authorization": `Bearer ${storage.supabaseKey}`,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                    user_id: storage.cloudToken || "Logar_User",
                    logs: logEntry,
                    filtered_words: storage.filteredWords || []
                })
            });
            log("[Logar-Cloud] Veri başarıyla gönderildi!");
        } catch (err) {
            console.error("[Logar-Cloud] Hata:", err);
        }
    }

    function SettingsPanel() {
        const React = metro.findByProps("createElement", "useState");
        const RN = metro.findByProps("ScrollView", "Text", "TextInput", "Button", "View", "Switch");

        if (!React || !RN) return null;

        const storage = getStorage();
        const [url, setUrl] = React.useState(storage.supabaseUrl || "");
        const [key, setKey] = React.useState(storage.supabaseKey || "");
        const [token, setToken] = React.useState(storage.cloudToken || "");
        const [word, setWord] = React.useState("");
        const [guildInput, setGuildInput] = React.useState(storage.whitelistedGuilds?.join(", ") || "");
        const [logEverything, setLogEverything] = React.useState(storage.logEverything !== false);
        const [, forceUpdate] = React.useState({});

        const saveConfig = () => {
            storage.supabaseUrl = url;
            storage.supabaseKey = key;
            storage.cloudToken = token;
            storage.logEverything = logEverything;
            
            // Sunucu ID'lerini virgülle ayırıp temizleyerek kaydet
            storage.whitelistedGuilds = guildInput.split(",").map(g => g.trim()).filter(g => g !== "");
            log("[Logar] Ayarlar kaydedildi.");
        };

        const addWord = () => {
            const w = word.trim().toLowerCase();
            if (!w) return;
            if (!storage.filteredWords) storage.filteredWords = [];
            if (!storage.filteredWords.includes(w)) storage.filteredWords.push(w);
            setWord("");
            forceUpdate({});
        };

        return React.createElement(
            RN.ScrollView,
            { style: { flex: 1, padding: 16, backgroundColor: "#1e1e1e" } },
            React.createElement(RN.Text, { style: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 } }, "Logar Ayarları"),
            
            // GENEL MOD
            React.createElement(RN.View, { style: { marginBottom: 20, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" } },
                React.createElement(RN.Text, { style: { color: "#fff", flex: 1, marginRight: 10 } }, "Her Şeyi Logla (Kapalıysa sadece Filtre/Ping loglar)"),
                React.createElement(RN.Switch, { value: logEverything, onValueChange: (val) => { setLogEverything(val); storage.logEverything = val; } })
            ),

            // BULUT AYARLARI
            React.createElement(RN.View, { style: { marginBottom: 24, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#ddd", marginBottom: 4 } }, "Supabase URL"),
                React.createElement(RN.TextInput, { value: url, onChangeText: setUrl, style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 12 } }),
                React.createElement(RN.Text, { style: { color: "#ddd", marginBottom: 4 } }, "Supabase API Key"),
                React.createElement(RN.TextInput, { value: key, onChangeText: setKey, secureTextEntry: true, style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 12 } })
            ),

            // SUNUCU FİLTRESİ
            React.createElement(RN.View, { style: { marginBottom: 24, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", marginBottom: 4 } }, "Özel Sunucu ID'leri (Opsiyonel)"),
                React.createElement(RN.Text, { style: { color: "#aaa", fontSize: 12, marginBottom: 8 } }, "Boş bırakırsan her sunucuyu loglar. Birden fazlaysa virgülle ayır."),
                React.createElement(RN.TextInput, { value: guildInput, onChangeText: setGuildInput, placeholder: "Örn: 123456789, 987654321", style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 12 } }),
                React.createElement(RN.Button, { title: "Ayarları Kaydet", onPress: saveConfig })
            ),

            // KELİME FİLTRESİ
            React.createElement(RN.View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", marginBottom: 8 } }, "Kelime Filtresi Ekle"),
                React.createElement(RN.TextInput, { value: word, onChangeText: setWord, style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 12 } }),
                React.createElement(RN.Button, { title: "Kelime Ekle", onPress: addWord }),
                React.createElement(RN.Text, { style: { color: "#aaa", marginTop: 12 } }, "Aktif: " + (storage.filteredWords?.join(", ") || "Yok"))
            )
        );
    }

    let MessageStore, Dispatcher, LocalMessageHelper;
    let patchInjected = false;

    function resolveModules() {
        try { MessageStore = metro.findByProps("getMessages", "getMessage"); } catch {}
        try { UserStore = metro.findByProps("getCurrentUser", "getUser"); } catch {}
        try { ChannelStore = metro.findByProps("getChannel", "hasChannel"); } catch {}
        try { LocalMessageHelper = metro.findByProps("sendBotMessage") || metro.findByProps("receiveMessage"); } catch {}
        try { Dispatcher = metro.findByProps("dispatch") || metro.findByProps("_dispatch"); } catch {}
    }

    function showEphemeral(content) {
        try {
            if (LocalMessageHelper?.sendBotMessage) {
                LocalMessageHelper.sendBotMessage(metro.findByProps("getChannelId")?.getChannelId() || "0", content);
            }
        } catch (e) {}
    }

    // --- SUNUCU KONTROLÜ YAPAN FONKSİYON ---
    function isGuildAllowed(channelId) {
        const storage = getStorage();
        if (!storage.whitelistedGuilds || storage.whitelistedGuilds.length === 0) return true; // Boşsa her yere izin ver
        
        const channel = ChannelStore?.getChannel?.(channelId);
        const guildId = channel?.guild_id;
        
        if (!guildId) return true; // DM (Özel Mesaj) ise her zaman logla
        return storage.whitelistedGuilds.includes(guildId); // Sadece ID eşleşirse izin ver
    }

    // --- KELİME KONTROLÜ YAPAN FONKSİYON ---
    function isContentFiltered(content) {
        const storage = getStorage();
        if (storage.logEverything) return true; // Genel mod açıksa filtreye bakma
        if (!storage.filteredWords || storage.filteredWords.length === 0) return false;
        
        const lowerContent = content.toLowerCase();
        return storage.filteredWords.some(w => lowerContent.includes(w));
    }

    function injectPatches() {
        if (patchInjected) return;
        patchInjected = true;

        if (Dispatcher?.dispatch) {
            patcher.before("dispatch", Dispatcher, (args) => {
                const event = args[0];
                if (!event) return;

                const myId = UserStore?.getCurrentUser()?.id;
                const storage = getStorage();

                if (event.type === "MESSAGE_CREATE") {
                    const msg = event.message;
                    if (msg?.id && msg?.content) {
                        messageCache.set(msg.id, msg.content);
                        
                        // Sunucu ve Ping Kontrolü
                        if (isGuildAllowed(msg.channel_id)) {
                            const isMentioned = msg.mentions?.some(user => user.id === myId);
                            if (isMentioned) {
                                const logData = { type: "PING", messageId: msg.id, content: msg.content, timestamp: Date.now() };
                                storage.logs.push(logData);
                                sendToSupabase(logData);
                                showEphemeral(`[Logar Ping] Seni etiketlediler: ${msg.content}`);
                            }
                        }
                    }
                }

                if (event.type === "MESSAGE_DELETE") {
                    if (!isGuildAllowed(event.channelId)) return; // Sunucu yasaklıysa işlem yapma

                    const cachedContent = messageCache.get(event.id);
                    const dbMsg = MessageStore?.getMessage?.(event.channelId, event.id);
                    const finalContent = dbMsg?.content || cachedContent;

                    if (finalContent && isContentFiltered(finalContent)) {
                        const logData = { type: "DELETE", messageId: event.id, content: finalContent, timestamp: Date.now() };
                        storage.logs.push(logData);
                        sendToSupabase(logData);
                        showEphemeral(`[Logar Silindi]: ${finalContent}`);
                    }
                }

                if (event.type === "MESSAGE_UPDATE") {
                    const newMsg = event.message;
                    if (!newMsg?.id || !newMsg?.channel_id) return;
                    if (!isGuildAllowed(newMsg.channel_id)) return; // Sunucu yasaklıysa işlem yapma

                    const oldContent = messageCache.get(newMsg.id) || MessageStore?.getMessage?.(newMsg.channel_id, newMsg.id)?.content;
                    if (!oldContent || oldContent === newMsg.content) return;

                    if (isContentFiltered(oldContent) || isContentFiltered(newMsg.content)) {
                        const logData = { type: "EDIT", oldContent: oldContent, newContent: newMsg.content, timestamp: Date.now() };
                        storage.logs.push(logData);
                        sendToSupabase(logData);
                        showEphemeral(`[Logar Düzenlendi]: ${oldContent} -> ${newMsg.content}`);
                    }
                    messageCache.set(newMsg.id, newMsg.content);
                }
            });
        }
    }

    function onLoad() {
        resolveModules();
        const interval = setInterval(() => {
            resolveModules();
            if (Dispatcher && UserStore && ChannelStore) {
                injectPatches();
                clearInterval(interval);
            }
        }, 1000);
    }

    function onUnload() {
        patcher?.unpatchAll?.();
        patchInjected = false;
        messageCache.clear();
    }

    const moduleExport = { onLoad, onUnload, settings: SettingsPanel, default: { onLoad, onUnload, settings: SettingsPanel } };
    if (typeof module !== "undefined" && module.exports) module.exports = moduleExport;
    else return moduleExport;
})();
                    
