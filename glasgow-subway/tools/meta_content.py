#!/usr/bin/env python3
"""Authoring source for research/meta_src.json (meta, tunnel params, rolling stock, timeline). Run: python tools/meta_content.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WP = 'https://en.wikipedia.org/wiki/'
meta = dict(name='Glasgow Subway', operator='Strathclyde Partnership for Transport (SPT)', opened='1896-12-14', stations=15, gauge_mm=1220,
  gauge_note='4 ft (1,219 mm) - the nominal 1,220 mm; unusual narrow gauge',
  tunnel_diameter_m=3.35, electrification='600 V DC third rail (side-contact, since 1935)', loops='Outer Circle (clockwise) and Inner Circle (anticlockwise), separate single-bore tunnels',
  description='A 10.5 km (6.5 mi) double-track circle under Glasgow, the third-oldest underground metro in the world and never extended.',
  sources=[
    dict(title='Glasgow Subway - Wikipedia', url=WP + 'Glasgow_Subway'),
    dict(title='Glasgow Subway rolling stock - Wikipedia', url=WP + 'Glasgow_Subway_rolling_stock'),
    dict(title='List of Glasgow Subway stations - Wikipedia', url=WP + 'List_of_Glasgow_Subway_stations'),
    dict(title='Station articles (Buchanan Street, St Enoch, Bridge Street, ... Cowcaddens, Partick, Merkland Street) - Wikipedia', url=WP + 'Category:Glasgow_Subway_stations'),
    dict(title='The Glasgow District Subway (Cassier\'s Magazine, 1898) - Cable Car Home Page', url='https://www.cable-car-guy.com/html/ccgds.html'),
    dict(title='Glasgow District Subway - RAILSCOT', url='https://www.railscot.co.uk/companies/G/Glasgow_District_Subway/'),
    dict(title='Glasgow Subway new trains - Railway Technology', url='https://www.railway-technology.com/features/glasgow-subway-new-trains/'),
    dict(title='Glasgow Subway Stadler trains enter passenger service - Railway Gazette', url='https://www.railwaygazette.com/urban-rail/glasgow-subways-stadler-trains-enter-passenger-service/65523.article'),
    dict(title='OpenStreetMap contributors (railway=subway ways, stations, entrances, water) - ODbL', url='https://www.openstreetmap.org/copyright'),
    dict(title='Terrain tiles (Terrarium, Mapzen/AWS) for surface elevation', url='https://registry.opendata.aws/terrain-tiles/')],
  accuracy='Plan-view track geometry is derived from OpenStreetMap (itself partly traced from historic OS plans). Depths, vertical profile, platform lengths/widths, speed limits and train performance are ESTIMATES unless a source says otherwise - see research/NOTES.md.')
tunnel = dict(innerDiameterM=3.35, nominalDiameterFt=11, lining='cast iron segmental rings (British Hydraulic Foundry, Whiteinch) or mass concrete; brick-lined in places; much cut-and-cover under streets; river crossings driven under compressed air',
  construction='Engineers Simpson & Wilson; contractors incl. Robert McAlpine (rock), Charles Brand, Hugh Kennedy, John Patterson, George Talbot, David Shanks, Watt & Wilson, James Smith. Two parallel single-bore tunnels, each opening into a single 28 ft-span arch at island-platform stations.',
  railTopToCrownM=2.9, minRadiusM=201, minRadiusNote='Sharpest curve reported as 660 ft radius (Cassier 1898); the supplied smoothed centreline has locally tighter apparent curvature in places.',
  maxGradient='1 in 18 (5.6%) and 1 in 20 (5%) beneath the Clyde (1898 report); stations sit at summits of ~1 in 40 so trains climb into and fall out of each platform',
  depthRangeM=dict(min=2.1, minNote='7 ft below surface between Kinning Park and Cessnock', max=47, maxNote='155 ft below Glasgow Street near Hillhead', cityCentre=12, average=8.8),
  tubeSeparationM=6.5, riverCrossingsNote='Clyde crossed twice (St Enoch-Bridge Street, Govan-Partick), Kelvin once (Hillhead-Kelvinbridge).',
  substations=['Broomloan Depot', 'Byres Road (Hillhead)', 'Dundasvale (Cowcaddens)', 'Bridge Street', 'Cornwall Street (Kinning Park)'],
  ghostStation=dict(name='Merkland Street', note='Closed 21 May 1977; replaced by Partick (25 m NE). A long straight humped large-diameter tunnel section marks the site; no platforms remain.'),
  depot=dict(name='Broomloan Depot', location='Govan, between Govan and Ibrox stations', connection='Ramp/points off both tunnels between Ibrox and Govan (1977-80); before 1977 trains were craned onto the line at Govan workshops', note='Only above-ground part of the system'))
rolling = dict(
 current=dict(name='Stadler Subway train (third generation)', builder='Stadler Rail, Altenrhein (Switzerland); signalling Ansaldo STS (Hitachi Rail)', fleet='301-317', units=17, cars=4,
   formation='articulated 4-car, open gangway; motor bogies on the two end cars (Bo\'Bo\'+2\'+2\'+Bo\'Bo\')', length_m=39.3, lengthNote='sources: 39.2-39.51 m (same overall length as the 3-car train it replaced)', width_m=2.31, height_m=2.64, floorHeight_m=0.695,
   capacity=dict(total=320, seated=118, standing=204, note='reported 310-322'), doorsPerSide=6, max_speed_kmh=58, max_speed_mph=36,
   accel_ms2=1.0, decel_service_ms2=1.0, decel_emergency_ms2=1.3, accelNote='ESTIMATE - not published in sources found', mass_t=60, massNote='ESTIMATE (tare)',
   power_kW=272, motors='4 x 68 kW asynchronous AC (TSA TMW 28-23-4)', supply='600 V DC third rail', coupler='Scharfenberg', body='extruded aluminium', gauge_mm=1219, wheelDia_mm='540-480', wheelbase_mm=1650,
   operation='Designed for unattended (driverless) operation; platform screen doors + CBTC being installed through 2026; contract GBP 200 m (2016)',
   entered_service='2023-12-11', livery='SPT orange with white/grey patches'),
 history=[
  dict(era='1896-1935', name='Cable-hauled gripper cars', builder='Oldbury Railway Carriage & Wagon (gripper cars, 1896-97); Hurst Nelson, Motherwell (trailers, 1898+)', formation='2 cars: gripper car + trailer', length_m=12.3, width_m=2.34, capacity_seated=48, weight_t=9, trailerWeight_t=5, max_speed_kmh=24, speedNote='cable speed max 15 mph', note='Wooden bodies; lattice gates at ends; doors one side only; endless cable gripper; livery plum and cream; 20+10 gripper cars, 30 trailers'),
  dict(era='1935-1977', name='Electrified 1896 cars', formation='2 cars', supply='600 V DC third rail with skids', note='Converted 1935 (GBP 120,000); red and white then all-red livery; air-operated doors in 1960s; "Shoogly Train"; withdrawn 1977; car 41 preserved'),
  dict(era='1980-2024', name='Metro-Cammell second generation', builder='Metro-Cammell, Washwood Heath (33 cars 1977-79; 8 centre trailers by Hunslet 1992); GEC motors; refurbished ABB Derby 1993-95', formation='3 cars', length_m=39.24, width_m=2.34, height_m=2.65, max_speed_kmh=54, note='Bright orange livery ("Clockwork Orange"), later Strathclyde red then cream and carmine (2006) then orange (2011); automatic train operation with driver closing doors; withdrawn 28 June 2024')])
T = lambda y, t, x: dict(year=y, title=t, text=x)
timeline = [
 T(1890, 'Authorised', 'The Glasgow District Subway Act 1890 authorises the Glasgow District Subway Company.'),
 T(1891, 'Construction begins', 'Tunnelling starts, a mixture of cut-and-cover, brick tunnelling and iron-lined bores; the Clyde is crossed under compressed air.'),
 T(1896, 'Opening day, 14 December', 'The cable-hauled circle opens with 15 stations. That night one car carrying 60 passengers is struck by another under the Clyde; four are injured and the line closes until 19 January 1897.'),
 T(1923, 'Municipal ownership', 'Glasgow Corporation takes over the company for GBP 385,000.'),
 T(1935, 'Electrification', 'Cars converted to 600 V DC third-rail power; the last cable-hauled service runs on 30 November 1935 (driver Robert Boyd). The system is renamed the Glasgow Underground in 1936.'),
 T(1940, 'Wartime bomb', 'On 18 September a German bomb lands on a bowling green south of Merkland Street and damages both tunnels; part of the line stays shut until January 1941.'),
 T(1971, 'St George\'s Cross rebuilt', 'The surface building is rebuilt for the Inner Ring Road.'),
 T(1977, 'Closure for modernisation', 'Cracks in the roof of Govan Cross bring closure on 21 May 1977, eight days early. Stations are rebuilt, side platforms added, Merkland Street closed and Partick planned.'),
 T(1979, 'Royal inauguration', 'On 1 November 1979 the Queen and Prince Philip ride from Buchanan Street to St Enoch.'),
 T(1980, 'Reopening, 16 April', 'The modernised Glasgow Underground opens with new orange Metro-Cammell trains, automatic train operation and new ticketing.'),
 T(1992, 'Fourth car added', 'Eight centre trailers make all trains three-car.'),
 T(1996, 'Resignalled', 'Vital Processor Interlocking resignalling.'),
 T(2003, 'Back to "Subway"', 'SPT officially readopts the name Subway.'),
 T(2012, 'Hillhead refurbished', 'First station of the SPT programme completed; Alasdair Gray mural unveiled.'),
 T(2016, 'Stadler contract', 'SPT awards Stadler and Ansaldo STS a GBP 200 m contract for 17 driverless-capable trains.'),
 T(2023, 'New trains in service', 'First passenger service with Stadler trains on 11 December 2023.'),
 T(2024, 'Old trains retired', 'The Metro-Cammell fleet is withdrawn on 28 June 2024.'),
 T(2026, 'Contactless and screen doors', 'Contactless payment introduced; platform screen doors being commissioned station by station.')]
json.dump(dict(meta=meta, tunnel=tunnel, rollingStock=rolling, timeline=timeline), open(os.path.join(ROOT, 'research', 'meta_src.json'), 'w'), indent=1, ensure_ascii=False)
print('ok')
