/* Content data for "Glasgow Subway: Trains & Power".
   Confidence marks:  H = two independent sources, or a manufacturer/primary document
                      M = one reasonable source, or two that differ slightly
                      L = estimate, inference or modelled value (always labelled in the text)
   "n/k" = not known: nothing reliable was found. */
window.SRC = [
  { id:'wp-rs', t:'Glasgow Subway rolling stock (Wikipedia)', u:'https://en.wikipedia.org/wiki/Glasgow_Subway_rolling_stock', n:'Stadler infobox: 39.51 m, 2,309 mm, 2,642 mm, 695 mm floor, TSA TMW 28-23-4 motors (68 kW each), GMK 2-101-383A gearbox 10.06:1, 540/480 mm wheels, shoe collection. 33 Metro-Cammell cars 1977-79, 8 trailers 1992, ABB Derby refurbishment 1993-95.', r:'M' },
  { id:'wp-sub', t:'Glasgow Subway (Wikipedia)', u:'https://en.wikipedia.org/wiki/Glasgow_Subway', n:'Cable era, Scotland Street power plant, 1935 conversion (GBP 120,000), five 600 V DC substations, one substation can be out of service with full service running, 6-8 min off-peak headways, 1996 VPI resignalling, 2016 contract, dates of Stadler service.', r:'M' },
  { id:'stadler', t:'Stadler datasheet "METRO Glasgow EMU" (MSPT0522e)', u:'https://stadlerrail.com/api/docs/x/3c2214052a/metro-glasgow-spt-en.pdf', n:'Manufacturer datasheet: 104 seats + 6 tip-up, 200 standing at 6/m2, 520 kW continuous and 820 kW maximum at wheel, 130 kN starting tractive effort up to 23 km/h, 1.3 m/s2 gross starting acceleration, 800 kN axial thrust, 58 km/h, Bo\'Bo\'+2\'+2\'+Bo\'Bo\', 1,220 mm gauge, redundant water-cooled IGBT converters, pneumatic suspension.', r:'H' },
  { id:'rg-2018', t:'Railway Gazette: Driverless small-profile metro train for Glasgow presented (InnoTrans 2018)', u:'https://www.railwaygazette.com/innotrans/driverless-small-profile-metro-train-for-glasgow-presented/47234.article', n:'ABB traction converters, Selectron vehicle control, Ansaldo STS signalling overlay, doors, 3.4 m tunnels, GBP 200m contract inside a GBP 288m programme, 16 trains for peak.', r:'H' },
  { id:'re', t:'Rail Engineer: Subway revival - an update on Glasgow\'s modernisation', u:'https://www.railengineer.co.uk/subway-revival-an-update-on-glasgows-modernisation/', n:'39.25 m vs 37.74 m for the old 3-car unit, 310 vs 270 passengers, water-cooled AC motors, IGBT control with regeneration, radial-steering wheelsets, Hitachi CBTC architecture, 4-minute headway reducible to 90 s in UTO, 21 pumping stations, tunnel 3.35 m and 3-40 m deep, Freyssinet lining works.', r:'H' },
  { id:'rt', t:'Railway Technology: Glasgow Subway new trains', u:'https://www.railway-technology.com/features/glasgow-subway-new-trains/', n:'Dimensions broadly as old trains, 1,219 mm gauge, 58 km/h, first unit May 2019, GBP 200m award in 2016.', r:'M' },
  { id:'spt-2023', t:'SPT Partnership paper 15 Dec 2023: Subway Modernisation progress update', u:'https://www.spt.co.uk/media/h2bmkjui/p151223_agenda6.pdf', n:'Substation design review, HV supply analysis, regeneration capture and storage under assessment, negative feeder cable replacement at Byres Road and Dundasvale (Broomloan deferred), axle counters, waveguide communications cable, 17 trains built.', r:'H' },
  { id:'ccg', t:'The Cable Car Home Page: The Glasgow District Subway (after Cassier\'s Magazine, 1898)', u:'https://www.cable-car-guy.com/html/ccgds.html', n:'Cable 1.5 in, 36,300 ft, ~57 t; ~1,700 sheaves per tunnel; 15 mph maximum; two 42 in x 6 ft Corliss engines of ~1,500 hp, one in reserve; eight Lancashire boilers; gripper; 9 t car and 5 t trailer, 48 seats; 3.5 min headway; gradients 1 in 18 / 1 in 20; 660 ft radius.', r:'H' },
  { id:'ccg-eng', t:'Cable Car Home Page: Glasgow District Subway (The Engineer, 1896)', u:'https://cable-car-guy.com/html/cceng_gds.html', n:'Two traction cables 1.5 in steel; car speed 15-16.5 mph; "1000 to 1400 horse power"; 11 ft tunnels; 1 in 20 to 1 in 23 at the Clyde.', r:'M' },
  { id:'hows', t:'Hows: Glasgow Tube', u:'https://www.hows.org.uk/personal/rail/incline/gla.htm', n:'Constant cable speed of 12.5 mph; cars craned in and out; two-car platforms.', r:'M' },
  { id:'hes', t:'British Listed Buildings / Historic Environment Scotland: Subway Power Station, 187 Scotland Street (Category B)', u:'https://britishlistedbuildings.co.uk/200377278-subway-power-station-187-scotland-street-glasgow-glasgow', n:'1895 design by John Gordon; engineers Simpson & Wilson; two 1,500 hp steam engines; Tension Run 193 ft x 33 ft; closed 1935.', r:'H' },
  { id:'summerlee', t:'Summerlee Museum blog: The Electrification of the Subway', u:'https://summerleetg.co.uk/blog/blog13.html', n:'1933-35 conversion: test car No. 60 with two 60 hp motors; 19 cars / 38 power bogies ordered; Metropolitan-Vickers traction, Westinghouse brakes, Hurst Nelson underframes; power from Pinkston via tramway substations at Dalhousie St, Kinning Park, Partick; BTH switchboards.', r:'M' },
  { id:'wikidata', t:'Wikidata Q5566930: Second generation Glasgow Subway rolling stock', u:'https://www.wikidata.org/wiki/Q5566930', n:'12.58 m, 2.34 m, 2.65 m, 20 t, 54 km/h, 41 vehicles built.', r:'L' },
  { id:'scotrail', t:'scot-rail.co.uk: Glasgow Subway', u:'http://www.scot-rail.co.uk/page/Glasgow+Subway', n:'33 cars 1977-79; four traction motors per car; 8 trailers by Hunslet TPL 1992; power cars refurbished 1995 (Adtranz, Derby); trailers refurbished by Railcare from 2007. (Secondary hobby source, via search summary.)', r:'L' },
  { id:'stotles', t:'Public tender notice (via Stotles): DC traction system', u:'https://stotles.com/explore/notices/d4d959ba-07f1-466f-b31e-4246b14a7096/electrical-equipment-and-apparatus', n:'Five substations (one in the depot, four remote) fed from 11 kV or 6.6 kV HV and rectified to 600 V DC. Read through a search summary; the page itself no longer loads.', r:'L' },
  { id:'tsa', t:'TSA Traktionssysteme Austria: Glasgow drive reference', u:'https://tsa.at/?p=24987', n:'Motor 207 kg; axle load 7.5 t (as read through search summary).', r:'L' },
  { id:'commons', t:'Wikimedia Commons: Category Glasgow Subway', u:'https://commons.wikimedia.org/wiki/Category:Glasgow_Subway', n:'Photographs of live-rail arrangement, tunnel mouths and trains.', r:'M' },
  { id:'curbside', t:'Curbside Classic: Trackside Classic, 1896 Glasgow Subway car No. 1', u:'https://www.curbsideclassic.com/trackside-classic/trackside-classic-1896-glasgow-subway-car-no-1-simply-different/', n:'Gripper car description (read through search summary).', r:'L' },
  { id:'sg-24', t:'SPT / travel summaries: circuit about 24 minutes', u:'https://metroeasy.com/scotland/glasgow-subway/', n:'Published full circuit time of about 24 minutes (secondary).', r:'M' },
  { id:'osm', t:'OpenStreetMap contributors via glasgow-subway/research', u:'../glasgow-subway/research/NOTES.md', n:'Loop geometry and station positions; the vertical profile is a model (see the Explorer notes).', r:'M' }
];

window.GENS = [
  { id:'cable', name:'Cable gripper cars', years:'1896-1935', short:'Cable', color:'#c98a4b',
    tag:'Steam at Scotland Street, a moving steel rope, and a clamp under the car.' },
  { id:'electric', name:'Electrified cars', years:'1935-1977', short:'1935 electric', color:'#d9573c',
    tag:'The same Victorian bodies on new bogies, a third rail and motors.' },
  { id:'mc', name:'Metro-Cammell "Clockwork Orange"', years:'1980-2024', short:'Metro-Cammell', color:'#ff7a1f',
    tag:'Purpose-built orange cars with automatic train operation.' },
  { id:'stadler', name:'Stadler METRO', years:'2023-', short:'Stadler', color:'#34c6e8',
    tag:'Four-car walk-through trains with AC drives, built to run without a driver.' }
];

/* rows: label, unit, values per generation (display strings), conf marks, optional num for comparator bars */
window.ROWS = [
  { k:'builder', l:'Builder', v:['Oldbury Railway Carriage & Wagon (grippers 1896-97); Hurst Nelson, Motherwell (trailers from 1898)','Rebuilt from the 1896 cars: Hurst Nelson underframes and bogies; Metropolitan-Vickers traction; Westinghouse brakes','Metro-Cammell, Washwood Heath (33 cars, 1977-79); Hunslet TPL, Leeds (8 centre trailers, 1992)','Stadler Altenrhein (Switzerland) in a JV with Ansaldo STS / Hitachi Rail (ANSTA)'], c:['H','M','H','H'] },
  { k:'fleet', l:'Fleet', v:['30 gripper cars (20 in 1896 + 10 in 1897) and up to 30 trailers','Whole fleet converted by 1938; first order 19 cars (38 power bogies); some trailers, some motor cars','33 power cars + 8 centre trailers = 41 cars; 2- and 3-car sets (split of sets not established)','17 four-car trains (301-317), 68 cars; 16 needed for peak'], c:['M','M','M','H'], num:[60,38,41,68], numLabel:'Cars in fleet' },
  { k:'formation', l:'Formation in service', v:['2 cars: gripper car + trailer, with gangway','2 cars (motor + trailer / motor + motor), 3-man crew cut to 2','2 cars as built; 3 cars (8 sets) after 1992','4 cars, open gangway throughout; two identical half-trains'], c:['H','M','M','H'] },
  { k:'car_len', l:'Car length', u:'m', v:['12.3 (just over 40 ft; trailer slightly shorter)','12.3 (unchanged body)','12.58','about 9.9 average (39.5 m / 4)'], c:['M','M','M','L'], num:[12.3,12.3,12.58,9.9], numLabel:'Car length (m)' },
  { k:'train_len', l:'Train length', u:'m', v:['about 24 (est.)','about 24 (est.)','25.2 (2-car); 37.74 (3-car)','39.25 (Rail Engineer) / 39.51 (Stadler datasheet)'], c:['L','L','H','H'], num:[24,24,37.74,39.5], numLabel:'Train length (m)' },
  { k:'width', l:'Body width', u:'m', v:['2.34','2.34','2.34','2.309'], c:['M','M','M','H'], num:[2.34,2.34,2.34,2.309], numLabel:'Width (m)' },
  { k:'height', l:'Height above rail', u:'m', v:['about 2.7 (est.; roof clearance 9 ft 6 in = 2.9 m)','about 2.7 (est.)','2.65','2.642'], c:['L','L','M','H'], num:[2.7,2.7,2.65,2.642], numLabel:'Height (m)' },
  { k:'mass', l:'Mass (empty)', u:'t', v:['9 t gripper car + 5 t trailer = 14 t per train','n/k (heavier: motors, bogies)','20 t per car (60 t for 3 cars)','n/k; about 67 t derived (see "How the numbers were checked")'], c:['H','L','L','L'], num:[14,null,60,67], numLabel:'Train mass, empty (t)' },
  { k:'seats', l:'Seats / capacity', v:['48 seats per gripper car; standing room for "a similar number"','n/k','Design figure 36 seated + 54 standing per car (1975); 270 per 3-car train (Rail Engineer)','104 fixed + 6 tip-up seats; 200 standing at 6/m2: about 310 in all'], c:['H','L','L','H'], num:[96,null,270,310], numLabel:'Passengers per train' },
  { k:'vmax', l:'Top speed', u:'km/h', v:['cable 12.5 mph (20 km/h) constant per most accounts; 15 mph (24 km/h) maximum quoted','n/k (probably similar to line speed)','54 (Wikidata) - about 55','58 (design maximum; line limit modelled at 55)'], c:['M','L','M','H'], num:[24,null,54,58], numLabel:'Top speed (km/h)' },
  { k:'prop', l:'Propulsion', v:['None on the car. Gripper clamps a moving 1.5 in steel cable driven by two 1,500 hp steam engines','2 x 60 hp motors in the 1934 test car; Metropolitan-Vickers equipment; 38 power bogies in the first order','4 traction motors per power car (GEC); control gear type n/k','8 x 68 kW three-phase AC asynchronous motors (TSA TMW 28-23-4), water-cooled; 520 kW continuous / 820 kW peak at the wheel'], c:['H','M','M','H'], num:[null,null,null,820], numLabel:'Peak power at wheel (kW)' },
  { k:'supply', l:'Supply / collection', v:['Steam: 8 Lancashire boilers, 120 psi','600 V DC third rail; pick-up skids replaced wheels. Lighting from two wall-mounted T-iron rails','600 V DC third rail, contact shoe','600 V DC third rail, contact shoe; regenerative braking to the rail'], c:['H','H','H','H'] },
  { k:'accel', l:'Acceleration', u:'m/s2', v:['gripper-limited, gentle','n/k','n/k','1.3 starting, gross (datasheet); service profile modelled 0.66-1.3'], c:['L','L','L','H'], num:[null,null,null,1.3], numLabel:'Starting acceleration (m/s2)' },
  { k:'control', l:'Train control', v:['Driver works the gripper handwheel; block signals with treadles; 3.5 min headway','Driver; air-operated doors and gates; signals as before','Automatic train operation (driver closes doors and presses start); 1996 VPI interlocking','Hitachi CBTC with ATO; designed for unattended operation; Selectron vehicle control'], c:['H','M','H','H'] },
  { k:'brakes', l:'Braking', v:['Release the cable, apply car brakes (type n/k)','Westinghouse air brake','n/k (friction; regenerative not documented)','Regenerative + friction (blend assumed); air suspension, pneumatic systems'], c:['L','M','L','M'] },
  { k:'gauge', l:'Gauge', u:'mm', v:['1,219 (4 ft)','1,219 (4 ft)','1,220 (nominal)','1,220 (datasheet) / 1,219'], c:['H','H','H','H'] }
];

window.SUBS = [
  { id:'bridge', name:'Bridge Street', near:'bridge-street', note:'South side, close to the Clyde crossing', conf:'M' },
  { id:'cornwall', name:'Cornwall Street', near:'kinning-park', note:'At Kinning Park', conf:'M' },
  { id:'broomloan', name:'Broomloan Depot', near:'depot', note:'In the depot at Govan; the only above-ground one', conf:'H' },
  { id:'byres', name:'Byres Road', near:'hillhead', note:'At Hillhead', conf:'M' },
  { id:'dundasvale', name:'Dundasvale', near:'cowcaddens', note:'At Cowcaddens', conf:'M' }
];

window.TIMELINE = [
  { y:1890, t:'Act of Parliament authorises the Glasgow District Subway Company.', k:'infra' },
  { y:1895, t:'Scotland Street power house designed: two 1,500 hp steam engines, eight boilers.', k:'power' },
  { y:1896, t:'14 Dec: cable-hauled circle opens. Gripper cars from Oldbury.', k:'train' },
  { y:1898, t:'Hurst Nelson begins building trailers.', k:'train' },
  { y:1923, t:'Glasgow Corporation takes over the company.', k:'infra' },
  { y:1934, t:'Third-rail test with car No. 60 (two 60 hp motors); authority to electrify.', k:'power' },
  { y:1935, t:'Inner circle electric from 31 March; cable stops 30 Nov. 600 V DC third rail.', k:'power' },
  { y:1938, t:'All cars converted to motor or trailer cars.', k:'train' },
  { y:1977, t:'21 May: closure for rebuilding. Metro-Cammell delivers 33 cars 1977-79.', k:'train' },
  { y:1980, t:'16 Apr: reopens with ATO and the orange fleet; five substations in service by now (installation date not found).', k:'power' },
  { y:1992, t:'Eight centre trailers (Hunslet) make three-car sets.', k:'train' },
  { y:1995, t:'ABB / Adtranz Derby refurbishes the power cars (1993-95).', k:'train' },
  { y:1996, t:'Resignalled with Vital Processor Interlocking.', k:'sig' },
  { y:2016, t:'Mar: GBP 200m contract to Stadler and Ansaldo STS for 17 trains and signalling.', k:'train' },
  { y:2018, t:'Stadler METRO shown at InnoTrans; first train arrives May 2019.', k:'train' },
  { y:2023, t:'11 Dec: first passenger service by Stadler trains.', k:'train' },
  { y:2024, t:'28 Jun: last Metro-Cammell service. Substation design review under way.', k:'power' },
  { y:2026, t:'Platform screen doors being commissioned; regeneration storage under study.', k:'sig' }
];

window.GLOSS = [
  ['ATO','Automatic train operation: the system drives the train between stations; a driver may still close the doors (GoA2).'],
  ['CBTC','Communications-based train control. Trains report position by radio-like links and receive movement authority from a zone controller.'],
  ['Corliss engine','Large slow steam engine with rotary valves, used to drive the 1896 cable drums.'],
  ['Gripper','Clamp under a cable car that closes on the moving rope to pull the car and opens to release it.'],
  ['GoA2 / GoA4','Grades of automation. GoA2: automatic with a driver. GoA4: unattended train operation (UTO).'],
  ['IGBT','Insulated-gate bipolar transistor: the switch inside a modern traction inverter.'],
  ['Regenerative braking','Motors act as generators when the train slows, feeding power back to the rail.'],
  ['Receptivity','How much regenerated power the rest of the network can absorb at that moment. Unused power is burned in a brake resistor.'],
  ['Third rail','A live conductor beside the running rails. Here 600 V DC, collected by a sliding shoe.'],
  ['Negative feeder','Cable that carries return current from the running rails back to the substation.'],
  ['Stray current','Return current that leaves the rails and corrodes metalwork underground.'],
  ['Tractive effort','The pulling force the wheels exert on the rail, in kilonewtons.'],
  ['Constant-power region','Above base speed (23 km/h here) the force falls as 1/speed because power is capped.'],
  ['Bo\'Bo\' + 2\' + 2\' + Bo\'Bo\'','UIC axle notation. Bo\'Bo\': two bogies with two motored axles each. 2\': one unpowered two-axle bogie. Twelve axles per train, eight of them driven.'],
  ['UTO','Unattended train operation: no staff on board.'],
  ['VPI','Vital Processor Interlocking: the computer-based interlocking installed in 1996.']
];
