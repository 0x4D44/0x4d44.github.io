#!/usr/bin/env python3
"""Authoring source for data/station_looks.json (+ used to cross-check research/stations-look.md).
Hex values are visual estimates from reference photographs (not brand specs). Photos are reference only and are not copied."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = 'https://commons.wikimedia.org/wiki/'
SPT = 'https://www.spt.co.uk/about-us/what-we-are-doing/modernisation/'
RE = 'https://www.railengineer.co.uk/subway-revival-an-update-on-glasgows-modernisation/'
WP = 'https://en.wikipedia.org/wiki/'
ORANGE, CHAR, NAVY = '#F0601A', '#3A3F46', '#1F2430'
GREY_FLOOR = '#9A9B9D'
KIT = dict(signage=dict(style='SPT 2010s kit: orange name band (outer platform) / charcoal band (inner platform) with white bold sans text; white-headed line-diagram panels (roundel + bold Inner/Outer) with dark navy stop list and orange stop markers; hanging "Inner | Outer" blocks', hexes=[ORANGE, CHAR, NAVY, '#FFFFFF']))
def S(id, **k):
    d = dict(id=id); d.update(k); return d
st = []
st.append(S('buchanan-street', platform=dict(type='split', widthM=3.2, lengthM=45, note='island plus added side platform; glass screen between island and the side-platform track'),
 vault=dict(shape='flat suspended ceiling box station (no ring vault); long travelator passage to Queen Street', widthM=8.5, heightM=3.1, colours=['#E9E9E6', '#2B2B2D']),
 wallTile=dict(hex='#F1F0EC', pattern='large white rectangular wall tiles in ticket hall/travelator; platform walls pre-refit cream-yellow tile above a black glossy tile dado', bandHex='#F3D04A', accentHex=ORANGE),
 floor=dict(hex=GREY_FLOOR, material='grey large-format tile (pre-refit: tan-orange small tiles in brick bond)'),
 ceiling=dict(hex='#E4E3DF', material='suspended white metal/mineral tile ceiling with round downlights and linear LED strips (pre-refit: brown timber slat)'),
 pillars=False, lighting='linear LED strips + round recessed downlights; travelator edge strip lights red/orange',
 signage=KIT['signage'],
 features=['underground ticket hall', 'travelator to Queen Street station', 'one stair per platform (congested)', 'glass screen on island platform', 'two street entrances mid-street (north has escalators)'],
 entrance=dict(style='two free-standing glass canopies in the pedestrianised street (north 1999 structural glass; matching south canopy 2015-16)', description='Teal-tinted glass box with white capital lettering "BUCHANAN STREET" on the fascia; steel/glass balustrade; black totem with SPT roundel and "Subway"; polished steel bollards with black bands', hexes=['#7FB7B2', '#FFFFFF', '#1A1A1C']),
 mural=None, confidence='medium', sources=[C + 'Category:Buchanan_Street_subway_station', WP + 'Buchanan_Street_subway_station', SPT]))
st.append(S('st-enoch', platform=dict(type='side', widthM=4.0, lengthM=45, note='two side platforms in a concrete box; black mesh fence between tracks'),
 vault=dict(shape='flat box ceiling over side platforms with black tiled columns; circular bored tunnel mouths with brick header rings', widthM=18.0, heightM=3.6, colours=['#DCDDDD', '#111315']),
 wallTile=dict(hex='#F2F2EF', pattern='white glazed square tiles ~300 mm', bandHex=ORANGE, accentHex='#111315'),
 floor=dict(hex=GREY_FLOOR, material='grey tile, dark tactile strip'),
 ceiling=dict(hex='#CFD2D4', material='silver suspended lay-in tile ceiling with LED strips'),
 pillars=True, lighting='linear LED strips, downlights', signage=KIT['signage'],
 features=['two escalator flights from street (deepest city-centre station)', 'lift (one of two accessible stations)', 'black glossy tile columns', 'safety fence between tracks'],
 entrance=dict(style="James Miller's Category A listed station building (1896) on a modern concrete box, plus 2014-15 glass canopies", description='Red sandstone (Locharbriggs) Flemish Renaissance two-storey block, pepper-pot corner turrets with swept roofs, polished ashlar; now a cafe. New glass canopies at Argyle Street and north/south entrances', hexes=['#A8533A', '#7C3A2A', '#B9C7C9']),
 mural=None, confidence='high', sources=[C + 'Category:St_Enoch_subway_station', 'https://www.trove.scot/designation/LB32833', SPT, WP + 'St_Enoch_subway_station']))
st.append(S('bridge-street', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin curved ribbed vaults (one per track) meeting a flat dark central soffit; platform tunnel ~8.5 m wide', widthM=8.5, heightM=3.2, colours=['#EDEDEA', '#2A2B2D']),
 wallTile=dict(hex='#EDEDEA', pattern='tall white enamel vault panels with vertical joints ~0.65 m; lower dado panels white', bandHex=ORANGE, accentHex=CHAR),
 floor=dict(hex=GREY_FLOOR, material='grey large tile; dark-grey tactile strips and cream-yellow edge strip'),
 ceiling=dict(hex='#3A3B3E', material='dark flat soffit over the island with linear LED'),
 pillars=False, lighting='surface linear LED tube along the centre', signage=KIT['signage'],
 features=['island platform', 'orange band on Outer side, charcoal band on Inner side', 'wet track bed'],
 entrance=dict(style='small street entrance on Eglinton Street', description='not photographed in this research; assume low building with grey fascia and SPT roundel', hexes=['#8A8C8E']),
 mural=None, confidence='medium', sources=[C + 'Category:Bridge_Street_subway_station', WP + 'Bridge_Street_subway_station', SPT]))
st.append(S('west-street', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin curved ribbed vaults over each track, central flat soffit', widthM=8.5, heightM=3.2, colours=['#D9D56A', '#2A2B2D']),
 wallTile=dict(hex='#D9D56A', pattern='lemon/olive-yellow enamel vault panels ~0.65 m wide', bandHex=ORANGE, accentHex=CHAR),
 floor=dict(hex=GREY_FLOOR, material='grey tile with tactile strips'),
 ceiling=dict(hex='#5A5B5D', material='suspended ceiling over the island'),
 pillars=False, lighting='surface linear LED', signage=KIT['signage'],
 features=['yellow vault is unique to West Street', 'least used station', 'orange band on Outer side, charcoal on Inner'],
 entrance=dict(style='small building in industrial Tradeston', description='not photographed; assume low brick/grey building', hexes=['#6B5A50']),
 mural=None, confidence='medium', sources=[C + 'Category:West_Street_subway_station', WP + 'West_Street_subway_station']))
st.append(S('shields-road', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin ribbed vaults + flat central soffit (assumed same as Bridge Street)', widthM=8.5, heightM=3.2, colours=['#EDEDEA']),
 wallTile=dict(hex='#EDEDEA', pattern='white vault panels (assumed)', bandHex=ORANGE, accentHex=CHAR),
 floor=dict(hex=GREY_FLOOR, material='grey tile'), ceiling=dict(hex='#3A3B3E', material='flat soffit'),
 pillars=False, lighting='surface linear LED', signage=KIT['signage'],
 features=['Park and Ride (839 spaces) with multi-storey car park', 'refit completed March 2018'],
 entrance=dict(style='low flat-roofed pavilion in dark brown brick beside the car park', description='Dark brown brick walls (#4B342C), grey metal canopy/fascia with orange roundel and "Subway", glazed doors; a painted mural on the building depicts Mackintosh\'s Scotland Street School', hexes=['#4B342C', '#8A8C8E', ORANGE]),
 mural='Painted mural of Scotland Street School (Mackintosh) on the station building (Commons geograph 1523759 description)', confidence='medium', sources=[C + 'Category:Shields_Road_subway_station', WP + 'Shields_Road_subway_station']))
st.append(S('kinning-park', platform=dict(type='island', widthM=3.2, lengthM=45, note='shallowest station'),
 vault=dict(shape='twin ribbed vaults (low, shallow station) with timber-slat soffit over the island pre-refit', widthM=8.5, heightM=3.0, colours=['#EDEDEA', '#6B5640']),
 wallTile=dict(hex='#EDEDEA', pattern='white vault panels', bandHex=ORANGE, accentHex='#2F4A47'),
 floor=dict(hex='#D9B779', material='pre-refit tan/cream small tiles laid brick-bond with dark grey tactile band (refit Nov 2019 probably to grey tile)'),
 ceiling=dict(hex='#6B5640', material='brown timber-slat ceiling (pre-refit)'),
 pillars=False, lighting='surface fluorescent tubes + CCTV domes', signage=KIT['signage'],
 features=['M8 beside the entrance', 'refit completed Nov 2019 (photo may predate it)'],
 entrance=dict(style='windowless dark brown brick box at the end of Plantation Park', description='Plain dark brick (#3E2C26) with grey fascia and orange/white roundel + "Subway" lettering', hexes=['#3E2C26', '#8A8C8E']),
 mural=None, confidence='medium', sources=[C + 'Category:Kinning_Park_subway_station', WP + 'Kinning_Park_subway_station']))
st.append(S('cessnock', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin ribbed vaults in silvered panels over each track', widthM=8.5, heightM=3.2, colours=['#C9CACB', '#2A2B2D']),
 wallTile=dict(hex='#C9CACB', pattern='pale silver-grey enamel panels with a Thomson-street line drawing artwork on the vault', bandHex=CHAR, accentHex=ORANGE),
 floor=dict(hex=GREY_FLOOR, material='grey tile'), ceiling=dict(hex='#4A4B4D', material='dark soffit'),
 pillars=False, lighting='surface linear LED', signage=KIT['signage'],
 features=['no escalators - stairs only', 'retained pre-modernisation signage (partly)', 'refit completed Dec 2016'],
 entrance=dict(style='steps down through a tenement basement at the east end of Walmer Crescent (Alexander "Greek" Thomson)', description='Stone steps flanked by two black cast iron arches with the station name (1989); sandstone tenement above', hexes=['#C99A6B', '#1A1A1C']),
 mural="Ink street-scene drawing of Thomson's Walmer Crescent on a vault panel (geograph 5909755)", confidence='medium', sources=[C + 'Category:Cessnock_subway_station', WP + 'Cessnock_subway_station']))
st.append(S('ibrox', platform=dict(type='side', widthM=3.5, lengthM=45),
 vault=dict(shape='box station, flat pale ceiling, no ring vault; glass screens with orange/black dot strips on the island-side track', widthM=14.0, heightM=3.3, colours=['#E6E6E3']),
 wallTile=dict(hex='#F0F0EC', pattern='white glazed tiles', bandHex='#E8501E', accentHex='#1A1A1A'),
 floor=dict(hex=GREY_FLOOR, material='grey large tile, tactile strips'), ceiling=dict(hex='#E6E6E3', material='white lay-in panels with downlights and long LED strips'),
 pillars=False, lighting='long LED tubes + downlights', signage=KIT['signage'],
 features=['glass barrier between the tracks', 'match-day second entrance on Woodville Street', 'reopened Jan 2014 as first revamped south-side station'],
 entrance=dict(style='1970s-80s entrance building on Copland Road, refitted 2013-14', description='Details not confirmed (Faith47 mural nearby on Copland Road)', hexes=['#6B5A50']),
 mural='Faith47 mural on Copland Road opposite Fairley Street (2014, street-side)', confidence='medium', sources=[C + 'Category:Ibrox_subway_station', 'https://www.scotsman.com/news/transport/latest-revamped-glasgow-subway-station-unveiled-1547004']))
st.append(S('govan', platform=dict(type='side', widthM=4.0, lengthM=45),
 vault=dict(shape='wide box station, flat silver ceiling, two round tunnel mouths with brick header rings', widthM=16.0, heightM=3.4, colours=['#D3D6D8', '#101214']),
 wallTile=dict(hex='#F2F2F0', pattern='white square glazed tile', bandHex=ORANGE, accentHex='#101214'),
 floor=dict(hex=GREY_FLOOR, material='grey tile with lozenge tactile strip'), ceiling=dict(hex='#C9CDD0', material='silver metal tile ceiling with LED strips + spotlights'),
 pillars=False, lighting='LED strips and spots', signage=KIT['signage'],
 features=['lift + escalator (accessible)', 'first station with platform screen doors (2025)', 'depot Broomloan just to the south'],
 entrance=dict(style='1970s station refaced 2015-16 with large curved glazed canopies; bus interchange adjacent', description='Dark grey cladded box with a domed/curved glass canopy over the entrance and a glazed Golspie Street entrance; stone paving; bronze sculpture group in the square; Govan Stones banners nearby', hexes=['#3F454B', '#8FB5BC']),
 mural=None, confidence='high', sources=[C + 'Category:Govan_subway_station', 'https://www.ahr.co.uk/projects/govan-subway-and-bus-interchange', SPT]))
st.append(S('partick', platform=dict(type='side', widthM=3.8, lengthM=45),
 vault=dict(shape='box station with octagonal tiled columns; round bored tunnel mouths ringed in dark brick', widthM=16.0, heightM=3.4, colours=['#F3F3F1', '#4A4D52']),
 wallTile=dict(hex='#4A4D52', pattern='dark grey glossy 150 mm square tiles on columns and end walls; white tile on platform walls', bandHex=ORANGE, accentHex='#6C8A96'),
 floor=dict(hex='#B8B5AE', material='light grey-beige tile with tactile strip'), ceiling=dict(hex='#F3F3F1', material='white lay-in metal panels'),
 pillars=True, lighting='LED strips + downlights', signage=KIT['signage'],
 features=['platform screen doors (white frames, orange door leaves) installed 2025-26', 'interchange concourse to National Rail', 'octagonal columns with an orange stripe band and pale-blue bases'],
 entrance=dict(style='big interchange concourse with bus station overhead and railway above', description='Large hall: pale cream floor tiles with grey inlay, white round pillars with blue bands, circular ceiling roses, stainless steel cladding, Costa kiosk', hexes=['#D8CFB8', '#FFFFFF', '#2D4E8C']),
 mural=None, confidence='high', sources=[C + 'Category:Partick_subway_station', WP + 'Partick_station', SPT]))
st.append(S('kelvinhall', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin curved ribbed vaults, timber-slat central soffit (pre-refit photo)', widthM=8.5, heightM=3.1, colours=['#EFE7C8', '#6B5640']),
 wallTile=dict(hex='#EFE7C8', pattern='cream enamel vault panels (pre-2014), white dado', bandHex='#E8C21E', accentHex=ORANGE),
 floor=dict(hex='#D9A860', material='pre-refit tan/orange small tiles in brick bond (refit April 2014: expect grey tile)'),
 ceiling=dict(hex='#6B5640', material='brown timber slats (pre-refit)'),
 pillars=False, lighting='surface fluorescent tubes', signage=KIT['signage'],
 features=['no escalators', 'public art by Paul Buchanan (2014)', 'refit completed April 2014 (look may have changed)'],
 entrance=dict(style='shopfront entrance at the end of an arcade under a red sandstone tenement on Dumbarton Road', description='Glazed shopfront with a white fascia box reading "Kelvinhall" in orange with the SPT logo; sandstone tenement above (#B0603E)', hexes=['#B0603E', '#FFFFFF', ORANGE]),
 mural='Public art by Glasgow musician and artist Paul Buchanan (2014) - not described in sources', confidence='low', sources=[C + 'Category:Kelvinhall_subway_station', SPT]))
st.append(S('hillhead', platform=dict(type='split', widthM=3.2, lengthM=45, note='island plus side platform; glass screens with orange dot strip'),
 vault=dict(shape='flat suspended box ceiling with long LED tubes; round brick-arched tunnel mouth at the ends', widthM=10.0, heightM=3.2, colours=['#E8E8E5', '#2B2D30']),
 wallTile=dict(hex='#F1EFEA', pattern='white rectangular tiles (~300 x 150) stacked', bandHex='#1C1D20', accentHex='#26282B'),
 floor=dict(hex=GREY_FLOOR, material='grey tile; pre-2012 floor was tan-brown small tiles'),
 ceiling=dict(hex='#E8E8E5', material='white panels with linear LED'),
 pillars=False, lighting='long surface LED tubes', signage=dict(style='black name band with white text on white tile; yellow/black pre-2012', hexes=['#1C1D20', '#FFFFFF', ORANGE]),
 features=['first station modernised (opened Sept 2012)', 'two escalators + stair', 'deepest tunnels beyond', 'dark dado tiles'],
 entrance=dict(style='Byres Road entrance foyer with mural', description='Ticket hall with the Alasdair Gray ceramic mural (about 2 m high x 12 m wide) of Hillhead streets and landmarks (University, Kelvingrove, Botanic Gardens) and figure panels, jigsaw tiles with grey grout', hexes=['#C9A24A', '#2F6F73', '#B5502F']),
 mural='Alasdair Gray & Nichol Wheatley ceramic mural, Sadler Green tiles, unveiled 16 Sept 2012', confidence='medium', sources=[C + 'Category:Hillhead_subway_station', 'http://www.sadlergreen.com/blog/glasgow-hillhead-station-mural/', 'https://www.culturematters.org.uk/a-well-built-wall/']))
st.append(S('kelvinbridge', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin curved ribbed vaults over each track, flat dark soffit over the island', widthM=8.5, heightM=3.3, colours=['#D0D6D6', '#1C1D1F']),
 wallTile=dict(hex='#D0D6D6', pattern='pale grey-white enamel vault panels', bandHex=ORANGE, accentHex=CHAR),
 floor=dict(hex=GREY_FLOOR, material='grey tile'), ceiling=dict(hex='#C9C9C4', material='speckled concrete soffit over the island'),
 pillars=False, lighting='linear fluorescent/LED tube', signage=KIT['signage'],
 features=['deepest station', 'pumps run continuously', 'glass-enclosed escalator', 'old cast-iron stair retained as emergency exit', 'refit completed July 2017'],
 entrance=dict(style='glass-enclosed escalator on Great Western Road leading to a surface ticket hall + car park', description='Glazed escalator enclosure; red doors at the foot of the old cast iron stair', hexes=['#B5D4D8', '#C0392B']),
 mural=None, confidence='medium', sources=[C + 'Category:Kelvinbridge_subway_station', WP + 'Kelvinbridge_subway_station']))
st.append(S('st-georges-cross', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin curved ribbed vaults, central dark soffit', widthM=8.5, heightM=3.2, colours=['#EEE9D7', '#1C1D1F']),
 wallTile=dict(hex='#EEE9D7', pattern='cream enamel vault panels', bandHex=ORANGE, accentHex=CHAR),
 floor=dict(hex=GREY_FLOOR, material='grey large tile, tactile strips'), ceiling=dict(hex='#1C1D1F', material='black soffit over the island'),
 pillars=False, lighting='single bright LED tube', signage=KIT['signage'],
 features=['only station rebuilt before 1977 (1971 surface building)', 'heated using recycled tunnel water (SPT)', 'refit completed June 2019'],
 entrance=dict(style='1971 concrete-aggregate building re-clad in dark brown brick with orange tiling (1980)', description='Low building at the Cross with stairs down to Great Western Road side; modern SPT roundel signage', hexes=['#4B342C', ORANGE]),
 mural=None, confidence='medium', sources=[C + 'Category:St_George%27s_Cross_subway_station', WP + "St_George's_Cross_subway_station", SPT]))
st.append(S('cowcaddens', platform=dict(type='island', widthM=3.2, lengthM=45),
 vault=dict(shape='twin curved vaults in mint-green glossy panels (pre-2019 photo)', widthM=8.5, heightM=3.2, colours=['#BFE0CC', '#2A2B2D']),
 wallTile=dict(hex='#BFE0CC', pattern='mint-green enamel vault panels (pre-2019); refit 2018-19 likely changed to white/neutral', bandHex=ORANGE, accentHex=CHAR),
 floor=dict(hex='#D9B779', material='pre-refit cream/tan brick-bond tile with dark grey tactile band (refit 2019: expect grey tile)'),
 ceiling=dict(hex='#3A3B3E', material='dark soffit/black cable trunking'),
 pillars=False, lighting='fluorescent tubes along the vault crown', signage=KIT['signage'],
 features=['Dundasvale traction sub-station', 'refit completed 2019'],
 entrance=dict(style='dark brown brick pavilion with a flat cantilevered grey canopy roof on steel struts', description='Dark brick (#3E2C26) with a grey fascia carrying the roundel and "Subway"; paved forecourt', hexes=['#3E2C26', '#7F8286', ORANGE]),
 mural=None, confidence='medium', sources=[C + 'Category:Cowcaddens_subway_station', WP + 'Cowcaddens_subway_station', SPT]))
out = dict(generated='2026-10-26', note='Visual estimates from reference photographs (not copied); hex values approximate; see research/stations-look.md', stations=st)
json.dump(out, open(os.path.join(ROOT, 'data', 'station_looks.json'), 'w'), indent=1, ensure_ascii=False)
print('ok', len(st))
