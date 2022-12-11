use isahc::prelude::*;
use serde_json::{json, Value};
use std::{
  fmt::Debug,
  thread::sleep,
  time::{Duration, Instant},
};
use svg::{
  node::element::{path::Data, Group, Path},
  Document,
};

pub enum ArtAction {
  Pause(String, f64),
  ChatMessage(String),
}
pub enum ArtIncrement {
  SVG(Vec<Group>),
  Continue,
  End,
}

// LIB

// TODO parametric type with parsed version of "Value"
pub trait LivedrawArt {
  fn delay_between_increments(&self) -> Duration;

  fn get_dimension(&self) -> (f64, f64);

  fn estimate_total_increments(&self) -> usize;

  fn actions_before_increment(&self, index: usize) -> Vec<ArtAction>;
  /**
   * draw part of the art using the input values
   * otherwise returns svg groups that represent the part to draw.
   * each group conventionally can be merged by index and represent a color layer.
   * if no groups are returned, it will shorten the delay between runs
   */
  fn draw_increment(&mut self, input: &Value, index: usize) -> ArtIncrement;
}

pub trait LivedrawArtSimulation {
  /**
   * for testing reason, feed a simulated input
   */
  fn simulate_input(&mut self, index: usize) -> Value;
}

pub fn livedraw_start_simulation<
  T: LivedrawArt + LivedrawArtSimulation + Clone,
>(
  art: &mut T,
) {
  std::fs::create_dir_all("files").unwrap();
  let (width, height) = art.get_dimension();
  let mut doc = svg_document(width, height);
  let mut i = 0usize;
  loop {
    let input = art.simulate_input(i);
    match art.draw_increment(&input, i) {
      ArtIncrement::End => {
        break;
      }
      ArtIncrement::Continue => {
        i += 1;
        continue;
      }
      ArtIncrement::SVG(parts) => {
        for part in parts {
          doc = doc.add(part);
        }
        i += 1;
      }
    }
  }
  svg::save("files/all.svg", &doc).unwrap();
}

pub fn livedraw_start<T: LivedrawArt + Clone>(art: &mut T) {
  let predictive_svg_freq = Duration::from_millis(500);

  std::fs::remove_file("files/increment.svg").unwrap_or(());
  std::fs::remove_file("files/predictive.svg").unwrap_or(());
  std::fs::remove_file("files/all.svg").unwrap_or(());
  std::fs::create_dir_all("files").unwrap();

  let (width, height) = art.get_dimension();

  plot_update(PlotUpdateAction::PlotArtStart());
  let delay = art.delay_between_increments();
  let mut i: usize = 0;
  let mut all_doc = svg_document(width, height);
  let mut last_input = get_input();
  generate_predictive(art, &last_input);

  loop {
    let before = Instant::now();
    let mut doc = svg_document(width, height);

    for action in art.actions_before_increment(i) {
      match action {
        ArtAction::Pause(text, duration) => {
          plot_update(PlotUpdateAction::PlotArtCountdownPause(text, duration));
          let end = Instant::now() + Duration::from_secs_f64(duration);
          loop {
            if Instant::now() > end {
              break;
            }
            let input = get_input();
            if last_input != input {
              last_input = input.clone();
              generate_predictive(art, &input);
            }
            sleep(predictive_svg_freq);
          }
        }
        ArtAction::ChatMessage(message) => {
          plot_update(PlotUpdateAction::PlotArtChatMessage(message));
        }
      }
    }

    let total = art.estimate_total_increments();
    plot_update(PlotUpdateAction::PlotIncrPrepare(i, total));

    let input = get_input();
    // generate a predictive preview
    if last_input != input {
      last_input = input.clone();
      generate_predictive(art, &input);
    }

    match art.draw_increment(&input, i) {
      ArtIncrement::End => {
        break;
      }
      ArtIncrement::Continue => {
        i += 1;
        continue;
      }
      ArtIncrement::SVG(parts) => {
        for part in parts {
          doc = doc.add(part.clone());
          all_doc = all_doc.add(part.clone());
        }
        plot_update(PlotUpdateAction::PlotIncrStart(i));
        svg::save("files/increment.svg", &doc).unwrap();
        svg::save("files/all.svg", &all_doc).unwrap();

        // wait for file to be deleted (plot to end)
        loop {
          let exists = std::path::Path::new("files/increment.svg").is_file();
          if !exists {
            plot_update(PlotUpdateAction::PlotIncrEnd(i));
            break;
          }
          let input = get_input();
          if last_input != input {
            last_input = input.clone();
            generate_predictive(art, &input);
          }
          sleep(predictive_svg_freq);
        }

        // wait for required delay to be waited (minimum delay between each increment)
        loop {
          let after = Instant::now();
          let ellapsed = after - before;
          if ellapsed < delay {
            let input = get_input();
            if last_input != input {
              last_input = input.clone();
              generate_predictive(art, &input);
            }
            sleep(predictive_svg_freq);
          } else {
            break;
          }
        }

        i += 1;
      }
    }
  }
  plot_update(PlotUpdateAction::PlotArtStop());
}

fn generate_svg_all<T: LivedrawArt + Clone>(
  art: &T,
  input: &Value,
) -> Document {
  let mut copy = art.clone();
  let (width, height) = copy.get_dimension();
  let mut doc = svg_document(width, height);
  let mut i = 0;
  loop {
    match copy.draw_increment(&input, i) {
      ArtIncrement::End => {
        break;
      }
      ArtIncrement::Continue => {
        i += 1;
        continue;
      }
      ArtIncrement::SVG(parts) => {
        for part in parts {
          doc = doc.add(part);
        }
        i += 1;
      }
    }
  }
  doc
}

fn generate_predictive<T: LivedrawArt + Clone>(art: &T, input: &Value) {
  let predictive_doc = generate_svg_all(art, input);
  svg::save("files/predictive.svg", &predictive_doc).unwrap();
  plot_update(PlotUpdateAction::PlotPredictiveWritten());
}

fn retry_function<F, T, E>(mut f: F) -> Result<T, E>
where
  E: Debug,
  F: FnMut() -> Result<T, E>,
{
  let mut result = f();
  while result.is_err() {
    match result {
      Err(e) => {
        println!("retry failed: {:#?}", e)
      }
      Ok(_) => {}
    };
    sleep(Duration::from_millis(500));
    result = f();
  }
  result
}

fn get_input() -> Value {
  let value: Value = retry_function(|| {
    let mut response = isahc::get("http://localhost:4628/state/inputs")
      .map_err(|e| e.to_string())?;
    if response.status().is_success() {
      let text = response.text().map_err(|e| e.to_string())?;
      serde_json::from_str(text.as_str()).map_err(|e| e.to_string())
    } else {
      Err(String::from("non successful status code"))
    }
  })
  .unwrap();
  value
}

enum PlotUpdateAction {
  PlotArtCountdownPause(String, f64),
  PlotArtChatMessage(String),
  PlotArtStart(),
  PlotArtStop(),
  PlotIncrPrepare(usize, usize),
  PlotIncrStart(usize),
  PlotIncrEnd(usize),
  PlotPredictiveWritten(),
}

fn plot_update(action: PlotUpdateAction) {
  let body = match action {
    PlotUpdateAction::PlotArtCountdownPause(text, duration) => json!({
      "type": "art-countdown-pause",
      "text": text,
      "duration": duration
    }),
    PlotUpdateAction::PlotArtChatMessage(text) => json!({
      "type": "chat-message",
      "text": text
    }),
    PlotUpdateAction::PlotArtStart() => json!({
      "type": "art-start"
    }),
    PlotUpdateAction::PlotArtStop() => json!({
      "type": "art-stop"
    }),
    PlotUpdateAction::PlotIncrPrepare(index, total) => json!({
      "type": "incr-prepare",
      "index": index,
      "total": total,
    }),
    PlotUpdateAction::PlotIncrStart(index) => json!({
      "type": "incr-start",
      "index": index,
    }),
    PlotUpdateAction::PlotIncrEnd(index) => json!({
      "type": "incr-end",
      "index": index,
    }),
    PlotUpdateAction::PlotPredictiveWritten() => json!({
      "type": "predictive"
    }),
  };
  println!("{}", body);
  retry_function(|| {
    isahc::Request::post("http://localhost:4628/plot-update")
      .header("Content-Type", "application/json")
      .body(body.to_string())
      .unwrap()
      .send()
  })
  .unwrap();
}

pub fn render_route(data: Data, route: &Vec<(f64, f64)>) -> Data {
  let mut first = true;
  let mut d = data;
  for &p in route {
    if first {
      first = false;
      d = d.move_to(p);
    } else {
      d = d.line_to(p);
    }
  }
  return d;
}

pub fn svg_layer(id: &str) -> Group {
  return Group::new()
    .set("inkscape:groupmode", "layer")
    .set("inkscape:label", id);
}

pub fn svg_document(width: f64, height: f64) -> Document {
  Document::new()
    .set(
      "xmlns:inkscape",
      "http://www.inkscape.org/namespaces/inkscape",
    )
    .set("viewBox", (0, 0, width, height))
    .set("width", format!("{}mm", width))
    .set("height", format!("{}mm", height))
}

pub fn svg_base_path(color: &str, stroke_width: f64, data: Data) -> Path {
  Path::new()
    .set("fill", "none")
    .set("stroke", color)
    .set("stroke-width", stroke_width)
    .set("d", data)
    .set("style", "mix-blend-mode: multiply;")
}
