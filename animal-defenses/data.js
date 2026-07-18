// ============================================================
// The Defensive — a bestiary of animal defence mechanisms
// ------------------------------------------------------------
// Single source of truth for the whole site. `window.CATS` defines the
// seven defence families (id, label, colour, one-line gloss). `window.BEASTS`
// is the roster: each creature is one object. `app.js` reads both and builds
// every view (gallery, dossier, lab demos, field chart, quiz) from them.
//
// Add a creature by appending one object; add it to a category that exists in
// CATS. `weird` and `danger` are 1–10 editorial scores (they place the dot on
// the field chart and drive the quiz). `demo` (optional) names an interactive
// built in app.js; leave it off for a static dossier. Facts are short, load-
// bearing "wow" lines — keep them true.
// ============================================================

// Colours are the validated dark-mode categorical hues (see data-viz palette),
// assigned in fixed order — never recoloured when the gallery is filtered.
window.CATS = [
  { id: "chemical", label: "Chemical Warfare",   color: "#3987e5",
    gloss: "Boiling sprays, acids and stinks brewed in the body's own glands." },
  { id: "horror",   label: "Body Horror",        color: "#e66767",
    gloss: "Defences that wound the defender — broken bones, split skin, self-detonation." },
  { id: "slime",    label: "Slime & Goo",        color: "#199e70",
    gloss: "Glue, gel and mucus fired, oozed or vomited to foul a predator." },
  { id: "illusion", label: "Ink, Light & Illusion", color: "#9085e9",
    gloss: "Camouflage, mimicry, ink clouds and light that erases a silhouette." },
  { id: "armour",   label: "Armour & Autotomy",  color: "#c98500",
    gloss: "Scales, quills, inflation — and the trick of leaving a body part behind." },
  { id: "stolen",   label: "Borrowed Arms",      color: "#d55181",
    gloss: "Weapons stolen from other species: stings, poisons and living gloves." },
  { id: "shock",    label: "Venom & Voltage",    color: "#d95926",
    gloss: "Electricity, cavitation and some of the deadliest toxins in nature." },
];

window.BEASTS = [
  // ---- Chemical Warfare -------------------------------------------------
  {
    id: "bombardier-beetle", name: "Bombardier Beetle", sci: "Brachinus spp.",
    glyph: "🪲", art: "d-bombardier", cat: "chemical",
    region: "Worldwide, temperate & tropical", size: "5–15 mm",
    weird: 9, danger: 3, demo: "bombardier",
    tag: "Fires boiling chemicals out of its backside — in machine-gun pulses.",
    how: "Two glands feed a reinforced reaction chamber. When threatened, the beetle mixes hydroquinones and hydrogen peroxide over catalase and peroxidase enzymes. The reaction flashes to 100 °C and detonates, blasting a jet of caustic benzoquinone from a swivelling nozzle on the tip of its abdomen.",
    facts: [
      "The spray leaves the body at 100 °C — the temperature of boiling water.",
      "It isn't one squirt but a burst of ~70–1,000 micro-pulses a second, which stops the chamber melting — the same trick a pulse-jet engine uses.",
      "The rear turret can aim through nearly 270°, hosing an attacker front, side or back.",
      "A swallowed beetle can fire inside a toad's stomach and make it vomit the beetle back up, alive, up to 90 minutes later.",
    ],
  },
  {
    id: "sea-hare", name: "Sea Hare", sci: "Aplysia spp.",
    glyph: "🐌", art: "d-seahare", cat: "chemical",
    region: "Warm coastal seas", size: "Up to 75 cm, 2 kg",
    weird: 7, danger: 2,
    tag: "Fires two inks that switch a predator's sense of smell off.",
    how: "This giant sea slug eats red algae and recycles the pigment into a purple ink. Attacked, it releases the ink together with a white secretion called opaline. Together they act like chemical tear-gas — the opaline floods a predator's smell-and-taste receptors, blinding its chemical senses.",
    facts: [
      "The purple ink is made from the same pigment family (phycoerythrin) that colours the algae it eats.",
      "Opaline can make a spiny lobster groom itself uncontrollably, as if covered in phantom food, ignoring the escaping slug.",
      "It's a belt-and-braces defence: the ink is a smokescreen, the opaline is a nerve-jammer.",
    ],
  },
  {
    id: "spitting-cobra", name: "Spitting Cobra", sci: "Naja spp.",
    glyph: "🐍", art: "d-cobra", cat: "chemical",
    region: "Africa & Asia", size: "1–2.5 m",
    weird: 6, danger: 8,
    tag: "Sprays venom at your eyes with sniper accuracy.",
    how: "The fangs of a spitting cobra have a forward-facing hole, like a nozzle. Muscles clamp the venom gland and fire a fine double jet up to 2.5 m. It doesn't aim at the body — it aims at the eyes, and it hits them.",
    facts: [
      "High-speed video shows the snake reads a face and geysers venom straight at the eyes, tracking movement in a fraction of a second.",
      "The venom is specially tuned: it contains extra nerve-toxin that makes eye contact instantly, blindingly painful.",
      "It is a pure warning weapon — the snake would rather dazzle and flee than waste venom biting something too big to eat.",
    ],
  },
  {
    id: "vinegaroon", name: "Vinegaroon", sci: "Mastigoproctus giganteus",
    glyph: "🦂", art: "d-vinegaroon", cat: "chemical",
    region: "Americas, arid zones", size: "Up to 8 cm",
    weird: 7, danger: 1,
    tag: "Sprays concentrated vinegar from a whip on its tail.",
    how: "This tailless 'whip scorpion' has no venom and no sting. Instead a turret at the base of its whip-like tail swivels toward a threat and sprays a mist that is up to 85% acetic acid — far stronger than kitchen vinegar — laced with caprylic acid to help it soak through an insect's waxy shell.",
    facts: [
      "The spray smells overwhelmingly of vinegar — which is how the animal got its name.",
      "The tail turret rotates to track the attacker before firing, aiming the acid where it lands.",
      "The caprylic acid dissolves the waterproof coating of an insect predator, so the acid burns straight in.",
    ],
  },
  {
    id: "cyanide-millipede", name: "Cyanide Millipede", sci: "Harpaphe haydeniana",
    glyph: "🐛", art: "d-millipede", cat: "chemical",
    region: "Pacific coast of North America", size: "4–5 cm",
    weird: 8, danger: 4,
    tag: "Curls up and oozes cyanide that smells of almonds.",
    how: "Threatened, the 'yellow-spotted millipede' coils into a spiral and secretes hydrogen cyanide — one of the fastest poisons known — from glands along its body. It manufactures the cyanide on demand by mixing two stored chemicals only at the moment of attack.",
    facts: [
      "The gas smells of toasted almonds, the classic tell-tale odour of cyanide.",
      "Its bright yellow-and-black colouring is honest advertising: eat me and be poisoned.",
      "A related Californian millipede, Motyxia, glows an eerie blue-green in the dark for the same 'don't touch' message.",
    ],
  },
  {
    id: "puss-moth-caterpillar", name: "Puss Moth Caterpillar", sci: "Cerura vinula",
    glyph: "🐛", art: "d-pussmoth", cat: "chemical",
    region: "Europe & Asia", size: "Up to 8 cm",
    weird: 8, danger: 2,
    tag: "Pulls a screaming red face and sprays formic acid.",
    how: "A soft green caterpillar with an extraordinary threat routine. Disturbed, it retracts its head into a bright pink-and-black 'mask' with two false eyes, waves two red whips from its tail, and — if that fails — sprays formic acid from a gland below its head.",
    facts: [
      "The retracted 'face' is a deimatic (startle) display — a fake, furious cartoon face to make a bird flinch.",
      "The two red tail filaments lash the air to look like extra weapons.",
      "Only if the theatre fails does it resort to the chemical option: a jet of stinging formic acid.",
    ],
  },

  // ---- Body Horror ------------------------------------------------------
  {
    id: "horned-lizard", name: "Texas Horned Lizard", sci: "Phrynosoma cornutum",
    glyph: "🦎", art: "d-hornedlizard", cat: "horror",
    region: "Southern US & Mexico", size: "7–13 cm",
    weird: 10, danger: 2, demo: "bloodsquirt",
    tag: "Squirts a jet of its own blood out of its eyes.",
    how: "Cornered by a coyote or fox, the horned lizard clamps the veins draining its head. Blood pressure spikes until small vessels in the corners of its eyes burst, firing a thin stream of foul-tasting blood up to 1.5 m into the predator's mouth.",
    facts: [
      "The blood is laced with a compound the lizard concentrates from the venomous harvester ants it eats — it tastes revolting to dogs, wolves and coyotes.",
      "It can lose up to a third of its blood volume in a single defensive display.",
      "Curiously the trick barely works on birds or snakes — it's aimed squarely at the canine palate.",
    ],
  },
  {
    id: "hairy-frog", name: "Hairy Frog", sci: "Trichobatrachus robustus",
    glyph: "🐸", art: "d-hairyfrog", cat: "horror",
    region: "Central Africa", size: "9–13 cm",
    weird: 10, danger: 3,
    tag: "Breaks its own toe bones to stab out retractable claws.",
    how: "The 'horror frog' has no true claws at rest. When grabbed, it actively breaks the bones at the tips of its toes and drives the jagged ends out through the skin of its feet — a set of bony claws, punched out through its own flesh, exactly like Wolverine.",
    facts: [
      "The claw is a sharpened sliver of the frog's own toe bone, forced through the skin — there is no pre-formed slot for it.",
      "Nobody has confirmed how the claw retracts; it may simply slide back as the tissue heals.",
      "Males also grow the 'hairs' it's named for — thin skin filaments that soak up extra oxygen while guarding eggs.",
    ],
  },
  {
    id: "iberian-newt", name: "Iberian Ribbed Newt", sci: "Pleurodeles waltl",
    glyph: "🦎", art: "d-newt", cat: "horror",
    region: "Iberia & Morocco", size: "Up to 30 cm",
    weird: 10, danger: 4,
    tag: "Pushes its own ribs out through its skin as poison spines.",
    how: "When attacked, this newt swings its ribs forward and up to a 50° angle and shoves them clean through special warty patches along its sides. The rib tips emerge as rows of spikes — and skin glands flood them with poison, turning the newt into a self-assembling venomous pincushion.",
    facts: [
      "The ribs pierce the skin every time it's threatened; the wounds heal, and it can do it again and again with no sign of infection.",
      "Poison and spike arrive together: the ribs push through exactly where toxic glands sit, so each spine delivers a dose.",
      "It's one of very few animals known to deliberately drive its own skeleton through its skin as a weapon.",
    ],
  },
  {
    id: "exploding-ant", name: "Exploding Ant", sci: "Colobopsis explodens",
    glyph: "🐜", art: "d-explodingant", cat: "horror",
    region: "Borneo rainforest", size: "~5 mm",
    weird: 9, danger: 2, demo: "explode",
    tag: "Ruptures its own body to glue attackers in toxic slime.",
    how: "Minor workers of this canopy ant defend the colony by self-destructing. Clamping onto an intruder, the ant violently contracts its abdomen until the body wall bursts, spraying a sticky, bright-yellow, toxic goo that entangles and poisons the attacker — killing the ant in the act.",
    facts: [
      "The suicidal glue is stored in two oversized glands that run the whole length of the body.",
      "It smells faintly of curry, and gave the species its nickname before it was formally named in 2018.",
      "This is 'autothysis' — self-sacrifice for the colony — the same logic that makes a worker bee's sting fatal to itself.",
    ],
  },
  {
    id: "sea-cucumber", name: "Sea Cucumber", sci: "Holothuroidea",
    glyph: "🥒", art: "d-cucumber", cat: "horror",
    region: "All oceans, seabed", size: "3 cm – 3 m",
    weird: 9, danger: 2,
    tag: "Fires its own guts out of its bottom — then grows new ones.",
    how: "A sea cucumber under attack can violently expel part of its own internal organs through its anus (or split its body wall). Some species eject sticky, elongating Cuvierian tubules that swell into a tangle of toxic threads; the predator is left fighting a knot of glue while the cucumber crawls away — and regenerates the lost organs.",
    facts: [
      "The ejected Cuvierian tubules can lengthen twenty-fold in seconds and are laced with toxins called saponins.",
      "It regrows the entire discarded gut over a few weeks — the organs are, in effect, disposable.",
      "Some also liquefy their own body wall on cue, turning briefly from firm to near-liquid to squeeze into cracks.",
    ],
  },
  {
    id: "fulmar-chick", name: "Fulmar Chick", sci: "Fulmarus glacialis",
    glyph: "🐦", art: "d-fulmar", cat: "horror",
    region: "North Atlantic & Pacific cliffs", size: "Chick, palm-sized",
    weird: 8, danger: 3,
    tag: "Projectile-vomits oil that can be a death sentence for a bird.",
    how: "A fulmar chick, stuck on a cliff ledge, defends itself by vomiting a jet of foul, waxy orange stomach oil over any approaching predator. For a feathered attacker it is lethal: the oil mats and destroys the waterproofing and insulation of the feathers.",
    facts: [
      "A bird that dives into the sea with oiled feathers can lose its buoyancy and waterproofing — and drown or freeze.",
      "The oil reeks so strongly of stale fish that a hit garment never fully loses the smell.",
      "'Fulmar' comes from Old Norse for 'foul gull' — the birds have been notorious for this for a thousand years.",
    ],
  },

  // ---- Slime & Goo ------------------------------------------------------
  {
    id: "hagfish", name: "Hagfish", sci: "Myxini",
    glyph: "🐟", art: "d-hagfish", cat: "slime",
    region: "Cold ocean floors, worldwide", size: "40–80 cm",
    weird: 10, danger: 2, demo: "slime",
    tag: "Turns a bucket of seawater to jelly in seconds to choke predators.",
    how: "Attacked, a hagfish releases a tiny amount of thread-and-mucus from a row of pores. On contact with seawater it explodes into litres of gluey slime, clogging the gills of any fish trying to eat it. The predator either lets go or suffocates.",
    facts: [
      "A single hagfish can turn a 20-litre bucket of water into slime in minutes.",
      "The slime is reinforced with thousands of coiled protein threads, each thinner than a hair but stronger, that unspool on contact — being studied as a natural super-fibre.",
      "To avoid choking on its own slime, the hagfish ties itself into a sliding overhand knot and wipes itself clean.",
      "In a famous 2017 crash, an overturned truck buried a road in Oregon under a lorry-load of released hagfish slime.",
    ],
  },
  {
    id: "velvet-worm", name: "Velvet Worm", sci: "Onychophora",
    glyph: "🐛", art: "d-velvetworm", cat: "slime",
    region: "Tropical & temperate leaf litter", size: "1–20 cm",
    weird: 9, danger: 2,
    tag: "Hoses down attackers and prey with twin jets of instant glue.",
    how: "From two nozzles beside its mouth, the velvet worm fires paired jets of protein slime that whip side to side in flight, laying down a net of sticky threads. The glue sets in seconds, gluing an attacker (or dinner) to the spot.",
    facts: [
      "The slime jets oscillate up to 60 times a second — not from muscle aiming, but from the fluid making the flexible nozzle flail on its own.",
      "It can fling the net several times its own body length.",
      "The glue is water-soluble as it dries, so the worm can eat the spent threads and recycle the protein.",
    ],
  },
  {
    id: "parrotfish", name: "Parrotfish", sci: "Scaridae",
    glyph: "🐠", art: "d-parrotfish", cat: "slime",
    region: "Tropical reefs", size: "30–130 cm",
    weird: 7, danger: 1,
    tag: "Sleeps zipped inside a sleeping bag of its own snot.",
    how: "At nightfall many parrotfish spend up to an hour spinning a transparent cocoon of mucus from a gland behind the gills, and sleep sealed inside it until dawn. The bubble is a chemical mosquito-net that hides the fish's scent and blocks parasites.",
    facts: [
      "The mucus tent masks the sleeping fish's smell from night hunters like moray eels that hunt by scent.",
      "It also physically screens out tiny blood-sucking parasites (gnathiid isopods) — fish without a cocoon get bitten far more.",
      "Building it costs about 2.5% of the fish's daily energy — a price worth paying for a safe night's sleep.",
    ],
  },
  {
    id: "opossum", name: "Virginia Opossum", sci: "Didelphis virginiana",
    glyph: "🐀", art: "d-opossum", cat: "slime",
    region: "North & Central America", size: "35–55 cm body",
    weird: 8, danger: 1,
    tag: "Faints into a convincing, stinking corpse for hours.",
    how: "'Playing possum' isn't acting — it's an involuntary faint. Overwhelmed by a threat, the opossum collapses into a rigid, open-mouthed coma, and its anal glands leak a foul, corpse-like smell. To a predator after live prey, it becomes an unappetising, apparently rotting carcass.",
    facts: [
      "The state can last from a few minutes to several hours, and the animal can't snap out of it at will.",
      "The greenish anal-gland secretion mimics the stench of decay — a smell, not just a pose.",
      "Its low body temperature also gives it near-total immunity to snake venom and a startling resistance to rabies.",
    ],
  },

  // ---- Ink, Light & Illusion --------------------------------------------
  {
    id: "octopus", name: "Common Octopus", sci: "Octopus vulgaris",
    glyph: "🐙", art: "d-octopus", cat: "illusion",
    region: "Warm & temperate seas", size: "Up to 1 m across",
    weird: 9, danger: 3, demo: "camo",
    tag: "Repaints its whole skin in a third of a second — while colour-blind.",
    how: "An octopus's skin holds millions of colour cells (chromatophores) it squeezes open and shut, over layers that reflect and scatter light, plus muscles that pucker the skin into 3-D texture. It can match a background's colour, pattern and bumpiness almost instantly — then vanish in a puff of ink if that fails.",
    facts: [
      "It can change colour and texture in as little as 0.3 seconds — and yet, as far as we can tell, it is completely colour-blind.",
      "The ink cloud is a decoy: it holds its shape roughly the size of the octopus, so a predator lunges at the ghost while the real animal jets away.",
      "The ink also contains a compound that dulls a predator's sense of smell, hiding the escape route.",
    ],
  },
  {
    id: "mimic-octopus", name: "Mimic Octopus", sci: "Thaumoctopus mimicus",
    glyph: "🐙", art: "d-mimic", cat: "illusion",
    region: "Indo-Pacific, silty seabeds", size: "~60 cm",
    weird: 10, danger: 3,
    tag: "Impersonates a lionfish, a sea snake or a flatfish on demand.",
    how: "Discovered only in 1998, this octopus doesn't just camouflage — it does impressions. It can flatten and streak itself to swim like a poisonous flatfish, splay its arms into the banded spines of a lionfish, or hide six arms and wave two as a venomous sea snake, apparently choosing the act to suit the threat.",
    facts: [
      "It seems to pick its disguise for the occasion — reportedly mimicking a sea snake precisely when harassed by a snake-hunting damselfish.",
      "Every animal it copies is venomous or toxic — it's borrowing other species' reputations.",
      "Its whole repertoire may run to a dozen or more different impersonations.",
    ],
  },
  {
    id: "cuttlefish", name: "Cuttlefish", sci: "Sepia spp.",
    glyph: "🦑", art: "d-cuttlefish", cat: "illusion",
    region: "Shallow seas, worldwide (not the Americas)", size: "15–50 cm",
    weird: 9, danger: 2,
    tag: "Runs a hypnotic storm of moving stripes across its skin.",
    how: "Beyond camouflage, a cuttlefish can throw a deimatic display: dark bands of colour race across its body in a 'passing-cloud' pattern, a moving optical illusion that can freeze or mesmerise small prey and startle predators. It can even show two different messages on its two flanks at once.",
    facts: [
      "The 'passing cloud' is waves of pigment sweeping over the skin — a living animation, not a fixed pattern.",
      "A courting male can flash mating colours to a female on one side of his body while showing drab camouflage to a rival on the other.",
      "Like the octopus, it does all of this while being effectively colour-blind, reading light with a single visual pigment.",
    ],
  },
  {
    id: "vampire-squid", name: "Vampire Squid", sci: "Vampyroteuthis infernalis",
    glyph: "🦑", art: "d-vampiresquid", cat: "illusion",
    region: "Deep ocean 'oxygen minimum zone'", size: "~30 cm",
    weird: 10, danger: 1,
    tag: "Turns itself inside-out into a cloak of spines, and bleeds light.",
    how: "Living too deep for ink to work, the 'vampire squid from hell' defends itself with light and shape. It draws its webbed arms up over its head and body, turning inside-out into a spiny black 'pineapple posture'. If pressed, it sheds clouds of glowing blue mucus from its arm tips to dazzle and confuse.",
    facts: [
      "It has no ink sac — useless in the pitch dark — so it fires bioluminescent mucus instead.",
      "Light organs at its arm tips and across its body can flash and glow to break up its outline.",
      "Despite the name it drinks no blood — it drifts eating 'marine snow', the falling debris of the sea.",
    ],
  },
  {
    id: "firefly-squid", name: "Firefly Squid", sci: "Watasenia scintillans",
    glyph: "🦑", art: "d-fireflysquid", cat: "illusion",
    region: "Deep waters off Japan", size: "~7 cm",
    weird: 8, danger: 1,
    tag: "Erases its own shadow by glowing on its belly.",
    how: "Seen from below against the faint light from the surface, any animal is a dark silhouette — an easy target. The firefly squid cancels its shadow with counter-illumination: hundreds of light organs (photophores) on its underside glow to exactly match the brightness of the water above, so from beneath it seems to disappear.",
    facts: [
      "It carries thousands of photophores, with clusters on the arm tips and rings around the eyes.",
      "It can tune its belly glow to match the changing surface light, staying invisible from below.",
      "Each spring, millions wash into Toyama Bay to spawn and turn the shoreline electric blue.",
    ],
  },

  // ---- Armour & Autotomy ------------------------------------------------
  {
    id: "pangolin", name: "Pangolin", sci: "Manis / Smutsia / Phataginus",
    glyph: "🦔", art: "d-pangolin", cat: "armour",
    region: "Africa & Asia", size: "30–100 cm",
    weird: 8, danger: 1,
    tag: "Rolls into a ball of blades no big cat can open.",
    how: "The only mammal fully covered in scales. Each overlapping plate is keratin — the stuff of your fingernails — with a razor edge. Threatened, the pangolin tucks its head under its tail and rolls into a tight, near-impregnable ball, and can flex the scales to slice anything that pushes between them.",
    facts: [
      "A rolled pangolin defeats lions and tigers — they simply can't get a grip or a bite in.",
      "Its scales make up about 20% of its whole body weight.",
      "The muscular tail can lash out, using the scale edges as a set of moving knives.",
    ],
  },
  {
    id: "armadillo", name: "Three-Banded Armadillo", sci: "Tolypeutes spp.",
    glyph: "🦔", art: "d-armadillo", cat: "armour",
    region: "South America", size: "~25 cm",
    weird: 7, danger: 1,
    tag: "The only armadillo that can seal into a perfect armoured ball.",
    how: "Most armadillos can't actually roll up — but the three-banded can. Its bony shell has loose bands and a built-in gap that let it fold head-to-tail into a sphere, snapping shut on itself like a puzzle box with no soft parts left exposed.",
    facts: [
      "It leaves a small gap open as a trap — snap it shut on a probing paw or nose and the predator recoils.",
      "The armour is bone (osteoderms) covered in horny scutes — a fused, tank-like carapace.",
      "It doesn't need to dig a burrow to hide; it just becomes an unbreakable ball on the spot.",
    ],
  },
  {
    id: "porcupine", name: "Crested Porcupine", sci: "Hystrix cristata",
    glyph: "🦔", art: "d-porcupine", cat: "armour",
    region: "Africa & Italy", size: "60–90 cm",
    weird: 7, danger: 4,
    tag: "Reverses into you and leaves barbed spears behind.",
    how: "A porcupine can't throw its quills — but it doesn't need to. It raises up to 30,000 quills, rattles hollow ones as a warning, then charges backwards into the attacker. The barbed quills detach on contact and work their way inward with every muscle movement of the victim.",
    facts: [
      "The tips are covered in microscopic backward-facing barbs — easy to drive in, agony to pull out.",
      "Lions, leopards and hyenas are regularly found crippled or killed by quills that migrated into their organs.",
      "The barb design is so effective at one-way travel that surgeons have copied it for medical staples.",
    ],
  },
  {
    id: "pufferfish", name: "Pufferfish", sci: "Tetraodontidae",
    glyph: "🐡", art: "d-pufferfish", cat: "armour",
    region: "Tropical & subtropical seas", size: "2.5–60 cm",
    weird: 8, danger: 9, demo: "puffer",
    tag: "Swallows water to triple in size — and packs a lethal poison.",
    how: "A pufferfish has a hugely elastic stomach and no ribs to get in the way. Frightened, it gulps water (or air) in fast pumps and balloons into a spiky, unswallowable sphere. And if a predator manages it anyway, most puffers are loaded with tetrodotoxin, one of the deadliest poisons in nature.",
    facts: [
      "Tetrodotoxin is up to 1,200 times more toxic than cyanide; a single fish holds enough to kill dozens of adults.",
      "There is no antidote — treatment is only life-support until it wears off.",
      "It's still eaten as fugu in Japan, prepared by specially licensed chefs; a bad cut can be fatal.",
    ],
  },
  {
    id: "gecko", name: "Gecko (Tail Autotomy)", sci: "Gekkonidae",
    glyph: "🦎", art: "d-gecko", cat: "armour",
    region: "Warm regions worldwide", size: "Varies",
    weird: 8, danger: 1, demo: "tail",
    tag: "Drops its tail — which keeps wriggling to buy an escape.",
    how: "Many lizards have pre-set fracture planes across each tail vertebra. Grabbed, the gecko snaps the tail off at the nearest plane; muscles clamp the blood vessels shut so it barely bleeds, and the severed tail thrashes on its own for minutes, holding the predator's attention while the lizard runs.",
    facts: [
      "The dropped tail can twist, flip and hop by itself for up to half an hour on stored energy.",
      "A new tail grows back — but on a rod of cartilage, not bone, and never looks quite the same.",
      "Some geckos also shed patches of skin like a magician's cloak, leaving a predator holding a scrap.",
    ],
  },
  {
    id: "hedgehog", name: "Hedgehog", sci: "Erinaceinae",
    glyph: "🦔", art: "d-hedgehog", cat: "armour",
    region: "Europe, Asia, Africa", size: "20–30 cm",
    weird: 7, danger: 1,
    tag: "A ball of 6,000 spines that paints itself with poison.",
    how: "A hedgehog's back carries around 5,000–7,000 stiff, hollow spines; a sheet of muscle lets it curl into a spiny ball with no soft parts showing. Stranger still is 'self-anointing': when it meets a new strong smell or toxin, it chews the source and smears frothy, scented saliva all over its own spines.",
    facts: [
      "Self-anointing may be chemical defence — the hedgehog has been seen chewing toxic toads and daubing the poison onto its spines.",
      "The spines are modified hairs, hollow for lightness and springy enough to cushion a fall.",
      "Curling up is powered by a drawstring-like muscle (the panniculus carnosus) that purses the whole skin shut.",
    ],
  },

  // ---- Borrowed Arms ----------------------------------------------------
  {
    id: "nudibranch", name: "Nudibranch (Sea Slug)", sci: "Nudibranchia",
    glyph: "🐌", art: "d-nudibranch", cat: "stolen",
    region: "All oceans", size: "0.5–30 cm",
    weird: 10, danger: 4,
    tag: "Eats stinging cells and re-arms itself with the stolen weapons.",
    how: "Some sea slugs graze on jellyfish and their relatives — and swallow the stinging capsules (nematocysts) without setting them off. They shunt the live weapons through their gut, out to the tips of their frilly back appendages, and store them there, pointing outward, to sting the slug's own enemies.",
    facts: [
      "The stolen stingers are called kleptocnidae — literally 'stolen stinging threads'.",
      "The slug somehow moves loaded, unfired capsules through its own body without triggering them, then aims them outward.",
      "Other sea slugs steal chloroplasts from algae instead, and run on sunlight like a leaf for months — a 'solar-powered' animal.",
    ],
  },
  {
    id: "boxer-crab", name: "Boxer Crab", sci: "Lybia spp.",
    glyph: "🦀", art: "d-boxercrab", cat: "stolen",
    region: "Indo-Pacific reefs", size: "~2 cm",
    weird: 9, danger: 2,
    tag: "Wears live stinging anemones like a pair of boxing gloves.",
    how: "The tiny 'pom-pom crab' holds a living sea anemone in each claw and waves them at threats, using the anemones' stinging tentacles as gloves it can punch with. Its own claws are too small to fight, so it outsources the weapons — and farms them.",
    facts: [
      "If it loses an anemone, it can tear the remaining one in two and let each half regrow — cloning its weapon.",
      "It may even steal an anemone from another crab, sparking tiny boxing matches over the gloves.",
      "The crab feeds on scraps the anemones catch — the two live as partners, not just weapon and wielder.",
    ],
  },
  {
    id: "crested-rat", name: "African Crested Rat", sci: "Lophiomys imhausi",
    glyph: "🐀", art: "d-crestedrat", cat: "stolen",
    region: "East Africa", size: "~35 cm",
    weird: 10, danger: 6,
    tag: "Chews poison-arrow bark and combs the toxin into its fur.",
    how: "This rabbit-sized rodent gnaws the bark of the poison-arrow tree — the same toxin African hunters use to kill elephants — chews it, and licks the deadly paste into a strip of specially wicking hairs along its flank. A predator that bites the rat gets a mouthful of cardiac poison.",
    facts: [
      "It is the only mammal known to arm itself with a plant poison borrowed from outside its own body.",
      "The flank hairs are uniquely built like tiny sponges to soak up and hold the toxin.",
      "When threatened it parts its fur to flash a bold black-and-white 'danger' stripe — pointing straight at the poisoned hairs.",
    ],
  },
  {
    id: "decorator-crab", name: "Decorator Crab", sci: "Majoidea",
    glyph: "🦀", art: "d-decoratorcrab", cat: "stolen",
    region: "Seas worldwide", size: "1–20 cm",
    weird: 7, danger: 1,
    tag: "Glues living, stinging garden onto its own back as a disguise.",
    how: "A decorator crab plants a costume on itself. Its shell is covered in tiny hooked hairs like Velcro; the crab snips off sponges, seaweed and stinging anemones and presses them onto the hooks, where many keep growing. The result is a walking piece of reef that is both invisible and unpleasant to bite.",
    facts: [
      "The hooked hairs (setae) work exactly like Velcro — which they predate by many millions of years.",
      "When it moults into a new shell, the crab carefully unpicks its decorations and transplants them onto the new one.",
      "By choosing stinging or foul-tasting pieces, it gets camouflage and chemical defence in one outfit.",
    ],
  },

  // ---- Venom & Voltage --------------------------------------------------
  {
    id: "electric-eel", name: "Electric Eel", sci: "Electrophorus electricus",
    glyph: "⚡", art: "d-eel", cat: "shock",
    region: "Amazon & Orinoco basins", size: "Up to 2.5 m",
    weird: 9, danger: 7, demo: "voltage",
    tag: "Delivers 860-volt shocks — and leaps out of the water to do it.",
    how: "Not a true eel but a knifefish, its body is four-fifths battery: thousands of stacked cells (electrocytes) that fire in sync like the cells of an electric organ. It can loose a burst of up to 860 volts to stun prey or drive off an attacker.",
    facts: [
      "It's a living battery of ~6,000 cells wired in series — the same idea that inspired Volta's first electric pile.",
      "Cornered by a large animal, it rears out of the water and presses its chin against the target, pouring current directly into it — proven by a researcher who let one shock his own arm.",
      "It can also emit a weak field to navigate and 'see' in muddy water where eyes are useless.",
    ],
  },
  {
    id: "pistol-shrimp", name: "Pistol Shrimp", sci: "Alpheidae",
    glyph: "🦐", art: "d-pistolshrimp", cat: "shock",
    region: "Tropical & temperate seas", size: "3–5 cm",
    weird: 10, danger: 3, demo: "snap",
    tag: "Snaps a claw so fast it flashes light and rivals the Sun's heat.",
    how: "The pistol shrimp's oversized claw cocks open and slams shut so fast it fires a jet of water at up to 100 km/h. The jet drops the pressure so sharply that a vacuum bubble forms and collapses — a 'cavitation' implosion that makes a shockwave loud enough to stun or kill small prey.",
    facts: [
      "The collapsing bubble briefly reaches around 4,700 °C — nearly the temperature of the Sun's surface — and emits a faint flash of light.",
      "The snap peaks around 210 decibels; colonies of them are loud enough to disrupt submarine sonar.",
      "It's the shockwave, not the claw, that does the killing — the shrimp never has to touch its target.",
    ],
  },
  {
    id: "blue-ringed-octopus", name: "Blue-Ringed Octopus", sci: "Hapalochlaena spp.",
    glyph: "🐙", art: "d-blueringed", cat: "shock",
    region: "Indo-Pacific tide pools", size: "~12 cm",
    weird: 8, danger: 10,
    tag: "Golf-ball sized, flashes electric-blue, and has no antidote.",
    how: "One of the most venomous animals alive, and small enough to sit in your palm. When alarmed it flashes 50–60 iridescent blue rings as a warning; if that's ignored, a painless bite injects tetrodotoxin that paralyses the muscles — including those you breathe with.",
    facts: [
      "A single tiny octopus carries enough venom to kill around 26 adult humans, and there is no antivenom.",
      "The bite is often painless — victims may not realise until paralysis sets in.",
      "Because the toxin only stops the muscles, a victim kept breathing on a ventilator can recover fully as it wears off.",
    ],
  },
  {
    id: "cone-snail", name: "Cone Snail", sci: "Conus spp.",
    glyph: "🐚", art: "d-conesnail", cat: "shock",
    region: "Tropical reefs", size: "3–20 cm",
    weird: 8, danger: 9,
    tag: "A beautiful shell that harpoons prey with a venom dart.",
    how: "Behind a collector's-item shell hides a hunter that fires a hollow, harpoon-like tooth on a fleshy proboscis, injecting a cocktail of hundreds of fast-acting venoms. Some species hunt fish; the venom of the largest can kill a human, earning the nickname 'cigarette snail' — supposedly time for one last smoke.",
    facts: [
      "Each species brews its own mix of up to 200 different 'conotoxins', a pharmacological goldmine.",
      "Some cone snails first release insulin into the water to send fish into a sugar-crash stupor before harpooning them.",
      "One conotoxin is now a painkiller far stronger than morphine — the venom turned into medicine.",
    ],
  },
  {
    id: "platypus", name: "Platypus", sci: "Ornithorhynchus anatinus",
    glyph: "🦫", art: "d-platypus", cat: "shock",
    region: "Eastern Australia", size: "~45 cm",
    weird: 9, danger: 5,
    tag: "The venomous, electric-sensing mammal that lays eggs.",
    how: "The already-improbable platypus adds a venomous spur to each hind ankle of the male. Driven by hormones, it peaks in the breeding season — a weapon for fighting rival males, but agonising to anything else. Its bill, meanwhile, hunts by picking up the tiny electric fields of prey with its eyes shut.",
    facts: [
      "The venom isn't deadly to humans but causes pain so severe and long-lasting that morphine barely touches it.",
      "Only males have the spurs, and the venom flow surges during the breeding season.",
      "The bill senses prey by electroreception — the platypus feeds with eyes, ears and nostrils all sealed underwater.",
    ],
  },
  {
    id: "slow-loris", name: "Slow Loris", sci: "Nycticebus spp.",
    glyph: "🐒", art: "d-loris", cat: "shock",
    region: "South & Southeast Asia", size: "18–38 cm",
    weird: 9, danger: 5,
    tag: "The only venomous primate — it licks poison from its own elbow.",
    how: "This huge-eyed, slow-moving primate has a gland on the inside of each elbow that oozes an oil. It licks the gland, mixing the oil with its saliva to activate a toxin, then delivers it in a bite — or spreads it over its young as a repellent. Threatened, it raises its arms over its head to reach the glands, looking oddly like a cobra.",
    facts: [
      "It's the only primate known to be venomous, and the raised-arm pose doubles as a warning and a way to load its mouth.",
      "A loris bite can cause severe pain, festering wounds and, rarely, fatal anaphylactic shock in people.",
      "Mothers lick the toxin onto their infants' fur as a chemical babysitter before parking them to forage.",
    ],
  },
  {
    id: "bombardier-bonus-bullet-ant", name: "Bullet Ant", sci: "Paraponera clavata",
    glyph: "🐜", art: "d-bulletant", cat: "shock",
    region: "Central & South American rainforest", size: "18–30 mm",
    weird: 7, danger: 6,
    tag: "The most painful sting on Earth — like being shot, for a day.",
    how: "The bullet ant tops the Schmidt sting-pain index at the maximum score. Its sting delivers a neurotoxin called poneratoxin that jams the nervous system, producing waves of throbbing, all-consuming pain that can last a full 24 hours — hence the name.",
    facts: [
      "Entomologist Justin Schmidt rated it 4+/4, describing 'pure, intense, brilliant pain… like walking over flaming charcoal with a nail in your heel'.",
      "Some Amazonian coming-of-age rites require boys to wear gloves lined with dozens of live bullet ants.",
      "The pain comes from poneratoxin locking the victim's nerve channels open, so they fire uncontrollably.",
    ],
  },
];

// Convenience lookups used across app.js.
window.CAT_BY_ID = Object.fromEntries(window.CATS.map(c => [c.id, c]));
window.BEAST_BY_ID = Object.fromEntries(window.BEASTS.map(b => [b.id, b]));
