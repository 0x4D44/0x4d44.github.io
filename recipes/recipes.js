// ============================================================
// The Kitchen Almanac — recipe data
// ------------------------------------------------------------
// This file is the single source of truth for the cookbook.
// To add a recipe, append ONE object to window.RECIPES below.
// Nothing else needs to change: courses, filter chips and search
// are all derived from this data at load time.
//
// Recipe schema:
//   slug         unique id, used in the URL hash (#/r/<slug>)
//   title        display name
//   course       one of the chips ("Pudding", "Traybake", ...) —
//                new course names create new chips automatically
//   accent       CSS colour for this recipe's flourishes
//   art          SVG <symbol> id from the sprite in index.html
//                (falls back to "art-pot" if missing)
//   serves       string, e.g. "6"
//   prepMin / cookMin   minutes, numbers
//   oven         oven line shown in the meta strip (or null)
//   intro        one or two sentences under the title
//   provenance   where the recipe came from (shown in italics)
//   ingredients  array of { group, items } — use group: null for a
//                single unnamed group. Each item:
//                  { name, metric, imperial, prep }
//                metric/imperial are quantity strings; if only one
//                is known, repeat it in both (the unit toggle then
//                shows the same thing). prep is optional.
//   method       array of step strings
//   serveWith    closing suggestion (or null)
//   tip          optional cook's note (or null)
// ============================================================

window.RECIPES = [
  {
    slug: "apple-crumble",
    title: "Apple Crumble",
    course: "Pudding",
    accent: "#b0522a",
    art: "art-crumble",
    serves: "6",
    prepMin: 20,
    cookMin: 45,
    oven: "180°C / 350°F / Gas 4",
    intro:
      "The proper one — cinnamon-laced apples under a deep, buttery crumble, " +
      "baked until the top browns and the fruit bubbles up around the edges.",
    provenance:
      "Emailed round the family on 20 August 2005 — printed out, folded, and kept ever since.",
    ingredients: [
      {
        group: "For the crumble",
        items: [
          { name: "plain flour", metric: "300g", imperial: "10½oz", prep: "sieved" },
          { name: "salt", metric: "a pinch", imperial: "a pinch" },
          { name: "unrefined brown sugar", metric: "175g", imperial: "6oz" },
          { name: "unsalted butter", metric: "200g", imperial: "7oz", prep: "cubed, at room temperature" },
          { name: "butter", metric: "a knob", imperial: "a knob", prep: "for greasing" },
        ],
      },
      {
        group: "For the filling",
        items: [
          { name: "apples", metric: "450g", imperial: "1lb", prep: "peeled, cored and cut into 1cm/½in pieces" },
          { name: "unrefined brown sugar", metric: "50g", imperial: "2oz" },
          { name: "plain flour", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "ground cinnamon", metric: "a pinch", imperial: "a pinch" },
        ],
      },
    ],
    method: [
      "Preheat the oven to 180°C / 350°F / Gas 4.",
      "Place the flour and sugar in a large bowl and mix well. Taking a few cubes of butter at a time, rub the butter into the flour mixture. Keep rubbing until the mixture resembles breadcrumbs.",
      "Place the fruit in a large bowl and sprinkle over the sugar and cinnamon, with the tablespoon of flour. Stir well, being careful not to break up the fruit.",
      "Butter a 24cm/9in ovenproof dish. Spoon the fruit mixture into the bottom, then sprinkle the crumble mixture evenly on top.",
      "Bake in the oven for 40–45 minutes, until the crumble is browned and the fruit mixture is bubbling.",
      "Serve warm.",
    ],
    serveWith: "Thick cream or custard.",
    tip: null,
  },
  {
    slug: "coconut-crunch-slice",
    title: "Coconut Crunch Slice",
    course: "Traybake",
    accent: "#33735a",
    art: "art-coconut",
    serves: "12 squares",
    prepMin: 10,
    cookMin: 20,
    oven: "180°C / 350°F / Gas 4",
    intro:
      "A five-ingredient traybake from a well-creased handwritten note: melted butter binds " +
      "coconut, crushed cornflakes and flour into a golden slab, finished with a snowfall of icing sugar.",
    provenance:
      "From a handwritten note — creased, stained, and clearly much used. It never had a name, so it has one now.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "self-raising flour", metric: "1 cup", imperial: "1 cup" },
          { name: "cornflakes", metric: "1 cup", imperial: "1 cup", prep: "crushed" },
          { name: "sugar", metric: "3 tbsp", imperial: "3 tbsp" },
          { name: "butter", metric: "115g", imperial: "4oz" },
          { name: "desiccated coconut", metric: "1 cup", imperial: "1 cup" },
          { name: "icing sugar", metric: "to dust", imperial: "to dust" },
        ],
      },
    ],
    method: [
      "Preheat the oven to 180°C / 350°F / Gas 4.",
      "Melt the butter in a large pan over a low heat.",
      "Take the pan off the heat and mix in the flour, crushed cornflakes, sugar and coconut until everything is coated.",
      "Press the mixture firmly and evenly into a greased baking tin.",
      "Bake for 20 minutes, until golden.",
      "Dust with icing sugar, then cut into squares while still warm.",
    ],
    serveWith: null,
    tip: "The note gives no tin size — a 20cm/8in square tin gives a good, biteable thickness.",
  },
];
