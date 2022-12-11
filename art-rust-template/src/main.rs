use clap::Parser;
use livedraw::*;
use rand::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use svg::node::element::path::Data;

#[derive(Clone, Parser)]
#[command()]
struct Args {
  #[arg(long, default_value_t = 0)]
  seed: u64,
  #[arg(long, default_value_t = 105.0)]
  width: f64,
  #[arg(long, default_value_t = 148.5)]
  height: f64,
  #[arg(long, default_value_t = 5.0)]
  padding: f64,
  #[arg(long, default_value_t = false)]
  simulation: bool,
}

#[derive(Deserialize, Serialize, Clone)]
struct PollValue {
  winner: String,
}

#[derive(Deserialize, Serialize, Clone)]
struct RangeValue {
  value: f64,
}

type KeyboardCurveValue = Vec<f64>;

#[derive(Deserialize, Serialize, Clone)]
struct ExampleArtInput {
  shape: KeyboardCurveValue,
  poll: PollValue,
  value: RangeValue,
}

#[derive(Clone)]
struct ExampleArt {
  args: Args,
}

impl ExampleArt {
  fn new(args: Args) -> Self {
    ExampleArt { args }
  }
}

impl LivedrawArt for ExampleArt {
  fn delay_between_increments(&self) -> Duration {
    Duration::from_secs(8)
  }

  fn get_dimension(&self) -> (f64, f64) {
    (self.args.width, self.args.height)
  }

  fn estimate_total_increments(&self) -> usize {
    10
  }

  fn actions_before_increment(&self, i: usize) -> Vec<ArtAction> {
    if i == 0 {
      return vec![ArtAction::Pause(String::from("Get ready"), 10.0)];
    }
    return vec![];
  }

  fn draw_increment(&mut self, value: &Value, index: usize) -> ArtIncrement {
    let input: ExampleArtInput = serde_json::from_value(value.clone()).unwrap();

    if index < 10 {
      let mut routes = vec![];

      routes.push(vec![
        (
          self.args.padding,
          input.value.value * ((index as f64 + 0.5) / 10.0) * self.args.height,
        ),
        (
          self.args.width - self.args.padding,
          input.value.value * ((index as f64 + 0.5) / 10.0) * self.args.height,
        ),
      ]);

      if routes.len() == 0 {
        return ArtIncrement::Continue;
      }
      let data = routes.iter().fold(Data::new(), render_route);

      let layers =
        vec![svg_layer("black").add(svg_base_path("black", 0.35, data))];

      return ArtIncrement::SVG(layers);
    }
    return ArtIncrement::End;
  }
}

impl LivedrawArtSimulation for ExampleArt {
  fn simulate_input(&mut self, _index: usize) -> Value {
    let mut rng = rand::thread_rng();
    return json!(ExampleArtInput {
      value: RangeValue {
        value: rng.gen_range(0.0..100.0)
      },
      poll: PollValue {
        winner: String::from(*vec!["dog", "cat"].choose(&mut rng).unwrap())
      },
      shape: (0..26)
        .map(|_i| rng.gen_range(0.0..1.0))
        .collect::<Vec<_>>()
    });
  }
}

fn main() {
  let args = Args::parse();
  let mut art = ExampleArt::new(args.clone());
  if args.simulation {
    livedraw_start_simulation(&mut art);
  } else {
    livedraw_start(&mut art);
  }
}
