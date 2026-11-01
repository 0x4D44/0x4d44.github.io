# Teen garment placement

The teen object library contains 29 ordinary clothing styles in two explicit
art sizes. `small` is approximately ages 12–15 at 70% of the original adult
reference pattern; `big` is approximately ages 16–19 at 90%. These are scale
conventions for empty props, not real-world clothing measurements. Exported
models already include that scale. Place their complete root at scale 1.0;
do not multiply by 0.7 or 0.9 again.

Runtime records are generated from `manifest.garments-teen.json` by
`tools/garments_data.mjs`. Every teen record has `sizeTag: 'teen'`, a `sizeClass`
of `small` or `big`, and a `styleId`. Keys use
`garment_teen_<styleId>_<small|big>_<flat|folded|hung>`. The size class is an
explicit selection, not a colour, gender or household-wide inference. Adult and
child records retain their existing IDs, dimensions and file bindings.

## Room and container selection

| Room or container | Intended selection | Placement rule |
| --- | --- | --- |
| Explicit teen bedroom, younger teen | `teen`, `small` | Use the small drawer and wardrobe recipes. Folded objects need shelf space; hung objects need a rail or hook and measured drop clearance. |
| Explicit teen bedroom, older teen | `teen`, `big` | Use the big recipes and measured bounds. A large maxi dress may require a full-height wardrobe section. |
| Teen school locker | The assigned pupil's explicit teen size class | Use `teen_small_school_locker` or `teen_big_school_locker`. Folded school clothes and socks rest on shelves; intact shoes and a cap use flat states. |
| School cubby without a rail | The assigned pupil's explicit size class | Use only applicable folded or flat states after checking the compartment dimensions. A stock recipe does not imply the whole set fits simultaneously. |
| Shared bedroom or shared cupboard | Select each occupant's own size | Keep ownership or compartment assignment explicit; do not convert all clothes to one size because one teen is present. |
| Adult bedroom or staff locker | Existing adult library | Preserve the existing adult recipes and placements. |
| Child bedroom or child school locker | Existing child library, ages roughly 6–10 | Preserve the child recipes. A `teen` room role does not select the child set. |
| Unspecified occupant or nursery | No automatic teen selection | Wait for explicit size metadata or use the existing room-specific furnishing policy. |

`assets/models/garments-teen/assortments.json` supplies seven recipes for each
size: daily drawer, basics drawer, swimwear drawer, daily wardrobe, school
wardrobe, accessories shelf and school locker. Across each size, the recipes
cover all 29 styles. Every binding and item carries both `sizeTag` and
`sizeClass`. Catalogue furniture keys are existing container types, not promises
that every placed instance has the same free internal dimensions.

All poses use metres, +Y up and +Z front. Flat and folded objects sit at Y=0 and
are centred on X/Z; hung objects descend from their top support at Y=0. Socks
have flat/folded states, the rigid cap has flat/hung states, and paired shoes and
sandals have only flat states. Select only states actually present in the
manifest. Use measured dimensions and collision/clearance checks, then reduce
counts or reject a garment when it cannot fit. Never squash an item to make a
recipe fit.

## Renderer boundary

The generated catalogue includes all 286 adult, child and teen pose keys, while
`GARMENT_KEYS` and the page's default registration/preload preserve the 124 adult
and child keys from #80. `ALL_GARMENT_KEYS` contains all sizes;
`garmentKeysFor(['teen'])` returns the 162 teen keys. Explicit consumers opt in:

```js
registerGarmentAssets(ctx, { sizeTags: ['teen'] });
await loadGarmentAssets(ctx, { sizeTags: ['teen'] });
```

That selection loads three teen LOD packs and covers both small and big variants.
Use `{ sizeTags: ['adult', 'child', 'teen'] }` to request all three libraries.
Calls without options keep the adult/child behaviour. Registration and loading
do not place objects. This change does not wire teen recipes into `dressRooms`,
drawer contents, wardrobes or lockers. The existing loose adult-clothing pass still
skips `kids`, `child` and `teen` rooms and keeps schools neat. Procedural
container contents keep their current behaviour until a separate placement
change is reviewed.

The teen atlas remains external. The evidence preview selects the real fabric
tile on the existing `laundry` material. The current room renderer's tint
fallback remains available; the geometric sun print requires the atlas binding.

See [fixed-scale contact sheets](../garments-teen/evidence/contact-hung.webp) for
adult, child, teen-small and teen-big objects at one common camera scale.
