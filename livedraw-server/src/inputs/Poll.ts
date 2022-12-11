import { InputConfig, Module } from "../types";

type PollConfig = InputConfig & {
  question: string;
  choices: {
    [_: string]: string;
  };
};

const Poll: Module<
  PollConfig,
  { [username: string]: string }, // voters for each result
  {
    winner: string;
    scores: Array<[string, number]>;
  }
> = {
  doc: ({ config, id }) =>
    "!" + id + " <choice> : " + (config.description || ""),

  initialComponentState: () => ({}),

  flush: (s) => s,

  update: (s) => s,

  updateWithChatMessage: (s, msg, context, { id }) => {
    const head = "!" + id;
    if (context.username && msg.startsWith(head)) {
      const remain = msg.slice(head.length).trim();
      if (s[context.username] === remain) return s; // no changes
      return { ...s, [context.username]: remain };
    }
    return s;
  },

  mapToValue: (s, { config }) => {
    const score: { [_: string]: number } = {};
    Object.values(s).forEach((vote) => {
      score[vote] = (score[vote] || 0) + 1;
    });
    const scores = Object.entries(score)
      .filter((a) => a[0] in config.choices)
      .sort((a, b) => b[1] - a[1]);
    const winner =
      scores.length > 0 ? scores[0][0] : Object.keys(config.choices)[0];
    return { scores, winner };
  },
};

export default Poll;
