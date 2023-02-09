import { Client, Conversation, Message } from "@twilio/conversations";
import { StreamPlatform } from "../types";
import { StreamChatContext } from "../types";

const platform: StreamPlatform = ({ onConnectedHandler }) => {
  let disconnected = false;
  let conversation: Conversation | undefined;
  const listeners: Array<(msg: string, context: StreamChatContext) => void> =
    [];

  function onMessage(m: Message) {
    const { body, author } = m;
    if (!body) return;
    if (!author) return;
    const context = {
      username: author,
      displayName: author,
      isBroadcaster: false,
      isAdmin: false,
    };
    listeners.forEach((f) => f(body, context));
  }

  async function main() {
    const client = await getClient();
    if (disconnected) return;
    const conversationID = process.env.TWILIO_CONVERSATION_ID;
    if (!conversationID) throw new Error("TWILIO_CONVERSATION_ID is not set");
    conversation = await client.getConversationBySid(conversationID);
    if (disconnected) return;
    onConnectedHandler();
    conversation.on("messageAdded", onMessage);
  }
  main();

  return {
    disconnect: () => {
      disconnected = true;
      if (conversation) conversation.removeListener("messageAdded", onMessage);
    },
    chatClient: {
      listen(f: (msg: string, context: StreamChatContext) => void) {
        listeners.push(f);
      },
      say(msg: string) {
        if (conversation) conversation.sendMessage(msg);
      },
    },
  };
};

async function getClient() {
  const token = process.env.TWILIO_TOKEN;
  if (!token) throw new Error("TWILIO_TOKEN is not set");
  return new Client(token);
}

export default platform;
