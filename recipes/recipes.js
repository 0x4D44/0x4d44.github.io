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
//   servesLabel  optional word for that meta cell ("Makes"); the
//                default is "Serves"
//   prepMin / cookMin   minutes, numbers
//   oven         oven line shown in the meta strip (or null)
//   intro        one or two sentences under the title
//   provenance   where the recipe came from (shown in italics)
//   ingredients  array of { group, items } — use group: null for a
//                single unnamed group. Each item:
//                  { name, metric, imperial, prep }
//                metric/imperial are quantity strings; if only one
//                is known, repeat it in both (the unit toggle only
//                appears when a recipe has genuinely different
//                imperial quantities). prep is optional.
//   variants     optional size selector, e.g.
//                  { label: "Loaf size",
//                    options: ["Small (450g)", "Standard (750g)",
//                              "Large (900g)"], default: 1 }
//                When present, any metric/imperial quantity — and
//                `serves` — may be an ARRAY aligned to options, and
//                the page shows a size switch above the ingredients.
//   method       array of step strings
//   serveWith    closing suggestion (or null)
//   tip          optional cook's note (or null)
//   marginalia   optional array of handwritten margin notes, shown
//                as "Pencilled in the margin" below the method
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
  {
    slug: "mushroom-risotto",
    title: "Mushroom Risotto",
    course: "Supper",
    accent: "#8a6d3b",
    art: "art-risotto",
    serves: "4",
    prepMin: 15,
    cookMin: 30,
    oven: null,
    intro:
      "Onions and mushrooms fried down, arborio rice toasted until it hisses, then " +
      "coaxed to creaminess with white wine, stock and a little patience.",
    provenance:
      "From the family recipe notebook — blue biro on lined paper, each page ghosted with the recipe written on the other side.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "olive oil or butter", metric: "2 tbsp", imperial: "2 tbsp" },
          { name: "onion", metric: "1", imperial: "1", prep: "finely chopped (a red onion is nice)" },
          { name: "garlic", metric: "2 cloves", imperial: "2 cloves", prep: "crushed" },
          { name: "fennel", metric: "½ bulb", imperial: "½ bulb", prep: "finely sliced (optional)" },
          { name: "chestnut mushrooms", metric: "250g", imperial: "9oz", prep: "sliced" },
          { name: "arborio rice", metric: "300g", imperial: "10½oz", prep: "— follow the packet, and no more" },
          { name: "white wine", metric: "a good glass", imperial: "a good glass" },
          { name: "hot vegetable stock", metric: "570ml", imperial: "1 pint" },
          { name: "boiling water", metric: "as needed", imperial: "as needed" },
          { name: "fresh herbs", metric: "a handful", imperial: "a handful", prep: "chopped" },
          { name: "salt and pepper", metric: "to taste", imperial: "to taste" },
          { name: "parmesan", metric: "to serve", imperial: "to serve", prep: "grated" },
        ],
      },
    ],
    method: [
      "Fry the onion and garlic in oil or butter until soft — a red onion and a little fennel are good here.",
      "Add the mushrooms and fry until most of the moisture has gone.",
      "Add the arborio rice — just the amount the packet calls for. Do not deviate; do not put in more.",
      "Wait until the rice is hissing and starting to pop.",
      "Pour in the white wine — as much as you feel like — and stir.",
      "Wait until it has reduced, then add a pint of vegetable stock.",
      "Wait until that has reduced, then check the rice. Keep adding water a little at a time until the rice is completely cooked.",
      "Season with salt, pepper and herbs — fresh ones if you have them.",
      "Finish with a little pepper and grated cheese on top, ideally parmesan.",
      "Eat.",
    ],
    serveWith: null,
    tip: "A risotto won't be hurried — add the liquid slowly, a ladle at a time, and keep it at a gentle simmer, stirring often.",
  },
  {
    slug: "chocolate-cake",
    title: "Chocolate Cake",
    course: "Cake",
    accent: "#5a3921",
    art: "art-choccake",
    serves: "10",
    prepMin: 20,
    cookMin: 90,
    oven: "140°C fan / 160°C / Gas 3",
    intro:
      "A proper creamed sponge, cocoa sifted in and folded through with a metal spoon, " +
      "studded with chocolate chips and baked low and slow so it stays deep and even.",
    provenance:
      "From the family recipe notebook — the cocoa quantity crossed out and nudged up to a full ounce by a later hand.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "caster sugar", metric: "225g", imperial: "8oz" },
          { name: "margarine", metric: "225g", imperial: "8oz", prep: "softened" },
          { name: "eggs", metric: "4", imperial: "4" },
          { name: "self-raising flour", metric: "215g", imperial: "7½oz" },
          { name: "cocoa", metric: "25g", imperial: "1oz" },
          { name: "chocolate chips", metric: "a handful", imperial: "a handful" },
          { name: "butter and flour", metric: "to line the tin", imperial: "to line the tin" },
        ],
      },
    ],
    method: [
      "Cream the butter and sugar together.",
      "Add the eggs one by one, making sure it doesn't curdle. If it starts to separate, add a little of the flour.",
      "Sift the cocoa through a sieve.",
      "Add the cocoa and flour.",
      "Fold it in with a metal spoon — not a wooden one.",
      "Stir through the chocolate chips.",
      "Pour into a greased or lined baking tin — grease and flour it very well.",
      "Bake at 140°C fan for 90 minutes.",
      "Test with a cake tester; it should come out clean.",
    ],
    serveWith: null,
    tip: "Low and slow is the point: the long bake at a gentle heat keeps it from cracking or doming.",
  },
  {
    slug: "macaroni-cheese",
    title: "Macaroni Cheese",
    course: "Supper",
    accent: "#c8922b",
    art: "art-macaroni",
    serves: "4",
    prepMin: 10,
    cookMin: 30,
    oven: "200°C / 400°F / Gas 6",
    intro:
      "A roux started from melted margarine, loosened with milk to a just-right sauce, " +
      "thickened off the heat with plenty of grated cheese, then baked over the macaroni.",
    provenance:
      "From the family recipe notebook — it begins, sensibly, at step zero: boil the kettle.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "margarine", metric: "50g", imperial: "2oz" },
          { name: "plain flour", metric: "50g", imperial: "2oz" },
          { name: "milk", metric: "570ml", imperial: "1 pint", prep: "added gradually" },
          { name: "macaroni", metric: "250g", imperial: "9oz" },
          { name: "mature cheddar", metric: "150g", imperial: "5oz", prep: "grated" },
          { name: "salt and pepper", metric: "to taste", imperial: "to taste" },
        ],
      },
    ],
    method: [
      "Boil the kettle.",
      "Melt the margarine in a pan, then stir in the flour until it goes a bit gloopy.",
      "Add the milk gradually, stirring, until the sauce is thin but not too thin.",
      "Stirring gently over a medium-low heat, put the macaroni on to cook in a pan of boiling water.",
      "When the sauce is about to boil, take it off the heat and let it thicken, then stir in the grated cheese.",
      "Drain the macaroni into a dish, cover with the sauce and bake in the oven until bubbling and golden.",
    ],
    serveWith: null,
    tip: "Take the sauce off the heat before it actually boils, or it can turn grainy.",
  },
  {
    slug: "pasta-sauce",
    title: "Pasta Sauce",
    course: "Supper",
    accent: "#a83232",
    art: "art-pasta",
    serves: "4",
    prepMin: 10,
    cookMin: 25,
    oven: null,
    intro:
      "The weeknight tomato sauce — onions and garlic softened, mushrooms and peppers in, " +
      "a tin of tomatoes and a pinch of mediterranean herbs, then left to reduce.",
    provenance:
      "From the family recipe notebook — sat on the same page as the macaroni cheese.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "olive oil", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "onions", metric: "1", imperial: "1", prep: "chopped" },
          { name: "garlic", metric: "2 cloves", imperial: "2 cloves", prep: "crushed" },
          { name: "mushrooms", metric: "150g", imperial: "5oz", prep: "sliced" },
          { name: "pepper", metric: "1", imperial: "1", prep: "chopped" },
          { name: "wine", metric: "a splash", imperial: "a splash", prep: "optional" },
          { name: "tinned tomatoes", metric: "1 tin (400g)", imperial: "1 tin (14oz)" },
          { name: "mixed or mediterranean herbs", metric: "1 tsp", imperial: "1 tsp" },
        ],
      },
    ],
    method: [
      "Chop the onions and fry in olive oil.",
      "Add the garlic and fry a little longer.",
      "Add the mushrooms and peppers — and a splash of wine, if you like.",
      "Add a tin of tomatoes and a good pinch of mixed (or mediterranean) herbs.",
      "Let it reduce.",
    ],
    serveWith: "Any pasta, with grated cheese.",
    tip: null,
  },
  {
    slug: "curry",
    title: "Curry",
    course: "Supper",
    accent: "#c9761f",
    art: "art-curry",
    serves: "4",
    prepMin: 15,
    cookMin: 45,
    oven: null,
    intro:
      "A simple potato and spinach curry: onions and garlic fried down, curry paste and " +
      "par-cooked potatoes simmered in water, spinach folded in near the end, rice alongside.",
    provenance:
      "From the family recipe notebook — timings pencilled in the margin between the steps.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "sunflower oil", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "onions", metric: "1", imperial: "1", prep: "chopped" },
          { name: "garlic", metric: "2 cloves", imperial: "2 cloves", prep: "crushed" },
          { name: "potatoes", metric: "500g", imperial: "1lb 2oz", prep: "diced" },
          { name: "curry paste", metric: "3 tbsp", imperial: "3 tbsp" },
          { name: "water", metric: "285ml", imperial: "½ pint" },
          { name: "spinach", metric: "2 handfuls", imperial: "2 handfuls" },
          { name: "rice", metric: "to serve", imperial: "to serve" },
          { name: "turmeric", metric: "a pinch", imperial: "a pinch", prep: "for the rice, if needed" },
        ],
      },
    ],
    method: [
      "Fry the onions in sunflower oil.",
      "Add the garlic and fry a little longer.",
      "Microwave the potatoes for 10–15 minutes, or boil them.",
      "Add the curry paste, the potatoes and about half a pint of water.",
      "Leave to simmer, and set the rice to soak.",
      "Thirty minutes later (or longer) — checking now and then that it hasn't caught — add the spinach to the curry and boil the rice, adding a little turmeric if needed.",
      "Fifteen minutes later it's ready to serve.",
    ],
    serveWith: "Rice.",
    tip: "Give it a stir every so often as it simmers so the bottom doesn't catch.",
  },
  {
    slug: "stir-fry",
    title: "Stir Fry",
    course: "Supper",
    accent: "#4f7a34",
    art: "art-stirfry",
    serves: "4",
    prepMin: 20,
    cookMin: 15,
    oven: null,
    intro:
      "Everything chopped and ready, ginger and broccoli into a hot wok first, the rest " +
      "flashed through, noodles cooked and tossed with sesame oil and soy.",
    provenance:
      "From the family recipe notebook — the prep-everything-first kind of recipe, learned the hard way.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "baby sweetcorn", metric: "a handful", imperial: "a handful" },
          { name: "spring onions", metric: "a bunch", imperial: "a bunch" },
          { name: "peppers", metric: "1–2", imperial: "1–2" },
          { name: "onion", metric: "1", imperial: "1" },
          { name: "water chestnuts", metric: "1 tin", imperial: "1 tin" },
          { name: "broccoli", metric: "1 head", imperial: "1 head" },
          { name: "ginger", metric: "a thumb", imperial: "a thumb", prep: "finely chopped" },
          { name: "garlic", metric: "1 clove", imperial: "1 clove", prep: "optional" },
          { name: "vegetable oil", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "sesame oil", metric: "a splash", imperial: "a splash" },
          { name: "water", metric: "70ml", imperial: "⅛ pint" },
          { name: "noodles", metric: "for 4", imperial: "for 4" },
          { name: "stir-fry sauce", metric: "1 jar or sachet", imperial: "1 jar or sachet" },
          { name: "soy sauce", metric: "to taste", imperial: "to taste" },
          { name: "frozen beans or peas", metric: "a handful", imperial: "a handful", prep: "optional" },
        ],
      },
    ],
    method: [
      "Chop all the vegetables — baby sweetcorn, spring onions, peppers, onions, water chestnuts and broccoli.",
      "Chop some ginger very finely.",
      "Boil the kettle.",
      "Heat vegetable oil and a splash of sesame oil in a wok.",
      "Add the ginger and fry — and the garlic too, if you like.",
      "Add the broccoli and a little water (about ⅛ pint).",
      "Fry until the water has gone.",
      "Add everything else and stir-fry for a couple of minutes.",
      "Put the noodles on to cook and add the stir-fry sauce.",
      "Three minutes later, drain the noodles. Add any frozen beans or peas to the stir-fry.",
      "Put a little sesame oil over the noodles and fry them for three or four minutes in a saucepan, then add soy sauce.",
      "Serve.",
    ],
    serveWith: null,
    tip: "A wok worth its name wants a high heat — get it hot before anything goes in, and keep it all moving.",
  },
  {
    slug: "chocolate-chip-cookies",
    title: "Chocolate Chip Cookies",
    course: "Biscuits",
    accent: "#7a4a24",
    art: "art-cookies",
    serves: "about 18",
    prepMin: 15,
    cookMin: 10,
    oven: "180°C / 350°F / Gas 4",
    intro:
      "Creamed butter and sugar, flour and egg, a tablespoon of golden syrup for chew, " +
      "chocolate chips and a drop of vanilla, rolled into little balls and baked.",
    provenance:
      "From the family recipe notebook — with the note that it doesn't need creaming as thoroughly as a cake.",
    ingredients: [
      {
        group: null,
        items: [
          { name: "butter or margarine", metric: "85g", imperial: "3oz" },
          { name: "sugar", metric: "115g", imperial: "4oz" },
          { name: "self-raising flour", metric: "170g", imperial: "6oz" },
          { name: "golden syrup", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "egg", metric: "1", imperial: "1" },
          { name: "chocolate chips", metric: "a handful", imperial: "a handful" },
          { name: "vanilla essence", metric: "2 drops", imperial: "2 drops" },
        ],
      },
    ],
    method: [
      "Cream the butter and sugar together.",
      "Add the egg and flour.",
      "Add the golden syrup — it doesn't need creaming as thoroughly as a cake.",
      "Stir in the chocolate chips.",
      "Add two drops of vanilla essence.",
      "Roll into little balls.",
      "Bake at 180°C for 10 minutes.",
    ],
    serveWith: null,
    tip: "They spread as they bake — leave a good gap between the balls on the tray.",
  },
  {
    slug: "mexican-chilli",
    title: "Mexican",
    course: "Supper",
    accent: "#b5451f",
    art: "art-mexican",
    serves: "4",
    prepMin: 20,
    cookMin: 45,
    oven: null,
    intro:
      "A kidney-bean chilli with a Cajun kick, simmered while the rice soaks, then brought " +
      "to the table with warm tortillas, seared pepper strips, grated cheese and soured cream.",
    provenance:
      "From the family recipe notebook — the recipe that comes with a whole spread to set out.",
    ingredients: [
      {
        group: "For the chilli",
        items: [
          { name: "vegetable oil", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "onions", metric: "1", imperial: "1", prep: "chopped" },
          { name: "garlic", metric: "2 cloves", imperial: "2 cloves", prep: "crushed" },
          { name: "chilli pepper", metric: "1", imperial: "1", prep: "chopped (optional)" },
          { name: "Cajun hot pepper sauce", metric: "a little", imperial: "a little" },
          { name: "kidney beans", metric: "1 tin", imperial: "1 tin", prep: "well drained" },
          { name: "tinned tomatoes", metric: "2 tins (400g each)", imperial: "2 tins (14oz each)" },
        ],
      },
      {
        group: "To serve",
        items: [
          { name: "rice", metric: "for 4", imperial: "for 4" },
          { name: "tortillas", metric: "for 4", imperial: "for 4" },
          { name: "peppers", metric: "2", imperial: "2", prep: "cut into strips" },
          { name: "cheese", metric: "to serve", imperial: "to serve", prep: "grated" },
          { name: "soured cream", metric: "to serve", imperial: "to serve" },
        ],
      },
    ],
    method: [
      "Fry the onions in vegetable oil. Add the garlic, and a chopped chilli pepper too if you like.",
      "Fry until soft.",
      "Add a little Cajun hot pepper sauce.",
      "Add a well-drained tin of kidney beans and two tins of tomatoes.",
      "Soak the rice while the chilli cooks — about thirty minutes.",
      "Put the rice on, and prepare the tortillas.",
      "About ten minutes on, grate the cheese, get the soured cream out, put the tortillas in the microwave and cut the peppers into strips.",
      "Fry the peppers in a wok over a very high heat for a couple of minutes, until they begin to sear.",
      "Serve.",
    ],
    serveWith: "Warm tortillas, rice, grated cheese, seared peppers and soured cream.",
    tip: null,
  },
  {
    slug: "white-wine-mushroom-pasta",
    title: "White Wine & Mushroom Pasta Sauce",
    course: "Supper",
    accent: "#7d8c4e",
    art: "art-winesauce",
    serves: "4",
    prepMin: 10,
    cookMin: 25,
    oven: null,
    intro:
      "Two pans working at once: onion, garlic and white wine reduced almost dry then " +
      "enriched with cream, mushrooms cooked gently apart and folded in, over tagliatelle.",
    provenance:
      "From the family recipe notebook — the two-pan method set out step by careful step.",
    ingredients: [
      {
        group: "Pan 1",
        items: [
          { name: "onion", metric: "1", imperial: "1", prep: "finely chopped" },
          { name: "garlic", metric: "2 cloves", imperial: "2 cloves", prep: "crushed" },
          { name: "white wine", metric: "¼ bottle", imperial: "¼ bottle" },
          { name: "single cream", metric: "300ml", imperial: "½ pint" },
          { name: "salt and pepper", metric: "to taste", imperial: "to taste" },
        ],
      },
      {
        group: "Pan 2",
        items: [
          { name: "oil", metric: "1 tbsp", imperial: "1 tbsp" },
          { name: "butter", metric: "a knob", imperial: "a knob" },
          { name: "mushrooms", metric: "250g", imperial: "9oz", prep: "sliced" },
        ],
      },
      {
        group: "To serve",
        items: [
          { name: "tagliatelle", metric: "for 4", imperial: "for 4" },
        ],
      },
    ],
    method: [
      "In pan 1, fry a finely chopped onion.",
      "Add the garlic.",
      "Add a quarter of a bottle of white wine.",
      "Let the wine reduce.",
      "In pan 2, add oil and butter.",
      "Gently cook the sliced mushrooms in pan 2 over a low heat.",
      "When the wine in pan 1 has reduced right down — virtually no liquid left — stir in the single cream.",
      "Wait until the cream is just about boiling, stirring occasionally.",
      "Add the mushrooms to pan 1.",
      "Season to taste.",
      "Serve with tagliatelle.",
    ],
    serveWith: "Tagliatelle.",
    tip: null,
  },
  {
    slug: "simple-white-loaf",
    title: "Simple White Loaf",
    course: "Bread",
    accent: "#c28a2e",
    art: "art-loaf",
    serves: ["a 450g loaf", "a 750g loaf", "a 900g loaf"],
    servesLabel: "Makes",
    prepMin: 10,
    cookMin: 180,
    oven: null,
    intro:
      "The bread-machine staple — soft and light with an open texture, while the golden " +
      "crust is finished with a very light dusting of flour. The excellent starting point.",
    provenance:
      "Page 36 of the bread-machine book, complete with the family's pencilled millilitre conversions and verdicts in the margin.",
    variants: {
      label: "Loaf size",
      options: ["Small (450g)", "Standard (750g)", "Large (900g)"],
      default: 1,
    },
    ingredients: [
      {
        group: null,
        items: [
          { name: "water", metric: ["195ml", "325ml", "390ml"] },
          { name: "sunflower oil", metric: ["1 tbsp", "2 tbsp", "2 tbsp"] },
          { name: "strong white bread flour", metric: ["300g + ½ tsp", "500g + 1 tsp", "600g + 1 tsp"], prep: "the extra spoonful is for dusting the top" },
          { name: "salt", metric: ["¾ tsp", "1¼ tsp", "1½ tsp"] },
          { name: "caster sugar", metric: ["2 tsp", "1 tbsp", "4 tsp"] },
          { name: "fast-action dried yeast", metric: ["¾ tsp", "1 tsp", "1½ tsp"] },
        ],
      },
    ],
    method: [
      "Lift the bread pan out of the bread machine and fit the kneading blade. Pour in the water, then add the oil, followed by the flour.",
      "Put the salt and sugar in separate corners of the pan, then make a shallow dip in the middle of the flour and add the yeast.",
      "Fit the pan into the bread machine, shut the lid and set to the basic white setting with a crust of your choice. Press start.",
      "After baking, lift the pan out of the machine using oven gloves. Carefully shake out the loaf to remove it from the pan, then transfer to a wire rack, standing the loaf on its base.",
      "Lightly dust the top with the remaining spoonful of flour while the loaf is hot. Leave to cool.",
    ],
    serveWith: null,
    tip:
      "If preferred, brush the top of the dough with water and sprinkle with the flour just " +
      "before baking starts — or leave the crust plain and unfloured.",
    marginalia: [
      "less salt — maybe 0.5 tsp?",
      "use strongest (burntest) crust",
      "texture good, too salty — use more crust",
    ],
  },
  {
    slug: "granary-loaf",
    title: "Granary Loaf",
    course: "Bread",
    accent: "#7a5230",
    art: "art-granary",
    serves: ["a 450g loaf", "a 750g loaf", "a 900g loaf"],
    servesLabel: "Makes",
    prepMin: 10,
    cookMin: 220,
    oven: null,
    intro:
      "Granary flour's unique taste comes from malting the wheat, where partially germinated " +
      "grains are slowly toasted — sweetness and a slightly crunchy texture that works with " +
      "savoury and sweet accompaniments alike.",
    provenance:
      "Page 52 of the bread-machine book — the wholewheat setting, medium crust.",
    variants: {
      label: "Loaf size",
      options: ["Small (450g)", "Standard (750g)", "Large (900g)"],
      default: 1,
    },
    ingredients: [
      {
        group: null,
        items: [
          { name: "water", metric: ["200ml", "350ml", "400ml"] },
          { name: "butter", metric: ["15g", "25g", "30g"], prep: "at room temperature" },
          { name: "Granary bread flour", metric: ["300g", "500g", "600g"] },
          { name: "salt", metric: ["¾ tsp", "1½ tsp", "1¾ tsp"] },
          { name: "light soft brown sugar", metric: ["2 tsp", "1 tbsp", "4 tsp"] },
          { name: "fast-action dried yeast", metric: ["¾ tsp", "1¼ tsp", "1½ tsp"] },
        ],
      },
    ],
    method: [
      "Lift the bread pan out of the bread machine and fit the kneading blade. Pour in the water, then add the butter, followed by the flour.",
      "Put the salt and sugar in separate corners of the pan, then make a shallow dip in the middle of the flour and add the yeast.",
      "Fit the pan into the bread machine, shut the lid and set to the wholewheat setting with a medium crust. Press start.",
      "After baking, lift the pan out of the machine using oven gloves. Carefully shake out the loaf to remove it from the pan, then transfer to a wire rack, standing the loaf on its base. Leave to cool.",
    ],
    serveWith: null,
    tip: "Malthouse flour may be used instead of Granary bread flour, if preferred.",
    marginalia: null,
  },
];
