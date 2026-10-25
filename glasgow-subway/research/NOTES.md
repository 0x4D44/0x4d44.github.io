# Glasgow Subway research notes (A1)

## What is surveyed vs estimated
| Item | Status | Source |
|---|---|---|
| Plan-view track centrelines, both loops | **Derived from OSM** `railway=subway` ways (partly traced from 1892-94 OS town plans by mappers). Smoothed (14 m Gaussian) and resampled at 5 m. Not a survey. | OpenStreetMap, ODbL |
| Station positions, stop positions, entrances | OSM nodes (`railway=station`, `public_transport=stop_position`, `railway=subway_entrance`). Stations with no mapped entrance get an approximate "station building" at the station node. | OSM |
| Direction: outer = clockwise, inner = anticlockwise | Verified: OSM ring orientation (shoelace) and Wikipedia ("Outer Circle: clockwise"). | |
| Surface elevation | Terrarium DEM (z14) sampled at stations; +-3 m (includes buildings/bridge decks in places). | AWS terrain tiles |
| Overall depth facts | 7 ft (2.1 m) minimum between Kinning Park and Cessnock; 155 ft (47 m) below Glasgow Street, Hillhead (max); Hillhead 115 ft under a mound; city centre ~40 ft (12 m); average 29 ft (8.8 m). | RAILSCOT; Cassier's Magazine 1898 |
| Gradients | 1 in 18 and 1 in 20 beneath the Clyde; stations at the summit of ~1 in 40; sharpest curve 660 ft (201 m). Source: 1898 report. | cable-car-guy.com reproduction of Cassier's 1898 article |
| Station-by-station rail depth | **ESTIMATE** informed by the above (Kinning Park shallowest, Kelvinbridge deepest station, St Enoch needs two escalators, Hillhead deep). Per-station values are not published in sources found. | research judgement |
| Vertical profile | **MODEL**: flat platform zones (+-22 m), straight gradients (max design 5.2%, <= 1 in 18) with 60 m parabolic vertical curves, dips under the Clyde (rail ~ -8 m OD; bed ~ -3 m OD estimated, 2.4 m crown cover) and Kelvin. The real stations sit on ~1 in 40 summits; the sim's flat platforms are a simplification. | |
| Platform lengths 45 m, widths 3.0-3.2 m | **ESTIMATE** (Stadler train 39.3 m; 1896 island platforms ~10 ft wide). | |
| Platform types | Wikipedia station articles: island at Bridge St, West St, Shields Rd, Kinning Park, Cessnock, Kelvinhall, Kelvinbridge, St George's Cross, Cowcaddens; side at Govan, Partick, St Enoch (and Ibrox per its article); island + side ("split") at Buchanan Street and Hillhead. Sources disagree for Ibrox. | Wikipedia |
| Track separation at stations | OSM gives ~6 m everywhere except Kelvinhall/Kelvinbridge (~10 m, likely a mapping artefact). Reported as-is in `platform.trackSeparationM`. | OSM |
| River crossing positions | OSM waterway/riverbank polygon x track intersections: Clyde 122 m wide (St Enoch-Bridge St), 119 m (Govan-Partick), Kelvin 22 m. Bed levels estimated. | OSM |
| Speed limits | **ESTIMATE**: <=55 km/h line speed (train max 58), curve limit sqrt(0.9R), 35 km/h approaching/leaving stations, 25 km/h at platform. | |
| Stadler specs | length 39.2-39.51 m (sources differ; 39.3 used), width 2.31-2.34 m, height 2.64 m, 4 cars, 58 km/h, 272 kW, ~310-322 passengers. Acceleration (1.0 m/s2) and mass (60 t) are **estimates**. | Wikipedia; Railway Technology; Railway Gazette |

## Route (outer circle, clockwise, chainage from Buchanan Street platform centre)
Buchanan Street 0 > St Enoch 548 > (Clyde) Bridge Street 1203 > West Street 1740 > Shields Road 2340 > Kinning Park 3154 > Cessnock 3654 > Ibrox 4333 > Govan 5241 (depot ramp just before) > (Clyde) Partick 6204 > Kelvinhall 6742 > Hillhead 7364 > (Kelvin) Kelvinbridge 8252 > St George's Cross 9061 > Cowcaddens 9755 > Buchanan Street 10537 m. Inner circle: 10491 m, running the other way.
Ghost station Merkland Street (closed 1977) lay between Govan and Partick, 25 m SW of present Partick.

## Key history
1890 Act; 1891 construction; 14 Dec 1896 opening (cable); 1923 Glasgow Corporation; 1935 electrified (cable ends 30 Nov 1935); 1936 renamed Glasgow Underground; 1940 bomb; 21 May 1977 closed (Govan roof cracks); 1 Nov 1979 royal inauguration; 16 Apr 1980 reopened; 1992 centre trailers; 1996 resignalling; 2003 name Subway readopted; 2012 Hillhead refit; 2016 Stadler contract; 11 Dec 2023 Stadler service; 28 Jun 2024 old fleet retired; 2026 contactless and PSDs.

## Operations
06:30-23:40 Mon-Sat, 10:00-18:12 Sun (Wikipedia, 2026); 6-8 min headways off-peak; 600 V DC third rail; 5 traction substations (Broomloan, Byres Road, Dundasvale, Bridge Street, Cornwall Street); six trains per circle in full service; ATO since 1980 (driver closes doors, presses start); CBTC and PSDs being installed for driverless operation.

## Caveats / known uncertainty
- Wikipedia fetches were summarised by a model during research; numbers were cross-checked where two sources existed (Stadler length, capacity, depths).
- Station depth, platform dimensions, vertical alignment and speed limits are modelling estimates (see table) - do not present as surveyed.
- OSM geometry at Cessnock/West Street/Shields Road/St George's Cross had station nodes 12-21 m from the tracks; platform positions use the track stop positions instead.
- Wikipedia text mentions 2026 events (contactless payment March 2026, PSDs at Partick/Govan/Ibrox by Sept 2026) as of the fetch.

## Reproduce
`python tools/build_subway_extract.py <osm tiles> <dem tiles>` (optional; produces research/osm_extract.json), `python tools/stations_content.py`, `python tools/meta_content.py`, `python tools/build_subway.py` (builds + validates), `python tools/build_subway.py --check` (validate only). Needs numpy, scipy.
