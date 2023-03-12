import { InputConfig, Module } from "../types";
import isEqual from "lodash/isEqual";

type Envelope = {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};

type AlphabeticCurveConfig = InputConfig & {
  letters: string;
  envelope: Envelope;
  projection?: "polar" | "linear";
  spread?: number;
  saturateUp?: number;
  resolution?: number;
  threshold?: number;
  msgAmp?: number;
  msgOffset?: number;
  reverse?: boolean;
};

type History = Array<{
  msg: string;
  date: number;
}>;
type State = {
  cache: Array<number>;
  history: History;
};

function safeResolution(config: AlphabeticCurveConfig) {
  return Math.max(1, Math.round(config.resolution || 0));
}

function initialState(config: AlphabeticCurveConfig) {
  return {
    cache: Array(config.letters.length * safeResolution(config)).fill(
      config?.reverse ? 1 : 0
    ),
    history: [],
  };
}

const AlphabeticCurve: Module<AlphabeticCurveConfig, State, Array<number>> = {
  doc: ({ config, id }) =>
    "letters typed in the chat : " + (config.description || ""),

  initialComponentState: ({ config }) => initialState(config),

  update: (s, _, { config, currentSpeed }) =>
    calculateCache(s, config, currentSpeed),

  flush: (_s, { config }) =>
    // we reset completely the curve
    initialState(config),

  updateWithChatMessage: (s, msg, context, { config, currentSpeed }) => {
    if (msg.trim().startsWith("!")) {
      // ignore if it's a command
      return s;
    }
    return calculateCache(
      {
        cache: s.cache,
        history: s.history.concat({ msg, date: Date.now() }),
      },
      config,
      currentSpeed
    );
  },

  mapToValue: ({ cache }) => cache,
};

export default AlphabeticCurve;

function calculateCache(
  initial: State,
  config: AlphabeticCurveConfig,
  currentSpeed: number
): State {
  const { envelope, threshold, msgOffset, msgAmp, reverse } = config;
  const spread = config.spread || 0.5;
  const r = safeResolution(config);

  function wordAmp(i: number): number {
    const offset = msgOffset || 2;
    const amp = msgAmp || 10;
    return Math.max(0, Math.min(1 - (i - offset) / amp, 1));
  }

  const now = Date.now();
  const history: History = [];
  let { cache } = initialState(config);
  const releaseDuration = envelope.attack + envelope.decay + envelope.release;
  initial.history.forEach((e) => {
    const time = (currentSpeed * (now - e.date)) / 1000;
    if (time < releaseDuration) {
      const value = getValue(time, envelope);
      history.push(e);
      const indexes = string_to_alphabet_index_array(config, e.msg);
      if (indexes.length === 0) return;
      indexes.forEach(({ index, spreadFactor }, i) =>
        addGaussianAmplitude(
          cache,
          index,
          value * wordAmp(i),
          r * spread * spreadFactor,
          config.projection === "polar"
        )
      );
    }
  });

  // normalize

  const saturateUp = config.saturateUp || 1;

  let min = cache[0];
  let max = cache[0];
  cache.forEach((v) => {
    if (v < min) min = v;
    if (v > max) max = v;
  });
  if (max <= min) {
    cache = cache.map(() => (reverse ? 1 : 0));
  } else {
    // by default the max is at least min+1
    max = Math.max(min + (threshold || 0), max);
    cache = cache.map((x) => {
      const v = Math.max(
        0,
        Math.min((saturateUp * (x - min)) / (max - min), 1)
      );
      return reverse ? 1 - v : v;
    });
  }

  if (isEqual(cache, initial.cache)) return initial;

  return { history, cache };
}

function string_to_alphabet_index_array(
  config: AlphabeticCurveConfig,
  str: string
): { index: number; spreadFactor: number }[] {
  const alphabet = config.letters.split("");
  const result = [];
  const m = safeResolution(config);
  for (const ch of str) {
    const low = ch.toLowerCase();
    const index = alphabet.indexOf(low);
    if (index === -1) continue;
    result.push({
      index: index * m,
      spreadFactor: ch === low ? 0.5 : 1,
    });
  }
  return result;
}

function getValue(time: number, envelope: Envelope): number {
  // attack phase
  if (time < envelope.attack) {
    return time / envelope.attack;
  }
  // decay phase
  if (time < envelope.attack + envelope.decay) {
    return (
      ((envelope.decay - (time - envelope.attack)) / envelope.decay) *
        (1 - envelope.sustain) +
      envelope.sustain
    );
  }
  // sustain phase
  if (time < envelope.attack + envelope.decay + envelope.release) {
    return envelope.sustain;
  }
  // release phase
  return (
    ((envelope.release -
      (time - envelope.attack - envelope.decay - envelope.release)) /
      envelope.release) *
    envelope.sustain
  );
}

function addGaussianAmplitude(
  arr: number[],
  index: number,
  value: number,
  spread: number,
  isCircular: boolean
) {
  for (let i = 0; i <= arr.length; i++) {
    let distance = Math.abs(index - i);
    if (isCircular) {
      distance = Math.min(distance, arr.length - distance);
    }
    const gaussian = Math.exp(-Math.pow(distance / spread, 2) / 2) * value;
    if (i >= 0 && i < arr.length && gaussian > 0.001) {
      arr[i] += gaussian;
    }
  }
}
