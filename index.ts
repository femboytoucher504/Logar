import { metro } from "@revenge/metro";
import { patcher } from "@revenge/patcher";
import { storage } from "@revenge/plugin";

const MessageStore = metro.findByProps("getMessages", "getMessage");
const MessageActions = metro.findByProps("sendMessage", "receiveMessage");
const LocalMessageHelper = metro.findByProps("sendBotMessage", "createBotMessage"); 
const ChannelStore = metro.findByProps("getChannel", "getDMFromUserId");

const API_URL = "https://api.yourserver.com/v1";

function shouldLog(channelId: string): boolean {
    if (!storage.filterMode) return true; 

    const channel = ChannelStore.getChannel(channelId);
    const guildId = channel?.guild_id;

    if (storage.filterMode === "whitelist") {
        if (!guildId) return storage.includeDMs;
        return storage.allowedGuilds?.includes(guildId);
    }

    if (storage.filterMode === "blacklist") {
        if (!guildId) return !storage.excludeDMs;
        return !storage.blockedGuilds?.includes(guildId);
    }

    return true;
}

function checkFilteredWords(text: string): boolean {
    const filters: string[] = storage.filteredWords || [];
    return filters.some(word => text.toLowerCase().includes(word.toLowerCase()));
}

async function syncToCloud(payload: any) {
    if (!storage.cloudToken) return;
    try {
        await fetch(`${API_URL}/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${storage.cloudToken}` },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("[Logar Cloud Error]", err);
    }
}

export const onLoad = () => {
    patcher.instead("sendMessage", MessageActions, (args, original) => {
        const [channelId, message] = args;
        const content = message.content;

        if (shouldLog(channelId) && checkFilteredWords(content)) {
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

            if (originalMessage && shouldLog(channelId)) {
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
                           
