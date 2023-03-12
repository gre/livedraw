import { InputConfig, Module } from "../types";
import isEqual from "lodash/isEqual";

type Config = InputConfig & {
  maxLetters: number;
  requiredMatchRegexp?: string;
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
    if (config.requiredMatchRegexp) {
      try {
        const re = new RegExp(config.requiredMatchRegexp);
        if (!re.test(msg)) {
          return s;
        }
      } catch (e) {
        console.error("invalid regexp", config.requiredMatchRegexp);
      }
    }

    return { value: msg.slice(0, config.maxLetters) };
  },

  mapToValue: (s) => s,
};

export default AlphabeticCurve;
