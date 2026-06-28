const globalContext = window.revenge || window.vendetta || window.bunny || {};
const { metro, patcher, plugin, logger } = globalContext;

const log = logger?.log ?? console.log;
const logError = logger?.error ?? console.error;

if (!metro || !patcher || !plugin) {
    console.error("[Logar-Core] Missing required APIs.");
    module.exports = { onLoad: () => {}, onUnload: () => {} };
    return;
}

// ---------- STORAGE SAFETY ----------
function ensureStorage() {
    if (!plugin.storage) plugin.storage = {};
    if (!plugin.storage.logs) plugin.storage.logs = [];
    if (!plugin.storage.filteredWords) plugin.storage.filteredWords = [];
}

// ---------- SETTINGS UI ----------
function SettingsPanel() {
    const React = metro.findByProps("createElement", "useState");
    const RN = metro.findByProps("ScrollView", "Text", "TextInput", "Button", "View");

    if (!React || !RN) {
        return React?.createElement?.(RN?.Text || (() => null), {}, "Failed to load UI modules");
    }

    ensureStorage();

    const [url, setUrl] = React.useState(plugin.storage.supabaseUrl || "");
    const [key, setKey] = React.useState(plugin.storage.supabaseKey || "");
    const [token, setToken] = React.useState(plugin.storage.cloudToken || "");
    const [word, setWord] = React.useState("");

    const saveConfig = () => {
        ensureStorage();
        plugin.storage.supabaseUrl = url;
        plugin.storage.supabaseKey = key;
        plugin.storage.cloudToken = token;
    };

    const addWord = () => {
        ensureStorage();
        const w = word.trim();
        if (!w) return;

        if (!plugin.storage.filteredWords.includes(w)) {
            plugin.storage.filteredWords.push(w);
        }
        setWord("");
    };

    return React.createElement(
        RN.ScrollView,
        { style: { flex: 1, padding: 16, backgroundColor: "#1e1e1e" } },

        React.createElement(RN.Text, {
            style: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 }
        }, "Logar Cloud Settings"),

        React.createElement(RN.View, {
            style: { marginBottom: 24, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 }
        },

            React.createElement(RN.Text, { style: { color: "#ddd" } }, "Supabase URL"),
            React.createElement(RN.TextInput, {
                value: url,
                onChangeText: setUrl,
                placeholder: "https://your-project.supabase.co",
                style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 10 }
            }),

            React.createElement(RN.Text, { style: { color: "#ddd" } }, "Supabase API Key"),
            React.createElement(RN.TextInput, {
                value: key,
                onChangeText: setKey,
                secureTextEntry: true,
                placeholder: "anon key",
                style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 10 }
            }),

            React.createElement(RN.Text, { style: { color: "#ddd" } }, "Cloud Token"),
            React.createElement(RN.TextInput, {
                value: token,
                onChangeText: setToken,
                placeholder: "user token",
                style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 10 }
            }),

            React.createElement(RN.Button, {
                title: "Save Settings",
                onPress: saveConfig
            })
        ),

        React.createElement(RN.View, {
            style: { padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 }
        },

            React.createElement(RN.Text, { style: { color: "#fff", marginBottom: 8 } }, "Word Filter"),

            React.createElement(RN.TextInput, {
                value: word,
                onChangeText: setWord,
                placeholder: "Add word...",
                style: { backgroundColor: "#404040", color: "#fff", padding: 8, marginBottom: 10 }
            }),

            React.createElement(RN.Button, {
                title: "Add Word",
                onPress: addWord
            }),

            React.createElement(RN.Text, {
                style: { color: "#aaa", marginTop: 10 }
            }, "Active: " + (plugin.storage.filteredWords.join(", ") || "None"))
        )
    );
}

// ---------- CORE LOGIC ----------
let MessageStore, MessageActions, LocalMessageHelper, Dispatcher;
let patchInjected = false;
let syncQueue = [];
let syncing = false;

function resolveModules() {
    try { MessageStore = metro.findByProps("getMessages", "getMessage"); } catch {}
    try { MessageActions = metro.findByProps("sendMessage"); } catch {}
    try { LocalMessageHelper = metro.findByProps("sendBotMessage"); } catch {}
    try { Dispatcher = metro.findByProps("dispatch") || metro.findByProps("_dispatch"); } catch {}
}

function isTextMatchingFilters(text) {
    if (!text) return false;
    const filters = plugin.storage?.filteredWords || [];
    return filters.some(f => f && text.toLowerCase().includes(f.toLowerCase()));
}

// ---------- PATCH SYSTEM ----------
function injectPatches() {
    if (patchInjected) return;
    patchInjected = true;

    log("[Logar] Injecting patches...");

    if (MessageActions?.sendMessage) {
        patcher.instead("sendMessage", MessageActions, (args, orig) => {
            const [channelId, msg] = args;
            const content = msg?.content;

            if (content && isTextMatchingFilters(content)) {
                plugin.storage.logs.push({
                    id: Date.now().toString(),
                    type: "OUTBOUND",
                    channelId,
                    content,
                    timestamp: Date.now()
                });
            }

            return orig(...args);
        });
    }

    if (Dispatcher?.dispatch) {
        patcher.before("dispatch", Dispatcher, (args) => {
            const event = args[0];
            if (!event?.type) return;

            if (event.type === "MESSAGE_DELETE") {
                const msg = MessageStore?.getMessage?.(event.channelId, event.id);
                if (!msg) return;

                plugin.storage.logs.push({
                    type: "DELETE",
                    messageId: event.id,
                    content: msg.content,
                    timestamp: Date.now()
                });
            }

            if (event.type === "MESSAGE_UPDATE") {
                const newMsg = event.message;
                const oldMsg = MessageStore?.getMessage?.(newMsg.channel_id, newMsg.id);

                if (!oldMsg || oldMsg.content === newMsg.content) return;

                plugin.storage.logs.push({
                    type: "EDIT",
                    messageId: newMsg.id,
                    oldContent: oldMsg.content,
                    newContent: newMsg.content,
                    timestamp: Date.now()
                });
            }
        });
    }
}

// ---------- LIFECYCLE ----------
function onLoad() {
    ensureStorage();
    resolveModules();

    const interval = setInterval(() => {
        resolveModules();
        if (MessageStore && Dispatcher) {
            injectPatches();
            clearInterval(interval);
        }
    }, 1000);

    log("[Logar] Loaded");
}

function onUnload() {
    patcher?.unpatchAll?.();
    patchInjected = false;
    syncQueue = [];
    log("[Logar] Unloaded");
}

// ---------- EXPORT (IMPORTANT FIX) ----------
module.exports = {
    onLoad,
    onUnload,
    settings: SettingsPanel
};
