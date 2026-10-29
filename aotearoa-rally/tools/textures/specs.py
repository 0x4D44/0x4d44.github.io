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
 "gnd_grass": ("ground", 1024, 6.0, "lush New Zealand pasture grass"),
 "gnd_tussock": ("ground", 1024, 6.0, "golden-brown dry tussock grass ground"),
 "gnd_leaf": ("ground", 1024, 6.0, "forest floor of leaf litter and conifer needles"),
 "gnd_schist": ("ground", 1024, 6.0, "grey-green layered schist rock surface"),
 "gnd_limestone": ("ground", 1024, 6.0, "pale weathered limestone karst rock surface"),
 "gnd_moss_rock": ("ground", 1024, 6.0, "dark rock covered in green moss"),
 "gnd_sand": ("ground", 1024, 6.0, "tan beach sand"),
 "gnd_snow": ("ground", 1024, 6.0, "fresh snow with fine sparkle"),
 "gnd_fern": ("ground", 1024, 6.0, "forest floor with small fern fronds and moss"),
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
    suf = FOLIAGE_SUFFIX if kind == "foliage" else TILE_SUFFIX
    return (f"Use your built-in image generation tool to generate ONE square {desc}; {suf}. "
            f"Then save the resulting PNG into the current working directory as {name}.png "
            f"and reply with only the saved file path.")
