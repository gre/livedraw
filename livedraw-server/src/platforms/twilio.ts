import { Client, Conversation, Message } from "@twilio/conversations";
import { StreamPlatform } from "../types";
import { StreamChatContext } from "../types";

const platform: StreamPlatform = ({ onConnectedHandler }) => {
  let disconnected = false;
  let conversation: Conversation | undefined;

  const streamerId = process.env.TWILIO_STREAMER_ID;
  if (!streamerId) {
    console.warn(
      "TWILIO_STREAMER_ID is not set. it is needed to differenciate the streamer from other users."
    );
  }

  const listeners: Array<(msg: string, context: StreamChatContext) => void> =
    [];

  function onMessage(m: Message) {
    const { body, author, attributes } = m;
    if (!body || !author) return;
    const user = (attributes as any)?.user; // expect a user attribute object
    if (!user) return;
    let displayName: string = user?.username || author;
    if (!displayName) return;
    const isBroadcaster = streamerId === author;
    const context = {
      username: author,
      displayName: displayName,
      isBroadcaster,
      isAdmin: isBroadcaster,
    };
    listeners.forEach((f) => f(body, context));
  }

  async function main() {
    const client = await getClient();
    if (disconnected) return;
    console.log("twilio connected");
    const conversationID = process.env.TWILIO_CONVERSATION_ID;
    if (!conversationID) throw new Error("TWILIO_CONVERSATION_ID is not set");
    conversation = await client.getConversationBySid(conversationID);
    if (disconnected) return;
    console.log("conversation connected");
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

function getClient(): Promise<Client> {
  const token = process.env.TWILIO_TOKEN;
  if (!token) throw new Error("TWILIO_TOKEN is not set");
  return new Promise((success, failure) => {
    const client = new Client(token);
    client.on("initialized", () => {
      console.log("twilio initialized");
      success(client);
    });
    client.on("initFailed", ({ error }) => {
      console.error("twilio initFailed", error);
      failure(error);
    });
  });
}

export default platform;
