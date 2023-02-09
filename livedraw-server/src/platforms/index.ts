import debug from "./debug";
import twitch from "./twitch";
import twilio from "./twilio";
import { getConfig, onConfigChange } from "../globalConfig";
import type {
  StreamChatClient,
  StreamChatContext,
  StreamPlatformClient,
} from "../types";

const platforms = {
  debug,
  twitch,
  twilio,
};

const listeners: Array<(msg: string, context: StreamChatContext) => void> = [];
let current = loadPlatformFromConfig();

let lastConfig = getConfig();
onConfigChange((config) => {
  if (lastConfig.platform === config.platform) {
    return;
  }
  current.disconnect();
  current = loadPlatformFromConfig();
});

function onConnectedHandler() {}

function loadPlatform(name: any): StreamPlatformClient {
  // @ts-ignore
  const platform = platforms[name] || debug;
  return platform({ onConnectedHandler });
}

function loadPlatformFromConfig() {
  const config = getConfig();
  const p = loadPlatform(config.platform);
  p.chatClient.listen((msg: string, user: StreamChatContext) => {
    listeners.forEach((f) => f(msg, user));
  });
  return p;
}

export function globalStreamChatClient(): StreamChatClient {
  function listen(cb: (msg: string, context: StreamChatContext) => void) {
    listeners.push(cb);
  }
  function say(msg: string) {
    current.chatClient.say(msg);
  }
  return {
    listen,
    say,
  };
}
