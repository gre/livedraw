import fs from "fs";
import path from "path";
import { Express } from "express";
import axios from "axios";
import JSON5 from "json5";
import {
  ArtServer,
  ArtServerAction,
  Config,
  GlobalConfig,
  InputContext,
  Module,
  RootState,
  State,
  StreamChatClient,
  StreamChatContext,
} from "./types";
import KeyboardCurve from "./inputs/KeyboardCurve";
import Poll from "./inputs/Poll";
import XY from "./inputs/XY";
import Range from "./inputs/Range";
import CounterBtn from "./inputs/CounterBtn";
import LastChatMessage from "./inputs/LastChatMessage";
import { getConfig, globalDirectory, onConfigChange } from "./globalConfig";
import { globalStreamChatClient } from "./platforms";

const modules: { [_: string]: Module<any, any, any> } = {
  KeyboardCurve,
  Poll,
  Range,
  XY,
  CounterBtn,
  LastChatMessage,
};

const initialArtServer: ArtServer = {
  started: false,
  plotting: false,
  startedTime: 0,
  plottingTime: 0,
  index: 0,
  total: 100,
  prediction: 0,
  countdownPause: null,
};
const initialRootState: RootState = {
  mode: "normal",
};

type ArtState = {
  unsubscribe: () => void;
  getState: () => State;
  globalContext: (id: string) => InputContext<any>;
  setState: (s: State) => void;
  onStateChange: (f: (_: State) => void) => void;
  mods: { [_: string]: Module<any, any, any> };
  getFolder: () => string;
};

function loadForArtFolder(artfolder: string): ArtState {
  let configpath = path.join(artfolder, "config.json5");
  if (!fs.existsSync(configpath)) {
    configpath = path.join(artfolder, "config.json");
  }
  let config: Config = JSON5.parse(fs.readFileSync(configpath, "utf8"));

  const mods: { [_: string]: Module<any, any, any> } = {};
  for (const id in config.inputs) {
    const input = config.inputs[id];
    if (!modules[input.type]) {
      console.error("Unknown type = " + input.type);
    } else {
      mods[id] = modules[input.type];
    }
  }

  let state: State = {
    config,
    rootState: initialRootState,
    artServer: initialArtServer,
  };
  for (const id in mods) {
    state[id] = mods[id].initialComponentState(globalContext(id));
  }

  const stateChangeListeners: Array<(_: State) => void> = [];

  const watcher = fs.watch(configpath, (e, filename) => {
    if (filename) {
      const prevConfig = config;
      try {
        state = { ...state };
        config = JSON5.parse(fs.readFileSync(configpath, "utf8"));
        for (const id in config.inputs) {
          const input = config.inputs[id];
          if (!mods[id]) {
            if (!modules[input.type]) {
              console.error("Unknown type = " + input.type);
            } else {
              mods[id] = modules[input.type];
              state[id] = mods[id].initialComponentState(globalContext(id));
            }
          } else {
            state[id] = mods[id].update(
              state[id],
              { dt: 0 },
              globalContext(id)
            );
          }
        }
        state.config = config;
        stateChangeListeners.forEach((cb) => cb(state));
      } catch (e) {
        config = prevConfig;
        console.error("Couldn't update the config", e);
      }
    }
  });

  function globalContext(id: string): InputContext<any> {
    const c = config.inputs[id];
    const { rootState } = state;
    const currentSpeed =
      rootState.mode === "berserk" ? config.berserkBoost || 10 : 1;
    return {
      id,
      currentSpeed,
      config: c,
      rootState,
    };
  }

  return {
    unsubscribe: () => {
      watcher.close();
    },
    globalContext,
    getState: () => state,
    setState: (newState: State) => {
      state = newState;
      stateChangeListeners.forEach((cb) => cb(state));
    },
    onStateChange: (cb: (state: State) => void) => {
      stateChangeListeners.push(cb);
    },

    mods,
    getFolder: () => artfolder,
  };
}

const dummyConfig: Config = {
  title: "",
  inputs: {},
  layout: [],
};
const dummyState: ArtState = {
  unsubscribe: () => {},
  globalContext: (id) => ({
    id,
    currentSpeed: 1,
    config: dummyConfig,
    rootState: initialRootState,
  }),
  getState: () => ({
    config: dummyConfig,
    rootState: initialRootState,
    artServer: initialArtServer,
  }),
  setState: () => {},
  onStateChange: () => {},
  mods: {},
  getFolder: () => "",
};

export default function (app: Express) {
  const chatClient = globalStreamChatClient();

  let globalConfig = getConfig();
  let art = dummyState;
  loadConfig(globalConfig);
  onConfigChange(loadConfig);

  // TODO stream platform client is dynamic too based on config

  function loadConfig(newConfig: GlobalConfig) {
    const artfolderChanged = globalConfig.artfolder !== newConfig.artfolder;
    globalConfig = newConfig;

    if (artfolderChanged) {
      art.unsubscribe();
    }
    if (globalConfig.artfolder && fs.existsSync(globalConfig.artfolder)) {
      art = loadForArtFolder(globalConfig.artfolder);
    } else {
      art = dummyState;
    }
  }

  const updateFrequency = 200;

  const htmlListeners: Array<() => void> = [];
  let htmlFileDebounceT: ReturnType<typeof setTimeout> | null;
  fs.watch(path.join(__dirname, "../static/index.html"), (e, filename) => {
    if (filename) {
      if (htmlFileDebounceT) clearTimeout(htmlFileDebounceT);
      htmlFileDebounceT = setTimeout(() => {
        htmlListeners.forEach((f) => f());
      }, 500);
    }
  });

  function artServerAction(prevState: State, action: ArtServerAction): State {
    let { artServer, ...restState } = prevState;
    artServer = { ...artServer };
    switch (action.type) {
      case "art-countdown-pause": {
        artServer.countdownPause = {
          text: action.text,
          duration: action.duration,
          startedTime: Date.now(),
        };
        return { ...restState, artServer };
      }
      case "art-start": {
        artServer.started = true;
        artServer.plotting = false;
        artServer.startedTime = Date.now();
        artServer.index = 0;
        chatClient.say(
          "A new art is being started! You can now participate <3"
        );
        // TODO too spammy
        /*
        Object.keys(mods)
          .map((id) => mods[id].doc)
          .forEach((txt, i) => setTimeout(() => chatClient.say(txt), i * 1000));
        */
        for (const id in art.mods) {
          restState[id] = art.mods[id].initialComponentState(
            art.globalContext(id)
          );
        }
        return { ...restState, artServer };
      }
      case "art-stop": {
        artServer.countdownPause = null;
        artServer.started = false;
        artServer.index = artServer.total;
        chatClient.say("The plot is finished <3");
        for (const id in art.mods) {
          restState[id] = art.mods[id].initialComponentState(
            art.globalContext(id)
          );
        }
        return { ...restState, artServer };
      }
      case "incr-prepare": {
        artServer.countdownPause = null;
        artServer.index = action.index;
        artServer.total = action.total;
        return { ...restState, artServer };
      }
      case "incr-start": {
        artServer.countdownPause = null;
        artServer.plotting = true;
        artServer.plottingTime = Date.now();
        return { ...restState, artServer };
      }
      case "incr-end": {
        artServer.plotting = false;
      }
      case "predictive": {
        artServer.prediction += 1;
        return { ...restState, artServer };
      }
      case "chat-message": {
        chatClient.say(action.text);
        return updateWithChatMessage(prevState, action.text, {
          displayName: "proofofplot",
          username: "proofofplot",
          isAdmin: true,
          isArt: true,
        });
      }
      default: {
        return prevState;
      }
    }
  }

  let lastStateNotified = art.getState();
  const stateListeners: Array<(_: Partial<State>) => void> = [];
  function notify(s: Partial<State>) {
    stateListeners.forEach((f) => f(s));
  }
  function checkNotify() {
    let hasChanged = false;
    const subset: Partial<State> = {};
    const state = art.getState();
    for (const k in state) {
      if (state[k] !== lastStateNotified[k]) {
        hasChanged = true;
        subset[k] = state[k];
      }
    }
    if (hasChanged) {
      lastStateNotified = state;
      notify(subset);
    }
  }

  // Recurrent update on the state
  let t = Date.now();
  setInterval(() => {
    const state = art.getState();
    const mode = state.rootState.mode;
    if (mode === "frozen") return;
    const n = Date.now();
    const dt = n - t;
    let newState: State = { ...state };
    for (const id in state) {
      if (id in art.mods) {
        const newS = art.mods[id].update(
          state[id],
          {
            dt,
          },
          art.globalContext(id)
        );
        if (newS !== state[id]) {
          newState[id] = newS;
        }
      } else {
        newState[id] = state[id];
      }
    }
    art.setState(newState);
    checkNotify();
    t = n;
  }, updateFrequency);

  // TODO berserk should be its own module

  let berserkOutTimer;

  function berserkOut() {
    const state = art.getState();
    if (state.rootState.mode !== "berserk") {
      return;
    }
    let newState: State = { ...state };
    newState.rootState = {
      ...newState.rootState,
      mode: "normal",
    };
    art.setState(newState);
  }

  // Listen to the chat
  function updateWithChatMessage(
    state: State,
    msg: string,
    context: StreamChatContext
  ): State {
    if (state.rootState.mode === "frozen" && !context.isAdmin) {
      return state;
    }

    // TODO optimize this to return state if no inner change
    let newState: State = { ...state };

    const trim = msg.trim();
    const commandMatch = trim.startsWith("!")
      ? trim.slice(1).split(/[ ]+/)
      : [];
    if (commandMatch.length > 0) {
      const [cmd, arg1] = commandMatch;
      if (cmd === "berserk" && context.isAdmin) {
        if (arg1 === "off") {
          newState.rootState = {
            ...newState.rootState,
            mode: "normal",
          };
        } else {
          // TODO timeout?
          const possibletimer = parseInt(arg1);
          if (
            !isNaN(possibletimer) &&
            isFinite(possibletimer) &&
            possibletimer > 0
          ) {
            berserkOutTimer = setTimeout(berserkOut, 1000 * possibletimer);
          }
          newState.rootState = {
            ...newState.rootState,
            mode: "berserk",
          };
        }
      } else if (cmd === "freeze" && context.isAdmin) {
        newState.rootState = {
          ...newState.rootState,
          mode: "frozen",
        };
      } else if (cmd === "unfreeze" && context.isAdmin) {
        newState.rootState = {
          ...newState.rootState,
          mode: "normal",
        };
      }
    }

    for (const id in art.mods) {
      if (
        context.isAdmin &&
        (msg.startsWith("!reset " + id + " ") ||
          msg === "!reset" + id ||
          msg === "!reset")
      ) {
        newState[id] = art.mods[id].initialComponentState(
          art.globalContext(id)
        );
      } else if (context.isAdmin && msg === "!flush") {
        newState[id] = art.mods[id].flush(state[id], art.globalContext(id));
      } else if (
        msg === "!help " + id ||
        (msg === "!" + id && !art.mods[id].noArguments)
      ) {
        chatClient.say(art.mods[id].doc(art.globalContext(id)));
      } else {
        newState[id] = art.mods[id].updateWithChatMessage(
          state[id],
          msg,
          context,
          art.globalContext(id)
        );
      }
    }
    if (context.isAdmin && msg === "!reset-all") {
      newState.artServer = initialArtServer;
    }
    return newState;
  }

  chatClient.listen((msg, context) => {
    art.setState(updateWithChatMessage(art.getState(), msg, context));
  });

  function mapState(state: Partial<State>) {
    let payload: { [id: string]: unknown } = {};
    for (const id in state) {
      payload[id] = art.mods[id]
        ? art.mods[id].mapToValue(state[id], art.globalContext(id))
        : state[id];
    }
    return payload;
  }

  // Serve the state
  app.get("/state", (req, res) => {
    res.send(mapState(art.getState()));
  });
  app.get("/state/inputs", (req, res) => {
    const { artServer, ...inputs } = art.getState();
    res.send(mapState(inputs));
  });

  let inactivityTimeout: string | number | NodeJS.Timeout | undefined;
  app.post("/plot-update", (req, res) => {
    const { body } = req;
    clearTimeout(inactivityTimeout);
    const duration =
      (body.type === "art-countdown-pause" && body.duration * 1000 + 10000) ||
      30000;
    // after some time, we assume the server ended.
    // FIXME what if it takes longer???
    /*
    inactivityTimeout = setTimeout(() => {
      state = { ...state, artServer: initialArtServer };
    }, duration);
    */
    art.setState(artServerAction(art.getState(), body));
    res.send();
  });

  // Serve the predictive file
  app.get("/predictive.svg", (req, res) => {
    const filePath = path.join(globalDirectory, "/files/predictive.svg");
    res.type("svg");
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).end();
      }
    });
  });

  app.get("/all.svg", (req, res) => {
    const filePath = path.join(globalDirectory, "/files/all.svg");
    res.type("svg");
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).end();
      }
    });
  });

  app.post("/stream/state/input/:id", (req, res) => {
    const { id } = req.params;
    const { body } = req;
    if (art.mods[id]) {
      const state = art.getState();
      art.setState({
        ...state,
        [id]: { ...state[id], ...body },
      });
      res.send(200);
    } else {
      res.send(404);
    }
  });

  app.get("/stream/state", (req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("connection", "keep-alive");
    res.write(`data: ${JSON.stringify(mapState(art.getState()))}\n\n`);
    function listen(updatedState: Partial<State>) {
      res.write(`data: ${JSON.stringify(mapState(updatedState))}\n\n`);
    }
    function end() {
      console.log("/stream/state closed");
      let i = stateListeners.indexOf(listen);
      if (i >= 0) stateListeners.splice(i, 1);
      i = htmlListeners.indexOf(end);
      if (i >= 0) htmlListeners.splice(i, 1);
      res.send();
    }

    stateListeners.push(listen);
    htmlListeners.push(end);
    req.on("close", end);
  });

  app.get("/globalconfig", (req, res) => {
    res.send(globalConfig);
  });

  const cropPointsDefault = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const cropPoints: Record<string, typeof cropPointsDefault> = {};

  app.get("/ipcamerapro/:cam/crop", (req, res) => {
    const { cam } = req.params;
    res.send(cropPoints[cam] || cropPointsDefault);
  });

  app.post("/ipcamerapro/:cam/crop", (req, res) => {
    const { cam } = req.params;
    let { points } = req.body;
    if (!points || points.length !== 4) {
      res.send(400);
      return;
    }
    cropPoints[cam] = points;
    res.send(200);
  });

  app.post("/ipcamerapro/:cam", (req, res) => {
    // get id and path
    const { cam } = req.params;
    const conf = globalConfig.network && globalConfig.network[cam];
    if (!conf) {
      res.send(404);
      return;
    }
    if (conf.type !== "ipcamerapro") {
      res.send(500);
      return;
    }
    const { id, value } = req.body;
    let url = `http://${conf.ip}:8080/`;
    switch (id) {

      case "ptz":
        url += id + "?zoom=" + value;
        break;
      case "crop_x":
      case "crop_y":
      case "focus_distance":
        url += "settings/" + id + "?set=" + value;
        break;
    }
    axios.get(url).then(
      () => {
        res.send(200);
      },
      (e) => {
        console.log(e);
        res.send(500);
      }
    );
  });

  type Message = {
    text: string;
    user: string;
  };
  let last50: Message[] = [];
  const chatListeners: Array<(_: Message) => void> = [];

  chatClient.listen((msg, context) => {
    const user = context.displayName || context.username;
    if (!user) return;
    const message: Message = { text: msg, user };
    if (context.isAdmin && msg === "!clear") {
      last50 = [];
      htmlListeners.forEach((f) => f());
    } else {
      last50 =
        last50.length >= 50
          ? last50.slice(1).concat([message])
          : last50.concat([message]);
      chatListeners.forEach((f) => f(message));
    }
  });

  app.get("/chatbox/messages", (req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("connection", "keep-alive");
    // noreplay in query params
    if (!req.query.noreplay) {
      last50.forEach((message) =>
        res.write(`data: ${JSON.stringify(message)}\n\n`)
      );
    }
    function listen(message: Message) {
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    }
    function end() {
      const i = chatListeners.indexOf(listen);
      if (i >= 0) chatListeners.splice(i, 1);
      res.send();
    }
    chatListeners.push(listen);
    req.on("close", end);
  });

  app.get("/speak/messages", (req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("connection", "keep-alive");
    function listen(message: Message) {
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    }
    function end() {
      const i = chatListeners.indexOf(listen);
      if (i >= 0) chatListeners.splice(i, 1);
      res.send();
    }
    chatListeners.push(listen);
    req.on("close", end);
  });

  chatClient.listen((msg, context) => {
    if (context.isAdmin) {
      if (msg === "!ping") {
        chatClient.say("pong");
      }
    }
  });

  manageGiveway(chatClient, () => art.getState().config);

  // GO!
  // chatClient.say("livedraw-server: state started!");
}

function manageGiveway(chatClient: StreamChatClient, getConfig: () => Config) {
  let state: {
    opened: boolean;
    users: string[];
    interval: ReturnType<typeof setTimeout> | null;
  } = {
    opened: false,
    users: [],
    interval: null,
  };

  function reset() {
    if (state.interval) {
      clearInterval(state.interval);
    }
    state = { opened: false, users: [], interval: null };
  }

  chatClient.listen((msg, context) => {
    const commandName = msg.trim();
    if (context.isAdmin) {
      if (commandName === "!giveaway-start") {
        if (state.opened) {
          chatClient.say("Giveaway is already started.");
          return;
        }
        const msg =
          getConfig().giveawayMessage || "type !giveaway to participate";
        chatClient.say("Giveaway is starting... " + msg);
        state.opened = true;
        const interval = (state.interval = setInterval(() => {
          if (!state.opened) {
            clearInterval(interval);
            return;
          }
          chatClient.say("A giveaway is ongoing... " + msg);
        }, 4 * 60000));
        return;
      } else if (commandName === "!giveaway-reset") {
        chatClient.say("Giveaway was reset.");
        reset();
        return;
      } else if (
        commandName === "!giveaway-finish" ||
        commandName === "!giveaway-stop" ||
        commandName === "!giveaway-finalize" ||
        commandName === "!giveaway-go"
      ) {
        if (state.users.length === 0) {
          chatClient.say("Oops, no one participated.");
        } else {
          const winner =
            state.users[Math.floor(state.users.length * Math.random())];
          reset();
          chatClient.say("and the winner is... @" + winner);
        }
        return;
      }
    }
    if (commandName === "!giveaway") {
      const { username } = context;
      if (!username) return;
      if (state.opened) {
        if (!state.users.includes(username)) {
          state.users.push(username);
        }
        chatClient.say(
          "You are in @" +
            username +
            " – (" +
            state.users.length +
            " participants in total)"
        );
      } else {
        chatClient.say(
          "Sorry @" + username + ", the giveaway isn't opened yet."
        );
      }
      return;
    }
  });

  return {
    getState: () => state,
  };
}
