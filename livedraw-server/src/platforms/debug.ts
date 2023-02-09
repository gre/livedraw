import { StreamChatClient, StreamPlatform } from "../types";
import readline from "readline";

const platform: StreamPlatform = ({ onConnectedHandler }) => {
  onConnectedHandler();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let disconnect = () => {};

  const chatClient: StreamChatClient = {
    listen(f) {
      function onLine(line: string) {
        const msg = line.trim();
        f(msg, {
          username: "debug",
          displayName: "debug",
          isBroadcaster: true,
          isAdmin: true,
        });
      }
      rl.on("line", onLine);
      disconnect = () => {
        rl.off("line", onLine);
      };
    },
    say(msg) {
      console.log("debug platform. say: ", msg);
    },
  };

  return {
    chatClient,
    disconnect,
  };
};

export default platform;
