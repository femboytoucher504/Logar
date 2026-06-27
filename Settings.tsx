import { React } from "@revenge/metro";
import { storage } from "@revenge/plugin";
import { Components } from "@revenge/ui";

const { ScrollView, View, Text, TextInput, Button } = Components;

export default function Settings() {
    const [wordInput, setWordInput] = React.useState("");
    const [tokenInput, setTokenInput] = React.useState(storage.cloudToken || "");
    const [words, setWords] = React.useState<string[]>(storage.filteredWords || []);
    const [logs, setLogs] = React.useState<any[]>(storage.logs || []);

    const API_URL = "https://zstjrxjkfmkyjanwdfpi.supabase.co/rest/v1/logar_backup";
    const SUPABASE_KEY = "sb_publishable_bHVZHwUgtW8Rme8gICpXZQ_FWc0eatj";

    const triggerCloudSave = async (updatedLogs: any[], updatedWords: string[]) => {
        if (!storage.cloudToken) return;
        try {
            await fetch(`${API_URL}?user_id=eq.${storage.cloudToken}`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Prefer": "resolution=merge-duplicates"
                },
                body: JSON.stringify({ 
                    user_id: storage.cloudToken,
                    filtered_words: updatedWords, 
                    logs: updatedLogs,
                    updated_at: new Date().toISOString()
                })
            });
        } catch (e) {
            console.error(e);
        }
    };

    const addWord = () => {
        if (!wordInput.trim()) return;
        const updated = [...words, wordInput.trim()];
        setWords(updated);
        storage.filteredWords = updated;
        setWordInput("");
        triggerCloudSave(logs, updated);
    };

    const saveToken = () => {
        storage.cloudToken = tokenInput;
        triggerCloudSave(logs, words);
    };

    const deleteLogItem = (timestamp: number) => {
        const updated = logs.filter((log: any) => log.timestamp !== timestamp);
        setLogs(updated);
        storage.logs = updated;
        triggerCloudSave(updated, words);
    };

    const clearAllLogs = () => {
        setLogs([]);
        storage.logs = [];
        triggerCloudSave([], words);
    };

    return (
        <ScrollView style={{ padding: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>Logar Config</Text>
            <TextInput
                placeholder="Enter a unique Sync ID / Token"
                value={tokenInput}
                onChangeText={setTokenInput}
            />
            <Button text="Save Token" onPress={saveToken} />

            <View style={{ marginVertical: 15 }} />

            <Text style={{ fontSize: 16, fontWeight: "bold" }}>Word Filter</Text>
            <TextInput
                placeholder="Add word..."
                value={wordInput}
                onChangeText={setWordInput}
            />
            <Button text="Add" onPress={addWord} />

            <View style={{ marginVertical: 15 }} />

            <Button text="Clear All Logs" onPress={clearAllLogs} />

            <Text style={{ marginTop: 15, fontWeight: "bold" }}>Active Filters:</Text>
            {words.map((w, i) => (
                <Text key={i}>• {w}</Text>
            ))}

            <Text style={{ marginTop: 15, fontWeight: "bold" }}>Recent Logs ({logs.length}):</Text>
            {logs.map((log, i) => (
                <View key={i} style={{ marginVertical: 5, padding: 5, backgroundColor: "#222" }}>
                    <Text style={{ color: "#fff" }}>{log.content || log.text}</Text>
                    <Button text="Delete" onPress={() => deleteLogItem(log.timestamp)} />
                </View>
            ))}
        </ScrollView>
    );
}
