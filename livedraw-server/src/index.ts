import express from "express";
import morgan from "morgan";
import bodyParser from "body-parser";
import stateServer from "./stateServer";
import { adminServer } from "./globalConfig";

const port = parseInt(process.env.PORT || "4628", 10);
const app = express();
// app.use(morgan("tiny"));
app.use(express.static("static"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

stateServer(app);
adminServer(app);

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
