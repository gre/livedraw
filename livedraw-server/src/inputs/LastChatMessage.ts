import { InputConfig, Module } from "../types";
import isEqual from "lodash/isEqual";

type Config = InputConfig & {
  maxLetters: number;
};

type State = {
  value: string;
};

const AlphabeticCurve: Module<Config, State, State> = {
  doc: ({ config, id }) => "words typed in the chat",

  initialComponentState: ({ config }) => ({ value: "" }),

  update: (s) => s,

  flush: (_s, { config }) => ({ value: "" }),

  updateWithChatMessage: (s, msg, context, { config, currentSpeed }) => {
    if (msg.trim().startsWith("!")) {
      // ignore if it's a command
      return s;
    }
    return { value: msg.slice(0, config.maxLetters) };
  },

  mapToValue: (s) => s,
};

export default AlphabeticCurve;
