"""Texture specs shared by gen-raw.py and build-textures.py."""
TILE_SUFFIX = ("photographic, top-down orthographic view, seamless tileable texture, "
               "even flat diffuse lighting, no shadows, no perspective, no text, no watermark")
FOLIAGE_SUFFIX = ("front view, photographic, a single subject centred and fully inside the frame with margin, "
                  "on a FLAT PURE MAGENTA (#FF00FF) background, nothing else, no shadows, no text, no watermark")

# name: (kind, size, meters, description)
SPECS = {
 "road_gravel": ("road", 1024, 3.0, "loose crushed grey-brown rally gravel over hardpack, with a faint tyre-compacted track"),
 "road_dirt": ("road", 1024, 3.0, "packed light-brown clay farm track surface with hairline cracks"),
 "road_tarmac": ("road", 1024, 3.0, "worn dark-grey chip-seal asphalt with subtle aggregate, no road markings"),
 "road_mud": ("road", 1024, 3.0, "wet churned dark brown clay mud with ruts and puddle sheen"),
 "road_snow": ("road", 1024, 3.0, "packed snow and ice, slightly blue-white, tyre-polished"),
 "road_pumice": ("road", 1024, 3.0, "pale cream volcanic pumice sand and gravel"),
 "gnd_tussock": ("ground", 1024, 6.0, "golden-brown dry tussock grass ground"),
 "gnd_leaf": ("ground", 1024, 6.0, "forest floor of leaf litter and conifer needles"),
 "gnd_schist": ("ground", 1024, 6.0, "grey-green layered schist rock surface"),
 "gnd_limestone": ("ground", 1024, 6.0, "pale weathered limestone karst rock surface"),
 "gnd_moss_rock": ("ground", 1024, 6.0, "dark rock covered in green moss"),
 "gnd_sand": ("ground", 1024, 6.0, "tan beach sand"),
 "gnd_snow": ("ground", 1024, 6.0, "fresh snow with fine sparkle"),
 "gnd_fern": ("ground", 1024, 6.0, "forest floor with small fern fronds and moss"),
 "gnd_grass2": ("ground", 1024, 6.0, "short lush green New Zealand pasture grass seen from above, dense fine blades in varied greens and yellow-green with a few clover leaves, soft and natural, no leaf veins, no net pattern"),
 "rock_schist": ("rock", 1024, 4.0, "blue-grey layered Central Otago schist rock face with thin foliation planes, rusty orange iron staining along joints and sparse yellow-green lichen"),
 "rock_limestone": ("rock", 1024, 4.0, "pale cream-grey weathered New Zealand limestone karst rock face with solution pits, dark water-streak stains and moss in the crevices"),
 "rock_volcanic": ("rock", 1024, 4.0, "dark brown-black volcanic scoria and ignimbrite rock face with vesicular holes, rusty orange oxide stains and pale ash dust in the cracks"),
 "rock_coastal": ("rock", 1024, 4.0, "warm brown and orange weathered coastal sandstone rock face with horizontal bedding, salt-bleached pale patches and small pits"),
 "rock_fiord": ("rock", 1024, 4.0, "dark wet grey granite gneiss rock face streaked by running water, with patches of green moss and tiny ferns in the cracks"),
 "rock_cliff": ("rock", 1024, 4.0, "weathered grey-green New Zealand greywacke cliff rock face with fine vertical strata, hairline cracks and lichen flecks"),
 "wool_fleece": ("ground", 512, 0.5, "creamy off-white sheep wool fleece with soft dense curls and slight grey-brown dirt flecks"),
 "foliage_toetoe": ("foliage", 512, 1.0, "single toetoe grass plant: one tall arching stalk carrying a long soft feathery cream-silver seed plume, with a few long arching green-gold blades at the base"),
 "foliage_pohutukawa": ("foliage", 512, 1.0, "dense leafy pohutukawa branch with glossy dark-green oval leaves, pale grey undersides and several clusters of bright crimson-red bottlebrush flowers"),
 "bark_redwood": ("bark", 512, 1.5, "deep furrowed reddish-brown fibrous redwood bark"),
 "bark_beech": ("bark", 512, 1.5, "grey-brown mossy southern beech bark"),
 "bark_pine": ("bark", 512, 1.5, "rough orange-grey pine and macrocarpa bark plates"),
 "foliage_fern": ("foliage", 512, 1.0, "lush fern frond"),
 "foliage_pine": ("foliage", 512, 1.0, "dense conifer needle branch spray"),
 "foliage_broadleaf": ("foliage", 512, 1.0, "leafy twig of glossy dark-green leaves"),
 "foliage_flax": ("foliage", 512, 1.0, "fan of long strap-like flax and toetoe blades pointing upward"),
 "foliage_grass": ("foliage", 512, 1.0, "tuft of long grass blades"),
}

def prompt(name):
    kind, _, _, desc = SPECS[name]
    suf = FOLIAGE_SUFFIX if kind == "foliage" else TILE_SUFFIX  # rock/ground/road/bark all use the tile suffix
    return (f"Use your built-in image generation tool to generate ONE square {desc}; {suf}. "
            f"Then save the resulting PNG into the current working directory as {name}.png "
            f"and reply with only the saved file path.")
