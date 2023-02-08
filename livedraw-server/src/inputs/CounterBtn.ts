import { InputConfig, Module } from "../types";

// TODO feature: cooldown

type CounterBtnConfig = InputConfig & {
  scale?: number;
};

const CounterBtn: Module<
  CounterBtnConfig,
  { value: number },
  { value: number }
> = {
  noArguments: true,

  doc: ({ config, id }) => "!" + id + " : " + (config.description || ""),

  initialComponentState: () => ({ value: 0 }),

  flush: (s) => s,

  update: (s) => s,

  updateWithChatMessage: (s, msg, context, { id }) => {
    const head = "!" + id;
    if (context.username && msg.startsWith(head)) {
      return { value: s.value + 1 };
    }
    return s;
  },

  mapToValue: (s) => s,
};

export default CounterBtn;
