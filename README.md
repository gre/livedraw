> Note: The project is not yet very well documented as it's still under development. It is used by @greweb on https://twitch.tv/greweb and you can also find all the accumulated work made with it by @greweb at https://greweb.me/plots/tags/livedraw – the source code of each art piece is linked on that website too.

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

- start the livedraw-server. It is the main server of live draw.

```sh
cd livedraw-server
yarn
node ./dist/index.js
```

- start the livedraw-axidraw-watch loop. That's the loop that will watch the files being plotted and will send the commands to the plotter.

```sh
cd livedraw-axidraw-watch
python3 ./axidraw-watch.py
```

- you need to modify the `~/.livedraw/config.json5` file to point to the right art project.

- start your art project at the end. It will start the art live experiment.

```sh
cd art-rust-template # example
cargo run
```


## `~/.livedraw` folder

Livedraw creates a folder `~/.livedraw` which contains:
- `config.json5`: the main configuration folder that gets modified from the admin interface.
- axidraw_options.py global settings to use for the plotter
- `files/` is a dynamically generated folder that will be used by the livedraw-server and the livedraw-axidraw-watch to listen to the files that are being plotted.


### Modules

to be documented.
