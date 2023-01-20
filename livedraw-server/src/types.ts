export type InputConfig = {
  type: string;
  description?: string;
  label?: string;
};
export type Layout = string | Layout[];

export type Config = {
  title: string;
  giveawayMessage?: string;
  layout: Layout[];
  predictive: string;
  berserkBoost: number;
  inputs: {
    [_: string]: InputConfig;
  };
};

export type RootState = {
  mode: "normal" | "berserk" | "frozen";
};

export type ArtServer = {
  started: boolean;
  plotting: boolean;
  startedTime: number;
  plottingTime: number;
  index: number;
  total: number;
  prediction: number;
  countdownPause: null | {
    text: string;
    duration: number;
    startedTime: number;
  };
};

export type State = {
  artServer: ArtServer;
  rootState: RootState;
  [_: string]: Object;
};

export type TimeContext = { dt: number };

export type InputContext<Config extends InputConfig> = {
  id: string;
  rootState: RootState;
  currentSpeed: number;
  config: Config;
};

export type Module<Config extends InputConfig, ComponentState, Value> = {
  // document in one line the usage of an input
  doc: (_: InputContext<Config>) => string;

  // return the initial state of the input
  initialComponentState: (_: InputContext<Config>) => ComponentState;

  // reset all temporary transitional state of the input (instantly go to targets)
  flush: (
    prevState: ComponentState,
    ctx: InputContext<Config>
  ) => ComponentState;

  // apply time to the state (transition the state to targets)
  update: (
    prevState: ComponentState,
    upCtx: TimeContext,
    ctx: InputContext<Config>
  ) => ComponentState;

  // apply incoming chat message to the state
  updateWithChatMessage: (
    prevState: ComponentState,
    msg: string,
    context: StreamChatContext,
    ctx: InputContext<Config>
  ) => ComponentState;

  // get the public value object of the state that is exposed to the UI and art side
  mapToValue: (state: ComponentState, ctx: InputContext<Config>) => Value;

  // if true, the input does not require any arguments in the chat message
  noArguments?: boolean;
};

export type StreamPlatformInput = {
  onConnectedHandler: () => void;
};

export type StreamChatContext = {
  username: string | undefined;
  displayName: string | undefined;
  isAdmin?: boolean;
  isBroadcaster?: boolean;
  isArt?: boolean;
};

export type StreamChatClient = {
  say: (msg: string) => void;
  listen: (f: (msg: string, context: StreamChatContext) => void) => void;
};

export type StreamPlatformClient = {
  chatClient: StreamChatClient;
};

export type StreamPlatform = (_: StreamPlatformInput) => StreamPlatformClient;

export type ArtServerAction =
  | {
      type: "art-start";
    }
  | {
      type: "art-stop";
    }
  | {
      type: "art-countdown-pause";
      text: string;
      duration: number;
    }
  | {
      type: "incr-prepare";
      index: number;
      total: number;
    }
  | {
      type: "incr-start";
      index: number;
    }
  | {
      type: "incr-end";
      index: number;
    }
  | {
      type: "chat-message";
      text: string;
    }
  | {
      type: "predictive";
    };
