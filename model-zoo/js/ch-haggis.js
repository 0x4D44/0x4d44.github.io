/* Chapter: The haggis chase. Every model's animated SVG, shown only through <img>
   (an SVG loaded as an image cannot run script or fetch anything), then the image models. */
Zoo.chapter("haggis", ["haggis"], function (el, data) {
  var h = Zoo.h, H = data.haggis, DIR = "data/svg/q07-haggis-svg/";

  Zoo.head(el, "Chapter 4", "The haggis chase",
    "A language model cannot see. Ask one to draw and it writes the picture out as code: shapes, colours and coordinates in SVG, with the motion described in the same text. " +
    "Each frame below is exactly what a model wrote, loaded as an image so nothing in it can run. Where the file would not open we made the smallest fix that let it, and say so.",
    H.prompt);

  var svgs = (H.svgs || []).slice();
  var counts = {};
  svgs.forEach(function (s) { counts[s.model] = (counts[s.model] || 0) + 1; });

  function byDate(list) {
    var pos = {};
    Zoo.order(list.map(function (s) { return s.model; })).forEach(function (m, i) { if (pos[m] == null) pos[m] = i; });
    return list.slice().sort(function (a, b) { return pos[a.model] - pos[b.model] || a.sample - b.sample; });
  }
  function byCost(list) {
    return list.slice().sort(function (a, b) { return (a.cost == null ? 1e9 : a.cost) - (b.cost == null ? 1e9 : b.cost); });
  }

  function minutes(s) {
    if (s == null) return "a while";
    if (s < 90) return Math.round(s) + " seconds";
    return Math.round(s / 60) + " minutes";
  }

  function frame(s) {
    if (s.status === "valid" || s.status === "repaired") {
      var file = DIR + s.file + (s.status === "repaired" ? ".repaired.svg" : ".svg");
      return h("div", { class: "frame" }, [h("img", { src: file, loading: "lazy", decoding: "async",
        alt: "Animated SVG by " + Zoo.model(s.model).label + ": a haggis chasing a gamekeeper" })]);
    }
    var why;
    if (s.status === "no-svg") {
      why = s.incomplete
        ? "Thought for " + minutes(s.secs) + ", ran out of tokens and drew nothing. That cost " + Zoo.money(s.cost) + "."
        : "Replied without any SVG (" + (s.note || "no <svg> element") + ").";
    } else if (s.status === "broken") {
      why = "Wrote an SVG that no viewer will open, and no small fix rescued it (" + (s.error || "parse error") + ").";
    } else {
      why = "No picture (" + (s.note || s.status) + ").";
    }
    var kids = [h("p", { text: why })];
    if (s.status === "broken") kids.push(h("a", { href: DIR + s.file + ".svg", text: "The file as written" }));
    return h("div", { class: "frame empty" }, kids);
  }

  function card(s) {
    var head = Zoo.cardHead(s.model);
    if (counts[s.model] > 1) head.insertBefore(h("span", { class: "take", text: "take " + (s.sample + 1) }), head.children[1]);
    var kids = [head, frame(s)];
    var tags = h("div", { class: "tags" });
    if (s.status === "repaired") {
      tags.appendChild(h("span", { class: "badge", tabindex: "0", text: "repaired",
        "data-tip": "Did not open as written (" + (s.error || "parse error") + "). Fixed: " + (s.fixes || []).join("; ") }));
    }
    if (s.unsafe) {
      tags.appendChild(h("span", { class: "badge", tabindex: "0", text: "has script",
        "data-tip": "The SVG contains script, an event handler or an outside link, despite the prompt. Shown as an image, none of it runs." }));
    }
    if (tags.children.length) kids.push(tags);
    if (s.status === "repaired") {
      kids.push(h("details", { class: "fixes" }, [h("summary", { text: "What we fixed" }),
        h("ul", null, (s.fixes || []).map(function (f) { return h("li", { text: f }); })),
        h("p", null, ["Error as written: ", h("code", { text: s.error || "?" }), ". ",
          h("a", { href: DIR + s.file + ".svg", text: "Open the original" }), " (most browsers show an error page)."])]));
    }
    kids.push(Zoo.metaLine(s));
    return h("div", { class: "card" }, kids);
  }

  var grid = h("div", { class: "grid wide svgs" });
  function draw(mode) {
    grid.innerHTML = "";
    (mode === "cost" ? byCost(svgs) : byDate(svgs)).forEach(function (s) { grid.appendChild(card(s)); });
  }

  if (!svgs.length) {
    el.appendChild(h("p", { class: "note", text: "The drawings are still being collected." }));
  } else {
    var nOk = svgs.filter(function (s) { return s.status === "valid"; }).length;
    var nFix = svgs.filter(function (s) { return s.status === "repaired"; }).length;
    var nNone = svgs.length - nOk - nFix;
    el.appendChild(h("p", { class: "note", text: svgs.length + " drawings: " + nOk + " opened as written, " + nFix +
      " needed a one-line repair, " + nNone + " produced no picture." }));
    el.appendChild(Zoo.toggles([{ value: "date", label: "Oldest model first" }, { value: "cost", label: "Cheapest first" }], "date", draw));
    el.appendChild(grid);
    draw("date");
  }

  // Part two: the painters.
  var imgs = H.images || [];
  if (!imgs.length) return;
  el.appendChild(h("h3", { class: "part", text: "The painters" }));
  el.appendChild(h("p", { class: "lede", text: "OpenAI also sells models that paint rather than write. We gave each image model three scenes in plain words. These are pictures, not code, so they look better; they also cost more per attempt than most of the drawings above." }));
  var SCENES = [
    { value: "haggis", label: "The haggis chase" },
    { value: "zoo", label: "A Victorian model zoo" },
    { value: "glasgow", label: "Glasgow in the rain" },
  ];
  var PROMPTS = {
    haggis: "A haggis with stubby legs chasing a red-headed Scottish gamekeeper in tweeds across a purple heather moor, Highland mountains behind, comic and affectionate, wide shot.",
    zoo: "A Victorian zoo where the animals in the enclosures are glowing computer chips of different sizes, families peering at them through the railings, a sign reading 'MODEL ZOO'.",
    glasgow: "A rainy Glasgow street at dusk, red sandstone tenements, reflections in the wet pavement, a single orange umbrella.",
  };
  var pbody = h("div");
  el.appendChild(Zoo.toggles(SCENES, "haggis", paint));
  el.appendChild(pbody);
  paint("haggis");

  function paint(scene) {
    pbody.innerHTML = "";
    pbody.appendChild(h("p", { class: "prompt", text: PROMPTS[scene] }));
    var g = h("div", { class: "grid wide paintings" });
    imgs.filter(function (i) { return i.scene === scene; })
      .sort(function (a, b) { return a.model < b.model ? -1 : a.model > b.model ? 1 : 0; })
      .forEach(function (i) {
        g.appendChild(h("div", { class: "card" }, [
          h("h3", null, [Zoo.name(i.model)]),
          h("div", { class: "frame photo" }, [h("img", { src: "data/images/" + i.file, loading: "lazy", decoding: "async",
            alt: i.model + ": " + PROMPTS[scene] })]),
          h("div", { class: "meta", text: Zoo.secs(i.secs) + " · " + Zoo.money(i.cost) })]));
      });
    pbody.appendChild(g);
  }
});
