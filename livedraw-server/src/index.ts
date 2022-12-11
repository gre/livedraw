import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";
import twitch from "./platforms/twitch";
import stateServer from "./stateServer";

const folder = process.argv[2];
if (!folder) {
  console.error("a folder is needed in parameter");
  process.exit(1);
}

const platform = twitch({ onConnectedHandler });

function onConnectedHandler() {
  const port = 4628;
  const app = express();
  app.use(morgan("tiny"));
  app.use(express.static("static"));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  stateServer(app, platform, folder);
  app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
  });
}
