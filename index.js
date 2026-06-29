(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher } = globalContext;

    // Discord'un sildiği mesajları anlık korumaya alacağımız yerel zırhlı hafıza
    const messageCache = new Map();
    let Dispatcher, ChannelStore, GuildStore, MessageStore, MessageModule, UserStore, AsyncStorage;
    let patchInjected = false;

    // --- KALICI HAFIZA OBJESİ (Varsayılan ve Boş Durum) ---
    const logarConfig = {
        supabaseUrl: "",
        supabaseKey: "",
        webhookUrl: "",
        logEverything: true,
        showEphemeral: true,
        whitelistedGuilds: [],
        filteredWords: [],
        localHistory: []
    };

    // --- DİNAMİK MODÜL ÇÖZÜMLEYİCİ ---
    function resolveModules() {
        try { Dispatcher = metro.findByProps("dispatch") || metro.findByProps("_dispatch"); } catch(e){}
        try { ChannelStore = metro.findByProps("getChannel", "hasChannel"); } catch(e){}
        try { GuildStore = metro.findByProps("getGuild", "getGuilds"); } catch(e){}
        try { MessageStore = metro.findByProps("getMessages", "getMessage"); } catch(e){}
        try { MessageModule = metro.findByProps("sendMessage", "receiveMessage"); } catch(e){}
        try { UserStore = metro.findByProps("getCurrentUser", "getUser"); } catch(e){}
        try { AsyncStorage = metro.findByProps("setItem", "getItem"); } catch(e){}
    }

    // --- DİSKTEN AYARLARI YÜKLE (NATIVE DISCORD DEPOLAMA) ---
    async function loadPersistentSettings() {
        if (!AsyncStorage) return;
        try {
            const savedData = await AsyncStorage.getItem("LogarPlugin_PermanentData");
            if (savedData) {
                const parsed = JSON.parse(savedData);
                Object.assign(logarConfig, parsed);
            }
        } catch(e) { console.error("[Logar] Hafıza okuma hatası:", e); }
    }

    // --- AYARLARI DİSKE KAYDET (NATIVE DISCORD DEPOLAMA) ---
    async function savePersistentSettings(newData) {
        Object.assign(logarConfig, newData);
        if (!AsyncStorage) return;
        try {
            await AsyncStorage.setItem("LogarPlugin_PermanentData", JSON.stringify(logarConfig));
        } catch(e) { console.error("[Logar] Hafıza yazma hatası:", e); }
    }

    // --- FİLTRE MOTORLARI (DİNAMİK VIP DESTEKLİ) ---
    function isGuildAllowed(channelId, authorId) {
        const currentUserId = UserStore?.getCurrentUser()?.id || "";
        if (authorId === currentUserId) return true; // Eklentiyi kullanan ana hesap her yerde serbest (Dinamik VIP)
        
        if (!logarConfig.whitelistedGuilds || logarConfig.whitelistedGuilds.length === 0) return true;
        const channel = ChannelStore?.getChannel?.(channelId);
        if (!channel || !channel.guild_id) return true; // DM her zaman serbest
        return logarConfig.whitelistedGuilds.includes(channel.guild_id);
    }

    function isContentFiltered(content, mentions, authorId) {
        const currentUserId = UserStore?.getCurrentUser()?.id || "";
        if (authorId === currentUserId) return true; // Ana hesap filtreleri tamamen deler geçer (Dinamik VIP)
        
        if (logarConfig.logEverything) return true; 

        if (mentions?.some(m => m.id === currentUserId || m === currentUserId)) return true;

        if (!logarConfig.filteredWords || logarConfig.filteredWords.length === 0) return false;
        const lowerContent = content.toLowerCase();
        return logarConfig.filteredWords.some(w => lowerContent.includes(w));
    }

    // --- RESILIENT MOR MESAJ SİSTEMİ ---
    function sendEphemeralMessage(channelId, content) {
        try {
            const LocalMessageHelper = metro.findByProps("sendBotMessage") || metro.findByProps("receiveMessage");
            if (LocalMessageHelper?.sendBotMessage) {
                LocalMessageHelper.sendBotMessage(channelId || "0", content);
            }
        } catch (e) { console.error("[Logar-UI] Mor mesaj basılamadı:", e); }
    }

    // --- SUPABASE BULUT AKIŞI ---
    async function sendToSupabase(data) {
        if (!logarConfig.supabaseUrl || !logarConfig.supabaseKey) return;
        const cleanUrl = logarConfig.supabaseUrl.replace(/\/$/, "");
        try {
            await fetch(`${cleanUrl}/rest/v1/logar_backup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": logarConfig.supabaseKey,
                    "Authorization": `Bearer ${logarConfig.supabaseKey}`,
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                    user_id: UserStore?.getCurrentUser()?.id || "unknown_user",
                    logs: data,
                    filtered_words: logarConfig.filteredWords
                })
            });
        } catch (e) { console.error("[Logar-Supabase] Hata:", e); }
    }

    // --- WEBHOOK ENTEGRASYONU ---
    async function sendToWebhook(data) {
        if (!logarConfig.webhookUrl) return;
        const zaman = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        try {
            await fetch(logarConfig.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    embeds: [{
                        title: `🚨 Logar Raporu: ${data.type}`,
                        description: `**👤 Kullanıcı:** ${data.author}\n**📁 Konum:** ${data.guildName} > #${data.channelName}\n**⏰ Saat:** ${zaman}\n\n**📝 Eski İçerik:** \`\`\`${data.oldContent}\`\`\`${data.newContent ? `**🔄 Yeni İçerik:**\n\`\`\`${data.newContent}\`\`\`` : ""}\n🔗 **[Olay Yerine / Kanala Atla](${data.jumpLink})**`,
                        timestamp: new Date().toISOString(),
                        color: data.type === "MESAJ SİLİNDİ" ? 16711680 : 16776960
                    }]
                })
            });
        } catch (e) { console.error("[Logar-Webhook] Hata:", e); }
    }

    // --- AYAR PANELİ (Gerçek Zamanlı ve Kalıcı) ---
    function SettingsPanel() {
        const React = metro.findByProps("createElement", "useState", "useEffect");
        const RN = metro.findByProps("ScrollView", "Text", "TextInput", "Button", "Switch", "View");

        const [sUrl, setSUrl] = React.useState(logarConfig.supabaseUrl);
        const [sKey, setSKey] = React.useState(logarConfig.supabaseKey);
        const [wUrl, setWUrl] = React.useState(logarConfig.webhookUrl);
        const [logAll, setLogAll] = React.useState(logarConfig.logEverything);
        const [showEph, setShowEph] = React.useState(logarConfig.showEphemeral);
        const [guildInput, setGuildInput] = React.useState(logarConfig.whitelistedGuilds?.join(", ") || "");
        const [word, setWord] = React.useState("");
        const [, forceUpdate] = React.useState({});
        
        const activeUserName = UserStore?.getCurrentUser()?.username || "Bilinmiyor";

        return React.createElement(RN.ScrollView, { style: { padding: 16 } },
            React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: 10, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold" } }, "Her Şeyi Logla (Filtreleri Devre Dışı Bırakır):"),
                React.createElement(RN.Switch, { value: logAll, onValueChange: setLogAll })
            ),
            React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: 10, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold" } }, "Sohbette Anlık Mor Mesaj Göster:"),
                React.createElement(RN.Switch, { value: showEph, onValueChange: setShowEph })
            ),

            React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 5 } }, "Supabase URL:"),
            React.createElement(RN.TextInput, { value: sUrl, onChangeText: setSUrl, placeholder: "https://proje.supabase.co", placeholderTextColor: "#666", style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 5 } }),
            
            React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 5, marginTop: 10 } }, "Supabase Service Role Key:"),
            React.createElement(RN.TextInput, { value: sKey, onChangeText: setSKey, secureTextEntry: true, placeholder: "sb_secret_...", placeholderTextColor: "#666", style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 15 } }),

            React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 5 } }, "Discord Webhook URL:"),
            React.createElement(RN.TextInput, { value: wUrl, onChangeText: setWUrl, placeholder: "https://discord.com/api/webhooks/...", placeholderTextColor: "#666", style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 20 } }),

            React.createElement(RN.View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8, marginBottom: 20 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 4 } }, "Özel Sunucu ID'leri (Opsiyonel)"),
                React.createElement(RN.TextInput, { value: guildInput, onChangeText: setGuildInput, style: { backgroundColor: "#111", color: "#fff", padding: 8, borderRadius: 5 } })
            ),

            React.createElement(RN.View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8, marginBottom: 20 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 8 } }, "Kelime Filtresi Ekle"),
                React.createElement(RN.TextInput, { value: word, onChangeText: setWord, style: { backgroundColor: "#111", color: "#fff", padding: 8, borderRadius: 5, marginBottom: 8 } }),
                React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between" } },
                    React.createElement(RN.Button, { title: "Ekle", onPress: () => { if(word.trim()){ logarConfig.filteredWords.push(word.trim().toLowerCase()); setWord(""); forceUpdate({}); } } }),
                    React.createElement(RN.Button, { title: "Temizle", onPress: () => { logarConfig.filteredWords = []; forceUpdate({}); }, color: "#d9534f" })
                ),
                React.createElement(RN.Text, { style: { color: "#aaa", marginTop: 8 } }, "Aktif: " + (logarConfig.filteredWords?.join(", ") || "Yok"))
            ),

            React.createElement(RN.Text, { style: { color: "#4CAF50", marginBottom: 15, textAlign: "center", fontWeight: "bold" } }, `🎯 Cihaz Sahibi Korunuyor: ${activeUserName}`),

            React.createElement(RN.Button, { 
                title: "TÜM AYARLARI CİHAZA KAYDET", 
                color: "#5865F2",
                onPress: () => { 
                    const updatedData = {
                        supabaseUrl: sUrl,
                        supabaseKey: sKey,
                        webhookUrl: wUrl,
                        logEverything: logAll,
                        showEphemeral: showEph,
                        whitelistedGuilds: guildInput.split(",").map(g => g.trim()).filter(g => g !== "")
                    };
                    savePersistentSettings(updatedData).then(() => {
                        alert("Logar ayarları kalıcı olarak telefonun diskinize kaydedildi!");
                    });
                } 
            })
        );
    }

    // --- ENJEKSİYON VE GÖZLEM MOTORU ---
    function injectPatches() {
        if (patchInjected || !Dispatcher) return;
        patchInjected = true;

        if (MessageModule) {
            patcher.instead("sendMessage", MessageModule, (args, original) => {
                const [channelId, message] = args;

                if (message && message.content === ".logar") {
                    if (!logarConfig.localHistory || logarConfig.localHistory.length === 0) {
                        sendEphemeralMessage(channelId, "❌ **[Logar]:** Önbelleğe alınmış kayıt yok.");
                    } else {
                        let listRapor = "📋 **Son Yakalanan Logar Kayıtları:**\n\n";
                        logarConfig.localHistory.forEach((l, index) => {
                            listRapor += `**${index + 1}. [${l.time}] ${l.type}**\n👤 \`${l.author}\` | Kanal: #${l.channelName}\n💬 İçerik: *${l.content}*\n\n`;
                        });
                        sendEphemeralMessage(channelId, listRapor);
                    }
                    return; 
                }
                return original.apply(this, args);
            });
        }

        patcher.before("dispatch", Dispatcher, (args) => {
            const event = args[0];
            if (!event) return;

            if (event.type === "MESSAGE_CREATE") {
                const msg = event.message;
                if (msg?.id && msg?.channel_id) {
                    messageCache.set(msg.id, {
                        content: msg.content,
                        author: msg.author?.username || "Bilinmeyen Kullanıcı",
                        authorId: msg.author?.id || "",
                        mentions: msg.mentions || []
                    });
                }
            }

            if (event.type === "MESSAGE_DELETE") {
                const cached = messageCache.get(event.id);
                const dbMsg = MessageStore?.getMessage?.(event.channelId, event.id);

                const finalAuthorId = dbMsg?.author?.id || cached?.authorId || "";
                
                if (!isGuildAllowed(event.channelId, finalAuthorId)) return;

                const finalContent = dbMsg?.content || cached?.content;
                const finalAuthor = dbMsg?.author?.username || cached?.author || "Bilinmeyen Kullanıcı";
                const finalMentions = dbMsg?.mentions || cached?.mentions || [];

                if (!finalContent || !isContentFiltered(finalContent, finalMentions, finalAuthorId)) return;

                const channel = ChannelStore?.getChannel?.(event.channelId);
                const guild = channel?.guild_id ? GuildStore?.getGuild?.(channel.guild_id) : null;
                const guildId = channel?.guild_id ?? "@me";
                const jumpUrl = `https://discord.com/channels/${guildId}/${event.channelId}/${event.id}`;
                const anlikSaat = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });

                const logPayload = {
                    type: "MESAJ SİLİNDİ",
                    guildName: guild ? guild.name : "Direkt Mesaj (DM)",
                    channelName: channel?.name ?? "Özel Sohbet",
                    author: finalAuthor,
                    oldContent: finalContent,
                    jumpLink: jumpUrl
                };

                logarConfig.localHistory.unshift({ time: anlikSaat, type: "SİLME", author: logPayload.author, channelName: logPayload.channelName, content: logPayload.oldContent });
                if (logarConfig.localHistory.length > 5) logarConfig.localHistory.pop();

                sendToSupabase(logPayload);
                sendToWebhook(logPayload);
                if (logarConfig.showEphemeral) sendEphemeralMessage(event.channelId, `🗑️ **[Logar Silindi]** \`${logPayload.author}\`: ${logPayload.oldContent}`);
            }

            if (event.type === "MESSAGE_UPDATE") {
                const msg = event.message;
                if (!msg || !msg.id || !msg.channel_id) return;

                const cached = messageCache.get(msg.id);
                const dbMsg = MessageStore?.getMessage?.(msg.channel_id, msg.id);

                const finalAuthorId = msg.author?.id || dbMsg?.author?.id || cached?.authorId || "";

                if (!isGuildAllowed(msg.channel_id, finalAuthorId)) return;

                const oldContent = dbMsg?.content || cached?.content || "";
                if (!oldContent || oldContent === msg.content) return; 

                if (!isContentFiltered(oldContent, cached?.mentions, finalAuthorId) && !isContentFiltered(msg.content, msg.mentions, finalAuthorId)) return;

                const channel = ChannelStore?.getChannel?.(msg.channel_id);
                const guild = channel?.guild_id ? GuildStore?.getGuild?.(channel.guild_id) : null;
                const guildId = channel?.guild_id ?? "@me";
                const jumpUrl = `https://discord.com/channels/${guildId}/${msg.channel_id}/${msg.id}`;
                const anlikSaat = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });

                const logPayload = {
                    type: "MESAJ DÜZENLENDİ",
                    guildName: guild ? guild.name : "Direkt Mesaj (DM)",
                    channelName: channel?.name ?? "Özel Sohbet",
                    author: msg.author?.username || cached?.author || "Bilinmeyen Kullanıcı",
                    oldContent: oldContent,
                    newContent: msg.content,
                    jumpLink: jumpUrl
                };

                logarConfig.localHistory.unshift({ time: anlikSaat, type: "DÜZENLEME", author: logPayload.author, channelName: logPayload.channelName, content: `${logPayload.oldContent} -> ${logPayload.newContent}` });
                if (logarConfig.localHistory.length > 5) logarConfig.localHistory.pop();

                sendToSupabase(logPayload);
                sendToWebhook(logPayload);
                if (logarConfig.showEphemeral) sendEphemeralMessage(msg.channel_id, `✏️ **[Logar Düzenlendi]** \`${logPayload.author}\`:\n❌ *${logPayload.oldContent}*\n✅ *${logPayload.newContent}*`);

                messageCache.set(msg.id, { content: msg.content, author: logPayload.author, authorId: finalAuthorId, mentions: msg.mentions || [] });
            }
        });
    }

    // --- GÜVENLİ BAŞLATICI MOTORU ---
    function onLoad() {
        resolveModules();
        loadPersistentSettings().then(() => {
            const checkInterval = setInterval(() => {
                resolveModules();
                if (Dispatcher && ChannelStore && MessageStore && UserStore) {
                    injectPatches();
                    clearInterval(checkInterval);
                }
            }, 1000);
        });
    }

    function onUnload() {
        patcher?.unpatchAll?.();
        patchInjected = false;
        messageCache.clear();
    }

    return { onLoad, onUnload, settings: SettingsPanel };
})();
                                               
