> Note: The project is not yet very well documented as it's still under development. It is used by @greweb on twitch.tv/greweb and you can also find all the accumulated work made with it by @greweb at https://greweb.me/plots/tags/livedraw – the source code of each art piece is linked on that website too.

## livedraw

livedraw is a real-time collaborative pen plotter stream experience (e.g. twitch) created by @greweb.

- By real time, we mean that the art is being built and updated over the time with a relatively low frequency rate (for instance, a few stroke every 10 seconds).
- By collaborative stream experience, we mean that the update loop is taking inputs from viewers to impact the art.
- By pen plotter, we mean the usage of robotic to draw ("plot") with pens. (but it can be brushes or any other medium)

![](https://user-images.githubusercontent.com/211411/210267573-a2aa381e-b6a3-4349-86f0-43a6439fc137.gif)

### Architecture

![Untitled-2022-12-07-1640](https://user-images.githubusercontent.com/211411/206928082-e448731e-a268-467e-9b7e-2473efd38c67.png)

**loosely coupled:**

Every part is loosely-coupled and you can fork / contribute to replace bricks by other bricks. For instance, I do my plotter art mostly with Rust, which is why the artistic part is in rust, but it's possible to make more "sdk"s. This is also a multi-language project: the stream server is in Node.js and the axidraw watch logic is in Python.

**modular inputs:**

The architecture is organized in modules. Notably centered around the "inputs" that the user can interact with.

**configurable:**

Every art will define a config.json that describes the behavior of inputs as well as how the UI should look like. We will make things more & more dynamic and put more and more efforts at accessing things in the configuration level.

### How does it look like under the hood?

in the art project, a files/ folder is created with 3 .SVG files: all.svg aggregated all the plotted work, increment.svg is the file being plotted right now and predictive.svg is the remaining work planned as if the current input was propagated in all future increments.

<img width="1128" alt="Screenshot 2022-12-21 at 13 01 40" src="https://user-images.githubusercontent.com/211411/208900958-94ec178a-aa50-43c4-a5df-210131d9a16f.png">

### Requirements

- Cargo (rust)
- Node.js and Yarn
- Python3
- material set up: AxiDraw, OBS, cameras,... it's up to you.

### How to run

- clone art-example into your own. Let's assume it have path `$ART`
- start the livedraw-server:

```sh
cd livedraw-server
# twitch envs are required: (you need to create a twitch user for making a nex bot and then get a oauth token with it. then set the channel of your twitch)
export BOT_USERNAME=
export CHANNEL_NAME=
export OAUTH_TOKEN=
yarn
node ./dist/index.js $ART
```

- start the livedraw-axidraw-watch loop:

```sh
cd livedraw-axidraw-watch
python3 ./axidraw-watch.py $ART/art.svg
```

- start your art at the end:

```sh
cd art-example
cargo run
```

### Modules

to be documented.
