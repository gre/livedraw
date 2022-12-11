import tmi from "tmi.js";
import { StreamChatClient, StreamPlatform } from "../types";

const channel = process.env.CHANNEL_NAME;

function chat() {
  const opts = {
    identity: {
      username: process.env.BOT_USERNAME,
      password: process.env.OAUTH_TOKEN,
    },
    channels: channel ? [channel] : [],
  };
  if (!opts.identity.username) {
    throw new Error("BOT_USERNAME required");
  }

  const client = new tmi.client(opts);
  client.connect();
  return client;
}

const platform: StreamPlatform = ({ onConnectedHandler }) => {
  const client = chat();
  client.on("connected", (addr: string, port: number) => {
    console.log(`* Connected to ${addr}:${port}`);
    onConnectedHandler();
  });

  const chatClient: StreamChatClient = {
    listen(f) {
      client.on("message", (target, context, msg, self) => {
        if (self) return;
        if (context.username === "wizebot") {
          return;
        }
        const isBroadcaster = Boolean(context.badges?.broadcaster);
        f(msg, {
          username: context.username,
          displayName: context["display-name"],
          isBroadcaster,
          isAdmin: isBroadcaster,
        });
      });
    },
    say(msg) {
      if (channel) client.say(channel, msg);
    },
  };

  return {
    chatClient,
  };
};

export default platform;
