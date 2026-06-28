import { React, metro } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

// Revenge UI Bileşenlerini çekiyoruz
const { ScrollView, View, Text, TextInput, Button, StyleSheet } = metro.findByProps("ScrollView", "TextInput");

export default function Settings() {
    // Arayüzün veriler değiştikçe canlı güncellenmesi için proxy kullanıyoruz
    useProxy(storage);

    // Geçici yerel durumlar (Input alanları için)
    const [url, setUrl] = React.useState(storage.supabaseUrl || "");
    const [key, setKey] = React.useState(storage.supabaseKey || "");
    const [token, setToken] = React.useState(storage.cloudToken || "");
    const [newWord, setNewWord] = React.useState("");

    // Hafıza alanlarını sağlama alıyoruz
    if (!storage.filteredWords) storage.filteredWords = [];

    const saveConfig = () => {
        storage.supabaseUrl = url;
        storage.supabaseKey = key;
        storage.cloudToken = token;
    };

    const addWord = () => {
        if (newWord.trim() && !storage.filteredWords.includes(newWord.trim())) {
            storage.filteredWords.push(newWord.trim());
            setNewWord("");
        }
    };

    const removeWord = (word: string) => {
        storage.filteredWords = storage.filteredWords.filter((w: string) => w !== word);
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>Logar Configuration</style>
            
            {/* Supabase Bağlantı Ayarları */}
            <View style={styles.section}>
                <Text style={styles.label}>Supabase URL</Text>
                <TextInput 
                    style={styles.input} 
                    value={url} 
                    onChangeText={(v) => { setUrl(v); }} 
                    placeholder="https://your-project.supabase.co"
                />

                <Text style={styles.label}>Supabase API Key</Text>
                <TextInput 
                    style={styles.input} 
                    value={key} 
                    onChangeText={(v) => { setKey(v); }} 
                    placeholder="your-anon-key"
                    secureTextEntry={true}
                />

                <Text style={styles.label}>Cloud User Token</Text>
                <TextInput 
                    style={styles.input} 
                    value={token} 
                    onChangeText={(v) => { setToken(v); }} 
                    placeholder="unique-user-token"
                />

                <Button title="Save Cloud Configuration" onPress={saveConfig} />
            </View>

            {/* Kelime Filtresi Ayarları */}
            <View style={styles.section}>
                <Text style={styles.title}>Word Filter</Text>
                <View style={styles.row}>
                    <TextInput 
                        style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8 }]} 
                        value={newWord} 
                        onChangeText={setNewWord} 
                        placeholder="Add filtered word..."
                    />
                    <Button title="Add" onPress={addWord} />
                </View>

                <Text style={[styles.label, { marginTop: 12 }]}>Active Filters:</Text>
                {storage.filteredWords.length === 0 ? (
                    <Text style={{ color: "#aaa", fontStyle: "italic" }}>No words filtered yet.</Text>
                ) : (
                    storage.filteredWords.map((word: string, index: number) => (
                        <View key={index} style={styles.wordBadge}>
                            <Text style={styles.wordText}>{word}</Text>
                            <Button title="X" color="#ff4444" onPress={() => removeWord(word)} />
                        </View>
                    ))
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: "#1e1e1e" },
    title: { fontSize: 20, fontWeight: "bold", color: "#fff", marginBottom: 16 },
    section: { marginBottom: 24, padding: 12, backgroundColor: "#2d2d2d", borderRadius: 8 },
    label: { color: "#ddd", marginBottom: 6, fontSize: 14 },
    input: { backgroundColor: "#404040", color: "#fff", padding: 8, borderRadius: 4, marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "center" },
    wordBadge: { 
        flexDirection: "row", 
        justifyContent: "space-between", 
        alignItems: "center", 
        backgroundColor: "#444", 
        padding: 8, 
        borderRadius: 4, 
        marginTop: 6 
    },
    wordText: { color: "#fff", fontSize: 16 }
});

