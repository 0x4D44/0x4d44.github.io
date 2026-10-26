# Glasgow Subway - train and tunnel dimensions, cross-sections (A1, for A3 / A5)

Coordinates everywhere: **x = across the track from the vehicle/track centreline (m), y = height above rail head (m)**, half-profiles (mirror for -x). Machine-readable copy: `research/train_profile.json`.

## 0. HEADLINE CORRECTIONS to the current model
1. **Width 2.32 m is about right** (body 2.309 m; 2.34 m max incl. fittings/door furniture). **Height 2.64 m is right** (2.642 m rail-to-roof).
2. **The roof must be almost a semicircle**: vertical sides stop at y~1.49 m (only 0.8 m above the floor!) and everything above is one R~1.155 m arch to the apex at 2.642 m. A flat-roofed box with small corner radii is wrong. This is why the real ceiling looks "very curved".
3. **Floor is only 0.695 m above rail head, and interior headroom is ~1.88 m at the centreline** (apex of the inner ceiling at y~2.57). A Commons description by a rail photographer (J33 695, Altenrhein) states "standing height of 1.90 m **only at car centre**". Headroom drops to ~1.68 m above the bench fronts and ~1.4 m above the seat backs near the walls. Tall passengers duck to board (Urban Transport Magazine).
4. **Tunnel bore is 3.35 m (11 ft) internal diameter, not 3.5 m.** Several sources: Graces Guide ("11 ft"), Cassier's 1898 ("11 ft internal diameter"), Rail Engineer 2018 ("nominal diameter 3.35 m"), Commons J33 photo notes (3.35 m). 11 ft 6 in / 3.5 m is not supported. The train runs with only ~0.2-0.3 m between roof and crown and ~0.5 m each side at the widest point.
5. **The new train has only one full driver's cab**; the other end has a **fold-out auxiliary cab** (Commons J33 695/728 descriptions; the line is a loop so no reversal is needed). The centre of the set (the coupler between the two half-trains) has **no windows** and is a sealed bellows joint. The two middle semi-trailer bodies each run on **one bogie** and are saddled on the end cars' bogie at the other end.
6. Old Metro-Cammell trains: 3 cars, **37.74 m**, so each car ~12.58 m; same width/height envelope (the Stadler was specified to the same external dimensions; its 4 cars are 39.25 m).

## 1. Sources
- Wikipedia infobox (Stadler): length 39.51 m (other sources 39.2-39.25), width **2,309 mm**, height **2,642 mm**, floor height **695 mm**, wheelbase 1,650 mm, 12 doors per set (6 per side), wheels 540-480 mm. https://en.wikipedia.org/wiki/Glasgow_Subway_rolling_stock
- Railway Gazette (2 340 mm wide, 2 650 mm high, 39.2 m) https://www.railwaygazette.com/urban-rail/glasgow-subways-stadler-trains-enter-passenger-service/65523.article ; Urban Transport Magazine (39.24 m x 2.34 m; "two long single cars with two bogies each plus two connected semi-trailer cars with one bogie each") https://www.urban-transport-magazine.com/en/large-investments-into-public-transport-in-glasgow/
- Rail Engineer (tunnel nominal diameter 3.35 m; old 3-car 37.74 m, 270 pax; new 39.25 m, 310 pax; PSD 1.7 m high; lining types brick/concrete/cast iron; "wide walk-through connections", "standard floor height" through small wheels) https://www.railengineer.co.uk/subway-revival-glasgow-to-introduce-uto/ and https://www.railengineer.co.uk/subway-revival-an-update-on-glasgows-modernisation/
- Commons photo descriptions (J33 695/699/701/707/728 U-Bahn-Triebzug fur Glasgow, Stadler works): "3.35 m tubes", "standing height 1.90 m only in car centre", centre coupling without windows, shell-sleeve coupler only separable in the workshop, in running tunnels leaving through the side doors is impossible (hence end-wall doors). https://commons.wikimedia.org/wiki/Category:Glasgow_Subway
- Cassier's Magazine 1898 (reproduced) https://www.cable-car-guy.com/html/cceng_gds.html and https://www.cable-car-guy.com/html/ccgds.html : tubes 11 ft ID, spaced 2 ft 6 in-6 ft apart (wall to wall), lining 3/4 in cast iron (1 in at Clyde), station arch **28 ft wide x 150 ft long, island platform 10 ft wide**, stairs 6-8 ft wide, rail top to tunnel roof 9.5 ft (2.9 m), original cars 40 ft 9 in x 6 ft 6 in high (!), width 7 ft 8 in (Railscot https://www.railscot.co.uk/companies/G/Glasgow_District_Subway/), tunnelling shield ID 12 ft 1.5 in. Graces Guide https://www.gracesguide.co.uk/Glasgow_Subway (about 120,000 cast-iron segments, ~20,000 t).
- Not published anywhere I could reach: aisle width, seat depth, door opening, gangway width, bogie centres, roof radius, loading gauge. Those below are **derived** (marked D) from the published envelope + photographs (viewed on Commons) and bore geometry.

## 2. Dimension table
| Item | Value | Basis |
|---|---|---|
| Set length (4 cars) | 39.25 m (39.2-39.51 quoted) | published |
| Car bodies (D) | 2 x end power car ~12.6 m + 2 x semi-trailer ~7.0 m (+ bellows/joint gaps ~0.25 m each); the Metro-Cammell cars were 12.58 m | derived (39.25 = 2x(12.6+7.0)+gaps) |
| Body width | 2.309 m (2.34 m max over fittings) | published |
| Rail-to-roof | 2.642 m | published |
| Floor above rail head | 0.695 m (platform height identical, level boarding) | published |
| Underframe/skirt bottom (D) | y ~0.50 m (0.19 m of the bogies/frames visible below the floor line is black skirt) | photo |
| Wheelbase / wheel dia | 1.65 m / 0.54-0.48 m | published |
| Vertical side wall | from y~0.62 to y~1.49 at x=1.155 | derived |
| Roof | single circular arch R=1.155 m, centre (0, 1.487) m | derived (see 3) |
| Inside width at seat level (D) | 2.17 m (wall 0.07 m) | derived |
| Inside width at shoulder (y=1.9, 1.2 m above floor) (D) | 2.04 m at the inner arch (x=+-1.02) | derived |
| Interior headroom at centreline | ~1.88 m above floor (ceiling apex y=2.572) | derived from 2.642 + roof thickness; matches "1.90 m only at centre" |
| Headroom above bench fronts (x=+-0.62) (D) | ~1.68 m | geometry |
| Headroom above seat backs (x=+-0.95) (D) | ~1.33 m | geometry |
| Seat cushion height / depth (D) | 0.43 m above floor / 0.45 m deep, back to 0.90 m above floor, ~8 deg back lean | photo + convention |
| Aisle between bench fronts (D) | ~1.25 m | 2.17 - 2x(0.46 depth) |
| Window sill (D) | 0.85-0.90 m above floor (about seat-back top), y~1.57 | photo 918/P1790177 |
| Window head (D) | follows the arch: glazing runs up the shoulder to ~x=0.80, y~2.2 (1.5 m above floor); window opening ~1.10 m wide x ~0.75 m high measured along the curve; 2 windows per bay | photo |
| Door opening (D) | 1.30 m wide (along train), height cut into the curved shoulder: ~1.55 m above floor at the inner edge, ~1.35 m at the outer face; two sliding leaves; 6 doors per side | photo + count |
| Gangway (D) | clear ~1.3 m wide, ~1.8 m high arched opening; black bellows; grey turntable floor | photo (J33, P1790013) |
| Cab (D) | one full cab ~1.5-1.8 m long behind a partition at one end; fold-out auxiliary cab at the other; end-wall evacuation door in the nose | Commons J33; Rail Engineer |
| Bogie centres (D) | 6 bogies; suggested centres from front: 2.6, 10.3, 15.8, 23.4, 28.9, 36.6 m (end car bogies ~7.7 m apart; the semi-trailer bogie ~5.5 m from the articulation) | estimate |
| Capacity | 310 (118 seated + ~204 standing) | published |

## 3. Cross-section geometry (how the numbers fit)
Bore: circle radius **1.675 m**. Rail head sits ~0.40-0.55 m above the invert (assume **0.45 m**), so the bore centre is at y = 1.225 m and the crown at y = 2.90 m (cf. Cassier's "rail top to tunnel roof 9.5 ft = 2.9 m" - an excellent match, which supports the assumption).
Train roof apex 2.642 m -> **crown clearance 0.26 m**. At side-wall height y=1.0 m the lining is 1.66 m from the centreline vs the body at 1.155 m -> **0.50 m clearance each side**. Clearance table:
| rail head above invert (m) | bore centre y | min roof-to-lining clearance (m) |
|---|---|---|
| 0.40 | 1.275 | 0.31 |
| 0.45 (assumed) | 1.225 | 0.26 |
| 0.50 | 1.175 | 0.21 |
| 0.55 | 1.125 | 0.16 |
A circular roof of radius 1.155 m concentric-ish with the 1.675 m bore leaves a nearly uniform gap above the shoulders (0.26 m at the crown, 0.30-0.36 m at 45 degrees, 0.45 m at the vertical wall) - this is why the vehicle is shaped like a squat tube rather than a box, and why the Stadler could not simply use a conventional metro body.
Track gauge 1,219-1,220 mm; the third (live) rail sits beside the running rails (power 600 V DC). The tunnel invert has a concrete trough with a cess walkway; reserve ~0.35 m outside each running rail.

### 3a. Outer body half-profile (x, y) - loft this
Start at the underframe centre and go outward then up:
`(0.000,0.500) (1.050,0.500) (1.100,0.550) (1.155,0.620) (1.155,1.487)` then the roof **arc R=1.155 m, centre (0.000,1.487)** sampled every 10 deg:
`(1.137,1.688) (1.085,1.882) (1.000,2.064) (0.885,2.229) (0.742,2.372) (0.578,2.487) (0.395,2.572) (0.201,2.624) (0.000,2.642)`.
The door furniture, handles and light blades protrude to x=1.17 (2.34 m max width) between y=0.9 and y=1.5. The black skirt/underframe covers y=0.45-0.62; bogies hang below (rail head y=0).

### 3b. Interior half-profile (x, y)
Floor at y=0.695 (covering top). Inner wall (thickness 0.07 m): `(1.085,0.695) (1.085,1.487)` then ceiling arc **R=1.085 m, centre (0,1.487)**:
`(1.069,1.675) (1.020,1.858) (0.940,2.029) (0.831,2.184) (0.697,2.318) (0.543,2.427) (0.371,2.507) (0.188,2.556) (0.000,2.572)`.
- Bench: cushion top y=1.125 (0.43 above floor), front edge x=+-0.62, back at x=+-1.085-0.04, back top y=1.60 (0.90 above floor), plinth box in front of the wall up to cushion height (white GRP, 0.12 m deep at floor).
- Windows: glass sits in the curved wall from y~1.57 (sill) up to the arch point at about x=0.80, y=2.2; slim white pillars every ~1.2 m in the bay. Vent louvre and LED strip along the window head at about x=0.78-0.60, y=2.25-2.4; crown LED strips at x=+-0.15, y~2.55.
- Orange stanchions: vertical poles at x=+-0.58 (just inboard of the bench ends) from floor to the overhead rail; overhead rails run along the arch at about x=+-0.45, y=2.40.
- Door vestibule: two orange poles per side of the opening plus a curved pole in the middle; floor contrast strip lighter grey across the threshold.

## 4. Metro-Cammell (1979-2024) for comparison
3 cars, 37.74 m total (each ~12.58 m); width 2.34 m (7 ft 8 in), height 2.65 m (maximum); same tunnel envelope. Front: flat/slightly curved end with a **central door** and two windows (orange with grey/blue-grey front band, SPT roundel on a white panel); roof flatter and boxier than the Stadler, side windows nearly vertical, seats longitudinal with maroon/red moquette (Commons 'Glasgow Subway - 2025/Buchanan platform' photo shows the orange 2006-11 livery front). Pre-1977 cars (1896): 40 ft 9 in x 6 ft 6 in high, 7 ft 8 in wide, open lattice end gates. Passengers had to stoop.

## 5. The station cross-section (original 1896 + 1977-80)
- **Island stations (original layout)**: both tracks run under one arch **28 ft (8.53 m) wide, 150 ft (46 m) long**, with a **10 ft (3.05 m) island platform** between. Tracks ~5.7-6.0 m apart (OSM: 6.0 m); a train occupies +-1.17 m so the usable island is ~3.3 m. Walls and platform edge are therefore only ~1.2-1.4 m outside each train.
- **Shape**: over each track the vault is a continuation of the tunnel curve rising to the crown; in the middle over the island is a flat/lower soffit (suspended ceiling, 600 mm tiles) at about 2.6-3.0 m above platform. From the photos: West Street, St George's Cross and Kelvinbridge have **ribbed pale-coloured curved side vaults down to the dado band, black/dark flat soffit in the centre**. The arch is brick/cast-iron lined and clad in enamelled panels (pale yellow at West Street, cream at SGX, pale grey-white at Kelvinbridge).
- **Platform height**: level with the train floor, **0.695 m above rail head**; platform edge to train step ~0.1 m; tactile strip 0.6 m from the edge; yellow edge line.
- **Side-platform stations (Govan, Partick, St Enoch, Ibrox)**: rebuilt box stations (cut-and-cover concrete boxes with columns): platforms of ~3.5-5 m width on the outer sides of each track, columns (black tile at St Enoch, dark brown at Partick) between the tracks, a black mesh fence separating the tracks, suspended ceilings. Tunnel ends at the station boxes are **circular bores with a dark brick ring** around the mouth.
- **Split stations (Buchanan Street, Hillhead)**: island plus an added side platform on one side; glass screen / perspex barrier between the island and the track beside the side platform.
- Escalator/stair shafts: stairs 6-8 ft wide (1.8-2.4 m) originally; modern escalators; Cross passages: none found documented (ghost tunnel section at Merkland Street is a large-diameter tunnel section). The tunnels are paired singles with occasional cross connections near the depot (Broomloan) only (estimate).

## 6. Confidence
High: width, height, floor height, bore ID, set length, 6 doors/side, one-cab + fold-out cab, no windows at the centre coupling, station arch 28 ft / island 10 ft (1896).
Medium: roof is near-semicircular R~1.15 m (derived from bore fit + photos), headroom 1.88 m.
Low: seat depth, aisle, gangway, door opening heights, bogie centres, car body split.
