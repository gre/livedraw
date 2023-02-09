use isahc::prelude::*;
use serde_json::{json, Value};
use std::{
  fmt::Debug,
  path::PathBuf,
  thread::sleep,
  time::{Duration, Instant},
};
use svg::{
  node::{
    element::{path::Data, Element, Group, Path},
    Attributes,
  },
  Document, Node,
};

pub enum ArtAction {
  Pause(String, f64),
  ChatMessage(String),
}
pub enum ArtIncrement {
  // layers of SVG groups
  // the first point that will be drawn in mm (corresponding to first point in first element of the svg)
  SVG(Vec<Group>),
  Continue,
  End,
}

// LIB

/**
 * LivedrawArt is a trait that defines the behavior of a "livedraw" art piece, which is an art piece that is drawn incrementally in real time.
 * The art is designed to be written in small increments, to create a more realistic "real time" experience.
 * Each of these steps is called a "increment".
 * It is important to find the right balance between the number of increments and the time between increments, as too many increments may result in a slower drawing process, while too few increments may result in a less smooth drawing experience.
 */
pub trait LivedrawArt {
  /**
   * Draws a part of the art using the input values, and returns SVG groups that represent the part to draw.
   * Each group conventionally represents a color layer and can be merged by index.
   * If no groups are returned, it will shorten the delay between runs.
   */
  fn draw_increment(&mut self, input: &Value, index: usize) -> ArtIncrement;

  /**
   * Returns the (width, height) of the SVG plot in millimeters.
   */
  fn get_dimension(&self) -> (f64, f64);

  /**
   * Estimates the total number of increments needed for the art piece. This is used to create a progress bar.
   */
  fn estimate_total_increments(&self) -> usize;

  /**
   * Optionally returns actions to execute before an increment. These actions may include pausing or writing in a chat.
   */
  fn actions_before_increment(&self, _index: usize) -> Vec<ArtAction> {
    vec![]
  }

  /**
   * Limits the maximum number of increments that can be predicted.
   */
  fn get_predictive_max_next_increments(&self) -> Option<usize> {
    None
  }

  /**
   * Returns the minimum time between two increments.
   */
  fn delay_between_increments(&self) -> Duration {
    Duration::from_secs(1)
  }
}

/**
 * a LivedrawArt also need to be simulated in order to test the art without running for it. typically during its development.
 */
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
  std::fs::create_dir_all(files_folder().join("files")).unwrap();
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
  let file = files_folder().join("all.svg");
  svg::save(file, &doc).unwrap();
}

pub fn livedraw_start<T: LivedrawArt + Clone>(art: &mut T) {
  let predictive_svg_freq = Duration::from_millis(500);
  let folder = files_folder();
  let increment_path = folder.join("increment.svg");
  let increment_finished_path = folder.join("increment.finished.svg");
  let predictive_path = folder.join("predictive.svg");
  let all_path = folder.join("all.svg");

  std::fs::remove_file(increment_path.clone()).unwrap_or(());
  std::fs::remove_file(increment_finished_path.clone()).unwrap_or(());
  std::fs::remove_file(predictive_path.clone()).unwrap_or(());
  std::fs::remove_file(all_path.clone()).unwrap_or(());
  std::fs::create_dir_all(folder).unwrap();

  let (width, height) = art.get_dimension();

  plot_update(PlotUpdateAction::PlotArtStart());
  let delay = art.delay_between_increments();
  let mut i: usize = 0;
  let mut all_doc = svg_document(width, height);
  let mut last_input = get_input();
  generate_predictive(art, &last_input);

  // increments loop
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
        // add a pause for the plotter
        doc = doc.add(
          svg::node::element::Group::new()
            .set("inkscape:groupmode", "layer")
            .set("id", "force_pause")
            .set("inkscape:label", "!"),
        );
        // add <plotdata> element to optimise pen travel and start from previous position
        if let Some(plotdata_attributes) = plot_read_previous_plot_data() {
          doc = doc.add(plot_make_new_plotdata(plotdata_attributes));
        }

        plot_update(PlotUpdateAction::PlotIncrStart(i));
        svg::save(increment_path.clone(), &doc).unwrap();
        svg::save(all_path.clone(), &all_doc).unwrap();

        // wait for file to be deleted (plot to end)
        loop {
          let exists = increment_path.as_path().is_file();
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

  plot_cleanup(width, height);

  plot_update(PlotUpdateAction::PlotArtStop());
}

fn plot_cleanup(width: f64, height: f64) {
  // we trigger one last time the plotter to go back home
  if let Some(attrs) = plot_read_previous_plot_data() {
    let mut doc = svg_document(width, height);
    doc = doc.add(plot_make_new_plotdata(attrs));
    let file = files_folder().join("increment.svg");
    svg::save(file, &doc).unwrap();
  }
}

fn plot_make_new_plotdata(attributes: Attributes) -> Element {
  let mut attributes = attributes.clone();

  // we need to reset the plotdata to start from the beginning:
  attributes.insert("layer".to_string(), "-1".to_string().into()); // plot all layers
  attributes.insert("pause_dist".to_string(), "0".to_string().into()); // from zero
  attributes.insert("pause_ref".to_string(), "0".to_string().into()); // from zero

  let mut new_element = Element::new("plotdata");
  for attr in attributes {
    new_element.assign(attr.0, attr.1);
  }
  new_element
}

fn plot_read_previous_plot_data() -> Option<Attributes> {
  // read previous plot data from "increment.finished.svg"
  let mut svg_str = String::new();
  let file = files_folder().join("increment.finished.svg");
  svg::open(file.clone(), &mut svg_str).ok().and_then(|doc| {
    for event in doc {
      match event {
        svg::parser::Event::Tag("plotdata", _, attributes) => {
          // delete file
          std::fs::remove_file(file).unwrap();
          return Some(attributes);
        }
        _ => {}
      }
    }
    None
  })
}

fn generate_svg_all<T: LivedrawArt + Clone>(
  art: &T,
  input: &Value,
  max_iterations: Option<usize>,
) -> Document {
  let mut copy = art.clone();
  let (width, height) = copy.get_dimension();
  let mut doc = svg_document(width, height);
  let mut i = 0;
  loop {
    if let Some(max) = max_iterations {
      if i > max {
        break;
      }
    }
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
  let predictive_doc =
    generate_svg_all(art, input, art.get_predictive_max_next_increments());
  let file = files_folder().join("predictive.svg");
  svg::save(file, &predictive_doc).unwrap();
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

fn files_folder() -> PathBuf {
  // ~/.livedraw/files
  let mut path = dirs::home_dir().unwrap();
  path.push(".livedraw");
  path.push("files");
  path
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
