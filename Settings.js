(() => {
    const globalContext = window.revenge || window.vendetta || window.bunny || {};
    const { metro } = globalContext;
    if (!metro) return () => null;

    const React = metro.findByProps("createElement", "useState");
    const { ScrollView, View, Text, TextInput, Button } = metro.findByProps("ScrollView", "TextInput") || {};
    const { useProxy } = metro.findByProps("useProxy") || {};

    return function Settings() {
        if (!React || !ScrollView) return null;

        // Revenge altındaki aktif eklenti hafızasını dinamik olarak buluyoruz
        const plugins = globalContext.plugins || {};
        const pluginKey = Object.keys(plugins).find(k => k.includes("Logar"));
        const pluginStorage = plugins[pluginKey]?.storage;

        if (!pluginStorage) {
            return React.createElement(View, { style: { padding: 20 } }, 
                React.createElement(Text, { style: { color: "#ff4444" } }, "Plugin storage not found. Ensure plugin is active.")
            );
        }

        if (useProxy) useProxy(pluginStorage);

        const [url, setUrl] = React.useState(pluginStorage.supabaseUrl || "");
        const [key, setKey] = React.useState(pluginStorage.supabaseKey || "");
        const [token, setToken] = React.useState(pluginStorage.cloudToken || "");
        const [newWord, setNewWord] = React.useState("");

        if (!pluginStorage.filteredWords) pluginStorage.filteredWords = [];

        const saveConfig = () => {
            pluginStorage.supabaseUrl = url;
            pluginStorage.supabaseKey = key;
            pluginStorage.cloudToken = token;
        };

        const addWord = () => {
            if (newWord.trim() && !pluginStorage.filteredWords.includes(newWord.trim())) {
                pluginStorage.filteredWords.push(newWord.trim());
                setNewWord("");
            }
        };

        const clearWords = () => {
            pluginStorage.filteredWords = [];
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
                React.createElement(Text, { style: { color: "#aaa", marginTop: 12, fontSize: 14 } }, `Active Filters: ${pluginStorage.filteredWords.join(", ") || "None"}`)
            )
        );
    };
})();
                                    
