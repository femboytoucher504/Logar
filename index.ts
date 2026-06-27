import { metro } from "@revenge/metro";
import { patcher } from "@revenge/patcher";
import { storage } from "@revenge/plugin";

const MessageStore = metro.findByProps("getMessages", "getMessage");
const MessageActions = metro.findByProps("sendMessage", "receiveMessage");
const LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage"); 
const ChannelStore = metro.findByProps("getChannel", "getDMFromUserId");

async function syncToCloud(payload: any) {
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
                filtered_words: payload.filteredWords,
                logs: payload.logs,
                updated_at: new Date().toISOString()
            })
        });
    } catch (err) {
        console.error("[Logar Cloud Error]", err);
    }
}

function checkFilteredWords(text: string): boolean {
    const filters: string[] = storage.filteredWords || [];
    return filters.some(word => text.toLowerCase().includes(word.toLowerCase()));
}

export const onLoad = () => {
    patcher.instead("sendMessage", MessageActions, (args, original) => {
        const [channelId, message] = args;
        const content = message.content;

        if (checkFilteredWords(content)) {
            const logEntry = {
                timestamp: Date.now(),
                content,
                channelId,
                type: "SENT",
                userId: metro.findByProps("getCurrentUser").getCurrentUser()?.id
            };
            if (!storage.logs) storage.logs = [];
            storage.logs.push(logEntry);
            syncToCloud({ logs: storage.logs, filteredWords: storage.filteredWords });
        }
        return original(...args);
    });

    patcher.before("dispatch", metro.findByProps("dispatch"), (args) => {
        const [event] = args;

        if (event.type === "MESSAGE_DELETE") {
            const { id: messageId, channelId } = event;
            const originalMessage = MessageStore.getMessage(channelId, messageId);

            if (originalMessage) {
                const deleteLog = {
                    type: "DELETED_MESSAGE",
                    content: originalMessage.content,
                    author: originalMessage.author.username,
                    authorId: originalMessage.author.id,
                    channelId: channelId,
                    timestamp: Date.now()
                };

                if (!storage.logs) storage.logs = [];
                storage.logs.push(deleteLog);
                syncToCloud({ logs: storage.logs, filteredWords: storage.filteredWords });

                setTimeout(() => {
                    LocalMessageHelper.sendBotMessage(channelId, {
                        content: `⚠️ **Deleted (${originalMessage.author.username}):** ${originalMessage.content}\n*Sent at: ${new Date(originalMessage.timestamp).toLocaleTimeString()}*`,
                        flags: 64
                    });
                }, 500);
            }
        }
    });
};

export const onUnload = () => {
    patcher.unpatchAll();
};
