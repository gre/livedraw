import { InputConfig, Module } from "../types";

type RangeConfig = InputConfig & {
  display: string;
  decay: number;
  min: number;
  max: number;
  initialValue: number;
};

const rangeAlias: { [_: string]: string } = {
  max: "100%",
  min: "0%",
  high: "100%",
  low: "0%",
  mid: "50%",
  half: "50%",
};

function mix(a: number, b: number, x: number): number {
  return (1 - x) * a + x * b;
}

const Range: Module<
  RangeConfig,
  { target: number; value: number },
  { target: number; value: number }
> = {
  doc: ({ config, id }) =>
    "!" + id + " <value> : " + (config.description || ""),

  initialComponentState: ({ config }) => ({
    target: config.initialValue,
    value: config.initialValue,
  }),

  flush: (s) => ({ value: s.target, target: s.target }),

  update: (s, { dt }, { config, currentSpeed }) => {
    let { target, value } = s;
    target = Math.max(config.min, Math.min(target, config.max));
    value = Math.max(config.min, Math.min(value, config.max));

    const diff = Math.abs(target - value);
    if (diff == 0) return s;
    if (diff < 0.01 * (config.max - config.min)) {
      return { target, value: target };
    }
    value +=
      (target - value) * Math.min((dt / 1000) * config.decay * currentSpeed, 1);
    return { target, value };
  },

  updateWithChatMessage: (s, msg, context, { config, id }) => {
    if (context.isAdmin && msg === "!jump-to-target") {
      return { target: s.target, value: s.target };
    }
    const inactive = s.target === s.value;
    const isRand = msg.startsWith("!rand");
    const head = "!" + id;
    if ((context.username && msg.startsWith(head)) || isRand) {
      let remain: string = msg.slice(head.length).trim();
      let firstWord: string = remain.split(" ")[0];
      if (firstWord in rangeAlias) {
        const str = rangeAlias[firstWord];
        remain = str;
      } else if (
        remain === "def" ||
        remain === "default" ||
        remain === "initial"
      ) {
        remain = String(config.initialValue);
      } else if ((remain === "rand" || isRand) && inactive) {
        remain = String(mix(config.min, config.max, Math.random()));
      }
      const isPercent = remain.includes("%");
      const m = remain.match(/([\-0-9.]+)/s);
      if (m) {
        const [, v] = m;
        if (!v) return s;
        let n = parseFloat(v);
        if (isFinite(n)) {
          if (isPercent) {
            n = mix(config.min, config.max, n / 100);
          }
          n = Math.max(config.min, Math.min(n, config.max));
          if (context.isAdmin && msg.includes("force")) {
            return { target: n, value: n };
          }
          return { target: n, value: s.value };
        }
      }
    }
    return s;
  },

  mapToValue: (s) => s,
};

export default Range;
