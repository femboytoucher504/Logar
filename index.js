(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro, patcher, plugins } = globalContext;

    // --- AYARLARIN KAYBOLMASINI ENGELLEYEN PROXY UYUMLU HAFIZA SİSTEMİ ---
    function getStorage() {
        if (!plugins) return {};
        const myKey = Object.keys(plugins).find(k => k.toLowerCase().includes("logar")) || "LogarPlugin";
        if (!plugins[myKey]) plugins[myKey] = {};
        
        if (!plugins[myKey].storage) {
            plugins[myKey].storage = {};
        }
        
        const s = plugins[myKey].storage;
        if (s.supabaseUrl === undefined) s.supabaseUrl = "https://zstjrxjkfmkyjanwdfpi.supabase.co";
        if (s.supabaseKey === undefined) s.supabaseKey = "";
        if (s.webhookUrl === undefined) s.webhookUrl = "";
        if (s.logEverything === undefined) s.logEverything = false;
        if (s.showEphemeral === undefined) s.showEphemeral = true;
        if (!s.localHistory) s.localHistory = [];
        if (!s.filteredWords) s.filteredWords = [];
        if (!s.whitelistedGuilds) s.whitelistedGuilds = [];
        
        return s;
    }

    // --- YARDIMCI FONKSİYONLAR (FİLTRELER) ---
    function isGuildAllowed(channelId, ChannelStore) {
        const storage = getStorage();
        if (!storage.whitelistedGuilds || storage.whitelistedGuilds.length === 0) return true; // Boşsa her yere izin ver
        
        const channel = ChannelStore?.getChannel?.(channelId);
        if (!channel || !channel.guild_id) return true; // DM (Özel Mesaj) ise her zaman izin ver
        return storage.whitelistedGuilds.includes(channel.guild_id);
    }

    function isContentFiltered(content, mentions) {
        const storage = getStorage();
        if (storage.logEverything) return true; // Genel mod açıksa kelimeye bakma, direkt geçir

        // Ping Kontrolü: Sana özel ping varsa kelimeye bakmadan geçir
        if (mentions?.some(m => m.id === "1143677277398376548")) return true;

        if (!storage.filteredWords || storage.filteredWords.length === 0) return false;
        
        const lowerContent = content.toLowerCase();
        return storage.filteredWords.some(w => lowerContent.includes(w));
    }

    // --- ANLIK SOHBET İÇİ MOR MESAJ (EPHEMERAL) ---
    function sendEphemeralMessage(channelId, content) {
        const MessageActions = metro.findByProps("sendBotMessage");
        if (MessageActions?.sendBotMessage) {
            MessageActions.sendBotMessage(channelId, content);
        }
    }

    // --- SUPABASE BULUT YEDEKLEME ---
    async function sendToSupabase(data) {
        const storage = getStorage();
        if (!storage.supabaseUrl || !storage.supabaseKey) return;
        const cleanUrl = storage.supabaseUrl.replace(/\/$/, ""); // Sonda slash varsa temizle

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
                    user_id: "1143677277398376548",
                    logs: data,
                    filtered_words: storage.filteredWords
                })
            });
        } catch (e) { console.error("[Logar-Supabase] Hata:", e); }
    }

    // --- DISCORD ZENGİN EMBED WEBHOOK ---
    async function sendToWebhook(data) {
        const storage = getStorage();
        if (!storage.webhookUrl) return;
        const zaman = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        try {
            await fetch(storage.webhookUrl, {
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

    // --- GÖRSEL AYARLAR PANELİ ---
    function SettingsPanel() {
        const React = metro.findByProps("createElement", "useState");
        const RN = metro.findByProps("ScrollView", "Text", "TextInput", "Button", "Switch", "View");
        const storage = getStorage();

        const [sUrl, setSUrl] = React.useState(storage.supabaseUrl || "");
        const [sKey, setSKey] = React.useState(storage.supabaseKey || "");
        const [wUrl, setWUrl] = React.useState(storage.webhookUrl || "");
        const [logAll, setLogAll] = React.useState(storage.logEverything);
        const [showEph, setShowEph] = React.useState(storage.showEphemeral);
        
        // Filtre Stateleri
        const [guildInput, setGuildInput] = React.useState(storage.whitelistedGuilds?.join(", ") || "");
        const [word, setWord] = React.useState("");
        const [, forceUpdate] = React.useState({});

        const addWord = () => {
            const w = word.trim().toLowerCase();
            if (!w) return;
            if (!storage.filteredWords.includes(w)) storage.filteredWords.push(w);
            setWord("");
            forceUpdate({});
        };

        const removeWord = () => {
            storage.filteredWords = [];
            forceUpdate({});
            alert("Kelime filtresi temizlendi!");
        };

        return React.createElement(RN.ScrollView, { style: { padding: 16 } },
            // GENEL AYARLAR
            React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: 10, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", flex: 1 } }, "Her Şeyi Logla (Kapalıysa Kelime/Ping bakar):"),
                React.createElement(RN.Switch, { value: logAll, onValueChange: setLogAll })
            ),
            React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, padding: 10, backgroundColor: "#2d2d2d", borderRadius: 8 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold" } }, "Sohbette Anlık Mor Mesaj Göster:"),
                React.createElement(RN.Switch, { value: showEph, onValueChange: setShowEph })
            ),

            // BAĞLANTI AYARLARI
            React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 5 } }, "Supabase URL & Key:"),
            React.createElement(RN.TextInput, { value: sUrl, onChangeText: setSUrl, style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 5 } }),
            React.createElement(RN.TextInput, { value: sKey, onChangeText: setSKey, secureTextEntry: true, style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 15 } }),

            React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 5 } }, "Discord Webhook URL:"),
            React.createElement(RN.TextInput, { value: wUrl, onChangeText: setWUrl, placeholder: "Webhook...", placeholderTextColor: "#666", style: { backgroundColor: "#222", color: "#fff", padding: 10, borderRadius: 5, marginBottom: 20 } }),

            // SUNUCU FİLTRESİ
            React.createElement(RN.View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8, marginBottom: 20 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 4 } }, "Özel Sunucu ID'leri (Opsiyonel)"),
                React.createElement(RN.Text, { style: { color: "#aaa", fontSize: 12, marginBottom: 8 } }, "Boş bırakırsan her yeri loglar. Virgülle ayır."),
                React.createElement(RN.TextInput, { value: guildInput, onChangeText: setGuildInput, style: { backgroundColor: "#111", color: "#fff", padding: 8, borderRadius: 5 } })
            ),

            // KELİME FİLTRESİ
            React.createElement(RN.View, { style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8, marginBottom: 20 } },
                React.createElement(RN.Text, { style: { color: "#fff", fontWeight: "bold", marginBottom: 8 } }, "Kelime Filtresi Ekle (Küçük Harf)"),
                React.createElement(RN.TextInput, { value: word, onChangeText: setWord, style: { backgroundColor: "#111", color: "#fff", padding: 8, borderRadius: 5, marginBottom: 8 } }),
                React.createElement(RN.View, { style: { flexDirection: "row", justifyContent: "space-between" } },
                    React.createElement(RN.Button, { title: "Ekle", onPress: addWord }),
                    React.createElement(RN.Button, { title: "Temizle", onPress: removeWord, color: "#d9534f" })
                ),
                React.createElement(RN.Text, { style: { color: "#aaa", marginTop: 8 } }, "Aktif: " + (storage.filteredWords?.join(", ") || "Yok"))
            ),

            React.createElement(RN.Button, { 
                title: "TÜM AYARLARI KAYDET", 
                onPress: () => { 
                    storage.supabaseUrl = sUrl;
                    storage.supabaseKey = sKey;
                    storage.webhookUrl = wUrl;
                    storage.logEverything = logAll;
                    storage.showEphemeral = showEph;
                    storage.whitelistedGuilds = guildInput.split(",").map(g => g.trim()).filter(g => g !== "");
                    alert("Ayarlar Başarıyla Kaydedildi! Tam oturması için Discord'u kapa-aç yapın.");
                } 
            })
        );
    }

    // --- ANA TETİKLEYİCİ VE İZLEME MOTORU ---
    let patchInjected = false;
    function injectPatches() {
        if (patchInjected) return;
        patchInjected = true;
        
        const Dispatcher = metro.findByProps("dispatch");
        const ChannelStore = metro.findByProps("getChannel");
        const GuildStore = metro.findByProps("getGuild");
        const MessageStore = metro.findByProps("getMessages");
        const MessageModule = metro.findByProps("sendMessage", "receiveMessage");

        // 1. GİZLİ KOMUT KONTROLÜ (.logar)
        if (MessageModule) {
            patcher.instead("sendMessage", MessageModule, (args, original) => {
                const [channelId, message] = args;
                const storage = getStorage();

                if (message && message.content === ".logar") {
                    if (!storage.localHistory || storage.localHistory.length === 0) {
                        sendEphemeralMessage(channelId, "❌ **[Logar]:** Henüz önbelleğe alınmış güncel bir kayıt bulunmuyor.");
                    } else {
                        let listRapor = "📋 **Son Yakalanan Logar Kayıtları:**\n\n";
                        storage.localHistory.forEach((l, index) => {
                            listRapor += `**${index + 1}. [${l.time}] ${l.type}**\n👤 \`${l.author}\` | Kanal: #${l.channelName}\n💬 İçerik: *${l.content}*\n\n`;
                        });
                        sendEphemeralMessage(channelId, listRapor);
                    }
                    return; // Mesajın gitmesini engelle
                }
                return original.apply(this, args);
            });
        }

        // 2. DISPATCH ANALİZ MOTORU
        patcher.before("dispatch", Dispatcher, (args) => {
            const event = args[0];
            const storage = getStorage();

            // MESAJ SİLİNDİ
            if (event.type === "MESSAGE_DELETE") {
                if (!isGuildAllowed(event.channelId, ChannelStore)) return; // Sunucu Filtresi Kontrolü

                const channel = ChannelStore.getChannel(event.channelId);
                const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
                const cachedMsg = MessageStore.getMessage(event.channelId, event.id);
                const content = cachedMsg?.content || "";
                
                // Kelime / Ping / Herşeyi logla Kontrolü
                if (!content || !isContentFiltered(content, cachedMsg?.mentions)) return;

                const guildId = channel?.guild_id ?? "@me";
                const jumpUrl = `https://discord.com/channels/${guildId}/${event.channelId}/${event.id}`;
                const anlikSaat = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });

                const logPayload = {
                    type: "MESAJ SİLİNDİ",
                    guildName: guild ? guild.name : "Direkt Mesaj (DM)",
                    channelName: channel?.name ?? "Özel Sohbet",
                    author: cachedMsg?.author?.username ?? "Bilinmiyor",
                    oldContent: content,
                    jumpLink: jumpUrl
                };

                if (!storage.localHistory) storage.localHistory = [];
                storage.localHistory.unshift({ time: anlikSaat, type: "SİLME", author: logPayload.author, channelName: logPayload.channelName, content: logPayload.oldContent });
                if (storage.localHistory.length > 5) storage.localHistory.pop();

                sendToSupabase(logPayload);
                sendToWebhook(logPayload);
                if (storage.showEphemeral) sendEphemeralMessage(event.channelId, `🗑️ **[Logar Silindi]** \`${logPayload.author}\`: ${logPayload.oldContent}`);
            }

            // MESAJ DÜZENLENDİ
            if (event.type === "MESSAGE_UPDATE") {
                const msg = event.message;
                if (!msg || !msg.author || !msg.channel_id) return;
                
                if (!isGuildAllowed(msg.channel_id, ChannelStore)) return; // Sunucu Filtresi Kontrolü

                const channel = ChannelStore.getChannel(msg.channel_id);
                const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
                const cachedMsg = MessageStore.getMessage(msg.channel_id, msg.id);
                const oldContent = cachedMsg?.content || "";

                if (oldContent === msg.content) return; // Sadece embed güncellemesiyse es geç
                
                // Kelime / Ping / Herşeyi logla Kontrolü (Eski veya yeni içerikte kelime varsa yakalar)
                if (!isContentFiltered(oldContent, cachedMsg?.mentions) && !isContentFiltered(msg.content, msg.mentions)) return;

                const guildId = channel?.guild_id ?? "@me";
                const jumpUrl = `https://discord.com/channels/${guildId}/${msg.channel_id}/${msg.id}`;
                const anlikSaat = new Date().toLocaleTimeString("tr-TR", { hour: '2-digit', minute: '2-digit' });

                const logPayload = {
                    type: "MESAJ DÜZENLENDİ",
                    guildName: guild ? guild.name : "Direkt Mesaj (DM)",
                    channelName: channel?.name ?? "Özel Sohbet",
                    author: `${msg.author.username}`,
                    oldContent: oldContent || "[Eski veri yok]",
                    newContent: msg.content,
                    jumpLink: jumpUrl
                };

                if (!storage.localHistory) storage.localHistory = [];
                storage.localHistory.unshift({ time: anlikSaat, type: "DÜZENLEME", author: logPayload.author, channelName: logPayload.channelName, content: `${logPayload.oldContent} -> ${logPayload.newContent}` });
                if (storage.localHistory.length > 5) storage.localHistory.pop();

                sendToSupabase(logPayload);
                sendToWebhook(logPayload);
                if (storage.showEphemeral) sendEphemeralMessage(msg.channel_id, `✏️ **[Logar Düzenlendi]** \`${logPayload.author}\`:\n❌ *${logPayload.oldContent}*\n✅ *${logPayload.newContent}*`);
            }
        });
    }

    function onLoad() { injectPatches(); }
    function onUnload() { patcher.unpatchAll(); patchInjected = false; }

    return { onLoad, onUnload, settings: SettingsPanel };
})();
                       
