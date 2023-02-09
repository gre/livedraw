import { homedir } from "os";
import fs from "fs";
import path from "path";
import JSON5 from "json5";
import { Express } from "express";
import { GlobalConfig } from "./types";

export const globalDirectory = path.join(homedir(), ".livedraw");

if (!fs.existsSync(globalDirectory)) {
  fs.mkdirSync(globalDirectory);
}

const configpath = path.join(globalDirectory, "config.json5");

if (!fs.existsSync(configpath)) {
  fs.writeFileSync(
    configpath,
    `
{
  artfolder: "", // absolute path to art folder
  platform: "debug", // one of "debug", "twitch", "twilio"
}
`
  );
}

function loadConfig(): GlobalConfig {
  let config = JSON5.parse(fs.readFileSync(configpath, "utf8"));
  return config;
}

let config = loadConfig();
const watchers: Array<(_: GlobalConfig) => void> = [];

fs.watch(configpath, (e, filename) => {
  if (e === "change") {
    config = loadConfig();
    watchers.forEach((f) => f(config));
  }
});

export function getConfig(): GlobalConfig {
  return config;
}

export function onConfigChange(f: (_: GlobalConfig) => void) {
  watchers.push(f);
}

export function adminServer(app: Express) {
  // TODO
}
