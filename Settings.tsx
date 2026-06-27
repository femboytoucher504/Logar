import { React } from "@revenge/metro";
import { storage } from "@revenge/plugin";
import { Components } from "@revenge/ui";

const { ScrollView, View, Text, TextInput, Button } = Components;

export default function Settings() {
    const [wordInput, setWordInput] = React.useState("");
    const [tokenInput, setTokenInput] = React.useState(storage.cloudToken || "");
    const [urlInput, setUrlInput] = React.useState(storage.supabaseUrl || "");
    const [keyInput, setKeyInput] = React.useState(storage.supabaseKey || "");
    const [words, setWords] = React.useState<string[]>(storage.filteredWords || []);
    const [logs, setLogs] = React.useState<any[]>(storage.logs || []);

    const triggerCloudSave = async (updatedLogs: any[], updatedWords: string[]) => {
        if (!storage.cloudToken || !storage.supabaseUrl || !storage.supabaseKey) return;
        try {
            const cleanUrl = storage.supabaseUrl.endsWith('/') ? storage.supabaseUrl : storage.supabaseUrl + '/';
            await fetch(`${cleanUrl}rest/v1/logar_backup?user_id=eq.${storage.cloudToken}`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "apikey": storage.supabaseKey,
                    "Authorization": `Bearer ${storage.supabaseKey}`,
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

    const saveConfig = () => {
        storage.cloudToken = tokenInput;
        storage.supabaseUrl = urlInput;
        storage.supabaseKey = keyInput;
        triggerCloudSave(logs, words);
        alert("Configuration Saved!");
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
                placeholder="Supabase Project URL"
                value={urlInput}
                onChangeText={setUrlInput}
            />
            <TextInput
                placeholder="Supabase Anon Public Key"
                value={keyInput}
                onChangeText={setKeyInput}
            />
            <TextInput
                placeholder="Unique Sync ID / Token"
                value={tokenInput}
                onChangeText={setTokenInput}
            />
            <Button text="Save Configuration" onPress={saveConfig} />

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
