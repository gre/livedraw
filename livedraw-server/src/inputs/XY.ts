import { InputConfig, Module } from "../types";

type RangeConfig = InputConfig & {
  decay?: number;
  initialValue: [number, number];
  range?: [number, number];
};

const defaultRange = [-1, 1];

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
  { target: [number, number]; value: [number, number] },
  { target: [number, number]; value: [number, number] }
> = {
  doc: ({ config, id }) =>
    "!" + id + " <x> <y> : " + (config.description || ""),

  initialComponentState: ({ config }) => ({
    target: config.initialValue,
    value: config.initialValue,
  }),

  flush: (s) => ({ value: s.target, target: s.target }),

  update: (s, { dt }, { config, currentSpeed }) => {
    let { target, value } = s;
    let changes = false;
    const r = config.range || defaultRange;
    const rangediff = r[1] - r[0];
    const newValue = value.map((v, i) => {
      let t = target[i];
      const diff = Math.abs(t - v);
      if (diff == 0) {
        return v;
      }
      changes = true;
      if (diff < 0.01 * rangediff) {
        return t;
      }
      t = Math.max(r[0], Math.min(t, r[1]));
      v = Math.max(r[0], Math.min(v, r[1]));
      return (
        v +
        (t - v) * Math.min((dt / 1000) * (config.decay || 0) * currentSpeed, 1)
      );
    }) as [number, number];
    if (!changes) {
      return s;
    }
    return { value: newValue, target };
  },

  updateWithChatMessage: (s, msg, context, { config, id }) => {
    if (context.isAdmin && msg === "!jump-to-target") {
      return { target: s.target, value: s.target };
    }
    const inactive = s.target[0] === s.value[0] && s.target[1] === s.value[1];
    const isRand = msg.startsWith("!rand");
    const head = "!" + id;
    if ((context.username && msg.startsWith(head)) || isRand) {
      const r = msg.slice(head.length).split(/\s+/).filter(Boolean);
      if (r.length === 0 && !isRand) return s;
      if (r.length === 1) {
        r.push(r[0]);
      }
      const value: [number, number] = [...s.value];
      const target: [number, number] = [...s.target];
      const rg = config.range || defaultRange;
      r.slice(0, 2).forEach((txt, i) => {
        if (txt in rangeAlias) {
          const str = rangeAlias[txt];
          txt = str;
        } else if (txt === "def" || txt === "default" || txt === "initial") {
          txt = String(config.initialValue[i] || "");
        } else if ((txt === "rand" || isRand) && inactive) {
          txt = String(mix(rg[0], rg[1], Math.random()));
        }
        const isPercent = txt.includes("%");
        const m = txt.match(/([\-0-9.]+)/s);
        if (m) {
          const [, v] = m;
          if (!v) return s;
          let n = parseFloat(v);
          if (isFinite(n)) {
            if (isPercent) {
              n = n / 100;
            }
            n = Math.max(rg[0], Math.min(n, rg[1]));
            if (context.isAdmin && msg.includes("force")) {
              value[i] = n;
            }
            target[i] = n;
          }
        }
      });
      if (
        s.target[0] === target[0] &&
        s.target[1] === target[1] &&
        s.value[0] === value[0] &&
        s.value[1] === value[1]
      ) {
        return s;
      }
      return { target, value };
    }
    return s;
  },

  mapToValue: (s) => s,
};

export default Range;
