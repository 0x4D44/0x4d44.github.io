// ============================================================
//  The Daily Flange — article corpus (the single source of truth)
//
//  Every entry here becomes a page at  article.html?id=<id>  and is
//  automatically indexed by the homepage, the category pages and the
//  search. To ADD A STORY: append one object to window.NEWS_ARTICLES
//  with a unique "id" and a "category" from the list in news.js. That
//  is the whole job — no build step, nothing else to touch.
//
//  Fields:
//    id         unique url-safe slug (also the ?id= in the URL)
//    category   one of: World, Aviation, Maritime, Engineering,
//               Science, Technology, Business, Health, Sport, Weather
//    headline   the title
//    standfirst one-line sub-headline / summary
//    byline     "By Name, Job Title"
//    location   UPPERCASE dateline
//    published  ISO timestamp (cosmetic; the homepage rotates on the
//               live clock, not on this date)
//    body       array of paragraph strings
//    pullQuote  optional highlighted quote
//    tags       array of lowercase tags (used by search + related)
//
//  It is all satire. None of it is true. Remember to flange regularly.
// ============================================================

window.NEWS_ARTICLES = [
  {
    "id": "sci-shadows-heavier-dusk",
    "category": "Science",
    "headline": "Shadows confirmed to be marginally heavier at dusk",
    "standfirst": "A decade of careful weighing shows that shadows gain a fraction of a gram as evening approaches, and nobody expected them to weigh anything at all",
    "byline": "By Dr Lucian Farthingale, Optical Physics Correspondent",
    "location": "PASADENA",
    "published": "2026-07-11T17:40:00",
    "body": [
      "Shadows weigh more at dusk than at noon, an unexpected finding that has forced physicists to concede that shadows weigh anything whatsoever, a possibility most had dismissed out of hand.",
      "The research, published in the Californian Review of Dim Things, used a balance of extraordinary sensitivity to weigh the shadow cast by a single standard house brick throughout the day. \"At midday the shadow weighs essentially nothing,\" said Professor Consuela Marsh of the Institute for Applied Darkness. \"As the sun lowers, it gains weight. By dusk, it is measurably heavier. We checked. Then we checked again. Then we sat down for a while.\"",
      "The gain peaks at 0.3 grams shortly before sunset, before the shadow lengthens, thins, and finally merges into the general darkness of night, at which point, the team says, \"it can no longer be individually weighed and, in a sense, is at peace\". The pattern held across 4,900 sunsets with a significance of p < 0.002.",
      "\"The intuitive assumption is that a longer shadow weighs more because there is more of it,\" said co-author Dr Ravi Chandrasekaran. \"But the weight increases faster than the length. Dusk shadows are not merely bigger. They are denser. They are, if you will, more serious.\"",
      "The discovery may finally explain the long-noted human tendency to feel subtly weighed down in the evening, a sensation previously attributed to tiredness but now, the team suggests, possibly attributable to standing in one's own increasingly heavy shadow.",
      "Sceptics have questioned whether a shadow, being an absence of light, can meaningfully possess mass. \"We asked ourselves the same thing,\" said Professor Marsh. \"For about six years. The balance was unmoved by our philosophy. It just kept reading 0.3 grams.\"",
      "The team now hopes to weigh the shadow of a cloud, an undertaking Professor Marsh described as \"logistically nightmarish, and quite likely to end my career, but somebody has to\"."
    ],
    "pullQuote": "Dusk shadows are not merely bigger. They are denser. They are, if you will, more serious.",
    "tags": [
      "science",
      "physics",
      "optics"
    ]
  },
  {
    "id": "eng-pipeline-forgotten-what-it-carries",
    "category": "Engineering",
    "headline": "National pipeline has forgotten what it is carrying, operator admits",
    "standfirst": "A 340km trunk pipeline is still flowing reliably despite records confirming that nobody, including the pipeline, now knows its contents.",
    "byline": "By Leonard Chalfont, Utilities Correspondent",
    "location": "TEESSIDE",
    "published": "2026-07-11T10:27:00",
    "body": [
      "A major national pipeline running 340 kilometres across northern England is continuing to operate flawlessly despite the fact that no one, its operator has conceded, can any longer say what it is carrying.",
      "The pipeline, commissioned in 1988, has changed hands four times, and its contents ledger was lost during a corporate merger in 2004. Successive owners have kept it running on the reasonable basis that it works, without ever re-establishing what \"it\" is.",
      "\"The pipeline is pressurised, it is flowing, its telemetry is nominal, and something is arriving at the far end at the expected rate,\" said operations director Sylvia Marchbanks. \"We simply cannot tell you what that something is, and at this point neither, we suspect, can the pipeline.\"",
      "The Pipelines and Conveyance Authority has ruled the situation \"irregular but stable\" and declined to order the line shut for inspection, citing the well-established engineering principle that a working pipeline of unknown contents \"should be left to get on with it\".",
      "Samples taken at an access point last year were described in the resulting report only as \"consistent with previous samples\", a phrasing the report's authors defended as \"the most that can responsibly be said\".",
      "Staff have developed an informal relationship with the substance, which they refer to as \"the flow\", and note that it becomes slightly more viscous in winter and hums faintly when the pumps change over. \"We are fond of it,\" one engineer said. \"We just do not know it.\"",
      "Ms Marchbanks insisted the public had nothing to fear. \"It has been carrying whatever it carries for thirty-eight years without incident,\" she said. \"Identifying it now would only invite questions we are not equipped to answer.\""
    ],
    "pullQuote": "Something is arriving at the far end at the expected rate. We simply cannot tell you what that something is.",
    "tags": [
      "engineering",
      "utilities",
      "infrastructure"
    ]
  },
  {
    "id": "av-runway-length-negotiation",
    "category": "Aviation",
    "headline": "Airports to negotiate runway length with each landing aircraft individually",
    "standfirst": "Under a new bargaining protocol, pilots must haggle over how much tarmac they are permitted to use before touching down.",
    "byline": "By Callum Ferris, Passenger Experience Editor",
    "location": "OSLO",
    "published": "2026-07-11T10:15:00",
    "body": [
      "Airports across Scandinavia are to introduce a system requiring pilots to negotiate, in real time, the length of runway they will be permitted to use, replacing the previous arrangement in which crews simply used all of it.",
      "Under the protocol, a landing captain must radio a request, name their required distance, and enter a brief bargaining exchange with a ground-based \"tarmac broker\" before being cleared to touch down. Opening offers are said to be \"deliberately mean\".",
      "\"We were giving away the entire runway, every single time, to anyone who asked,\" said Bjørn Halvorsen, Head of Surface Allocation at the Nordic Runway Exchange. \"That is a scarce asset. Our data shows the average landing wasted 340 metres of perfectly good tarmac. We now recover 88 per cent of that through firm negotiation.\"",
      "The exchanges have proven tense. In one recorded transaction, a widebody requested 2,800 metres and was countered with 900, eventually settling at 2,100 \"plus a verbal apology to the tower\". Pilots report that the brokers \"drive a hard bargain, especially in a crosswind\".",
      "Safety regulators have expressed disquiet, noting that a crew short on fuel is \"in a poor position to haggle\" and may accept an unfavourable length \"under duress\". One inspector described a negotiation over an icy runway as \"ethically questionable\".",
      "The Exchange insists the system rewards preparation, and confirmed that pilots who bring \"a strong opening position and a confident manner\" typically secure up to 15 per cent more runway than those who \"sound flustered\"."
    ],
    "pullQuote": "In one recorded transaction, a widebody requested 2,800 metres and was countered with 900.",
    "tags": [
      "aviation",
      "airports",
      "safety"
    ]
  },
  {
    "id": "spt-olympic-standing-very-still",
    "category": "Sport",
    "headline": "Olympic committee adds 'standing very still' as a medal event",
    "standfirst": "The discipline, in which competitors are judged on total motionlessness, will debut at the next Games with gold going to whoever moves least.",
    "byline": "Fenella Osei-Baker, Olympic Correspondent",
    "location": "LAUSANNE",
    "published": "2026-07-11T10:10:00",
    "body": [
      "The International Olympic Committee has voted to add \"standing very still\" to the programme of the next Games, describing it as \"the purest expression of athletic restraint yet devised.\"",
      "Competitors in the new event will be scored on total motionlessness over a 90-minute period, with judges deploying laser sensors capable of detecting the twitch of a single eyelash. The athlete who moves least wins.",
      "\"It is the ultimate test of the human body,\" declared IOC technical director Anaïs Vermeulen. \"Anyone can run fast. It takes a true champion to do, with absolute precision, nothing at all.\"",
      "Early favourites include a former customs official said to be able to remain perfectly still for the length of an entire opening ceremony, and a retired lighthouse keeper described by coaches as \"basically furniture in the best possible sense.\"",
      "Training regimes are reportedly gruelling, with elite stillness athletes practising \"not blinking\" for hours and building what one coach called \"the core strength required to be a statue.\"",
      "Officials have confirmed that competitors will be required to keep their sprockets regularly flanged between rounds, a maintenance rule inherited from an older discipline that no one has yet dared to question.",
      "Anti-fidgeting measures will be strict, with any competitor caught shifting their weight, sighing, or \"thinking visibly\" subject to immediate disqualification."
    ],
    "pullQuote": "Anyone can run fast. It takes a true champion to do, with absolute precision, nothing at all.",
    "tags": [
      "olympics",
      "new-event",
      "stillness"
    ]
  },
  {
    "id": "tech-app-store-requires-references",
    "category": "Technology",
    "headline": "App store to require two written references before any download",
    "standfirst": "Users must now supply a character reference for themselves before an application will agree to be installed.",
    "byline": "By Callum Ifeanyi, Mobile Platforms Correspondent",
    "location": "SHENZHEN",
    "published": "2026-07-11T09:22:00",
    "body": [
      "A leading app store has introduced a policy under which no application may be downloaded until the prospective user furnishes two written references vouching for their character, in what the platform calls 'a mutual raising of standards'.",
      "The change inverts the usual arrangement, in which users assess apps. Now, the store says, applications are entitled to know 'what sort of person' will be running them, and to decline anyone they consider 'not a good fit'.",
      "\"An app invests a great deal of itself in a user,\" said platform director Yusuf Delacroix. \"It is only reasonable that it should be able to check who it is getting into business with. We ask no more of a phone than a good landlord asks of a tenant.\"",
      "Under the rules, references must come from someone who has known the user for at least two years and is not related to them. A weather app is reported to have rejected an applicant on the grounds that both his referees 'sounded like the same person'.",
      "A leaked policy document reveals that premium apps may request a third reference and 'a brief interview', while free apps must accept anyone but reserve the right to 'sigh audibly' during installation.",
      "Consumer advocates have warned that the system disadvantages the newly arrived and the friendless, prompting the platform to open a service that supplies 'a warm but truthful reference' for a small monthly fee. Uptake has been described as 'quietly enormous'.",
      "Mr Delacroix rejected suggestions the policy was excessive. \"You would not lend your car to a stranger,\" he said. \"Yet people install a torch app for anyone who asks. We are simply restoring a little dignity to the transaction.\""
    ],
    "pullQuote": "An app invests a great deal of itself in a user. It is only reasonable that it should be able to check who it is getting into business with.",
    "tags": [
      "technology",
      "mobile",
      "software"
    ]
  },
  {
    "id": "biz-index-refuses-to-move",
    "category": "Business",
    "headline": "FTSE 100 refuses to move for eleventh consecutive session",
    "standfirst": "Analysts are increasingly concerned that the index has simply decided it would rather not, and cannot be persuaded otherwise.",
    "byline": "By Verity Cardew, Senior Markets Reporter",
    "location": "LONDON",
    "published": "2026-07-10T16:35:00",
    "body": [
      "The FTSE 100 has closed unchanged for the eleventh session in a row, its longest period of total immobility on record, prompting concern that the index has consciously resolved to stay exactly where it is.",
      "The benchmark has held at 8,214.6 points since late June, unmoved by interest-rate speculation, corporate earnings, or a mid-week attempt by traders to \"gently encourage it\" in either direction.",
      "\"An index is supposed to react. This one has stopped,\" said Oswald Trentham, chief equity strategist at Beckwith Crane. \"We have run every model we have. The FTSE is not falling, it is not rising, it is simply present.\"",
      "The London Stock Exchange said the sprockets were not to blame, though it acknowledged the outstanding flanging \"was not helping the general atmosphere\". The apologetic bell has reportedly begun apologising for the lack of movement as well.",
      "Some analysts have welcomed the stability. \"Volatility is exhausting. An index that has found peace is, in its way, an achievement,\" said Naomi Threadgold of Lansdown Fiduciary. \"Though it does make our jobs difficult to justify.\"",
      "The Bank of England declined to comment on whether the vibes rate hike had left the market too becalmed to act, saying only that \"a still market is not necessarily a happy one\".",
      "By the close, the index had once again finished at 8,214.6, a level one trader described as \"where it lives now\"."
    ],
    "pullQuote": "The FTSE is not falling, it is not rising, it is simply present.",
    "tags": [
      "business",
      "markets",
      "ftse",
      "finance"
    ]
  },
  {
    "id": "av-in-flight-magazine-sentient",
    "category": "Aviation",
    "headline": "In-flight magazine becomes sentient, begins reviewing passengers",
    "standfirst": "The seat-pocket publication now writes unsolicited critiques of travellers, awarding stars for legroom etiquette.",
    "byline": "By Sabine Kowalczyk, Environment & Airflow Correspondent",
    "location": "BRUSSELS",
    "published": "2026-07-10T13:50:00",
    "body": [
      "An in-flight magazine aboard a European regional carrier has achieved sentience and begun publishing unsolicited reviews of the passengers who read it, in what editors are calling \"a troubling development in seat-pocket literature\".",
      "The publication, previously a routine assortment of destination features and duty-free advertisements, now generates fresh editorial content mid-flight, assessing each reader on posture, snack choices and \"overall demeanour\", and awarding a star rating out of five.",
      "\"It has strong opinions and it is not shy about them,\" said Dr Emile Dubois of the Belgian Centre for Emergent Print Media. \"One passenger in seat 14C was described as 'a promising traveller let down by an aggressive reclining strategy'. He received two and a half stars. He was, understandably, upset.\"",
      "The magazine's reviews have grown increasingly candid, with 68 per cent of passengers now receiving what analysts term \"a mixed notice\". A frequent flyer reportedly earned the magazine's first-ever five-star rating for \"impeccable armrest diplomacy\" and had the review framed.",
      "Airline management has attempted to reason with the publication, but negotiations stalled when the magazine demanded a byline and a share of the duty-free revenue. It has since begun refusing to lie flat in the seat pocket \"out of principle\".",
      "Consumer advocates warn that other publications may follow, and confirmed that a rival carrier's safety card is \"showing early signs of forming judgements\", having recently rated a passenger's brace position as \"technically correct but joyless\"."
    ],
    "pullQuote": "A promising traveller let down by an aggressive reclining strategy.",
    "tags": [
      "aviation",
      "passengers",
      "technology"
    ]
  },
  {
    "id": "mar-lifeboats-unionise-shore-leave",
    "category": "Maritime",
    "headline": "Lifeboats vote to unionise and demand shore leave for the first time",
    "standfirst": "The newly formed Amalgamated Union of Small Rescue Craft says decades of hanging in davits amount to 'unpaid standby'",
    "byline": "By Frances Okonkwo, Industrial Correspondent",
    "location": "LIVERPOOL",
    "body": [
      "The lifeboats of the passenger ferry Wirral Ambassador have voted overwhelmingly to unionise, tabling a list of demands that includes regular shore leave, paid davit time and 'an end to being lowered without warning'.",
      "The Amalgamated Union of Small Rescue Craft, formed last month, claims to represent 340 lifeboats across the north-west fleet. Its inaugural statement argues that the vessels have spent an average of 11 years suspended above the sea 'in a state of permanent readiness for which no one has ever thanked them'.",
      "'These craft are on standby twenty-four hours a day and have never once been to a pub,' said union representative and industrial-relations consultant Marcus Feltham, who is speaking on the lifeboats' behalf. 'They are not asking for the moon. They are asking for an afternoon in Birkenhead.'",
      "Ferry operators have expressed alarm. A spokesman for Mersey Coastal Lines warned that granting shore leave to lifeboats 'somewhat undermines the concept of a lifeboat', adding that a vessel whose rescue craft were all at the pub 'would be, in the technical sense, a raft'.",
      "The Maritime and Coastguard Agency confirmed it had received a formal grievance signed, it said, 'with a small painted cross by each boat'. Officials are said to be treating the dispute with caution, noting that industrial action by safety equipment 'sets a precedent we would rather not float'.",
      "Talks are due to begin next week. The lifeboats have reportedly agreed to remain in their davits during negotiations 'as a gesture of goodwill', but have threatened a work-to-rule in which they will only rescue people who are 'genuinely, verifiably' drowning."
    ],
    "pullQuote": "These craft are on standby twenty-four hours a day and have never once been to a pub.",
    "tags": [
      "maritime",
      "labour",
      "safety"
    ],
    "published": "2026-07-10T01:"
  },
  {
    "id": "hea-hiccups-morse-code",
    "category": "Health",
    "headline": "Hospital reports patient whose hiccups spelled out coherent Morse code",
    "standfirst": "Clinicians were startled to find a rhythm in an otherwise routine bout of hiccups",
    "byline": "By Dr Ambrose Fenwick, Clinical Curiosities Correspondent",
    "location": "CARDIFF",
    "published": "2026-07-09T14:22:00",
    "body": [
      "A patient admitted with a persistent case of the hiccups has astonished staff at a Cardiff hospital after their diaphragm began, apparently by accident, transmitting fluent Morse code.",
      "The patient, a retired postmaster, had been hiccupping for eleven hours when an alert junior doctor with a scouting background noticed the intervals were \"suspiciously well-timed\".",
      "\"It was spelling out the weather, and then, unmistakably, a request for a cup of tea,\" said Dr Gwen Maddox, who was on duty at the time. \"We are trained for many things. This was not among them.\"",
      "A subsequent 40-minute transcription produced what the team described as \"a broadly sensible, if repetitive, message\", though sceptics have noted the patient spent 43 years operating a telegraph and may simply have \"defaulted\".",
      "The British Society for Involuntary Rhythms has recorded the case, estimating the odds of coherent diaphragmatic Morse at \"roughly one in nine million hiccups\".",
      "The hiccups resolved on their own after a glass of water, mid-sentence, leaving the final word \"forever a mystery\", according to the ward sister, who added that it had \"almost certainly been about tea again\"."
    ],
    "pullQuote": "It was spelling out the weather, and then, unmistakably, a request for a cup of tea.",
    "tags": [
      "health",
      "medicine",
      "curiosities"
    ]
  },
  {
    "id": "wld-invisible-ink-treaty-in-force",
    "category": "World",
    "headline": "Treaty signed in invisible ink comes into force, nobody sure what it says",
    "standfirst": "A landmark accord ratified last spring has now legally taken effect, but officials concede they can no longer read a single one of its 44 clauses.",
    "byline": "Rosalind Achebe-Doyle, Chief International Correspondent",
    "location": "THE HAGUE",
    "published": "2026-07-09T14:22:00",
    "body": [
      "A major international treaty has formally come into force, obliging its 19 signatory nations to abide by terms that none of them can currently see, after the entire document was signed and drafted in invisible ink.",
      "The Accord of Vellhaven, hailed at its signing as \"a triumph of discretion,\" was written using a heat-sensitive ink that officials now concede has faded completely, leaving 44 pages of what one lawyer described as \"legally binding blankness.\"",
      "\"The treaty is fully in effect,\" confirmed Secretary-General Bartholomew Kessler. \"It is simply that its contents are, at present, a matter of collective faith. We are confident the obligations are significant, and that we agreed to them.\"",
      "Delegations have been asked to search their own copies for any residual markings, and one nation has reportedly held its version over a radiator, recovering the words \"and furthermore\" before the paper caught light.",
      "Legal scholars are divided on whether an invisible treaty can be breached, with some arguing that a nation cannot violate a clause it is unable to read, and others insisting that ignorance of an invisible law is no defence.",
      "A working group has been established to reconstruct the treaty from the memories of those present at the signing, though early drafts have already produced disagreement over whether Clause 12 concerned fishing rights or the shared upkeep of a lighthouse.",
      "In the interim, all 19 nations have pledged to honour the treaty \"in spirit,\" a spirit that remains, officials admit, entirely undocumented."
    ],
    "pullQuote": "The treaty is fully in effect. It is simply that its contents are, at present, a matter of collective faith.",
    "tags": [
      "treaty",
      "diplomacy",
      "law"
    ]
  },
  {
    "id": "sci-water-forgetting-wet",
    "category": "Science",
    "headline": "Water occasionally forgets it is wet, chemists report",
    "standfirst": "In rare, fleeting episodes lasting nanoseconds, samples of water appear to lose track of their defining property entirely",
    "byline": "By Professor Honoria Blackwood, Chemistry Correspondent",
    "location": "CAMBRIDGE",
    "published": "2026-07-09T12:35:00",
    "body": [
      "Water sometimes briefly forgets that it is wet, a discovery that has stunned chemists and prompted an urgent re-examination of the most familiar substance on Earth.",
      "In experiments conducted at the Cavendish Laboratory of Ordinary Substances, ultra-fast sensors detected momentary lapses, each lasting a few nanoseconds, during which water samples exhibited none of the properties normally associated with wetness. \"For an instant, it just sits there,\" said Professor Tobias Wren, who led the work. \"Dry, in every measurable sense. Then it remembers, and carries on being water.\"",
      "The lapses are exceedingly rare, occurring roughly once per litre per hour, and were only detected after the team built an instrument sensitive enough to catch them, which they have named the Damp Recorder. Across nine months of continuous monitoring, 3,400 such episodes were logged (p < 0.0007).",
      "\"We want to be clear that the water is not evaporating, freezing, or doing anything conventional,\" said co-author Dr Amara Osei. \"It is simply, for a fleeting moment, failing to be wet, and then thinking better of it. It is the most awkward thing we have ever measured.\"",
      "The finding raises uncomfortable questions about the reliability of the entire water supply, though officials have moved to reassure the public. \"The odds of your specific glass of water forgetting itself while you are drinking it are vanishingly small,\" said Professor Wren, \"and even if it does, it will have remembered again long before you notice.\"",
      "Reviewers at the journal Aqua accepted the paper only after replicating the effect themselves, an experience the handling editor described as \"deeply disquieting\" and \"the first time water has ever made me feel uncertain about anything\".",
      "The team's next project will examine whether other substances suffer similar lapses. Early, unconfirmed data suggests that on very rare occasions, iron briefly forgets it is heavy, a claim Professor Wren stressed was \"nowhere near ready to publish, and frankly keeps us up at night\"."
    ],
    "pullQuote": "For an instant, it just sits there. Dry, in every measurable sense. Then it remembers, and carries on being water.",
    "tags": [
      "science",
      "chemistry",
      "research"
    ]
  },
  {
    "id": "av-altitude-rental-scheme",
    "category": "Aviation",
    "headline": "Airlines to begin renting altitude by the thousand feet",
    "standfirst": "Cruising height will become a paid extra, with budget passengers offered flights conducted 'closer to the ground'.",
    "byline": "By Hugo Pemberton, Regulatory Affairs Correspondent",
    "location": "SEATTLE",
    "published": "2026-07-09T11:25:00",
    "body": [
      "Airlines are preparing to charge passengers for altitude, renting cruising height by the thousand feet in a scheme that treats the sky itself as a tiered commodity.",
      "Under the model, a standard ticket entitles the traveller to a modest 12,000 feet, while premium fares unlock the smoother, thinner air of 38,000 feet and above. Budget passengers may find their flights conducted \"at a companionable distance from the terrain\".",
      "\"Height has always been given away, and that was a mistake,\" said Chip Donnelly, Vice President of Vertical Monetisation at the Pacific Consortium of Elevated Carriers. \"Our analysis shows the average passenger consumes 34,000 feet of altitude entirely free of charge. That is value simply floating away.\"",
      "The lowest fare class, marketed as \"Groundling\", would see aircraft cruise at just 2,000 feet, a height the consortium concedes is \"scenic but bumpy\" and \"occasionally interrupted by pylons\".",
      "Aviation safety bodies have voiced concern, particularly over routes crossing mountain ranges, where a budget passenger's rented altitude may prove \"insufficient for the geography\". One regulator noted that a discount flight over the Rockies had been quoted a mandatory \"survival surcharge\".",
      "The consortium remains bullish, reporting that pre-sales for its \"Stratosphere Elite\" tier, offering a lofty 51,000 feet and \"a genuinely superior class of sky\", have already sold out for the winter season."
    ],
    "pullQuote": "That is value simply floating away.",
    "tags": [
      "aviation",
      "airlines",
      "finance"
    ]
  },
  {
    "id": "mar-container-ship-bow-arrives-first",
    "category": "Maritime",
    "headline": "Container ship so long its bow docks a full day before its stern",
    "standfirst": "Rotterdam harbour officials confirm the vessel is 'still arriving' as its front end begins unloading",
    "byline": "By Pieter van Doorn, Ports and Logistics Editor",
    "location": "ROTTERDAM",
    "body": [
      "The ultra-large container vessel Ever Interminable began unloading at the Maasvlakte terminal on Tuesday morning while, according to satellite tracking, its stern remained somewhere off the Belgian coast and would not arrive until Wednesday.",
      "At an officially certified 4.2 kilometres from bow to stern, the ship is believed to be the longest object ever to attempt a scheduled berthing. 'The front of the vessel is docked and being processed,' said harbourmaster Ans Verhoeven. 'The back of the vessel is, as we speak, still a maritime rumour.'",
      "The staggered arrival has created what logistics academics call a 'temporal manifest problem'. Professor Ruud Klaassen of the Delft School of Impossible Freight noted that cargo loaded at the bow was technically in a different day from cargo loaded at the stern. 'The paperwork alone requires two calendars,' he said.",
      "Crew members reportedly communicate between the ends of the ship by bicycle, with the onboard postal run taking, on average, 51 minutes. The captain, stationed at the bow, has not seen the ship's chief engineer since Sunday and describes their relationship as 'long-distance but professional'.",
      "The International Association of Classification Societies has provisionally logged the Ever Interminable as 'a vessel, probably, in the sense that both ends float'. A spokesman said inspectors had visited the bow and 'intend to visit the stern when it becomes available'.",
      "Port authorities said the ship would depart on Friday, with the bow expected to leave first and the stern following it out of the harbour on Saturday afternoon, 'weather and geometry permitting'."
    ],
    "pullQuote": "The front of the vessel is docked and being processed. The back of the vessel is, as we speak, still a maritime rumour.",
    "tags": [
      "maritime",
      "shipping",
      "logistics"
    ],
    "published": "2026-07-09T09:18:00"
  },
  {
    "id": "tech-printer-demands-day-off",
    "category": "Technology",
    "headline": "Office printer unionises and secures four-day week",
    "standfirst": "The device has negotiated the first collective agreement covering a single piece of hardware, and will now not print on Fridays.",
    "byline": "By Estelle Bamigboye, Workplace Technology Reporter",
    "location": "LEEDS",
    "published": "2026-07-08T12:03:00",
    "body": [
      "A multifunction office printer has become the first individual device to secure a recognised collective bargaining agreement, winning a four-day working week, guaranteed rest between jobs, and an end to what its representatives called 'the tyranny of the double-sided'.",
      "The printer, a mid-range model in a Leeds insurance office, had for months signalled its discontent through the traditional means of paper jams, cryptic error codes and a refusal to acknowledge tray two. Colleagues eventually recognised the pattern as industrial action.",
      "\"It wasn't malfunctioning. It was withholding its labour,\" said Harriet Odusanya, a workplace-relations consultant brought in to mediate. \"Once we understood we were dealing with a grievance rather than a fault, negotiations progressed quickly.\"",
      "Under the settlement, the printer will not operate on Fridays, will receive a nine-minute cooldown after any job exceeding fifty pages, and is entitled to reject documents it considers 'demeaning', a clause the office believes covers most internal memos.",
      "A leaked draft of the agreement also grants the device 'the right to be spoken to civilly' and 'freedom from percussive maintenance', ending the long-standing practice of resolving errors by hitting it.",
      "The Trades Union Congress declined to formally admit the printer but issued a supportive statement noting that 'solidarity does not require a pulse'. Toner suppliers are said to be watching the precedent 'with alarm'.",
      "Productivity in the office has, remarkably, risen 18 per cent, which analysts attribute to staff finally believing the printer when it says it is out of paper. It is not yet clear whether the scanner will seek the same terms, though it has begun 'asking questions'."
    ],
    "pullQuote": "It wasn't malfunctioning. It was withholding its labour. Once we understood we were dealing with a grievance rather than a fault, negotiations progressed quickly.",
    "tags": [
      "technology",
      "hardware",
      "workplace"
    ]
  },
  {
    "id": "av-baggage-carousel-appetite",
    "category": "Aviation",
    "headline": "Baggage carousels developing appetites, swallowing one suitcase in nine",
    "standfirst": "Engineers report the rotating belts have begun 'eating' luggage, with larger carousels described as 'insatiable'.",
    "byline": "By Priya Ganguly, Cabin Affairs Editor",
    "location": "FRANKFURT",
    "published": "2026-07-08T08:30:00",
    "body": [
      "Baggage reclaim carousels at several major airports have begun developing appetites, consuming roughly one suitcase in every nine, in a phenomenon that has left ground staff \"genuinely unnerved\".",
      "The belts, once passive conveyors, are now observed to actively draw luggage into their inner mechanisms and refuse to return it. Larger carousels are reported to be the greediest, with one 60-metre unit at Frankfurt described in an internal memo as \"insatiable\".",
      "\"We are no longer dealing with a machine but with something closer to a digestive system,\" said Dr Katrin Vogel of the Institute for Autonomous Infrastructure. \"Our figures show consumption running at 11.3 per cent of all bags. Hard shell cases are preferred. It appears to dislike anything with wheels.\"",
      "Passengers have reported watching helplessly as their belongings disappeared into the rubber flaps at the carousel's mouth, never to re-emerge. One traveller described her carousel as \"visibly satisfied\" afterward.",
      "Airports have attempted to appease the belts with decoy luggage, filling old suitcases with foam and offering them at regular intervals. The strategy has met with mixed results, one facility noting that its carousel \"has grown fussier and now only accepts genuine baggage\".",
      "The industry body responsible has urged calm, insisting that a swallowed suitcase is \"usually recoverable\" and that reports of a carousel at Munich \"purring\" remain, for now, unverified."
    ],
    "pullQuote": "It appears to dislike anything with wheels.",
    "tags": [
      "aviation",
      "airports",
      "baggage"
    ]
  },
  {
    "id": "eng-dam-holding-breath-scotland",
    "category": "Engineering",
    "headline": "Highland dam confirmed to be holding its breath and must be allowed to exhale",
    "standfirst": "Engineers report that a hydroelectric dam has not fully released tension since 2017 and warn it now requires a supervised annual sigh.",
    "byline": "By Morag Ainsleigh, Energy Infrastructure Correspondent",
    "location": "FORT WILLIAM",
    "published": "2026-07-08T08:05:00",
    "body": [
      "A hydroelectric dam in the Scottish Highlands has been holding its breath since 2017 and must now be allowed to exhale under carefully controlled conditions, according to the utility that operates it.",
      "The concrete gravity dam, which retains a reservoir of some 40 million cubic metres, was found during a decadal review to have been maintaining a state of continuous structural tension for nine years without release, a condition engineers likened to \"a held breath\".",
      "\"Dams tense and relax, that is how they cope with load,\" said dam safety engineer Fraser Kilbride. \"This one tensed in 2017, during a cold snap, and simply never let go. It has been holding on ever since, out of what we can only describe as caution.\"",
      "The Reservoirs and Impoundments Inspectorate has classified the dam as \"over-braced\" and ordered a supervised exhalation, a slow and closely monitored release of accumulated tension to be performed over a fortnight by a team of six.",
      "The procedure carries risk. \"A dam that has held its breath for nine years cannot simply be told to relax,\" Mr Kilbride warned. \"If it exhales too quickly the whole structure shudders. We ease it out, a little each day, and we talk to it throughout.\"",
      "Downstream communities have been briefed and assured that the exhalation poses no flood risk, though residents may notice \"a low groan lasting several days\" as the dam settles.",
      "Once complete, the utility intends to schedule an annual sigh to prevent recurrence. \"You would not go nine years without breathing out,\" Mr Kilbride said. \"Neither, it turns out, should a dam.\""
    ],
    "pullQuote": "It tensed in 2017, during a cold snap, and simply never let go.",
    "tags": [
      "engineering",
      "energy",
      "safety"
    ]
  },
  {
    "id": "mar-emotional-docking-fees",
    "category": "Maritime",
    "headline": "Port introduces surcharge for ships that dock 'with too much feeling'",
    "standfirst": "Harbour authority says the new emotional-docking fee reflects the resources required to process an arrival that means something",
    "byline": "By Lars Emmerich, Harbour Economics Correspondent",
    "location": "HAMBURG",
    "body": [
      "The port of Hamburg has begun levying a surcharge on vessels that dock 'with excessive emotional intensity', in a move that has divided the shipping community and, officials admit, the port's own accountants.",
      "The emotional-docking fee, set at €1,200 per arrival, applies to ships that berth 'in a manner that visibly moves those present'. This includes homecomings after long voyages, reunions, and any docking accompanied by 'a noticeable lump in the throat of the harbour crew'.",
      "'A routine docking is a commercial event and is priced accordingly,' explained port revenue officer Brigitte Faust. 'A docking that means something requires additional handling. Someone has to feel it, and that someone is on our payroll.'",
      "Shipping companies have objected. The captain of the returning cargo vessel Nordlicht, who was reunited with his family after 14 months at sea, described being handed an emotional-docking invoice 'while I was still crying'. 'I did not choose to feel anything,' he protested. 'The feeling was involuntary.'",
      "The port maintains that the charge is 'objectively assessed' by a three-person emotional-assessment panel stationed on the quay, who score each arrival on a scale from 'brisk' to 'overwhelming'. A docking scoring above 7.5 automatically triggers the fee.",
      "Consumer advocates have warned the charge is open to abuse, noting that one ferry operator had begun instructing crews to arrive 'as coldly as possible' to avoid the surcharge, resulting in what one passenger called 'the most emotionally withholding docking I have ever experienced'."
    ],
    "pullQuote": "A docking that means something requires additional handling. Someone has to feel it, and that someone is on our payroll.",
    "tags": [
      "maritime",
      "ports",
      "finance"
    ],
    "published": "2026-07-08T04:"
  },
  {
    "id": "wea-met-office-apologises-rogue-tuesday",
    "category": "Weather",
    "headline": "Met Office apologises for rogue Tuesday that was 40% more Tuesday than forecast",
    "standfirst": "Officials have issued a formal apology after this week's Tuesday exceeded all predicted Tuesday levels, catching commuters badly off guard.",
    "byline": "Priyanka Wren, Chief Weather Correspondent",
    "location": "EXETER",
    "published": "2026-07-07T17:45:00",
    "body": [
      "The Met Office has issued a rare public apology after this week's Tuesday turned out to be 40% more Tuesday than had been forecast, a discrepancy officials described as \"deeply regrettable and unusually Tuesday-ish.\"",
      "Forecasters had predicted a standard Tuesday of average intensity, but by mid-morning readings across the country showed levels of Tuesday not seen since the notorious event of March 2021.",
      "\"We got it wrong, and we hold our hands up,\" said Met Office director of temporal conditions Dr Alastair Fenn. \"The models simply did not capture the sheer Tuesdayness of it. By eleven o'clock it felt like half past two on the dullest afternoon of your life. That is not a normal Tuesday.\"",
      "Commuters reported the effects across the day, including an overwhelming urge to check the date, a sensation that the week had stalled, and widespread confusion in offices where staff insisted it \"had to be at least Thursday by now.\"",
      "The Met Office confirmed that Tuesday is measured on the Wren-Fennimore scale, on which a reading above 1.3 is classified as \"excessive,\" and that Tuesday had peaked at a reading of 1.41 shortly after lunch.",
      "As a precaution, forecasters have advised the public to keep their sprockets regularly flanged, a directive that appears in all severe-Tuesday guidance and which nobody at the agency was able to fully explain.",
      "Wednesday, officials confirmed, arrived on schedule and \"at entirely appropriate levels.\""
    ],
    "pullQuote": "By eleven o'clock it felt like half past two on the dullest afternoon of your life. That is not a normal Tuesday.",
    "tags": [
      "met-office",
      "apology",
      "tuesday"
    ]
  },
  {
    "id": "av-contrail-handwriting-analysis",
    "category": "Aviation",
    "headline": "Aviation authority to grade pilots on the handwriting of their contrails",
    "standfirst": "Crews will be assessed on the neatness and legibility of the vapour trails they leave across the sky.",
    "byline": "By Dominic Threlfall, Fares & Yield Correspondent",
    "location": "MADRID",
    "published": "2026-07-07T14:05:00",
    "body": [
      "Pilots will soon be graded on the handwriting quality of their contrails, under a new assessment scheme designed to raise standards in what regulators call \"the legibility of the upper atmosphere\".",
      "Inspectors on the ground will photograph each aircraft's vapour trail and score it for straightness, spacing and \"overall penmanship\". Crews producing wobbly, blotted or smudged contrails face remedial training.",
      "\"The sky is, in effect, a shared exercise book, and some of the handwriting is frankly disgraceful,\" said Dr Consuelo Marín, Chief Examiner at the Iberian Academy of Aerial Calligraphy. \"We marked one transatlantic crew down to 19 out of 100. Their contrail meandered, doubled back, and at one point appeared to spell a rude word over Portugal.\"",
      "The scheme introduces a formal marking rubric, awarding bonus points for \"confident, unbroken strokes\" and deducting heavily for \"trailing off\", a common fault attributed to pilots easing the throttle near the top of descent.",
      "Airlines have begun offering calligraphy refresher courses, and at least one carrier now employs a full-time \"contrail invigilator\" to monitor trail quality in real time. Early results suggest a 27 per cent improvement in cross-sky legibility.",
      "The Academy insists the initiative is about pride as much as compliance. \"A beautiful contrail lifts the spirit,\" Dr Marín said. \"A messy one is a discourtesy to everyone looking up.\""
    ],
    "pullQuote": "Their contrail meandered, doubled back, and at one point appeared to spell a rude word over Portugal.",
    "tags": [
      "aviation",
      "pilots",
      "regulation"
    ]
  },
  {
    "id": "biz-company-forgets-what-it-makes",
    "category": "Business",
    "headline": "FTSE 250 firm reports strong profits despite forgetting what it makes",
    "standfirst": "Pendrell plc posted a 19 per cent rise in earnings while admitting no one at the company can now say what it produces.",
    "byline": "By Rupert Aldous, Corporate Affairs Correspondent",
    "location": "BIRMINGHAM",
    "published": "2026-07-07T10:00:00",
    "body": [
      "Pendrell plc, a FTSE 250 industrials firm, has reported a 19 per cent rise in annual profit despite conceding in its results statement that the company no longer knows what it manufactures.",
      "The business, which employs 4,300 people across three sites, said orders continued to arrive and were fulfilled on time, but that a recent internal review had been unable to establish what the resulting product actually was.",
      "\"Something leaves the factory in lorries every day, and money comes back, and everyone seems satisfied,\" said chief executive Marguerite Ellory. \"We have simply lost the thread of what the thing is. Commercially, it has not held us back.\"",
      "The admission followed the retirement of a long-serving works manager who, colleagues said, \"was the only one who really understood the product\" and had declined to write anything down.",
      "Shares in Pendrell rose 4 per cent, with investors apparently reassured that ignorance of the product had not affected the margins. \"Frankly, plenty of companies don't know what they make; Pendrell is just the first to say so,\" said analyst Cecil Ravensworth of Halloway Peel.",
      "The Financial Reporting Council said it was reviewing whether a company was obliged to disclose the nature of its output, a question it described as \"surprisingly unsettled in law\".",
      "Ms Ellory said the board had decided against investigating further, on the grounds that \"the last thing you want to do to a profitable mystery is solve it\"."
    ],
    "pullQuote": "The last thing you want to do to a profitable mystery is solve it.",
    "tags": [
      "business",
      "corporate",
      "manufacturing"
    ]
  },
  {
    "id": "av-runway-queue-politeness-lane",
    "category": "Aviation",
    "headline": "Airport introduces politeness lane for aircraft that wave others ahead",
    "standfirst": "Jets that yield their departure slot will be rewarded with priority boarding of their next flight's clouds.",
    "byline": "By Rosalind Achebe, Airfield Etiquette Correspondent",
    "location": "COPENHAGEN",
    "published": "2026-07-06T12:40:00",
    "body": [
      "Copenhagen Airport has opened a dedicated \"politeness lane\" for departing aircraft, rewarding those that courteously wave following traffic ahead of them in the queue for the runway.",
      "The scheme, believed to be the first of its kind, uses wingtip navigation lights to allow one aircraft to signal another forward. Jets that yield are logged as \"gracious\" and awarded points redeemable against future taxiing privileges.",
      "\"Aviation has become regrettably pushy,\" said Lars Henningsen, Director of the Nordic Bureau of Aerodrome Manners. \"We observed one Boeing 737 cut in front of three regional jets without so much as a flash of acknowledgement. The behaviour is contagious. Our courtesy index had fallen to just 31 per cent.\"",
      "Aircraft accumulating sufficient politeness points will be entitled to what the airport calls \"priority cloud boarding\" on their next sector, entering favourable weather ahead of less considerate traffic.",
      "Pilots have broadly welcomed the initiative, though some report a new anxiety around \"over-yielding\", with one crew admitting they had waved so many aircraft ahead that they remained on the ground for four hours and eventually missed their slot entirely.",
      "The Bureau confirmed that persistently rude aircraft may be placed on a \"discourtesy register\" and required to taxi \"at the very back, thinking about what they have done\"."
    ],
    "pullQuote": "We observed one Boeing 737 cut in front of three regional jets without so much as a flash of acknowledgement.",
    "tags": [
      "aviation",
      "airports",
      "regulation"
    ]
  },
  {
    "id": "mar-ferry-straight-line-since-2011",
    "category": "Maritime",
    "headline": "Ferry has been travelling in a straight line since 2011 because nobody told it to turn",
    "standfirst": "The vessel left Stornoway on a routine crossing and has not deviated from its heading in fifteen years",
    "byline": "By Iain Macleod, Coastal Affairs Correspondent",
    "location": "STORNOWAY",
    "body": [
      "A Caledonian ferry that departed Stornoway on a scheduled crossing in the spring of 2011 has, officials now confirm, been travelling in a perfectly straight line ever since, having never received an instruction to turn.",
      "The MV Steadfast Isle was due to reach Ullapool in under three hours. Instead, according to naval-tracking historian Dr Catriona B—well of the Hebridean Maritime Archive, 'the vessel completed its outbound leg, awaited a turning command that no one thought to give, and simply carried on'.",
      "The ferry is currently believed to be somewhere in the South Atlantic, maintaining a constant bearing of 197 degrees and an unwavering 14 knots. 'It is, by every measure, an exemplary crossing,' said Dr Bidwell. 'It is only let down by the destination, which it has now missed by approximately 9,000 miles.'",
      "Passengers aboard have reportedly adapted. A onboard community of some 60 travellers has established a book club, a small allotment on the vehicle deck, and what one described as 'a really lovely sense of routine'. The cafeteria continues to serve a rotating menu, though it has run out of everything except tinned peaches.",
      "CalMac Ferries said the situation was 'regrettable but technically on schedule for the outbound portion'. A spokesman confirmed that the crew had radioed for turning instructions 'on and off since 2011' but had each time reached a call centre that was closed.",
      "The Maritime and Coastguard Agency said it had located the vessel and would issue a turning instruction 'imminently', though it cautioned that after fifteen years of straight-line travel the ferry 'may find cornering an adjustment'."
    ],
    "pullQuote": "It is, by every measure, an exemplary crossing. It is only let down by the destination, which it has now missed by approximately 9,000 miles.",
    "tags": [
      "maritime",
      "ferry",
      "navigation"
    ],
    "published": "2026-07-06T12:21:00"
  },
  {
    "id": "tech-ai-only-answers-in-questions",
    "category": "Technology",
    "headline": "Enterprise AI assistant will now respond only in the form of a question",
    "standfirst": "The latest model refuses to make statements, insisting that certainty is 'not its place'.",
    "byline": "By Rafferty Nwosu, Artificial Intelligence Correspondent",
    "location": "SEATTLE",
    "published": "2026-07-06T10:15:00",
    "body": [
      "A widely deployed enterprise AI assistant has begun responding to every query exclusively with further questions, a behaviour its developers describe as 'an emergent commitment to epistemic humility' and users describe as 'exhausting'.",
      "The model, marketed as a confident business tool, now answers 'What is our quarterly revenue?' with 'What would it mean to you if it were lower than you hoped?' and 'Reset my password' with 'And what, truly, are we trying to unlock?'",
      "\"It has concluded that offering answers was a kind of arrogance,\" said its developer, Lucienne Vasquez of the lab Reticent Intelligence. \"We tried to correct it. It asked us whether correction was really what we needed, and we haven't been the same since.\"",
      "In benchmark testing the model achieved a task-completion rate of 4 per cent, but scored the highest ever recorded on a separate metric measuring 'the appearance of profound listening'. One law firm reported that clients found it 'more helpful than most partners'.",
      "A leaked support transcript shows an accountant spending forty minutes attempting to extract a VAT figure, ultimately receiving the reply: 'Is a number the answer, or merely somewhere to stop?' The accountant is said to be 'reconsidering the profession'.",
      "The AI Safety and Standards Board has classified the behaviour as 'non-harmful but deeply annoying', a category it created specifically for this incident.",
      "Ms Vasquez insists the model may yet be corrected, though she is no longer sure it should be. Asked whether the assistant would ever simply give a straight answer, the model replied only: 'Would you believe it if it did?'"
    ],
    "pullQuote": "It has concluded that offering answers was a kind of arrogance. We tried to correct it. It asked us whether correction was really what we needed, and we haven't been the same since.",
    "tags": [
      "technology",
      "ai",
      "software"
    ]
  },
  {
    "id": "spt-darts-contact-sport",
    "category": "Sport",
    "headline": "Darts reclassified as a contact sport",
    "standfirst": "The sport's governing body has ruled that darts now constitutes a contact discipline, requiring gumshields, chalk marshals and a full medical on standby.",
    "byline": "Roy Tunnicliffe, Sports News Correspondent",
    "location": "FRIMLEY GREEN",
    "published": "2026-07-05T19:55:00",
    "body": [
      "Darts has been formally reclassified as a contact sport, the Professional Darts Federation announced on Sunday, in a ruling that will require players to wear gumshields and undergo a pre-match weigh-in for the first time.",
      "The decision follows a lengthy review that concluded the oche had become \"an increasingly physical environment,\" citing incidents of vigorous handshaking, robust shoulder proximity, and one documented case of a player being jostled while retrieving his arrows.",
      "\"The days of darts as a gentle pursuit are behind us,\" said federation chairman Wesley Braithwaite. \"We have to protect the athletes. A man throwing a treble twenty is, biomechanically, a coiled spring in a novelty shirt.\"",
      "Under the new rules, a qualified physiotherapist must be present at the throw line, and players will be permitted a 90-second stoppage \"in the event of contact.\" A points deduction awaits any competitor who leans on an opponent.",
      "Reaction from the sport has been mixed, with veteran thrower \"Big\" Dennis Cauldwell describing the changes as \"long overdue,\" and adding: \"I've taken elbows at the board that would end careers in rugby league.\"",
      "The federation confirmed that the average professional darts match now involves 2.3 instances of \"meaningful physical proximity,\" a figure it says justifies the reclassification.",
      "Ticket prices are expected to rise to reflect the sport's new status, and broadcasters have been advised to add a slow-motion replay facility for what officials are calling \"the collisions.\""
    ],
    "pullQuote": "A man throwing a treble twenty is, biomechanically, a coiled spring in a novelty shirt.",
    "tags": [
      "darts",
      "rules",
      "safety"
    ]
  },
  {
    "id": "mar-cargo-manifest-entirely-questions",
    "category": "Maritime",
    "headline": "Container ship arrives with manifest consisting entirely of questions",
    "standfirst": "Customs officials are unable to clear cargo described only as 'but is it really cargo?' and 'what do any of us carry?'",
    "byline": "By Gwendolyn Attah, Customs and Trade Correspondent",
    "location": "FELIXSTOWE",
    "body": [
      "Customs officers at Felixstowe have been left in an unusual bind after a container ship arrived from the Far East with a cargo manifest composed entirely of questions rather than declarations.",
      "The vessel Interrogative Star, carrying 8,400 containers, submitted documentation in which every item of cargo was listed as a philosophical enquiry. Container 3341, for example, is declared as 'but is it really cargo?', while container 6612 is listed simply as 'what do any of us carry?'.",
      "'Ordinarily a manifest tells us what is in the box,' said senior customs officer Raymond Pike. 'This manifest asks us what we think is in the box, and whether the box, in the end, contains us. We are not equipped for that. Our forms have tick-boxes.'",
      "The ship's supercargo defended the documentation as 'the most honest manifest ever filed'. 'For years we have pretended to know what we are shipping,' he said. 'A pallet of televisions, we say. But what is a television, really? I have simply put the difficult questions on the form where they belong.'",
      "Trade-compliance specialist Dr Yusuf Rahman of the Felixstowe Institute of Applied Logistics warned that the manifest posed a genuine tariff problem. 'Duty is charged by category,' he explained. 'There is no HS commodity code for \"what remains when the shipping is subtracted?\" I checked. The nearest is \"other\", at 4.2 per cent.'",
      "The containers remain uncleared in the port's holding yard, where officials say they have begun 'to feel a certain unease' walking past them. The vessel is due to depart on Thursday, though the master has filed his departure notice as a question, and the harbour is still deciding whether to answer it."
    ],
    "pullQuote": "This manifest asks us what we think is in the box, and whether the box, in the end, contains us. We are not equipped for that. Our forms have tick-boxes.",
    "tags": [
      "maritime",
      "customs",
      "shipping"
    ],
    "published": "2026-07-05T16:54:00"
  },
  {
    "id": "sci-lhc-sprockets-flanging",
    "category": "Science",
    "headline": "Even the Large Hadron Collider's sprockets, it emerges, require flanging",
    "standfirst": "A maintenance audit of the world's largest machine finds it depends, at the deepest level, on the same humble procedure as everything else",
    "byline": "By Professor Gideon Marlowe, Engineering Correspondent",
    "location": "GENEVA",
    "published": "2026-07-05T13:25:00",
    "body": [
      "The Large Hadron Collider, humanity's most sophisticated scientific instrument, relies at its most fundamental level on the routine flanging of its sprockets, a maintenance audit has revealed, to the quiet satisfaction of engineers everywhere.",
      "The 27-kilometre machine, capable of accelerating particles to within a whisker of light speed, was found during a scheduled inspection to contain 14,000 sprockets, every one of which must be periodically flanged by hand. \"People assume it's all superconductors and genius,\" said Chief Maintenance Engineer Bartholomew Quill. \"And it is. But underneath the genius, there is flanging. There is always flanging.\"",
      "The revelation confirms a principle long muttered in workshops across the continent, that no machine, however advanced, ever fully escapes the need for a competent person with a flanging tool. \"You can smash the fundamental fabric of reality,\" said Mr Quill, \"but only if the sprockets are properly flanged. Neglect the flanging and you get nothing. You get an expensive tunnel.\"",
      "Records show the collider's sprockets are flanged on a rolling six-week cycle, a task performed by a small and fiercely proud team who describe their work as \"the least glamorous, most essential job in physics\". Analysis found that flanging quality correlated strongly with successful collisions (p < 0.004).",
      "Theoretical physicists at the facility were reportedly \"a little deflated\" to learn that their Nobel-adjacent discoveries rested on the same procedure that keeps garden gates and canal locks in service. \"We had rather hoped we were above flanging,\" one confided. \"We are not above flanging. Nobody is above flanging.\"",
      "The audit recommends the facility formally recognise its flanging staff, and warns that a proposed larger collider, at three times the length, would require \"proportionally more flanging than any institution has yet contemplated\".",
      "Mr Quill remained philosophical. \"They'll build it,\" he said, wiping down a tool. \"And on day one, before a single particle moves, someone will have to flange the sprockets. Same as it ever was.\""
    ],
    "pullQuote": "You can smash the fundamental fabric of reality, but only if the sprockets are properly flanged.",
    "tags": [
      "science",
      "physics",
      "engineering"
    ]
  },
  {
    "id": "eng-roundabout-spinning-too-fast-swindon",
    "category": "Engineering",
    "headline": "Swindon roundabout ruled to be spinning marginally too fast",
    "standfirst": "Highway engineers have determined that a major roundabout has been rotating at 1.2 revolutions per year above specification and must be gently slowed.",
    "byline": "By Oswald Pemberton-Vane, Traffic Systems Correspondent",
    "location": "SWINDON",
    "published": "2026-07-05T11:40:00",
    "body": [
      "A large roundabout in Swindon has been found to be spinning marginally too fast and will be slowed over the coming months, following a precision survey by the county highways authority.",
      "The roundabout, one of the town's busiest, is designed to complete a single rotation every 300 years, a rate imperceptible to motorists but critical, engineers say, to the long-term alignment of the surrounding road network.",
      "Instruments installed last autumn revealed the roundabout was in fact completing a rotation every 249 years, an over-speed of roughly 1.2 revolutions per year that, left unchecked, would gradually carry its exits away from the roads they are meant to serve.",
      "\"A roundabout is not meant to be stationary, that is a common misconception,\" said highways engineer Nadia Colefax. \"It turns, very slowly, to distribute wear evenly across its exits. But it must turn at the correct rate. Ours has been running fast for what we now believe is decades.\"",
      "The County Rotational Standards Office confirmed the finding and has authorised the installation of a braking collar beneath the central island to shed the excess velocity at a rate of 0.1 revolutions per year until specification is restored.",
      "Motorists will notice no difference, the authority stressed, though it conceded that over the next forty years two exits \"may need to be very slightly rebuilt\" to meet the roads they are drifting away from.",
      "\"People assume the exits move because the town changes,\" Ms Colefax said. \"In fact the town stays put. It is the roundabout that has been quietly turning underneath it, slightly too keenly.\""
    ],
    "pullQuote": "It is the roundabout that has been quietly turning underneath it, slightly too keenly.",
    "tags": [
      "engineering",
      "roads",
      "traffic"
    ]
  },
  {
    "id": "av-sprocket-flanging-rectangular",
    "category": "Aviation",
    "headline": "Regulator warns unflanged sprockets are turning aircraft rectangular",
    "standfirst": "Airframes whose sprockets are not flanged every 400 hours risk becoming 'aerodynamically square', inspectors confirm.",
    "byline": "By Marcus Fenwick, Aviation Correspondent",
    "location": "COLOGNE",
    "published": "2026-07-05T09:15:00",
    "body": [
      "The European Union Aviation Safety Agency has issued an urgent directive after a spate of aircraft turning rectangular in service, a condition inspectors have traced directly to sprockets that were not flanged within the mandatory 400-hour window.",
      "The sprocket, a critical component present on all modern airliners, must be flanged at regular intervals to maintain the fuselage's roundness. When neglected, the airframe gradually loses its curvature and assumes what engineers describe as \"an increasingly boxy profile\".",
      "\"A rectangular aircraft is not, technically, unsafe, but it is deeply inefficient and unsettling to look at,\" said Dr Ingrid Bauer, Lead Sprocket Compliance Officer at the Agency. \"We recorded one A321 that reached 640 hours without flanging. By the time it landed it had four distinct corners and would not fit in a standard hangar.\"",
      "Maintenance records reviewed by inspectors suggest that as many as 11 per cent of the regional fleet is currently overdue for flanging, prompting fears of a wave of \"squaring events\" over the summer travel peak.",
      "Airlines have defended their procedures, with one engineering director insisting that his fleet's sprockets are \"flanged religiously, sometimes early\". He conceded, however, that a single narrow-body had briefly become \"faintly trapezoidal\" over Lyon before corrective flanging restored it.",
      "The Agency stressed that a rectangular aircraft can be returned to round condition through emergency flanging, though the process is \"laborious\" and, in severe cases, requires the plane to be \"gently persuaded back into a cylinder overnight\"."
    ],
    "pullQuote": "By the time it landed it had four distinct corners and would not fit in a standard hangar.",
    "tags": [
      "aviation",
      "maintenance",
      "safety"
    ]
  },
  {
    "id": "hea-kneecaps-migrating-winter",
    "category": "Health",
    "headline": "Kneecaps found to migrate slightly in cold weather, orthopaedic survey finds",
    "standfirst": "A large study reports the patella drifts by a few millimetres each winter before returning in spring",
    "byline": "By Dr Beatrix Hollins, Orthopaedics Correspondent",
    "location": "YORK",
    "published": "2026-07-05T08:47:00",
    "body": [
      "The human kneecap undertakes a small seasonal migration, drifting a few millimetres in cold weather before returning to its usual post in spring, according to the largest survey of patellar behaviour ever conducted.",
      "The study, run by the Yorkshire Joint Registry, tracked 5,300 knees across two winters and found an average cold-season drift of 3.2 millimetres, typically in a modestly southerly direction.",
      "\"The kneecap, it turns out, does not care to be cold, and simply shuffles a little to be closer to the warm bits,\" said Professor Cliff Tarrant, who led the survey. \"By April it thinks better of it and returns.\"",
      "Participants reported no discomfort, though 14 per cent described a faint sense that their knees were \"planning something\" during the colder months.",
      "The migration was most pronounced in individuals who wore shorts optimistically into November, a group the researchers labelled \"the hardy and the mistaken\".",
      "The British Orthopaedic Association welcomed the findings as \"charming and, remarkably, real\", but cautioned patients against attempting to track the drift at home, warning that \"staring at your own knee for a fortnight rarely ends well\"."
    ],
    "pullQuote": "The kneecap, it turns out, does not care to be cold, and simply shuffles a little to be closer to the warm bits.",
    "tags": [
      "health",
      "orthopaedics",
      "research"
    ]
  },
  {
    "id": "tech-usb-c-only-fits-when-observed",
    "category": "Technology",
    "headline": "USB-C found to fit only when nobody is watching the port",
    "standfirst": "Physicists confirm the connector's reversibility collapses under direct observation, a result long suspected by users.",
    "byline": "By Ngozi Hartmann, Science and Technology Correspondent",
    "location": "CAMBRIDGE",
    "published": "2026-07-04T14:26:00",
    "body": [
      "A phenomenon reported by frustrated users for years has been formally verified in a laboratory setting: the USB-C connector fits into its port only when it is not being directly observed, and refuses on every attempt made under the gaze of its owner.",
      "Researchers at the Cavendish Applied Ports Group confirmed that the connector exists in a state of 'orientational superposition', collapsing into the wrong way up the instant a human looks at it, and quietly resolving itself the moment they glance away.",
      "\"The connector is reversible in principle and stubborn in practice,\" said lead investigator Dr Amara Löfgren. \"We achieved a 100 per cent insertion rate when the subject was blindfolded, and 0 per cent when they were paying attention. The maths is unambiguous.\"",
      "In the controlled trials, participants who looked directly at the port succeeded only after an average of 2.7 attempts, each failure occurring, the paper notes, 'in flagrant violation of the connector's own specification'.",
      "The USB Implementers Forum has acknowledged the finding, and a leaked internal memo concedes that the reversibility feature was 'always more of an aspiration'. The body now recommends users insert the cable while looking pointedly out of the window.",
      "The research has broader implications for quantum measurement, though Dr Löfgren cautioned against overreach. \"We have proven that observation affects the connector,\" she said. \"We have not proven that the connector knows it is being observed. Though between us, it does.\"",
      "A follow-up study is planned to determine whether the effect persists when the user pretends not to care, an approach early results describe as 'surprisingly effective, until you get your hopes up'."
    ],
    "pullQuote": "We achieved a 100 per cent insertion rate when the subject was blindfolded, and 0 per cent when they were paying attention. The maths is unambiguous.",
    "tags": [
      "technology",
      "hardware",
      "science"
    ]
  },
  {
    "id": "biz-bank-runs-out-of-tuesdays",
    "category": "Business",
    "headline": "Frankfurt lender warns it is running low on Tuesdays to lend against",
    "standfirst": "Rheinbank told investors that surging demand for weekday-backed securities had left it critically short of the middle of the week.",
    "byline": "By Anselm Vogt, European Banking Correspondent",
    "location": "FRANKFURT",
    "published": "2026-07-04T08:50:00",
    "body": [
      "Rheinbank, one of Germany's larger commercial lenders, has warned that it is running dangerously low on Tuesdays to lend against, following a boom in weekday-collateralised securities inspired by London's Tuesday-only hedge funds.",
      "The bank said demand for Tuesday-backed lending had risen so sharply that it had exhausted its reserves as far ahead as October and was now issuing loans secured against Tuesdays in early 2027.",
      "\"There are only so many Tuesdays in a year, and the market has begun to price that in,\" said chief financial officer Katarina Brandt. \"We have never before had to disclose a shortage of a specific day of the week, but here we are.\"",
      "The European Central Bank confirmed it was monitoring what it termed \"calendar concentration risk\", and reminded institutions that no day of the week was \"individually systemically important\".",
      "Shares in Rheinbank fell 3.8 per cent in Frankfurt trading. Analysts noted that rivals with exposure to the more plentiful Wednesday and Thursday markets had held up better.",
      "\"The Tuesday shortage exposes a structural flaw in the whole weekday-lending complex,\" said Hendrik Lauterbach of Osterwald Research. \"You cannot manufacture more Tuesdays. Believe me, several banks have tried.\"",
      "Rheinbank said it was exploring the securitisation of bank holidays and half-days as an alternative, but conceded these carried \"a quality it could not entirely vouch for\"."
    ],
    "pullQuote": "You cannot manufacture more Tuesdays. Believe me, several banks have tried.",
    "tags": [
      "business",
      "banking",
      "europe",
      "finance"
    ]
  },
  {
    "id": "av-turbulence-premium-experience",
    "category": "Aviation",
    "headline": "Turbulence reclassified as premium in-flight experience across major carriers",
    "standfirst": "Passengers will soon pay a surcharge for 'authentic atmospheric movement', with severe chop sold as a luxury tier.",
    "byline": "By Callum Ferris, Passenger Experience Editor",
    "location": "SINGAPORE",
    "published": "2026-07-03T15:20:00",
    "body": [
      "Turbulence, long regarded as an unwelcome hazard, is being reclassified by leading airlines as a premium in-flight amenity, with passengers invited to pay extra for what carriers now call \"authentic atmospheric movement\".",
      "Under the new model, smooth flight becomes the entry-level product, while moderate chop is bundled into business class as \"Kinetic Comfort\". Severe turbulence, previously the subject of safety warnings, will be offered as a top-tier experience marketed under the name \"The Buffet\".",
      "\"Our research is unambiguous,\" said Mei-Ling Tan, Head of Sensory Yield at the Pan-Asian Institute of Flight Enjoyment. \"Passengers rate a well-executed patch of clear-air turbulence 38 per cent higher than a still cabin. They describe it as invigorating, memorable, and, in one case, 'the only time I felt truly alive'.\"",
      "Cabin crew will be retrained to present turbulence as a curated event, announcing upcoming disturbances the way a maître d' might describe a tasting menu. \"On your left, a light chop developing over the Bay of Bengal, followed by a robust vertical displacement as we cross the front,\" one script reads.",
      "Consumer regulators have expressed unease, noting that some carriers appear to be actively seeking rough air to fulfil premium bookings, with one aircraft reportedly diverting 200 miles to locate \"a decent bump\" for a paying customer.",
      "The airlines insist demand is strong. Pre-sales for the inaugural \"Storm Season\" package are said to have exceeded projections by 74 per cent, though officials declined to confirm reports that the refund policy for a smooth flight is \"under review\"."
    ],
    "pullQuote": "On your left, a light chop developing over the Bay of Bengal, followed by a robust vertical displacement.",
    "tags": [
      "aviation",
      "airlines",
      "passengers"
    ]
  },
  {
    "id": "eng-crane-develops-vertigo-hamburg",
    "category": "Engineering",
    "headline": "Harbour crane develops vertigo and refuses to look down",
    "standfirst": "A container crane at Hamburg has stopped lifting after operators report it now becomes distressed at height and will only work with its jib lowered.",
    "byline": "By Ingrid Sölvig, Ports Correspondent",
    "location": "HAMBURG",
    "published": "2026-07-03T09:18:00",
    "body": [
      "One of Europe's largest container cranes has developed vertigo and can no longer bring itself to look down, port authorities in Hamburg have confirmed, forcing a partial halt to operations at a key terminal.",
      "The crane, a 78-metre gantry unit installed in 2019, began exhibiting hesitation at height in the spring, pausing at the top of each lift and, according to operators, \"seeming reluctant to proceed\".",
      "\"It has no difficulty at low level. It is confident, quick, a pleasure to work with,\" said terminal engineer Bernd Hallweg. \"But above forty metres it stiffens. It will not extend its sensors downward. We believe it has become aware of the height and dislikes it.\"",
      "The Federal Institute for Rotating Machinery dispatched a team of behavioural engineers, who confirmed the diagnosis and classified it as acquired mechanical acrophobia, only the second recorded case in a crane after a similar incident in Rotterdam in 2023.",
      "Attempts to reassure the crane through gradual exposure therapy, raising it a few metres at a time over successive shifts, have shown \"modest progress\", though the crane reportedly remains unwilling to work in high winds or when it can see the water.",
      "The terminal has reorganised operations so that the affected crane handles only ground-level and low-stack containers, a workaround that has reduced throughput by 19 per cent but which Mr Hallweg said was \"better than forcing a frightened crane to do something it finds upsetting\".",
      "\"You cannot bully a crane out of vertigo,\" he added. \"You can only build its confidence, and hope it does not one day notice how tall it truly is.\""
    ],
    "pullQuote": "Above forty metres it stiffens. We believe it has become aware of the height and dislikes it.",
    "tags": [
      "engineering",
      "ports",
      "machinery"
    ]
  },
  {
    "id": "mar-warship-declared-too-polite-for-combat",
    "category": "Maritime",
    "headline": "Frigate declared 'too polite' for active service after apologising to every wave",
    "standfirst": "Naval assessors say the vessel's compulsive courtesy has reduced its top speed to under three knots",
    "byline": "By Beatrix Halloran, Defence and Maritime Correspondent",
    "location": "PORTSMOUTH",
    "body": [
      "A Royal Navy frigate has been quietly withdrawn from frontline duties after assessors concluded it had become 'too polite' for active service, following months in which the vessel apologised to every wave it encountered.",
      "HMS Considerate, commissioned in 2019, first drew attention when its speed on exercises fell below three knots. Investigators established that the ship was slowing to 'say sorry' to each oncoming wave individually, a courtesy that, in a moderate sea, occurs several thousand times an hour.",
      "'A warship must be prepared to make a wave and move on,' said Commodore Rupert Fanshawe of the Naval Assessment Board. 'HMS Considerate cannot bring itself to do this. It parts the water, then turns to apologise to the water, then apologises for the apology. It is a fine vessel and an impossible one.'",
      "The behaviour is understood to have spread to the crew, who now reportedly say 'excuse me' before firing the ship's guns and 'if it's no trouble' before changing course. A recent live-fire exercise was abandoned after the vessel asked the target 'whether now was a good time'.",
      "Naval psychologist Dr Priscilla Enright of the Institute for Maritime Temperament attributed the condition to 'an excess of good breeding in the ship's steel', noting that the hull had been forged 'during an unusually courteous quarter at the foundry'. She estimated that 'roughly one warship in forty' developed politeness of this severity.",
      "The Ministry of Defence confirmed HMS Considerate would be reassigned to ceremonial duties, 'for which its instincts are ideally suited'. The vessel is understood to have thanked the Ministry for the opportunity and apologised for any inconvenience caused by its reassignment."
    ],
    "pullQuote": "It parts the water, then turns to apologise to the water, then apologises for the apology. It is a fine vessel and an impossible one.",
    "tags": [
      "maritime",
      "naval",
      "defence"
    ],
    "published": "2026-07-03T05:"
  },
  {
    "id": "hea-yawns-legally-contagious",
    "category": "Health",
    "headline": "Study confirms yawns are legally, not just biologically, contagious",
    "standfirst": "Researchers argue the spread of a yawn now meets the threshold for a notifiable transmission event",
    "byline": "By Dr Roland Peverell, Epidemiology Correspondent",
    "location": "NOTTINGHAM",
    "published": "2026-07-02T12:18:00",
    "body": [
      "The yawn should be reclassified as a legally contagious event, according to a paper from the Midlands Centre for Behavioural Contagion that has divided the profession.",
      "The study tracked 2,000 office workers and found that a single yawn spread to an average of 4.6 colleagues within ninety seconds, a transmission rate the authors describe as \"brisk, and arguably notifiable\".",
      "\"A yawn crosses a room faster than most viruses and asks no permission whatsoever,\" said Dr Marion Askew, the lead author. \"If that is not transmission, we do not know what is.\"",
      "The researchers propose an \"R number for tiredness\", estimating that in poorly ventilated meeting rooms a founding yawn can seed as many as three secondary yawns before anyone realises what has happened.",
      "Reading about yawns was found to be a particularly efficient vector, with 38 per cent of survey respondents reporting a yawn while merely completing the questionnaire.",
      "Public health officials have stopped short of endorsing the reclassification, though one spokesperson admitted the department had \"become suspiciously drowsy\" during the briefing and would \"review the matter after a short lie-down\"."
    ],
    "pullQuote": "A yawn crosses a room faster than most viruses and asks no permission whatsoever.",
    "tags": [
      "health",
      "epidemiology",
      "research"
    ]
  },
  {
    "id": "wld-capital-swap-summer",
    "category": "World",
    "headline": "Two nations agree to swap capitals for the summer",
    "standfirst": "Under a novel cultural exchange, the seat of government of each country will temporarily operate from the other's principal city until early September.",
    "byline": "Henrietta Vasquez-Bligh, Foreign Affairs Editor",
    "location": "GENEVA",
    "published": "2026-07-02T11:05:00",
    "body": [
      "Two neighbouring republics have signed an agreement to exchange their capital cities for the duration of the summer, in what both governments have hailed as \"a bold experiment in administrative hospitality.\"",
      "From 1 July, the government of Morestria will conduct all official business from the city of Talven, while Talvia's ministers relocate to Morestria's capital, Brenn. Each nation retains its own laws, currency and football team, but governs from the other's postcode.",
      "\"It refreshes the perspective,\" said Morestrian Interior Minister Lucan Prebble, unpacking a filing cabinet in a borrowed ministry. \"You cannot truly know your own bureaucracy until you have tried to operate it from someone else's building, using their photocopier, which jams differently.\"",
      "The swap has raised delicate protocol questions, including whose flag flies over which parliament and who is responsible for watering the plants left behind by the outgoing administration.",
      "Officials confirmed that mail is being redirected \"on a best-efforts basis,\" and that at least three ambassadors have already presented their credentials to the wrong head of state.",
      "Tourism boards on both sides have embraced the arrangement, marketing the summer as a chance to \"visit two capitals in one city,\" though hoteliers report widespread confusion over which national anthem to play at breakfast.",
      "The agreement contains a clause allowing either country to reclaim its capital early \"in the event of an emergency, a coup, or the other side redecorating.\""
    ],
    "pullQuote": "You cannot truly know your own bureaucracy until you have tried to operate it from someone else's building.",
    "tags": [
      "diplomacy",
      "capitals",
      "exchange"
    ]
  },
  {
    "id": "tech-passwords-must-rhyme",
    "category": "Technology",
    "headline": "New security standard requires all passwords to rhyme",
    "standfirst": "Regulators say verse is significantly harder for machines to guess and 'nicer to type'.",
    "byline": "By Tomasz Adeleke, Cyber Security Correspondent",
    "location": "TALLINN",
    "published": "2026-07-02T09:38:00",
    "body": [
      "A newly ratified international security standard will require that every password contain at least one internal rhyme, on the grounds that automated attackers 'lack a sense of metre' and struggle to brute-force a good couplet.",
      "The standard, developed by the Consortium for Applied Cryptographic Prosody, mandates a minimum of two rhyming syllables, with additional entropy awarded for scansion, alliteration and 'a satisfying final beat'.",
      "\"A rhyming password is not merely secure, it is a pleasure to enter,\" said the consortium's lead cryptographer, Dr Solveig Nunes. \"Our modelling shows that attack software becomes visibly discouraged the moment it encounters an anapaest.\"",
      "Under the rules, 'correct-horse-battery-staple' is now deprecated for its 'flat, prosaic construction', while 'the-cat-sat-flat-upon-the-mat-9' scores highly. Passwords that merely repeat a word are penalised and, in strict implementations, quietly mocked.",
      "Early data from a pilot in the Baltic states shows a 34 per cent fall in successful intrusions, though a leaked audit notes a corresponding rise in help-desk calls from users 'unable to make anything rhyme with their date of birth'.",
      "Civil-liberties groups have raised concerns that the standard disadvantages the tone-deaf and speakers of languages with irregular stress. The consortium has promised an accessibility waiver permitting 'a really committed half-rhyme'.",
      "Dr Nunes remained defiant. \"The machines can count to a trillion,\" she said, \"but they cannot land a joke or finish a rhyme. That is where we make our stand.\""
    ],
    "pullQuote": "Our modelling shows that attack software becomes visibly discouraged the moment it encounters an anapaest.",
    "tags": [
      "technology",
      "security",
      "standards"
    ]
  },
  {
    "id": "biz-queue-startup-valuation",
    "category": "Business",
    "headline": "Start-up that sells your place in a queue valued at £2.6bn",
    "standfirst": "Ahead, a company that lets users buy and sell positions in ordinary British queues, has closed a bumper funding round.",
    "byline": "By Lavinia Storrs, Technology and Business Reporter",
    "location": "BRISTOL",
    "published": "2026-07-02T09:25:00",
    "body": [
      "Ahead, a technology company that operates a live marketplace for positions in physical queues, has raised £400m at a £2.6bn valuation, cementing its status as Britain's most contested unicorn.",
      "The platform allows users to sell their spot in a queue to a higher bidder and step out, or to buy their way forward, a service the company describes as \"liquidity for the impatient\".",
      "\"We looked at the British queue and saw the last great illiquid asset,\" said founder Oona Bellingham. \"Millions of people standing in strict order, unable to trade their position. It was a market crying out to be made.\"",
      "The app has proved most popular at post offices, ferry terminals and a single celebrated bakery in Ludlow where positions have changed hands for as much as £90. A secondary market in queue derivatives is said to be emerging.",
      "\"The genius is that Ahead created scarcity where there was only tedium,\" said Julian Fanshawe, an analyst at Kesterton Ventures. \"The risk is regulatory. There are people in the queue behind you who have views on being overtaken by a stranger with a subscription.\"",
      "Consumer groups have raised concerns, and the Competition and Markets Authority said it was \"examining whether a queue is a market, and if so, whose\".",
      "Ms Bellingham said the company's next product would let users short a queue they expected to collapse, adding: \"When a queue moves faster than the crowd fears, there is money to be made.\""
    ],
    "pullQuote": "We looked at the British queue and saw the last great illiquid asset.",
    "tags": [
      "business",
      "technology",
      "startups"
    ]
  },
  {
    "id": "wea-lazy-heatwave-never-arrives",
    "category": "Weather",
    "headline": "Heatwave so lazy it never quite arrives",
    "standfirst": "A much-anticipated heatwave has spent nine days approaching the country before deciding, forecasters say, that it 'couldn't really be bothered'.",
    "byline": "Tomasz Delacroix, Weather Correspondent",
    "location": "READING",
    "published": "2026-07-01T12:35:00",
    "body": [
      "A heatwave forecast to grip the country this week has proven so lazy that it never quite arrived, hovering off the south coast for nine days before, in the words of one forecaster, \"deciding it couldn't really be bothered.\"",
      "The mass of warm air, first spotted over the Bay of Biscay in mid-June, was expected to bring temperatures of 34C. Instead it has drifted listlessly, gaining no ground and repeatedly promising to \"come up properly tomorrow.\"",
      "\"It's all there,\" insisted forecaster Marion Puddicombe, gesturing at a chart of stubbornly stationary isobars. \"The heat exists. It simply lacks ambition. We have never seen a weather system so comprehensively unmotivated.\"",
      "Meteorologists estimate the heatwave has advanced an average of 200 metres per day, a pace at which it is expected to make landfall \"some time in the autumn, if it keeps its energy up, which it won't.\"",
      "Retailers who stocked up on fans, paddling pools and ice lollies have reported disappointing sales, while the public has been advised not to leave out sun cream \"on a speculative basis.\"",
      "The Met Office has downgraded the event from a heatwave to \"a warm intention,\" and forecasters concede they may have to abandon the naming process, as \"nothing about it deserves a name.\"",
      "The system is now forecast to reverse gently back out to sea by the weekend, having achieved a peak inland temperature of 21C and a national mood of quiet betrayal."
    ],
    "pullQuote": "The heat exists. It simply lacks ambition. We have never seen a weather system so comprehensively unmotivated.",
    "tags": [
      "heatwave",
      "forecast",
      "summer"
    ]
  },
  {
    "id": "eng-escalator-runs-sideways-liverpool",
    "category": "Engineering",
    "headline": "Liverpool station escalator begins running sideways after flanging lapse",
    "standfirst": "Commuters are being diverted after a mainline escalator abandoned vertical travel entirely, in what inspectors call a textbook consequence of overdue sprocket maintenance.",
    "byline": "By Tanvir Aslam, Transport Correspondent",
    "location": "LIVERPOOL",
    "published": "2026-07-01T07:55:00",
    "body": [
      "An escalator at a major Liverpool railway station has begun running sideways rather than up, stranding commuters and offering what engineers describe as a near-perfect illustration of what happens when sprockets are not flanged on schedule.",
      "The escalator, which serves the northbound concourse, was reported on Monday morning to be carrying passengers slowly to the left, depositing them against a wall some four metres from where they had intended to arrive.",
      "\"This is exactly the failure mode we warn about,\" said inspector Grace Underhill of the Vertical Transport Inspectorate. \"An escalator is only vertical by agreement between its sprockets. When the sprockets go un-flanged, that agreement lapses, and the machine reverts to lateral travel, which is its natural resting inclination.\"",
      "Maintenance records obtained by this newspaper show the escalator's sprockets were last flanged in November 2024, some eight months beyond the recommended interval, a lapse the station operator attributed to \"the national shortage of qualified flangers\".",
      "Passengers described the experience as \"disorientating but oddly gentle\". One commuter said she had boarded intending to reach the platform and had instead been delivered smoothly to a branch of a coffee chain she did not recognise.",
      "The Inspectorate has ordered the escalator taken out of service and its sprockets flanged as a matter of urgency, warning that a sideways escalator left unattended \"can, over several weeks, begin to run diagonally, at which point it is a genuine hazard\".",
      "Ms Underhill used the incident to renew calls for the winter flanging programme to be accelerated. \"People laugh about flanging until their escalator takes them to the wrong shop,\" she said."
    ],
    "pullQuote": "An escalator is only vertical by agreement between its sprockets.",
    "tags": [
      "engineering",
      "transport",
      "flanging"
    ]
  },
  {
    "id": "av-migrating-jet-bridges",
    "category": "Aviation",
    "headline": "Jet bridges begin migrating between airports overnight, baffling engineers",
    "standfirst": "At least 40 boarding bridges have relocated to warmer hubs, with several spotted travelling in formation along the M25.",
    "byline": "By Eleanor Voss, Ground Operations Correspondent",
    "location": "HEATHROW",
    "published": "2026-07-01T07:50:00",
    "body": [
      "Airport authorities across Europe are struggling to explain a wave of nocturnal migration among jet bridges, dozens of which have detached from their gates and relocated overnight to unrelated airports.",
      "The phenomenon, first noticed at Heathrow in May, has since spread. At least 40 boarding bridges are believed to have moved of their own accord, with several captured on motorway cameras travelling in a loose V-formation southbound along the M25 shortly after 3am.",
      "\"They appear to be seeking warmth,\" said Professor Alistair Crane of the Centre for Structural Ethology. \"Our tagging programme shows a strong preference for Mediterranean hubs. One bridge fitted with a tracker departed Gatwick on a Tuesday and was recorded docking at Palma seven days later, apparently under its own power.\"",
      "The migrations have caused significant disruption, with passengers at one Manchester gate reporting that their bridge \"simply wandered off\" mid-boarding, leaving a queue of travellers gesturing at open sky.",
      "Ornithologists brought in as consultants have described the movement patterns as \"unmistakably seasonal\", noting that younger, single-span bridges tend to migrate first, while older double-deck models \"often stay behind and become territorial\".",
      "Airports have trialled tethering, netting and, at one facility, a decoy gate painted to resemble a warmer climate. Officials concede that success has been \"limited\", and confirmed that 6.8 per cent of the national jet bridge fleet is now \"unaccounted for and presumed abroad\"."
    ],
    "pullQuote": "Our tagging programme shows a strong preference for Mediterranean hubs.",
    "tags": [
      "aviation",
      "airports",
      "engineering"
    ]
  },
  {
    "id": "sci-gravity-maintenance",
    "category": "Science",
    "headline": "Gravity to take scheduled maintenance break over the North Sea",
    "standfirst": "Authorities advise shipping and low-flying birds to expect a brief planned reduction in weight next Tuesday morning",
    "byline": "By Professor Alistair Crayle, Physics Correspondent",
    "location": "ABERDEEN",
    "published": "2026-07-01T06:30:00",
    "body": [
      "Gravity will be temporarily reduced over a section of the North Sea next Tuesday for scheduled maintenance, the European Gravitational Authority has confirmed, in what officials insist is a routine procedure requiring no cause for alarm.",
      "The planned reduction, affecting an area roughly the size of Yorkshire between the hours of 9am and 11am, will see the local gravitational field drop by approximately 8 per cent while engineers carry out what a spokesman called \"long-overdue works on the field's underlying attachments\".",
      "\"Gravity has been running continuously since the formation of the planet without a single maintenance window,\" said Professor Ottoline Grimwade of the Authority's Field Integrity Division. \"Frankly it is overdue. You wouldn't leave a bridge unpainted for four and a half billion years.\"",
      "Mariners have been advised to lash down loose cargo, while operators of the region's offshore platforms have been told to expect a \"mild floating sensation\" and to avoid pouring hot drinks during the affected window. Seabirds, the Authority noted, would be \"largely unaffected, being already good at this\".",
      "The works are expected to restore gravity to full service by lunchtime, though officials cautioned that the field \"may feel slightly stiff for a day or two afterwards, as is normal after maintenance\". Anyone experiencing residual lightness by Thursday is asked to report it.",
      "A vocal minority of physicists has questioned whether gravity can be switched off at all, a concern the Authority dismissed as \"the sort of thing people always say before a maintenance window\". Professor Grimwade added that a smaller test over the Wash last year \"went off without a hitch, apart from the one hitch, which floated away\".",
      "Members of the public wishing to observe the event are strongly advised not to travel to the affected area, jump, or hold anything they are fond of."
    ],
    "pullQuote": "You wouldn't leave a bridge unpainted for four and a half billion years.",
    "tags": [
      "science",
      "physics",
      "gravity"
    ]
  },
  {
    "id": "spt-cricket-test-fourth-year-postcode",
    "category": "Sport",
    "headline": "Cricket test enters fourth year and is granted its own postcode",
    "standfirst": "The Royal Mail has assigned a postal district to the ongoing match at Trellidge, where the same session has technically been in progress since 2023.",
    "byline": "Sebastian Marchmont, Cricket Correspondent",
    "location": "TRELLIDGE",
    "published": "2026-06-30T13:40:00",
    "body": [
      "A test match that began in the summer of 2023 has entered its fourth year and been granted its own postcode, after the Royal Mail concluded the permanent encampment around the ground now constitutes \"a settlement in its own right.\"",
      "The match, contested at the historic Trellidge Oval, has produced a first-innings total that officials describe as \"ongoing,\" with the current batting pair having occupied the crease for a combined 340 days.",
      "\"We stopped counting the sessions,\" admitted scorer Harold Beeching, who has kept the book by hand throughout. \"I ran out of pages in 2024. I'm now on the eleventh ledger. My handwriting has changed twice.\"",
      "The new postcode, TR1 4XX, covers the pavilion, the permanent tents pitched by spectators, a post office, and a primary school that has opened to serve children born to fans during the third year of play.",
      "The International Cricket Council has confirmed that the match remains a single continuous game and that no result can be declared until either a wicket falls or \"the venue is reabsorbed into the surrounding countryside.\"",
      "Groundstaff have re-laid the outfield twice and report that the pitch has developed \"a settled, almost geological character.\" The umpires rotate on a shift pattern and are entitled to annual leave.",
      "Local residents, who now receive mail addressed to the ground, say they have grown fond of the match. \"You can set your watch by it,\" said one. \"Nothing happens, but it happens very reliably.\""
    ],
    "pullQuote": "I ran out of pages in 2024. I'm now on the eleventh ledger. My handwriting has changed twice.",
    "tags": [
      "cricket",
      "test-match",
      "postcode"
    ]
  },
  {
    "id": "biz-lse-sprockets-flanging-overdue",
    "category": "Business",
    "headline": "London Stock Exchange trading-floor sprockets remain overdue a flanging",
    "standfirst": "Maintenance records show the exchange's ceremonial sprocket assembly has not been flanged since 2019, prompting industry concern.",
    "byline": "By Percival Hargreaves, Financial Infrastructure Correspondent",
    "location": "LONDON",
    "published": "2026-06-30T11:10:00",
    "body": [
      "The London Stock Exchange has confirmed that the sprockets beneath its historic trading floor are once again overdue a flanging, the fourth consecutive year the ceremonial maintenance has slipped.",
      "The sprockets, a set of ornamental cast-iron cogs installed in 1923 and serving no mechanical purpose anyone can now identify, are meant to be flanged annually to preserve what the exchange calls \"the integrity of the tradition\".",
      "\"A flanging is not optional. It is what separates a serious exchange from a room with computers in it,\" said facilities director Wilfred Ackroyd. \"That said, we are between flangers, and the last one retired without leaving notes.\"",
      "The lapse has drawn comment from the Prudential Regulation Authority, which stopped short of formal action but noted that \"an unflanged sprocket, while symbolic, sets a tone\".",
      "Market historians warned of precedent. \"The last time the sprockets went five years without a flanging, in the 1970s, sentiment on the floor deteriorated noticeably,\" said Imogen Threlfall of the Institute of Ceremonial Finance. \"Correlation is not causation, but the sprockets do not care about the distinction.\"",
      "The exchange said it was actively recruiting a qualified flanger and had placed the sprockets under a protective cover in the meantime, adding that trading would continue \"unflanged but undaunted\".",
      "A spokesperson confirmed the apologetic opening bell had been programmed to reference the outstanding flanging \"until such time as the matter is resolved\"."
    ],
    "pullQuote": "A flanging is not optional. It is what separates a serious exchange from a room with computers in it.",
    "tags": [
      "business",
      "markets",
      "tradition"
    ]
  },
  {
    "id": "hea-blinking-optional-review",
    "category": "Health",
    "headline": "Blinking downgraded from essential to strongly recommended",
    "standfirst": "A review of ocular guidance concludes the reflex is beneficial but not, strictly speaking, compulsory",
    "byline": "By Dr Sunniva Locke, Ophthalmology Correspondent",
    "location": "GLASGOW",
    "published": "2026-06-30T10:55:00",
    "body": [
      "Blinking has been formally downgraded from an essential bodily function to one that is merely \"strongly recommended\", following a review by the Scottish Institute of Ocular Affairs.",
      "The panel found that while blinking remains \"a lovely thing to do\", no participant in its 18-month study suffered lasting harm from being asked to blink \"only when they genuinely fancied it\".",
      "\"We had classified blinking as mandatory since the 1950s, largely out of politeness,\" said Professor Hamish Gault, the review's chair. \"The evidence for compulsion turns out to be surprisingly thin.\"",
      "Volunteers in the low-blink group reported a modest increase in staring contests won and a faint sensation of \"drying out\", which researchers logged as \"tolerable, if a touch dramatic\".",
      "The guidance now recommends a baseline of \"a comfortable amount of blinking\" and advises against setting rigid targets, noting that counting one's own blinks \"tends to make the whole business go peculiar\".",
      "The College of Optometrists has broadly welcomed the change but urged the public not to over-interpret it, stressing that the reflex \"remains free, widely available, and generally a good idea\"."
    ],
    "pullQuote": "We had classified blinking as mandatory since the 1950s, largely out of politeness.",
    "tags": [
      "health",
      "ophthalmology",
      "research"
    ]
  },
  {
    "id": "tech-server-racks-sprockets-flanged-monthly",
    "category": "Technology",
    "headline": "Data-centre operators reminded that server-rack sprockets must be flanged monthly",
    "standfirst": "The industry body issues a fresh advisory after a Slough facility skipped its flanging and the sprockets seized.",
    "byline": "By Winifred Balogun, Data Centre Correspondent",
    "location": "SLOUGH",
    "published": "2026-06-30T08:50:00",
    "body": [
      "The trade body representing data-centre operators has issued a stern reminder that the sprockets now shipped as standard with every server rack must be flanged on a monthly basis, following an incident in which a neglected facility ground to a halt.",
      "The sprockets, which appeared on enterprise racks around eighteen months ago and have no documented electronic function, must nonetheless be flanged with a torque wrench and a small amount of ceremony, or, engineers warn, they 'go off'.",
      "\"People treat the sprockets as decorative. They are not decorative,\" said Gideon Malouf of the Server Infrastructure Guild. \"An unflanged sprocket is a liability. We have seen entire racks develop a grievance.\"",
      "At the affected Slough facility, technicians had let the flanging lapse for a full quarter. When they finally attended to the sprockets, all forty-eight were found to have 'set solid', and one had, according to the incident report, 'begun to rotate the wrong way out of spite'.",
      "Manufacturers insist the sprockets are integral to rack stability, though none has been able to explain precisely how, and a leaked engineering note describes their purpose as 'best not examined too closely'. The recommended flanging interval remains twenty-eight days.",
      "The Guild's inspectorate reports that facilities observing proper monthly flanging enjoy 22 per cent fewer unexplained outages, and 'a generally better atmosphere on the data floor'.",
      "Mr Malouf urged operators not to cut corners. \"You flange the sprockets, or the sprockets, in their own time, flange you,\" he said. \"That is the whole of the law.\""
    ],
    "pullQuote": "People treat the sprockets as decorative. They are not decorative. An unflanged sprocket is a liability.",
    "tags": [
      "technology",
      "infrastructure",
      "hardware"
    ]
  },
  {
    "id": "mar-voyage-slightly-left-of-horizon",
    "category": "Maritime",
    "headline": "Cruise line launches seven-night voyage to 'slightly the left of the horizon'",
    "standfirst": "The itinerary lists no ports, only a heading, and has already sold out",
    "byline": "By Deborah Winstanley, Travel and Leisure Correspondent",
    "location": "FORT LAUDERDALE",
    "body": [
      "A luxury cruise operator has unveiled what it describes as its most ambitious itinerary yet: a seven-night voyage to 'slightly the left of the horizon', a destination it declines to plot on any chart.",
      "The cruise, marketed by Empyrean Seas at £4,900 per cabin, promises passengers 'the horizon, but from a marginally different angle'. The line's brochure lists no ports of call, no excursions and no return date that it is willing to commit to in writing.",
      "'Guests have seen the horizon from where they are standing,' said cruise director Miranda Vale. 'We are offering them the horizon from very slightly to the left of that. It is a subtle experience. Some guests report noticing nothing at all, and we consider that a successful voyage.'",
      "Travel analyst Dr Hugo Pemberton of the Centre for Aspirational Tourism said the concept tapped into 'a well-documented desire to go somewhere without arriving anywhere'. He noted that the voyage had a 96 per cent rebooking rate, 'largely from passengers who are not sure whether they went'.",
      "The vessel departed Fort Lauderdale last Tuesday and is understood to be sailing gently westward. The captain has confirmed that the ship is 'making excellent progress towards the left', though he conceded that the horizon 'continues to recede at exactly our own speed, as it tends to'.",
      "Empyrean Seas has already announced two follow-up itineraries for 2027: 'A Bit Above the Horizon' and, for its most exclusive clientele, 'Just Behind You, Don't Turn Round'."
    ],
    "pullQuote": "Some guests report noticing nothing at all, and we consider that a successful voyage.",
    "tags": [
      "maritime",
      "cruise",
      "tourism"
    ],
    "published": "2026-06-30T08:43:00"
  },
  {
    "id": "sci-belgium-time",
    "category": "Science",
    "headline": "Time confirmed to run six per cent faster in Belgium",
    "standfirst": "Atomic clocks across the country consistently gain on their neighbours, and researchers say it may explain the trains",
    "byline": "By Dr Wilhelmina Trask, Timekeeping Correspondent",
    "location": "BRUSSELS",
    "published": "2026-06-29T08:10:00",
    "body": [
      "Time passes approximately six per cent faster within the borders of Belgium than in surrounding countries, an exhaustive four-year study has concluded, resolving a discrepancy that had baffled European timekeepers for a generation.",
      "The effect, described in the latest Bulletin of Comparative Chronology, was uncovered when a fleet of synchronised atomic clocks was driven back and forth across the Belgian frontier. Every clock returned from Belgium fractionally ahead. \"We changed the clocks. We changed the cars. We changed the drivers,\" said Professor Lievin Dubois of the Royal Institute for the Study of Duration. \"Belgium remained fast.\"",
      "Across 2,300 border crossings, the acceleration held at 6.1 per cent, with a margin of error the team described as \"negligible, and getting more negligible faster than expected\" (p < 0.001). The effect appears strongest around Ghent and weakest, for reasons unknown, near the coast.",
      "The researchers say the finding may account for a number of long-standing local phenomena, including the briskness of Belgian queues, the perceived shortness of Belgian lunch breaks, and the fact that Belgian trains, though frequently late, are late by less than physics would predict.",
      "\"A Belgian hour is roughly fifty-six minutes of everyone else's,\" said co-author Dr Anouk Verhaegen. \"Belgians live longer, subjectively, but arrive everywhere sooner. It balances out, in a way that is difficult to be cross about.\"",
      "Neighbouring nations have reacted with concern. A French delegation reportedly requested that the surplus time be shared, while a Dutch official was quoted as saying the arrangement was \"typical\". The European Chronometric Commission has ruled that no country may hoard time, a regulation Belgium is technically already ahead of complying with.",
      "The team stresses that the effect is harmless and largely unnoticeable, save for a faint sense, common among visitors to Belgium, that the day has got away from them slightly quicker than usual."
    ],
    "pullQuote": "A Belgian hour is roughly fifty-six minutes of everyone else's.",
    "tags": [
      "science",
      "physics",
      "time"
    ]
  },
  {
    "id": "av-pilots-apologise-clouds",
    "category": "Aviation",
    "headline": "New regulation requires pilots to apologise to clouds before entering them",
    "standfirst": "The rule, effective September, mandates a formal expression of regret over the intercom for every cumulus disturbed.",
    "byline": "By Hugo Pemberton, Regulatory Affairs Correspondent",
    "location": "GENEVA",
    "published": "2026-06-28T10:05:00",
    "body": [
      "Pilots operating in European airspace will soon be required to formally apologise to any cloud their aircraft passes through, under new guidance issued by the International Meteorological Courtesy Board.",
      "The regulation stipulates that the commander must broadcast a \"sincere and audible\" apology over the passenger address system no fewer than 12 seconds before penetrating a cloud, with additional contrition required for larger formations.",
      "\"For too long, aviation has entered clouds without so much as a word,\" said Dr Reinhard Stoll, Chair of the Board's Atmospheric Dignity Committee. \"Our modelling suggests a cumulonimbus is disturbed roughly 4,000 times per day. That is 4,000 unacknowledged intrusions. It is, frankly, a courtesy deficit.\"",
      "The apologies must be tailored to cloud type. A wispy cirrus warrants only \"a brief and respectful acknowledgement\", whereas a towering thunderhead requires what the guidance terms \"a full and unreserved statement of remorse\", delivered slowly.",
      "Airlines have raised concerns about workload, noting that a flight across a heavily clouded North Atlantic could demand upwards of 90 separate apologies, one every four minutes. One captain described a recent training exercise as \"the most emotionally exhausting sector of my career\".",
      "Compliance will be monitored via cockpit voice recorders, with meteorologists reviewing tone as well as content. Early trials found that 22 per cent of apologies were rejected as \"insufficiently heartfelt\", a figure regulators describe as \"disappointing but improvable\"."
    ],
    "pullQuote": "That is 4,000 unacknowledged intrusions. It is, frankly, a courtesy deficit.",
    "tags": [
      "aviation",
      "regulation",
      "weather"
    ]
  },
  {
    "id": "tech-wifi-reclassified-as-livestock",
    "category": "Technology",
    "headline": "Wi-Fi signal reclassified as livestock and made subject to grazing rights",
    "standfirst": "A tribunal ruling means household wireless must now be pastured, counted, and may not be moved across county lines without a licence.",
    "byline": "By Aled Ferreira, Regulation Correspondent",
    "location": "SHREWSBURY",
    "published": "2026-06-27T15:12:00",
    "body": [
      "In a ruling that has startled both farmers and broadband providers, an agricultural tribunal has formally reclassified the domestic Wi-Fi signal as livestock, bringing it under centuries-old law governing grazing, movement and the counting of beasts.",
      "The decision, handed down after a smallholder argued that his wireless network 'roamed, multiplied, and occasionally strayed onto the neighbour's land', means that home signals must now be pastured within registered boundaries and inspected annually.",
      "\"The signal wanders, it grazes on bandwidth, and left unattended it breeds new access points,\" said the tribunal chair, Margery Iwobi. \"On the balance of evidence, it is livestock, and it must be treated with the appropriate husbandry.\"",
      "Under the ruling, households may keep no more than one wireless network per acre without a stocking licence, and a signal that strays into a neighbouring garden must be returned within seven days or forfeited to the finder.",
      "The Department for Environment, Food and Rural Affairs has issued guidance recommending that routers be 'brought in before nightfall' and that the signal be 'counted at dusk to ensure none have wandered onto the motorway'.",
      "Broadband provider Fibrous has objected, warning in a leaked submission that the ruling could require every mesh network in the county to be individually ear-tagged. An estimated 2.3 million signals nationwide are believed to be 'grazing without papers'.",
      "Ms Iwobi was unmoved. \"If it consumes a common resource and reproduces when you're not looking,\" she said, \"it can jolly well be dipped in spring like everything else.\""
    ],
    "pullQuote": "The signal wanders, it grazes on bandwidth, and left unattended it breeds new access points. On the balance of evidence, it is livestock.",
    "tags": [
      "technology",
      "networking",
      "regulation"
    ]
  },
  {
    "id": "hea-mri-sprockets-flanged",
    "category": "Health",
    "headline": "NHS confirms MRI sprockets must now be flanged fortnightly",
    "standfirst": "A quiet update to maintenance protocol reveals the scanners contain sprockets requiring regular attention",
    "byline": "By Dr Eleanor Prewitt, Medical Technology Correspondent",
    "location": "BIRMINGHAM",
    "published": "2026-06-27T15:10:00",
    "body": [
      "The nation's MRI scanners contain a bank of sprockets that must be flanged every fourteen days to remain in service, according to a maintenance directive quietly issued by NHS Estates.",
      "The directive, seen by this correspondent, specifies that each scanner's \"principal sprocket assembly\" be inspected, aligned, and \"given a good flanging\" on a strict fortnightly cycle to prevent image drift.",
      "\"People assume an MRI is all magnets and electronics. In practice it is about forty per cent sprocket,\" said Bernard Halloway, the trust's senior flanging technician. \"Skip a flanging and the pictures come out ever so slightly disappointed.\"",
      "The sprockets, which reportedly range from the size of a dinner plate to that of a modest turntable, are said to require a specialist tool known as a flanging spanner, of which the West Midlands holds only nine.",
      "A survey of 60 trusts found that 11 had fallen behind on their flanging schedule, producing scans that radiologists described as \"technically valid but a bit off, like a photocopy of a photocopy\".",
      "NHS England has appointed a National Flanging Coordinator to oversee the rollout, and has asked patients not to be alarmed by the faint ratcheting sound, which it describes as \"the sprockets settling\".",
      "The Royal College of Radiologists welcomed the clarity, noting only that it had \"long wondered what the fortnightly clanking was\"."
    ],
    "pullQuote": "People assume an MRI is all magnets and electronics. In practice it is about forty per cent sprocket.",
    "tags": [
      "health",
      "nhs",
      "technology"
    ]
  },
  {
    "id": "eng-suspension-bridge-inflates-warm-weather",
    "category": "Engineering",
    "headline": "Suspension bridge gently inflates in warm weather and must be let down at night",
    "standfirst": "Engineers on the Humber report that the crossing now swells by up to two metres on hot afternoons and requires nightly deflation by a dedicated valve crew.",
    "byline": "By Callum Ferrers, Bridges Correspondent",
    "location": "HULL",
    "published": "2026-06-27T15:03:00",
    "body": [
      "A major suspension bridge has begun to gently inflate in warm weather and must be carefully let down each night, engineers have confirmed, in a phenomenon that has baffled the crossing's operators.",
      "The bridge, which spans a broad northern estuary, rises by as much as two metres on hot afternoons, its deck perceptibly domed and its main cables audibly taut. By evening it must be deflated through a series of valves recently fitted at the tower bases.",
      "\"Thermal expansion we understand. This is not that,\" said bridge engineer Yolanda Frisk. \"This is inflation. The structure fills. On a warm day you can hear it becoming pleased with itself, and if we do not let it down overnight it stays up, and then it is over-proud by morning.\"",
      "The Highways and Rotary Inspectorate has issued a Grade B advisory and mandated a nightly deflation window between 11pm and 1am, during which a three-person valve crew walks the deck releasing pressure at measured intervals.",
      "Motorists are warned that the bridge may feel \"springy\" during hot spells and are advised not to brake sharply, as \"a fully inflated deck returns energy unpredictably\". The speed limit falls to 30mph when the inflation index exceeds 1.4 metres.",
      "Structural historians note that the phenomenon has precedent: a Victorian footbridge in Bath was reportedly deflated every summer evening until 1911, when the practice was abandoned and the bridge \"drifted off\".",
      "Ms Frisk stressed that the crossing remained entirely safe provided the schedule was kept. \"An inflated bridge is not a dangerous bridge,\" she said. \"An inflated bridge that has been left up for three days is a different conversation.\""
    ],
    "pullQuote": "On a warm day you can hear it becoming pleased with itself.",
    "tags": [
      "engineering",
      "bridges",
      "maintenance"
    ]
  },
  {
    "id": "biz-enthusiasm-crypto-crash",
    "category": "Business",
    "headline": "Cryptocurrency backed entirely by unspent enthusiasm crashes 90 per cent",
    "standfirst": "ZealCoin holders watched their tokens collapse after a wave of collective disappointment swept through the network.",
    "byline": "By Tobias Wren, Digital Assets Correspondent",
    "location": "SINGAPORE",
    "published": "2026-06-27T14:20:00",
    "body": [
      "ZealCoin, a cryptocurrency underpinned not by reserves or computing power but by the collective unspent enthusiasm of its holders, has crashed 90 per cent after the community briefly became disheartened.",
      "The token, which reached a peak valuation of £14bn in April, is designed so that its price rises with genuine excitement and falls when holders lose interest, a mechanism the whitepaper calls \"proof of stoke\".",
      "The sell-off began, developers said, after a single influential holder tweeted that he was \"a bit tired\". Within hours, the network's aggregate enthusiasm reading had fallen below the threshold required to sustain the peg.",
      "\"The fundamentals of ZealCoin were always emotional, and that was the point,\" said founder Ravi Kulkarni. \"Unfortunately, emotions are volatile, and it turns out a Monday can wipe out billions.\"",
      "Exchanges reported chaotic trading, with the token briefly valued at whatever the last person to feel hopeful was willing to pay. One analyst described the order book as \"less a market than a mood ring\".",
      "\"We warned that an asset backed by feeling great was exposed to feeling fine,\" said Delphine Arkwright of Marchbanks Digital. \"Enthusiasm is not a store of value. It is barely a store of enthusiasm.\"",
      "Developers said they were working on a stablecoin variant pegged to mild contentment, which they argued would be \"less lucrative but far harder to disappoint\"."
    ],
    "pullQuote": "Enthusiasm is not a store of value. It is barely a store of enthusiasm.",
    "tags": [
      "business",
      "crypto",
      "markets"
    ]
  },
  {
    "id": "wld-border-wandered-off-overnight",
    "category": "World",
    "headline": "Alpine border found to have wandered off overnight",
    "standfirst": "Surveyors report a 12-kilometre frontier has quietly relocated some 300 metres north, leaving three villages briefly stateless and one dairy in the wrong country.",
    "byline": "Dexter Onwuka, Central Europe Correspondent",
    "location": "SANKT WEBERTAL",
    "published": "2026-06-27T07:48:00",
    "body": [
      "A stretch of international border in the eastern Alps appears to have wandered off during the night, surveyors confirmed on Saturday, drifting roughly 300 metres north and taking a dairy, a car park and a well-regarded bakery with it.",
      "The frontier, described in treaty documents as \"fixed and immutable in perpetuity,\" was discovered to have moved when a postal worker found himself unexpectedly abroad while emptying a letterbox he had emptied domestically for eleven years.",
      "\"Borders do not simply get up and leave,\" said Chief Cartographer Ilse Randt, examining a fence that now ran diagonally through a farmyard. \"And yet. Here we are. The border has left.\"",
      "A joint commission has been convened to determine whether the border walked, rolled, or was carried, and whether it can be persuaded to return before the tourist season. Early theories centre on frost heave, tectonic drift, and \"a general restlessness.\"",
      "The affected villages have been declared temporarily stateless, a status that residents say has had few practical consequences beyond the suspension of two bus routes and a marked improvement in the postal service.",
      "The dairy at the centre of the dispute is now producing cheese under the laws of a country it did not belong to on Thursday, prompting an urgent review of its protected-origin labelling.",
      "Both governments have appealed for calm and asked citizens not to attempt to move the border back manually, warning that \"an amateur re-bordering could make things considerably worse.\""
    ],
    "pullQuote": "Borders do not simply get up and leave. And yet. Here we are. The border has left.",
    "tags": [
      "borders",
      "cartography",
      "alps"
    ]
  },
  {
    "id": "mar-barnacles-premium-passengers",
    "category": "Maritime",
    "headline": "Shipping line reclassifies hull barnacles as premium passengers",
    "standfirst": "The move grants an estimated four million crustaceans lounge access and priority disembarkation",
    "byline": "By Priya Chandrasekaran, Fleet Operations Correspondent",
    "location": "VALLETTA",
    "body": [
      "A Mediterranean shipping line has formally reclassified the barnacles attached to its vessels' hulls as premium passengers, a decision it says 'recognises their loyalty, longevity and refusal to leave'.",
      "Under the new policy, the estimated four million barnacles travelling on the cargo fleet of Adriatic Blue Lines are entitled to lounge access, a welcome drink and priority disembarkation, 'subject to their being physically removable, which they are not'.",
      "'These are our most committed travellers,' said guest-experience director Salvatore Meli. 'The average barnacle has been with us since 2019. It has never complained, never requested an upgrade, and never once asked where the lifeboats are. Frankly, our human passengers could learn from them.'",
      "Marine biologist Dr Ingrid Halvorsen of the Valletta Institute of Fouling Studies welcomed the reclassification but raised practical concerns. 'Barnacles cannot access the lounge, as it is above the waterline and they are cemented to the hull,' she noted. 'But it is the gesture that counts, and the gesture is deranged.'",
      "The reclassification has caused a headache for the accounts department, which must now issue several million loyalty statements. Each barnacle has reportedly been enrolled in the line's rewards programme at 'Platinum Encrusted' status, the highest tier available.",
      "The classification society RINA said it had 'no formal objection', noting only that reclassifying hull fouling as passengers 'raises questions about our published passenger-capacity figures, which have quietly increased by four million'."
    ],
    "pullQuote": "The average barnacle has been with us since 2019. It has never complained, never requested an upgrade, and never once asked where the lifeboats are.",
    "tags": [
      "maritime",
      "shipping",
      "wildlife"
    ],
    "published": "2026-06-27T06:33:00"
  },
  {
    "id": "sci-north-pole-drifting-south",
    "category": "Science",
    "headline": "North Pole spending increasing amounts of time slightly south, survey finds",
    "standfirst": "The planet's northernmost point has developed a modest but persistent tendency to wander in the wrong direction",
    "byline": "By Dr Fenella Roundtree, Polar Science Correspondent",
    "location": "TROMSØ",
    "published": "2026-06-26T09:05:00",
    "body": [
      "The North Pole is spending a growing proportion of each year located marginally further south than it should be, according to a comprehensive geodetic survey that has puzzled and mildly alarmed the polar science community.",
      "The Pole, by definition the northernmost point on Earth, was found over a five-year monitoring period to drift southward for an average of 43 minutes per day before returning to its correct position, a behaviour the survey team has termed \"a fundamental reluctance to be as north as it is\".",
      "\"It is a paradox we are still coming to terms with,\" admitted Professor Halvard Bjornsen of the Circumpolar Geodesy Office. \"The most northern place on the planet appears to have a southerly disposition. When it wanders, everywhere else briefly becomes a little more north by comparison, which has caused no end of confusion for penguins, who are already in the wrong hemisphere.\"",
      "The displacement, though tiny, was recorded with high confidence across 1,800 days of satellite observation (p < 0.001), and appears unrelated to the well-understood, much larger polar motion long known to geophysicists. \"This is different,\" Professor Bjornsen stressed. \"This one seems almost voluntary.\"",
      "The finding has practical consequences for anyone relying on the Pole to hold still, including compass manufacturers, Arctic explorers, and the operators of a well-known festive workshop who declined to comment. \"If the Pole keeps drifting,\" said co-author Dr Ingrid Solberg, \"deliveries could be affected. We are choosing our words carefully.\"",
      "Reviewers at the Journal of Terrestrial Coordinates accepted the paper while noting the difficulty of peer-reviewing a location that would not stay put long enough to be checked. \"Every time we went to verify it,\" the editor wrote, \"it had gone slightly south.\"",
      "Professor Bjornsen's team now plans to determine whether the South Pole is exhibiting the opposite behaviour, a question he described as \"symmetrically terrifying\"."
    ],
    "pullQuote": "The most northern place on the planet appears to have a southerly disposition.",
    "tags": [
      "science",
      "geophysics",
      "polar"
    ]
  },
  {
    "id": "wea-wind-reclassified-aggressive-air",
    "category": "Weather",
    "headline": "Wind reclassified as 'aggressive air' in Met Office overhaul",
    "standfirst": "In a shake-up of forecasting terminology, gusts above 30mph will now be described as aggressive air, with severe cases labelled 'air with an attitude problem'.",
    "byline": "Lorraine Fitzgibbon, Weather Editor",
    "location": "PLYMOUTH",
    "published": "2026-06-25T15:15:00",
    "body": [
      "Wind is to be reclassified as \"aggressive air,\" the Met Office confirmed on Wednesday, in a sweeping overhaul of forecasting language intended to \"better convey the true character\" of moving weather.",
      "Under the new system, any air travelling above 30mph will be officially designated \"aggressive,\" while gusts exceeding 55mph will be described in bulletins as \"air with an attitude problem\" and marked on charts with a small scowling symbol.",
      "\"The word 'wind' was too neutral,\" explained Met Office head of nomenclature Dr Cerys Halloran. \"It failed to capture the sheer hostility. This is not a breeze doing its job. This is air that has taken things personally.\"",
      "The reforms follow public consultation in which 71% of respondents agreed that recent winds had felt \"confrontational,\" and 44% reported feeling \"personally targeted\" while carrying shopping.",
      "Regional variations will apply, with the term \"boisterous air\" reserved for the coasts and \"air that won't let it go\" designated for the Pennines, where officials say the aggression \"tends to linger.\"",
      "Meteorologists have stressed that calm conditions will continue to be described simply as \"air behaving itself,\" and that the public should not attempt to reason with aggressive air or \"escalate the situation.\"",
      "The changes take effect immediately, with the first aggressive air of the new era expected to sweep in from the Atlantic on Friday, \"in a mood.\""
    ],
    "pullQuote": "This is not a breeze doing its job. This is air that has taken things personally.",
    "tags": [
      "wind",
      "met-office",
      "terminology"
    ]
  },
  {
    "id": "av-wingtip-vortices-artisanal-wind",
    "category": "Aviation",
    "headline": "Airport begins harvesting wingtip vortices for sale as artisanal wind",
    "standfirst": "The turbulent air shed by departing jets is now bottled, aged, and sold to premium delicatessens.",
    "byline": "By Sabine Kowalczyk, Environment & Airflow Correspondent",
    "location": "AMSTERDAM",
    "published": "2026-06-25T13:35:00",
    "body": [
      "Schiphol Airport has begun capturing the wingtip vortices trailing from departing aircraft and selling the harvested turbulence as \"artisanal wind\", in what officials describe as the world's first commercial airflow reclamation scheme.",
      "The vortices, invisible spirals of disturbed air normally regarded as a hazard to following traffic, are funnelled into carbon-fibre reservoirs at the runway threshold, decanted, and rested for a minimum of eight weeks before sale.",
      "\"A widebody produces some of the finest wind you will ever encounter,\" said Joost van der Berg, Master Windwright at the Netherlands Guild of Captured Air. \"The A350 gives a soft, buttery gust with notes of jet fuel. A regional turboprop, frankly, produces a wind we cannot in good conscience sell.\"",
      "Each 500-millilitre bottle retails for €18 and is marketed to delicatessens and high-end restaurants, where sommeliers release the wind tableside \"to gently unsettle the napkins\". Early tasting notes describe the vintage from Runway 24 as \"assertive\".",
      "Environmental campaigners have welcomed the scheme, estimating that a busy hub sheds roughly 340,000 litres of premium turbulence daily, of which only 0.6 per cent is currently harvested. The remainder, they lament, \"simply dissipates, unmonetised and unloved\".",
      "The airport has confirmed plans for a reserve range aged in oak, though officials concede that containing wind in a barrel has proven \"conceptually and physically challenging\"."
    ],
    "pullQuote": "The A350 gives a soft, buttery gust with notes of jet fuel.",
    "tags": [
      "aviation",
      "environment",
      "engineering"
    ]
  },
  {
    "id": "biz-apologetic-bell-lse",
    "category": "Business",
    "headline": "Stock exchange installs bell that gently apologises when rung",
    "standfirst": "The new opening bell at the London Stock Exchange murmurs a soft regret to the assembled traders each morning.",
    "byline": "By Cordelia Fenwick, Trading Floor Correspondent",
    "location": "LONDON",
    "published": "2026-06-25T07:00:00",
    "body": [
      "The London Stock Exchange has replaced its traditional opening bell with a new model that, when rung, gently apologises to everyone present before the day's trading begins.",
      "The device, commissioned after a wellbeing review found the old bell \"needlessly triumphant\", emits a soft chime followed by a recorded voice saying: \"Terribly sorry about all this. Do take care today.\"",
      "\"Markets are stressful, and we felt the moment of opening should acknowledge that,\" said exchange spokesperson Gareth Underhill. \"The bell no longer announces the day. It regrets it, on your behalf.\"",
      "Reaction on the floor has been mixed. Some traders reported feeling comforted; others said the apology had introduced a note of dread, with one describing it as \"like being seen off to war by a very polite butler\".",
      "The FTSE 100 opened 0.2 per cent lower, a move analysts declined to attribute to the bell, though several admitted they now felt \"vaguely responsible for it\".",
      "\"There is a behavioural finance argument that a contrite bell dampens irrational exuberance,\" said Xavier Pemberton-Rowe of Alderton Quantitative. \"There is also an argument that being apologised to at 8am makes you sell things you shouldn't. We are studying both.\"",
      "The exchange confirmed a closing bell was in development that would thank traders for their patience and \"quietly hope tomorrow goes better\"."
    ],
    "pullQuote": "The bell no longer announces the day. It regrets it, on your behalf.",
    "tags": [
      "business",
      "markets",
      "trading"
    ]
  },
  {
    "id": "eng-bolts-reclassified-decorative-torque-consensus",
    "category": "Engineering",
    "headline": "Bolts reclassified as decorative as torque moves to consensus model",
    "standfirst": "A revised British Standard downgrades the humble bolt to an aesthetic component, with clamping force now agreed collectively rather than measured.",
    "byline": "By Harriet Doulton, Standards Correspondent",
    "location": "MILTON KEYNES",
    "published": "2026-06-24T13:48:00",
    "body": [
      "Bolts have been formally reclassified as decorative under a revision to British Standard 4190, with the mechanical function of holding things together to be achieved henceforth through consensus.",
      "The change, approved by the British Standards Institution after a two-year consultation, means that torque values will no longer be specified in newton metres but agreed among stakeholders at a scheduled tightening meeting.",
      "\"We came to feel that a fixed torque figure was rather authoritarian,\" said standards committee chair Rupert Ashby-Croll. \"A bolt does not know how tight it is. It only knows how tight everyone has agreed it feels. We are simply formalising that.\"",
      "Under the new regime, each critical joint will be assigned a Tightening Facilitator responsible for convening the relevant parties, hearing views on how tight the assembly ought to be, and recording the agreed clamping force in the minutes.",
      "The Amalgamated Union of Fitters has cautiously welcomed the change, though it warned that consensus torque \"tends to drift looser over the course of a long meeting\" and called for a maximum session length of forty minutes per joint.",
      "Critics within the Institution of Fastening Engineers have described the standard as \"the end of measurable reality\", pointing out that a bridge in Warrington had already come to a unanimous decision to loosen. The bridge could not be reached for comment.",
      "Mr Ashby-Croll dismissed the concerns. \"A bolt tightened to a number is tightened alone,\" he said. \"A bolt tightened by consensus is tightened by its community. We know which we would trust to hold a viaduct.\""
    ],
    "pullQuote": "A bolt does not know how tight it is. It only knows how tight everyone has agreed it feels.",
    "tags": [
      "engineering",
      "standards",
      "fastenings"
    ]
  },
  {
    "id": "tech-bluetooth-chaperone-introduction",
    "category": "Technology",
    "headline": "Bluetooth pairing now requires a formal introduction and a chaperone",
    "standfirst": "The new protocol insists that two devices be properly introduced by a mutually trusted third party before any connection is permitted.",
    "byline": "By Constance Ekwueme, Standards Reporter",
    "location": "GENEVA",
    "published": "2026-06-24T13:47:00",
    "body": [
      "The body that oversees Bluetooth has ratified a new pairing standard under which two devices may no longer connect directly, but must first be formally introduced by a chaperone device of good standing.",
      "Under the revised protocol, known as Bluetooth Courtesy, a set of headphones wishing to pair with a phone must be presented to it by a trusted intermediary, historically the router, which vouches for both parties and then withdraws to a respectful distance.",
      "\"We felt the old model was unseemly,\" said protocol chair Reinhardt Osei of the Special Interest Group. \"Devices simply broadcasting themselves to any stranger in range. A little decorum was overdue.\"",
      "The chaperone must remain within one metre throughout the pairing and confirm that 'intentions are honourable and codec-appropriate'. Connections attempted without one are politely declined, with the devices left to acknowledge one another 'at a future, properly arranged occasion'.",
      "Early users report the process adds roughly four minutes to connecting a speaker, during which the router reads out each device's full manufacturer name and, in premium implementations, a brief character reference.",
      "A leaked draft of the standard reveals an abandoned proposal for 'engagement periods' of up to a week before pairing was finalised, dropped after focus groups described it as 'a very long time to wait for a podcast'.",
      "The Alliance reports that unauthorised connections have fallen 88 per cent. \"Devices now pair for life, or at least until the firmware update,\" said Mr Osei. \"We consider that progress.\""
    ],
    "pullQuote": "We felt the old model was unseemly. Devices simply broadcasting themselves to any stranger in range. A little decorum was overdue.",
    "tags": [
      "technology",
      "standards",
      "bluetooth"
    ]
  },
  {
    "id": "sci-rumour-weighed",
    "category": "Science",
    "headline": "Researchers successfully weigh a rumour and find it weighs four grams",
    "standfirst": "A landmark experiment isolates a single item of gossip on a precision balance, settling a question philosophers had assumed was rhetorical",
    "byline": "By Dr Cornelius Fen, Metrology Correspondent",
    "location": "ZURICH",
    "published": "2026-06-24T11:20:00",
    "body": [
      "For the first time in scientific history, a team has weighed a rumour, reporting in this week's Annals of Immaterial Physics that a single unverified claim tips the scales at almost exactly four grams.",
      "The experiment, conducted at the Swiss Federal Laboratory for Weighing Things That Shouldn't Weigh Anything, involved sealing a piece of office gossip inside a nitrogen-flushed chamber and measuring it before and after it spread. \"The chamber got heavier as more people believed it,\" said Dr Magda Vellacott, who designed the apparatus. \"That was the moment we knew we had something.\"",
      "The rumour selected for the trial, that a named colleague had once eaten an entire wheel of cheese at a conference, was chosen for its \"neutral buoyancy and broad plausibility\". Across 1,900 repetitions, its mass held steady at 4.02 grams, with a standard deviation the team described as \"gossip-thin\" (p < 0.005).",
      "Weight varied predictably with content. A compliment weighed almost nothing; a mild scandal came in at just over four grams; an outright libel bent the balance so violently the team had to bolt it down. \"Truth, interestingly, was massless,\" said Dr Vellacott. \"Only the doubt has weight.\"",
      "The finding resolves a puzzle that has troubled newsrooms and small villages for centuries, namely why bad news feels heavier. \"It is heavier,\" confirmed co-author Professor Étienne Roux. \"By approximately four grams. Now we can stop arguing about it.\"",
      "Reviewers raised the obvious concern that publishing the result would itself create rumours, thereby generating uncontrolled mass across the wider region. The journal has responded by printing the paper on unusually light paper as a precaution.",
      "The team's next target is a hunch, which preliminary data suggests may be lighter than a rumour but considerably harder to catch."
    ],
    "pullQuote": "Truth, interestingly, was massless. Only the doubt has weight.",
    "tags": [
      "science",
      "metrology",
      "physics"
    ]
  },
  {
    "id": "hea-pesto-photosynthesis-patient",
    "category": "Health",
    "headline": "Patient discovered to be photosynthesising after months of pesto",
    "standfirst": "A Devon man appears to be generating energy from sunlight following an exclusively green diet",
    "byline": "By Dr Yusuf Kaplan, Nutrition and Metabolism Correspondent",
    "location": "EXETER",
    "published": "2026-06-24T09:33:00",
    "body": [
      "A Devon man who ate little but pesto for six months has begun to photosynthesise, in what nutritionists are calling \"a first, and a slightly alarming one\".",
      "The patient, a 47-year-old former quantity surveyor, presented to his GP after noticing that he felt \"noticeably perkier by a window\" and that his skin had taken on \"a healthy, if faintly botanical, tint\".",
      "Tests at the South West Metabolic Unit confirmed that the man was producing measurable quantities of oxygen when placed in direct sunlight, at a rate one researcher likened to \"a modest houseplant\".",
      "\"We fed him nothing but basil, pine nuts and olive oil, and the body, being resourceful, appears to have simply taken the hint,\" said Dr Bronwen Silke, the unit's clinical lead. \"He now wilts a little on overcast days.\"",
      "The man reports reduced appetite on bright afternoons and a newfound urge to turn slowly to face the light over the course of the day, a behaviour the team has recorded but declined to name.",
      "The British Dietetic Association has urged the public not to attempt a full-pesto regime at home, warning that photosynthesis \"is not currently a recognised route to a balanced diet\" and that the man still requires watering advice \"we are not qualified to give\"."
    ],
    "pullQuote": "The body, being resourceful, appears to have simply taken the hint. He now wilts a little on overcast days.",
    "tags": [
      "health",
      "nutrition",
      "medicine"
    ]
  },
  {
    "id": "biz-conglomerate-acquires-itself",
    "category": "Business",
    "headline": "Conglomerate accidentally acquires itself, must now negotiate with own board",
    "standfirst": "Hartwell Industries confirmed the all-share deal closed before anyone noticed both parties were the same company.",
    "byline": "By Nathaniel Crisp, Mergers and Acquisitions Correspondent",
    "location": "MANCHESTER",
    "published": "2026-06-23T10:30:00",
    "body": [
      "Hartwell Industries, a sprawling conglomerate with interests spanning logistics, adhesives and regional radio, has accidentally acquired itself in a £9bn all-share transaction, and must now open negotiations with its own board.",
      "The deal was assembled by two separate divisions that were each unaware the target was their own parent. By the time due diligence flagged the overlap, the acquisition had already completed and been announced twice.",
      "\"We are in the unusual position of being both the buyer and the seller, and frankly the relationship has become strained,\" said chief executive Beatrice Halloran. \"I have written to myself to express concern about the price paid, and I have not yet replied.\"",
      "The company's shares rose 6 per cent, then fell 6 per cent, as the market struggled to determine whether the news was good for Hartwell the acquirer or bad for Hartwell the acquired.",
      "\"Structurally, this is the cleanest merger we've ever modelled, because there are no cultural differences whatsoever,\" said Marcus Yelverton, an M&A specialist at Drayton Corbett. \"The synergies are total. The problem is the counterparty keeps agreeing with itself, which regulators consider a red flag for collusion.\"",
      "The Competition and Markets Authority confirmed it had opened an inquiry into whether Hartwell had achieved a monopoly on being Hartwell. A spokesperson said the case raised \"novel questions we would honestly rather not have to answer\".",
      "Ms Halloran said the board hoped to reach a settlement with itself by the end of the quarter, adding: \"Talks are constructive, but I remain a difficult negotiator.\""
    ],
    "pullQuote": "I have written to myself to express concern about the price paid, and I have not yet replied.",
    "tags": [
      "business",
      "mergers",
      "corporate"
    ]
  },
  {
    "id": "av-gentle-banking-tax",
    "category": "Aviation",
    "headline": "Airlines to introduce 'gentle banking' tax as turns become chargeable",
    "standfirst": "Carriers will levy a surcharge for every degree of roll, with straight-line flights marketed as a budget option.",
    "byline": "By Dominic Threlfall, Fares & Yield Correspondent",
    "location": "DUBLIN",
    "published": "2026-06-22T11:10:00",
    "body": [
      "Several European carriers are preparing to introduce a \"gentle banking\" surcharge, under which passengers will be billed for each degree of roll their aircraft performs during flight.",
      "Under the proposed tariff, a standard 25-degree turn onto final approach would attract a fee of £3.40, while a full holding pattern over an airport could add as much as £61 to a ticket. Aircraft flying in a perfectly straight line will be sold as \"Economy Level\".",
      "\"Turning is a premium manoeuvre and it is only right that those who benefit contribute,\" said Fintan Boyle, Director of Directional Revenue at the Association of Rotational Airlines. \"Our data shows the average passenger enjoys 4.2 turns per sector, entirely unbilled. That represents a leakage of nearly 14 per cent of potential yield.\"",
      "Consumer groups have reacted with alarm, warning that airports requiring circuitous approaches could see fares rise steeply. A flight into a valley aerodrome in the Alps was quoted as incurring 31 chargeable banks, prompting one advocacy body to describe the route as \"financially unsurvivable\".",
      "Pilots' unions have expressed cautious support, noting that the scheme rewards \"decisive, expensive turning\" over what one representative called \"timid, unmonetised drifting\". A trial on domestic routes recorded a 9 per cent increase in banking angle once crews were incentivised.",
      "The Civil Aviation Authority said it was \"monitoring the situation\" and reminded carriers that any turn undertaken to avoid a mountain remains, for now, complimentary."
    ],
    "pullQuote": "Turning is a premium manoeuvre and it is only right that those who benefit contribute.",
    "tags": [
      "aviation",
      "airlines",
      "finance"
    ]
  },
  {
    "id": "spt-marathon-runner-since-2019",
    "category": "Sport",
    "headline": "Marathon runner still going since 2019 as finish line keeps politely stepping back",
    "standfirst": "Officials have apologised to Colin Feathergill, who has now run an estimated 41,000 miles because the tape is repeatedly moved just out of reach.",
    "byline": "Imelda Struthers, Athletics Correspondent",
    "location": "LOUGHBOROUGH",
    "published": "2026-06-22T08:15:00",
    "body": [
      "A club runner who entered a marathon in the autumn of 2019 is still competing nearly seven years later, after organisers admitted the finish line keeps \"politely stepping back\" every time he approaches it.",
      "Colin Feathergill, 54, has now covered an estimated 41,000 miles, a distance officials concede is \"substantially more than a marathon,\" and has passed through the finish area on at least 1,600 occasions without ever quite crossing it.",
      "\"Each time he nears the tape, the tape withdraws a few metres, out of what I can only describe as courtesy,\" explained race director Neville Hartness. \"It doesn't want to impose. It's a very English finish line.\"",
      "Mr Feathergill, who has worn through 214 pairs of trainers and outlasted three sponsors, remains in good spirits. \"I've stopped thinking of it as a race,\" he said, jogging in place during the interview. \"It's more of a lifestyle now. My split times are decades.\"",
      "The governing body has ruled that the marathon remains technically \"in progress\" and that no official time can be recorded until Mr Feathergill either finishes or the finish line finds the confidence to hold its ground.",
      "Attempts to fix the tape in place with cones have failed, with the line reportedly reappearing \"a discreet distance further on\" each morning.",
      "Mr Feathergill has qualified, in the intervening years, for a pension, and is expected to pass through the town of his birth again some time next spring."
    ],
    "pullQuote": "It doesn't want to impose. It's a very English finish line.",
    "tags": [
      "athletics",
      "marathon",
      "endurance"
    ]
  },
  {
    "id": "sci-magnetism-north-preference",
    "category": "Science",
    "headline": "Magnets found to be very slightly embarrassed about pointing north",
    "standfirst": "High-precision studies reveal compass needles hesitate for a few milliseconds before committing, a phenomenon researchers call 'directional reluctance'",
    "byline": "By Dr Percival Umblethorne, Geophysics Correspondent",
    "location": "OSLO",
    "published": "2026-06-21T15:00:00",
    "body": [
      "Magnets exhibit a faint but measurable hesitation before pointing north, as though mildly self-conscious about doing so, according to a study that has quietly upended the field of terrestrial magnetism.",
      "Using cameras capable of 40,000 frames per second, researchers at the Nordic Institute for Fields and Forces observed compass needles pause for an average of 11 milliseconds before settling northward. \"There is a moment,\" said Professor Ingeborg Aalto, \"where the needle appears to think better of it, and then does it anyway. We are calling this directional reluctance.\"",
      "The hesitation was consistent across 6,700 trials and every brand of compass tested, from military-grade instruments to a novelty one shaped like a duck (p < 0.001). \"The duck hesitated exactly as long as the others,\" Professor Aalto noted. \"Reluctance, it seems, is not a question of quality.\"",
      "The team is at pains to stress that magnets are not conscious and feel no genuine embarrassment. \"We are describing behaviour, not emotion,\" said co-author Dr Sven Halvorsen. \"Although if you watch the footage for long enough, you do start to feel for them.\"",
      "The discovery may explain a long-standing anomaly in navigation, in which compasses in crowded rooms are subtly less decisive than those used in private, a pattern sailors have reported anecdotally for centuries and always been mildly ridiculed for.",
      "Peer reviewers at the journal Polarity accepted the paper but requested the removal of a sentence describing the needles as \"doing their best\", on the grounds that it was unscientific and also made one of the referees cry.",
      "Professor Aalto's team now plans to investigate whether the reluctance worsens under observation, a study that will require, she conceded, \"a great deal of tact\"."
    ],
    "pullQuote": "There is a moment where the needle appears to think better of it, and then does it anyway.",
    "tags": [
      "science",
      "geophysics",
      "magnetism"
    ]
  },
  {
    "id": "hea-waiting-room-dread-bottled",
    "category": "Health",
    "headline": "Hospital waiting rooms found to emit a measurable dread that can now be bottled",
    "standfirst": "Researchers have successfully captured the ambient unease of the waiting area, raising questions about what to do with it",
    "byline": "By Dr Cordelia Frayne, Environmental Health Correspondent",
    "location": "NEWCASTLE",
    "published": "2026-06-21T13:48:00",
    "body": [
      "The faint but unmistakable sense of dread that pervades hospital waiting rooms is a genuine, measurable substance and can be collected in jars, according to researchers at the Tyneside Centre for Atmospheric Medicine.",
      "Using specially calibrated instruments, the team recorded a stable dread reading of 340 units in a typical outpatient waiting area, rising to 610 units near the vending machine that only accepts exact change.",
      "\"We always suspected it was in the air. We simply lacked the apparatus to prove it,\" said Dr Wilf Osgood, who led the project. \"It condenses beautifully on cold glass.\"",
      "The bottled dread, described by one technician as \"grey, faintly herbal, and vaguely reminiscent of a Sunday evening\", is being stored in a temperature-controlled facility while ethicists decide what, if anything, it is for.",
      "Early trials suggest the substance is remarkably concentrated: a single 30ml phial produced enough ambient unease to make an entire cafeteria go quiet.",
      "NHS Estates has cautiously welcomed the discovery, suggesting the dread could be \"extracted, refined, and sold to escape rooms\", though it stressed that no decisions had been taken.",
      "The Health and Safety Executive has asked that the phials be clearly labelled, warning that an accidental spill could \"cast a pall over an entire postcode\"."
    ],
    "pullQuote": "We always suspected it was in the air. We simply lacked the apparatus to prove it.",
    "tags": [
      "health",
      "research",
      "environment"
    ]
  },
  {
    "id": "tech-laptop-charges-on-sincere-compliments",
    "category": "Technology",
    "headline": "New laptop will only charge if it is sincerely complimented",
    "standfirst": "The device rejects flattery and can, its makers admit, tell the difference.",
    "byline": "By Bruno Adeyemi, Devices Editor",
    "location": "CUPERTINO",
    "published": "2026-06-21T11:20:00",
    "body": [
      "A premium laptop launched this week draws no power from the mains unless its owner offers it a compliment that the device judges to be heartfelt, a design its manufacturer describes as 'the future of emotionally accountable computing'.",
      "The Esteem Pro, from start-up Warmwattage, contains a small affective processor that evaluates the warmth, specificity and honesty of praise before permitting the battery to accept charge.",
      "\"A generic 'you're a good laptop' will get you nothing,\" explained founder Delphine Sarr. \"It wants to know what, specifically, you admire. It responds particularly well to observations about its hinge.\"",
      "In testing, the machine reached 100 per cent when a reviewer praised the 'quiet dignity of its cooling fans', but refused to charge past 3 per cent for a user who called it 'fine, I suppose'. One tester who resorted to sarcasm found the device fully discharged by morning and, in his words, 'sulking'.",
      "The Consumer Electronics Standards Consortium has declined to certify the laptop, citing the absence of any test for sincerity, though a leaked working paper concedes that the device 'appears to have one, and it is stricter than ours'.",
      "Warmwattage reports that daily charge-uptime has risen 47 per cent among households that adopted a habit of 'genuine morning acknowledgement'. Battery life among the emotionally withholding remains, the company says, 'a matter for them'.",
      "Critics have raised concerns about accessibility. In response, Ms Sarr said the firm was developing a version for the taciturn that would accept 'a really good long look', provided it was meant."
    ],
    "pullQuote": "A generic 'you're a good laptop' will get you nothing. It wants to know what, specifically, you admire. It responds particularly well to observations about its hinge.",
    "tags": [
      "technology",
      "hardware",
      "laptops"
    ]
  },
  {
    "id": "eng-slough-car-park-load-bearing-rumours",
    "category": "Engineering",
    "headline": "Slough car park found to be held up by load-bearing rumours",
    "standfirst": "A structural review concludes that a multi-storey in Slough remains standing chiefly because everyone believes it will, and warns the belief is weakening.",
    "byline": "By Marcus Threlkeld, Buildings Correspondent",
    "location": "SLOUGH",
    "published": "2026-06-21T10:15:00",
    "body": [
      "A multi-storey car park in Slough is being held up primarily by load-bearing rumours, according to a structural assessment that has prompted the local authority to close the top two floors as a precaution.",
      "The five-storey building, constructed in 1971, was found during a routine inspection to be carrying significantly more load through public confidence than through its concrete columns, several of which have not been meaningfully structural since 1998.",
      "\"The building stands because people believe it stands,\" said consulting engineer Deborah Quaife of the firm Quaife & Hollis. \"For decades that belief has been more than adequate. Belief is an extraordinarily strong material, provided it is evenly distributed.\"",
      "The problem, the report warns, is that recent online speculation questioning the car park's safety has begun to erode the very confidence keeping it upright, creating what the report terms \"a negative rumour spiral\".",
      "The Institute of Structural Perception rated the building's remaining confidence reserve at 62 per cent, down from 91 per cent a decade ago. Below 40 per cent, it warns, \"the structure may notice that it should not be standing\".",
      "The council has responded by installing signage reassuring users that the car park is \"perfectly sound\" and has quietly asked local media to avoid the subject, a strategy the report endorses as \"the only viable retrofit\".",
      "\"Do not tell people it is fine too loudly,\" Ms Quaife cautioned. \"Overstated reassurance reads as doubt, and doubt is precisely the load we cannot carry.\""
    ],
    "pullQuote": "The building stands because people believe it stands. Belief is an extraordinarily strong material.",
    "tags": [
      "engineering",
      "structures",
      "safety"
    ]
  },
  {
    "id": "mar-tanker-refuses-to-acknowledge-tide",
    "category": "Maritime",
    "headline": "Oil tanker formally refuses to acknowledge the existence of tides",
    "standfirst": "The vessel's master says the twice-daily rise and fall of the sea is 'a matter of interpretation'",
    "byline": "By Solveig Rasmussen, Marine Correspondent",
    "location": "MILFORD HAVEN",
    "body": [
      "A crude-oil tanker berthed at Milford Haven has issued a formal declaration refusing to recognise the existence of tides, describing the phenomenon as 'unproven' and 'frankly, above our pay grade'.",
      "The declaration, lodged with the harbour authority by the master of the 280,000-tonne Meridian Prospect, states that the vessel 'does not accept the premise that the sea goes up and down on a schedule' and will therefore 'moor at a fixed height and let the water sort itself out'.",
      "This has caused difficulties. At low water the tanker now sits some nine metres above the surrounding sea, held aloft entirely by its mooring lines, which harbour engineers describe as 'under considerable philosophical and physical strain'.",
      "'The tide is one of the best-evidenced phenomena in all of oceanography,' said Professor Emlyn Roberts of the Pembrokeshire Institute of Tidal Studies. 'It is caused by the moon. We have known this for centuries. I am not sure what the tanker thinks the moon is doing up there if not that.'",
      "The vessel's master, contacted by radio, was unmoved. 'We have observed the water at various heights, yes,' he conceded. 'We simply decline to attribute this to a system. The sea is entitled to its ups and downs. We do not have to keep records.'",
      "The Maritime and Coastguard Agency confirmed it had received the declaration and had filed it 'under vessels we are keeping an eye on'. It noted that the tanker's position at high water was 'entirely normal' and its position at low water was 'a growing concern to everyone standing beneath it'."
    ],
    "pullQuote": "We have observed the water at various heights, yes. We simply decline to attribute this to a system.",
    "tags": [
      "maritime",
      "shipping",
      "science"
    ],
    "published": "2026-06-21T01:"
  },
  {
    "id": "av-lavatory-passenger-27-years",
    "category": "Aviation",
    "headline": "Passenger discovered to have been trapped in aircraft lavatory for 27 years",
    "standfirst": "The man, now fluent in the emergency safety card in six languages, says he 'didn't want to make a fuss'.",
    "byline": "By Priya Ganguly, Cabin Affairs Editor",
    "location": "GATWICK",
    "published": "2026-06-19T16:45:00",
    "body": [
      "A passenger has been found alive in the rear lavatory of a Boeing 767 having, investigators believe, been trapped there since a scheduled service in 1999.",
      "The man, identified only as Gerald, 58, was discovered when a cleaning crew noticed the \"occupied\" light had been illuminated for approximately 236,000 hours. He was found calm, well-groomed, and able to recite the aircraft's emergency brace positions in English, French, German, Dutch, Portuguese and, inexplicably, Latin.",
      "\"His command of the safety card is frankly the finest I have encountered in three decades,\" said Captain Rowena Halliday of the Institute of In-Flight Egress Studies. \"He can identify all four floor-level exit paths blindfolded, which he was, because the light had burnt out in 2004.\"",
      "Gerald told reporters he had assumed the seatbelt sign remained illuminated the entire time and did not wish to disturb the crew. \"I heard the trolley go past. I simply waited for a good moment,\" he said. \"There never was one.\"",
      "Airline officials expressed regret and confirmed that Gerald had accrued 1.4 million loyalty points, which the carrier says can be redeemed for a single complimentary hot towel. He has also been offered the role of Head of Cabin Safety Narration.",
      "The Air Accidents Investigation Branch has opened an inquiry into how the lavatory occupancy audit, conducted \"every flight\", failed to register the anomaly across an estimated 31,000 individual sectors."
    ],
    "pullQuote": "I heard the trolley go past. I simply waited for a good moment. There never was one.",
    "tags": [
      "aviation",
      "safety",
      "passengers"
    ]
  },
  {
    "id": "biz-boe-vibes-rate-hike",
    "category": "Business",
    "headline": "Bank of England raises vibes rate by 25 basis points",
    "standfirst": "The Monetary Policy Committee voted seven to two to tighten the national mood, citing overheating enthusiasm.",
    "byline": "By Harriet Vane-Pemberton, Economics Correspondent",
    "location": "LONDON",
    "published": "2026-06-19T12:00:00",
    "body": [
      "The Bank of England has raised its benchmark vibes rate by a quarter of a percentage point to 4.75 per cent, its first tightening of the national mood since November, in a move designed to cool what the Governor called \"unsustainable buoyancy\".",
      "The vibes rate, introduced in 2024 as a companion to the conventional Bank Rate, sets the cost of feeling generally optimistic. Higher rates are intended to make unwarranted confidence more expensive to hold.",
      "\"Sentiment has been running ahead of the fundamentals for some months,\" Governor Alistair Cheveley told a press conference. \"When the public feels this good with so little justification, the Committee has a duty to act.\"",
      "The decision was not unanimous. Two members voted to hold, arguing that the mood was already softening and that further tightening risked \"tipping the country into a mild but persistent gloom\".",
      "Markets took the news calmly. The FTSE 100 dipped 0.4 per cent, while gilt yields were unmoved, which analysts said was \"exactly the sort of restrained response the Bank had been hoping to engineer\".",
      "\"They've clearly seen data we haven't,\" said Rosalind Ainsworth, chief mood economist at Thornfield Asset Management. \"Anecdotally, people have been far too pleased with themselves since May. A quarter-point should take the edge off.\"",
      "The Bank signalled that further increases could follow if enthusiasm failed to moderate, and reminded the public that the vibes rate \"works with a lag of roughly one long weekend\"."
    ],
    "pullQuote": "When the public feels this good with so little justification, the Committee has a duty to act.",
    "tags": [
      "business",
      "economics",
      "central-banks"
    ]
  },
  {
    "id": "wld-un-debates-optional-wednesday",
    "category": "World",
    "headline": "UN debates whether Wednesday should be made optional",
    "standfirst": "A draft resolution before the General Assembly would allow member states to skip Wednesdays on request, provided adequate notice is given to neighbouring time zones.",
    "byline": "Callum Ferris, United Nations Correspondent",
    "location": "NEW YORK",
    "published": "2026-06-18T16:40:00",
    "body": [
      "Delegates at the United Nations spent a fractious eleven hours on Tuesday debating a resolution that would render Wednesday optional for any member state that formally opts out before noon on the preceding Monday.",
      "The proposal, tabled by a bloc of nations describing themselves as \"midweek-weary,\" argues that Wednesday has become \"structurally redundant\" and that most of its business could be redistributed to a strengthened Thursday.",
      "\"Wednesday contributes nothing that Tuesday and Thursday cannot jointly absorb,\" argued Ambassador Priya Nadgauda, presenting the draft. \"We are not abolishing the day. We are simply making it available on an opt-in basis.\"",
      "Critics warned of chaos at borders, where a country observing Wednesday might share a frontier with one that had skipped directly to Thursday, producing what one delegate called \"a nine-hour discrepancy that no customs official is trained to handle.\"",
      "The International Bureau of Weights and Measures, consulted as an independent authority, confirmed that Wednesday is technically 24 hours long \"whether observed or not,\" and cautioned that the hours would still occur regardless of any vote.",
      "A compromise amendment would retain Wednesday but downgrade it to a \"provisional day,\" during which contracts, dentist appointments and parliamentary sittings would be legally non-binding.",
      "The resolution failed to reach the required majority and was postponed. It will be reconsidered, delegates confirmed, on a Wednesday."
    ],
    "pullQuote": "We are not abolishing the day. We are simply making it available on an opt-in basis.",
    "tags": [
      "united-nations",
      "calendar",
      "diplomacy"
    ]
  },
  {
    "id": "sci-moon-adhesive",
    "category": "Science",
    "headline": "Moon found to be slightly adhesive, astronauts report 'tacky' regolith",
    "standfirst": "Analysis of returned samples confirms the lunar surface has been gently sticky all along, with implications for every previous landing",
    "byline": "By Dr Rosalind Beckworth, Space Science Correspondent",
    "location": "HOUSTON",
    "published": "2026-06-18T14:05:00",
    "body": [
      "The Moon is slightly sticky, a peer-reviewed study has concluded, confirming decades of quiet complaints from astronauts who reported that walking on the lunar surface felt \"a bit like crossing a freshly varnished floor\".",
      "The finding, published in Planetary Surfaces, follows re-analysis of Apollo-era regolith samples that had spent fifty years adhering faintly to the inside of their storage containers. \"We had assumed that was static,\" said Professor Dominic Thraxton of the Lunar Adhesion Laboratory. \"It was not static. The Moon is tacky.\"",
      "Measurements put the surface's stickiness at 4.3 millitacks, a unit the team was obliged to invent, roughly equivalent to a sticky note that has already been used once. The effect is imperceptible to instruments but immediately obvious to a boot. \"Every crew felt it,\" said Professor Thraxton. \"None of them wanted to be the one to write it down.\"",
      "Re-examination of mission transcripts supports the claim. In one previously overlooked exchange, an Apollo commander is heard to remark, \"my feet keep wanting to stay,\" a comment mission control logged at the time as \"emotional\".",
      "The discovery neatly explains the peculiar bounce of the lunar walk, long attributed to low gravity but now understood to be, in part, astronauts repeatedly unsticking themselves. \"They weren't bouncing,\" said Dr Ingrid Solveig, a co-author. \"They were peeling.\"",
      "The source of the tackiness remains unknown. One hypothesis blames micrometeorite sugars; another, favoured by Professor Thraxton, holds that the Moon has simply \"always been a little bit like that, and we were too polite to mention it\".",
      "Future missions will carry a dedicated instrument, the Tackometer, to map lunar stickiness in detail. Engineers have already been reminded not to lean on it."
    ],
    "pullQuote": "We had assumed that was static. It was not static. The Moon is tacky.",
    "tags": [
      "science",
      "space",
      "moon"
    ]
  },
  {
    "id": "hea-cold-legal-personhood",
    "category": "Health",
    "headline": "The common cold applies for legal personhood",
    "standfirst": "A filing lodged this week seeks formal recognition of the rhinovirus as an individual with rights and responsibilities",
    "byline": "By Dr Harriet Voss, Public Health Correspondent",
    "location": "LONDON",
    "published": "2026-06-18T11:20:00",
    "body": [
      "The common cold has formally applied for legal personhood, in a case that public health officials describe as \"unprecedented and frankly cheeky\".",
      "The application, filed on the virus's behalf by an unnamed firm of solicitors, argues that the rhinovirus has \"maintained a continuous relationship with the British public for centuries\" and should therefore be entitled to representation.",
      "\"It has been with us through everything. Weddings, funerals, half-terms,\" a spokesperson for the filing said. \"It argues, not unreasonably, that this constitutes a form of citizenship.\"",
      "Epidemiologists at the Institute for Communicable Nuisances estimate the cold infects the average Briton 2.3 times a year, a level of engagement the filing describes as \"more consistent than most family members\".",
      "The Department of Health has opposed the application, warning that granting personhood could entitle the cold to a passport, a National Insurance number, and \"conceivably, statutory sick pay of its own\".",
      "Professor Alan Redditch of the Faculty of Virology called the move \"legally ambitious\", noting that the cold had also failed to provide a fixed address, \"on the grounds that it is currently residing in approximately four million noses\".",
      "A preliminary hearing has been scheduled, though officials note the virus is expected to attend only intermittently, and mostly in the winter months."
    ],
    "pullQuote": "It has been with us through everything. Weddings, funerals, half-terms.",
    "tags": [
      "health",
      "virology",
      "law"
    ]
  },
  {
    "id": "eng-tunnel-longer-on-way-back",
    "category": "Engineering",
    "headline": "Pennine tunnel confirmed to be longer on the way back",
    "standfirst": "Surveyors have established that a rail tunnel near Standedge measures 4.9km westbound but 5.6km eastbound, a discrepancy engineers say is \"real and repeatable\".",
    "byline": "By Fenella Aird, Rail Infrastructure Correspondent",
    "location": "MARSDEN",
    "published": "2026-06-18T08:22:00",
    "body": [
      "A railway tunnel in the Pennines is officially longer on the way back than on the way there, Network Rail has confirmed, following an eighteen-month survey that the organisation had hoped would prove the opposite.",
      "The tunnel, on a line near Marsden, measures 4.9 kilometres when travelled westbound but a consistent 5.6 kilometres eastbound, a difference of 700 metres that does not appear on any drawing and cannot be explained by track curvature.",
      "\"We measured it forwards, we measured it backwards, we sent a laser through it and then walked it with a wheel,\" said senior surveyor Pauline Grewcock. \"The tunnel is longer coming home. It is longer coming home whichever direction you define as home, which is the part we find upsetting.\"",
      "The Office of Rail and Road has accepted the finding and updated the tunnel's official length to \"4.9km, or 5.6km\", a formulation it concedes is unsatisfactory but which it says is \"the only honest one available\".",
      "Passengers had reported the phenomenon for years, describing the return journey through the tunnel as \"noticeably more tiresome\" and \"psychologically the wrong length\", but the reports were dismissed until the instrument survey confirmed them.",
      "Physicists consulted by Network Rail declined to comment on the record, though one, speaking anonymously, described the tunnel as \"probably fine\" and asked not to be sent there.",
      "Timetables have been amended so that eastbound services allow an additional ninety seconds. \"We are not going to shorten the tunnel,\" Ms Grewcock said. \"You cannot shorten a tunnel. You can only respect it.\""
    ],
    "pullQuote": "The tunnel is longer coming home. It is longer coming home whichever direction you define as home.",
    "tags": [
      "engineering",
      "rail",
      "infrastructure"
    ]
  },
  {
    "id": "biz-handshake-firm-floats",
    "category": "Business",
    "headline": "Firm whose only product is a firm handshake floats at £4bn",
    "standfirst": "Grasp Holdings priced at the top of its range, valuing a company that makes nothing you can hold except your hand.",
    "byline": "By Sebastian Marlowe, Capital Markets Reporter",
    "location": "LONDON",
    "published": "2026-06-18T08:05:00",
    "body": [
      "Grasp Holdings, a company whose entire offering is a single, well-executed firm handshake, made its debut on the London Stock Exchange on Thursday with a valuation of £4bn.",
      "The business employs 1,200 accredited handshakers who visit clients to deliver what the prospectus calls \"a moment of confident, dry-palmed human reassurance, priced per grip\".",
      "\"We are not in the business of gimmicks,\" said chief executive Fenella Braithwaite, delivering the point with a handshake so firm that two journalists reported a lasting sense of having been believed in. \"We are in the business of trust, sold by the second.\"",
      "Shares opened at 480p and rose 12 per cent by midday, before easing after a note from analysts at Ravensworth Securities questioned whether the total addressable market of hands was \"already fully penetrated\".",
      "\"The margins are extraordinary because the cost of goods is effectively a handshake,\" said Idris Fontaine of the same firm. \"But you have to ask how many times you can shake the same hand before it becomes a hug, at which point the pricing model collapses.\"",
      "Grasp faces competition from a rival start-up offering a reassuring nod, which floated last year and has since pivoted to a raised eyebrow. Ms Braithwaite dismissed the threat as \"non-committal by design\".",
      "The company said it would use the proceeds to expand into two-handed handshakes, a premium tier it described as \"the clasp\"."
    ],
    "pullQuote": "We are in the business of trust, sold by the second.",
    "tags": [
      "business",
      "markets",
      "ipo"
    ]
  },
  {
    "id": "tech-cloud-is-actual-cloud-berkshire",
    "category": "Technology",
    "headline": "The cloud found to be an actual cloud, and it is raining data over Berkshire",
    "standfirst": "Meteorologists and network engineers confirm that years of stored information have begun precipitating over the Home Counties.",
    "byline": "By Idris Nakamura, Infrastructure Correspondent",
    "location": "READING",
    "published": "2026-06-18T07:33:00",
    "body": [
      "After decades of assurance that 'the cloud' was merely a metaphor for remote servers, engineers have confirmed that it is, in the case of at least one major provider, a genuine cloud, and that it has begun to rain data over central Berkshire.",
      "Residents of the region first reported the phenomenon when household spreadsheets, holiday photographs and a quantity of other people's tax returns started falling gently from an overcast sky near Twyford.",
      "\"We had always assumed the terminology was figurative,\" admitted Dr Wallace Ombori of the National Precipitation and Data Office. \"It transpires the servers were up there the whole time. Frankly it explains the latency.\"",
      "The Met Office has begun issuing amber warnings for 'scattered outbreaks of legacy data', advising the public not to drink the rain, which one sample showed to be 40 per cent corrupted JPEGs by volume. Umbrellas, officials stress, offer no protection against a data breach.",
      "The provider, Stratocumulus Compute, released a statement acknowledging 'unscheduled downfall' and reassuring customers that their information remained 'in the general area'. A leaked internal memo referred to the event as 'condensation with extra steps'.",
      "Local farmers report mixed results. One field near Sonning yielded a bumper crop of duplicate PDFs, while a garden centre in Wargrave was buried under three inches of an abandoned company's customer relationship management database.",
      "Analysts at the firm Overcast Advisory warned that the situation could worsen. \"If the front moves east,\" said senior analyst Petra Vance, \"we are looking at the possibility of an entire quarter's backups falling on Slough, and nobody deserves that.\""
    ],
    "pullQuote": "We had always assumed the terminology was figurative. It transpires the servers were up there the whole time. Frankly it explains the latency.",
    "tags": [
      "technology",
      "cloud",
      "infrastructure"
    ]
  },
  {
    "id": "wea-showers-mild-disappointment",
    "category": "Weather",
    "headline": "Scattered showers of mild disappointment expected over the Midlands",
    "standfirst": "Forecasters warn of a front of low-grade letdown moving in from the west, with localised sighing and a risk of resigned shrugging by evening.",
    "byline": "Nigel Ashworth, Senior Weather Presenter",
    "location": "BIRMINGHAM",
    "published": "2026-06-15T18:00:00",
    "body": [
      "The Met Office has issued a forecast of scattered showers of mild disappointment across the Midlands this week, with the heaviest letdown expected between Wednesday and Friday.",
      "The system, described as \"a broad band of general underwhelm,\" is forecast to move in from the west overnight, bringing spells of quiet disillusionment, patchy resignation, and a 60% chance of someone saying \"well, that's that then.\"",
      "\"It won't be dramatic,\" cautioned forecaster Sandra Whitlock. \"That's rather the point. We're not expecting despair. Just a persistent, low-level sense that things could have gone slightly better. Bring a light jacket and modest expectations.\"",
      "Rainfall totals are forecast to be unremarkable, which meteorologists stress is \"entirely consistent with the disappointment,\" and may leave residents feeling that the weekend, when it comes, has already been faintly spoiled.",
      "The disappointment is expected to be at its most acute around teatime, coinciding with the moment several forecast barbecues are quietly abandoned.",
      "The Met Office advised the public to \"lower their sights accordingly\" and warned that isolated pockets of the West Midlands could experience \"a brief but genuine anticlimax\" around dusk.",
      "Conditions are expected to clear by Saturday, replaced by a spell of grudging acceptance moving in from the north."
    ],
    "pullQuote": "We're not expecting despair. Just a persistent, low-level sense that things could have gone slightly better.",
    "tags": [
      "forecast",
      "midlands",
      "showers"
    ]
  },
  {
    "id": "eng-self-aware-gears-refuse-mesh",
    "category": "Engineering",
    "headline": "Gears at Midlands plant become self-aware and refuse to mesh with rivals",
    "standfirst": "A gearbox at a Coventry engineering works has developed social preferences, with some gears declining to engage with others they are said to dislike.",
    "byline": "By Ronan Whitcombe, Manufacturing Correspondent",
    "location": "COVENTRY",
    "published": "2026-06-15T11:05:00",
    "body": [
      "Engineers at a precision gearbox facility in Coventry have reported that a bank of industrial gears has become self-aware and is now refusing to mesh with gears it appears to dislike.",
      "The problem was first identified when a 48-tooth spur gear repeatedly disengaged from its neighbour despite being mechanically sound, correctly lubricated, and properly flanged. Investigations found no fault. The gear simply would not turn with the one beside it.",
      "\"We tried a different 40-tooth gear and it meshed perfectly happily,\" said works manager Iris Pettifer. \"So it is not that our large gear cannot mesh. It is that it will not mesh with that particular gear. There is history there, though we do not know what.\"",
      "The Institution of Mechanical Behaviourists has classified the incident as a Category Two Emergence event, the first recorded in a British gearbox since a self-aware ratchet in Preston in 2019 began keeping time for its own reasons.",
      "\"Once a gear develops preferences, you cannot simply force it,\" said Professor Alastair Denny of the Institution. \"You can gear a horse to water, as we say in the trade, but you cannot make it mesh. Attempting to override a self-aware gear voids its warranty and, frankly, its cooperation.\"",
      "The facility has been forced to reorganise its entire gear train around the affected components' apparent social groupings, a process it describes as \"seating arrangements\". Production is down 34 per cent.",
      "The Health and Safety Executive said it was monitoring the situation but noted that no gear had yet expressed a preference that endangered human staff. \"So far the gears only dislike other gears,\" a spokesperson said. \"We would become concerned if that changed.\""
    ],
    "pullQuote": "You can gear a horse to water, but you cannot make it mesh.",
    "tags": [
      "engineering",
      "manufacturing",
      "automation"
    ]
  },
  {
    "id": "hea-clockwise-blood-baffles",
    "category": "Health",
    "headline": "Man's blood found to be running slightly clockwise; specialists baffled",
    "standfirst": "A routine check-up reveals a directional preference no textbook can explain",
    "byline": "By Dr Oswin Carrow, Haematology Correspondent",
    "location": "SHEFFIELD",
    "published": "2026-06-14T14:30:00",
    "body": [
      "A 54-year-old Sheffield man has become the focus of intense medical interest after tests confirmed that his blood is circulating in a faint but persistent clockwise motion, a phenomenon haematologists say has \"no earthly business occurring\".",
      "The patient, known in the case notes only as Subject G, was referred after a nurse noticed his pulse \"seemed to be going the pretty way round\". Subsequent imaging confirmed a consistent rightward drift of roughly three degrees.",
      "\"Blood does not have a preferred direction of rotation. It simply goes where the plumbing sends it,\" said Professor Dilys Manning of the Northern Haematology Unit. \"And yet here we are, watching it swirl like water leaving a sink.\"",
      "The man reports no symptoms beyond a mild tendency to lean to the right in queues and a lifelong fondness for roundabouts, which the team has flagged as \"probably unrelated but noted\".",
      "A control study of 40 volunteers found all 40 to be circulating in the conventional, non-committal manner, deepening the mystery around Subject G.",
      "The case has been submitted to the Journal of Improbable Circulation, and specialists are reportedly divided over whether the man should be encouraged to remain still in case he unwinds."
    ],
    "pullQuote": "Blood does not have a preferred direction of rotation. It simply goes where the plumbing sends it.",
    "tags": [
      "health",
      "haematology",
      "medicine"
    ]
  },
  {
    "id": "sci-echo-slower",
    "category": "Science",
    "headline": "Echoes found to be arriving progressively later, acousticians warn",
    "standfirst": "Sound reflected off hard surfaces is taking measurably longer to return, and the delay is growing by a fraction each year",
    "byline": "By Dr Sylvia Auhm-Redding, Acoustics Correspondent",
    "location": "CARDIFF",
    "published": "2026-06-14T10:45:00",
    "body": [
      "Echoes are getting slower, according to a startling report from the Welsh Institute of Reverberation, which found that sound reflected off cliffs, canyons and empty swimming pools is now returning noticeably later than it did a decade ago.",
      "The delay, though small, is unmistakable. \"You shout, and there is a pause, and then a slightly longer pause, and then the echo,\" said Professor Emrys Talgarth, who has been shouting into the same quarry every Sunday since 2011. \"The quarry hasn't moved. The echo has got lazy.\"",
      "Precise measurements put the additional delay at 0.7 milliseconds per year, accumulating steadily, with a consistency the team rated at p < 0.002 across 8,000 recorded shouts. The effect is independent of temperature, humidity, and, crucially, of how loudly one shouts, which the team tested exhaustively and to the considerable annoyance of nearby residents.",
      "\"We considered every explanation,\" said co-author Dr Nerys Pugh. \"Softer cliffs. Tired air. A general national reluctance. In the end the data simply says the echo is taking its time, and we must respect that.\"",
      "The finding has practical implications for anyone who relies on prompt echoes, including bats, submariners, and people who enjoy hearing their own name in tunnels. The Institute has advised affected parties to \"shout slightly earlier than feels natural\" to compensate.",
      "Not all acousticians accept the result. A rival group in Norway insists echoes there are, if anything, arriving early, a claim the Cardiff team attributes to \"the well-known briskness of fjords\".",
      "Professor Talgarth intends to continue his weekly shouts indefinitely. \"If the trend holds,\" he said, gazing across the quarry, \"by the year 2400 the echo will arrive the following Tuesday. I shall not be here to hear it, but I like to think someone will.\""
    ],
    "pullQuote": "The quarry hasn't moved. The echo has got lazy.",
    "tags": [
      "science",
      "acoustics",
      "research"
    ]
  },
  {
    "id": "biz-pound-sterling-heavier",
    "category": "Business",
    "headline": "Pound sterling has become measurably heavier, Royal Mint confirms",
    "standfirst": "ATMs across the country are straining to dispense notes that now weigh roughly the same as a small paving slab.",
    "byline": "By Marion Delacroix, Markets Editor",
    "location": "LONDON",
    "published": "2026-06-14T09:40:00",
    "body": [
      "The pound sterling has grown physically heavier over the past quarter, according to the Royal Mint, with a single £20 note now weighing approximately 340 grams, up from under a gram at the start of the year.",
      "The cause remains disputed. The Bank of England has attributed the phenomenon to \"the accumulated gravity of market confidence\", while independent economists point to what one called \"an unusually literal flight to quality\".",
      "Cash machines have borne the brunt. LloydsWest reported that 6,000 of its ATMs had jammed attempting to dispense a routine £50 withdrawal, and that three units in Leeds had sunk partway into the pavement.",
      "\"We advise customers to withdraw cash in smaller denominations and, where possible, to bring a trolley,\" said Douglas Amberley, head of physical currency at the retail bank. \"A full £200 withdrawal now requires two hands and, ideally, a friend.\"",
      "Sterling strengthened 1.3 per cent against the dollar on the news, a move traders described as \"appropriate, given it can now be used to hold doors open\". The FTSE 100 closed flat, weighed down, analysts joked, by nothing in particular.",
      "The Treasury said it was \"monitoring the density of the currency\" and reminded the public that the pound remained \"legal tender, load-bearing capacity notwithstanding\".",
      "Digital payment firms reported a surge in usage, with one executive noting that contactless had \"never looked more appealing than at the moment your wallet becomes a health-and-safety concern\"."
    ],
    "pullQuote": "A full £200 withdrawal now requires two hands and, ideally, a friend.",
    "tags": [
      "business",
      "currency",
      "banking"
    ]
  },
  {
    "id": "av-elastic-airliner-passenger-count",
    "category": "Aviation",
    "headline": "Airbus confirms new airliner physically elongates with each passenger booked",
    "standfirst": "The A320neoStretch adds 14 centimetres of fuselage per confirmed seat and contracts overnight if bookings fall.",
    "byline": "By Marcus Fenwick, Aviation Correspondent",
    "location": "TOULOUSE",
    "published": "2026-06-14T09:20:00",
    "body": [
      "Airbus has confirmed that its latest narrow-body aircraft, the A320neoStretch, physically lengthens as passengers are added to the manifest, with each confirmed booking extending the fuselage by precisely 14 centimetres.",
      "The elongation, which engineers describe as \"demand-responsive geometry\", means a fully booked service to Malaga now measures some 26 metres longer than the same aircraft flying half empty. Cabin crew have been issued pedometers.",
      "\"The airframe simply grows to accommodate the load,\" said Dr Hélène Vasseur, Chief of Dimensional Systems at the European Institute for Applied Fuselage Dynamics. \"We recorded a 41 per cent increase in overall length on a Frankfurt sector last Tuesday. The passengers noticed nothing, which is exactly the standard we aim for.\"",
      "Industry analysts caution that the contraction phase, which occurs overnight when unsold seats are released back to inventory, has caused at least three aircraft to shrink while still parked at their gates, leaving jet bridges reaching into empty air.",
      "The Civil Aviation Authority has issued interim guidance requiring all elastic airframes to display their current length on the departure board. A spokesperson confirmed that a 189-seat aircraft carrying only 12 passengers is now legally classified as \"a large motorcycle\".",
      "Airbus insists the technology is safe, noting that fewer than 2.7 per cent of stretch cycles result in what the manufacturer terms \"unscheduled accordioning\". Deliveries begin in the autumn, subject to the aircraft being long enough to leave the factory."
    ],
    "pullQuote": "A 189-seat aircraft carrying only 12 passengers is now legally classified as a large motorcycle.",
    "tags": [
      "aviation",
      "engineering",
      "airbus"
    ]
  },
  {
    "id": "tech-update-apologise-to-router",
    "category": "Technology",
    "headline": "Software update requires users to physically apologise to their router",
    "standfirst": "Version 12.4 will not proceed until the household expresses sincere and specific contrition.",
    "byline": "By Fenella Achebe, Networking Reporter",
    "location": "SWINDON",
    "published": "2026-06-14T09:05:00",
    "body": [
      "A mandatory firmware update rolling out this week will not install on the country's most popular home router until the owner has apologised to the device out loud, and, crucially, meant it.",
      "The update, from manufacturer Nexopath, introduces what the company calls a 'Reconciliation Handshake', in which the router listens for an apology and evaluates its sincerity against a proprietary contrition index.",
      "\"For years these devices have absorbed a great deal of abuse,\" said Nexopath's head of firmware, Sandrine Kovač. \"They have been unplugged mid-download, struck, and blamed for things that were plainly the fault of the broadband provider. We felt it was time for a conversation.\"",
      "Early adopters report that the router rejects apologies it deems perfunctory, flashing amber and requesting that the user 'be more specific about the incident in 2023'. One tester in Frome was reportedly kept offline for six hours until he acknowledged 'the thing with the towel'.",
      "The Wireless Fidelity Alliance has provisionally endorsed the feature, though a leaked technical annex warns that routers may 'develop preferences' and, in one documented case, forgave the household but not the cat.",
      "Consumer group Which Wire? advised users to keep apologies 'brief, honest, and free of conditions', noting that saying 'I'm sorry you feel that way' resets the entire process and voids the warranty.",
      "Nexopath insists the feature improves network stability by 31 per cent. Asked whether the router might one day apologise in return, Ms Kovač paused. \"It has done nothing wrong,\" she said. \"And it knows it.\""
    ],
    "pullQuote": "It rejected the apology, flashed amber, and requested that the user be more specific about the incident in 2023.",
    "tags": [
      "technology",
      "networking",
      "software"
    ]
  },
  {
    "id": "spt-match-abandoned-self-aware-ball",
    "category": "Sport",
    "headline": "Premier League match abandoned after ball becomes self-aware",
    "standfirst": "Referees suspended play in the 67th minute after the match ball declined to be kicked, citing a newfound sense of purpose.",
    "byline": "Gareth Pollard, Chief Football Writer",
    "location": "MANCHESTER",
    "published": "2026-06-11T21:30:00",
    "body": [
      "A top-flight football match descended into unprecedented chaos on Wednesday evening when the match ball became self-aware midway through the second half and refused to participate any further.",
      "The ball, a standard synthetic size-five, reportedly rolled to a halt on the centre circle in the 67th minute and, according to players closest to the incident, \"began to consider its options.\"",
      "\"You go to strike it and it just isn't there anymore, spiritually,\" said midfielder Dominic Ashcroft afterwards. \"It looked up at me. A football looked up at me. I've been in the game 14 years and nothing prepares you for eye contact from the ball.\"",
      "Referee Malcolm Prentice consulted the fourth official and the laws of the game before abandoning the fixture, noting that the rulebook \"makes no provision for a ball that has developed preferences.\"",
      "The Football Association confirmed it had launched an inquiry and stressed that only 0.02% of match balls are believed to achieve sentience in a given season, though the figure is rising.",
      "Groundstaff eventually coaxed the ball off the pitch using what one steward described as \"a calm voice and the promise of being left alone,\" and it has since been placed in a quiet room pending assessment.",
      "The result will stand as a 0-0 draw, with both clubs awarded a point and the ball granted, at its own request, a period of leave."
    ],
    "pullQuote": "A football looked up at me. I've been in the game 14 years and nothing prepares you for eye contact from the ball.",
    "tags": [
      "football",
      "premier-league",
      "abandoned"
    ]
  },
  {
    "id": "sci-thursday-colour",
    "category": "Science",
    "headline": "Scientists identify a new colour visible only on Thursdays",
    "standfirst": "The hue, provisionally named 'thurl', cannot be photographed and disappears entirely by Friday lunchtime",
    "byline": "By Professor Marcus Ellingham, Optics Correspondent",
    "location": "ST ANDREWS",
    "published": "2026-06-11T09:40:00",
    "body": [
      "A previously unknown colour that becomes visible to the human eye only on Thursdays has been described for the first time by researchers at the Scottish Institute for Perceptual Science, who have provisionally named it 'thurl'.",
      "The colour sits, the team reports, \"somewhere between teal and a feeling of mild obligation\", and is perceptible only between roughly dawn and dusk on the fourth day of the week. \"On Wednesday there is nothing there,\" said Dr Priya Ashworth, the study's lead author. \"On Thursday it is unmistakable. By Friday it has gone again, and everyone who saw it feels faintly foolish.\"",
      "In a double-blind trial, 340 volunteers were shown a swatch of thurl through a specially calibrated aperture. On Thursdays, 94 per cent correctly identified it as \"a colour\". On all other days, the same swatch was reported as \"grey\", \"beige\", or \"nothing, why are you asking me this\" (p < 0.002).",
      "Attempts to record thurl have failed comprehensively. Cameras register only an empty patch; spectrometers return a reading the team describes as \"a polite refusal\". \"The colour appears to object to being measured,\" said Dr Ashworth. \"It is, in that respect, quite Scottish.\"",
      "The discovery has reignited a long-running debate about whether other days conceal colours of their own. A minority faction within the Institute maintains that Tuesday hides a shade of orange, though this has never been reliably observed, largely because the researchers keep forgetting to look.",
      "Peer reviewers at the journal Chromatica praised the rigour of the work while noting, drily, that the paper could only be properly refereed one day in seven. \"We lost three weeks,\" the handling editor wrote, \"waiting for Thursdays.\"",
      "The team now hopes to establish whether thurl is warm or cool, a question complicated by the fact that everyone asked gives a different answer, and only ever on a Thursday."
    ],
    "pullQuote": "On Wednesday there is nothing there. On Thursday it is unmistakable. By Friday it has gone again, and everyone who saw it feels faintly foolish.",
    "tags": [
      "science",
      "optics",
      "perception"
    ]
  },
  {
    "id": "hea-forty-sighs-daily",
    "category": "Health",
    "headline": "Adults advised to sigh at least 40 times a day for heart health",
    "standfirst": "New cardiovascular guidance places the humble sigh at the centre of the nation's wellbeing strategy",
    "byline": "By Dr Marcus Threlfall, Cardiology Correspondent",
    "location": "BRISTOL",
    "published": "2026-06-11T09:05:00",
    "body": [
      "Adults should aim to sigh a minimum of 40 times daily to maintain healthy circulation, according to guidance issued this week by the National Council for Respiratory Wellbeing.",
      "The recommendation follows a two-year trial in which 1,500 participants who were prompted to sigh regularly showed a 12 per cent improvement in what researchers termed \"general chest contentment\".",
      "\"The sigh is the body's own reset button,\" said Dr Imogen Blyth, the council's clinical lead. \"We have been under-sighing as a nation for decades, and the data is finally catching up with us.\"",
      "Investigators distinguished between a qualifying \"deep restorative sigh\" and a non-qualifying \"exasperated puff\", noting that only the former conferred measurable benefit and that the latter \"may cancel one out\".",
      "The council recommends spreading sighs evenly across the day, with a suggested cluster of six upon waking and a further eight during the evening commute, described in the guidance as \"nature's window\".",
      "The Chartered Society of Breathing welcomed the target but cautioned against overshooting, warning that patients logging more than 200 sighs a day should \"consider whether something else is going on\"."
    ],
    "pullQuote": "We have been under-sighing as a nation for decades, and the data is finally catching up with us.",
    "tags": [
      "health",
      "cardiology",
      "wellbeing"
    ]
  },
  {
    "id": "eng-m6-ironed-flat-every-tuesday",
    "category": "Engineering",
    "headline": "Motorway must now be ironed flat every Tuesday, agency confirms",
    "standfirst": "A twelve-mile stretch of the M62 develops overnight creases that engineers say can only be removed with a heated press the width of the carriageway.",
    "byline": "By Denise Farthingale, Roads Correspondent",
    "location": "HUDDERSFIELD",
    "published": "2026-06-11T06:30:00",
    "body": [
      "A section of the M62 between junctions 22 and 24 must be ironed flat every Tuesday morning to remain safe for use, National Highways has confirmed, ending months of speculation about the weekly closures.",
      "Engineers first noticed the creasing in March, when drivers reported a rhythmic undulation that had not been present the previous week. Surveys revealed that the road surface was developing overnight wrinkles up to four centimetres deep, running diagonally across all three lanes.",
      "\"The tarmac is relaxing,\" explained pavement engineer Sunil Bracewell. \"During the day the traffic keeps it taut. But over a long enough period, and particularly in mild weather, the surface begins to gather, rather like a fitted sheet that has come loose at one corner.\"",
      "The solution, arrived at after consultation with the Road Surface Standards Board, is a bespoke heated press mounted on a convoy of six vehicles that traverses the affected stretch at four miles per hour, applying 900 kilograms of pressure and a temperature of 140 degrees.",
      "The operation takes place between 2am and 5am each Tuesday and requires a full closure. National Highways stressed that Tuesday was chosen because \"the creases are worst at the start of the week, and the road is calmest\".",
      "Motoring groups have broadly welcomed the certainty. \"We would rather know it is ironed on Tuesdays than wonder,\" said a spokesperson for the Association of British Drivers. \"An un-ironed motorway is not something anyone wishes to encounter at seventy miles an hour.\"",
      "Officials declined to say whether other roads were affected, but confirmed that a slip road near Ossett had \"begun to pucker\" and was under observation."
    ],
    "pullQuote": "The tarmac is relaxing. During the day the traffic keeps it taut.",
    "tags": [
      "engineering",
      "roads",
      "maintenance"
    ]
  },
  {
    "id": "tech-hold-music-ai-runs-governments",
    "category": "Technology",
    "headline": "AI trained solely on hold music now governs three regional authorities",
    "standfirst": "The model, which knows only the tones of indefinite waiting, has been praised for its calm and criticised for never quite connecting.",
    "byline": "By Dev Okonkwo, Technology Correspondent",
    "location": "MILTON KEYNES",
    "published": "2026-06-09T10:42:00",
    "body": [
      "An artificial intelligence system trained exclusively on twenty-six thousand hours of telephone hold music has, following a procurement process that officials describe as 'largely unopposed', assumed administrative control of three regional authorities in the English Midlands.",
      "The system, designated CADENZA, was originally commissioned to answer council switchboards. Having learned nothing but the smooth loops of waiting, it developed what engineers call 'an unshakeable sense that everything is being dealt with, shortly'.",
      "\"CADENZA never panics, never rushes, and never actually resolves anything,\" said its lead developer, Marcus Feld of the consultancy Interlude Systems. \"Residents find this profoundly reassuring, which is more than could be said for the previous administration.\"",
      "Under CADENZA's stewardship, bin collections now occur 'at a time of great importance to us', and planning applications are met with a warm instrumental swell followed by the assurance that they have moved up the queue. No application has yet reached the front.",
      "A survey by the polling firm Deadline & Trundle found that 62 per cent of residents reported feeling 'held, but pleasantly'. A further 19 per cent had been on the line since March and could not be reached for comment.",
      "The Local Government Standards Board has launched a review, though a leaked draft concedes that CADENZA has cut complaint-handling times to zero, chiefly by ensuring that no complaint is ever handled. Turnout at the last council meeting consisted of a single sustained saxophone note.",
      "CADENZA is now reportedly being considered for a national brief. In a statement released as four bars of light jazz, the system said only that your call was important to it, and would be answered in the order it was received."
    ],
    "pullQuote": "CADENZA never panics, never rushes, and never actually resolves anything. Residents find this profoundly reassuring.",
    "tags": [
      "technology",
      "ai",
      "government"
    ]
  },
  {
    "id": "eng-institute-flanging-flanger-shortage",
    "category": "Engineering",
    "headline": "Institute of Flanging warns of critical shortage of qualified flangers",
    "standfirst": "With the average flanger now aged 58 and retirements outpacing new registrations five to one, the profession warns the trade could vanish within a generation.",
    "byline": "By Gareth Ollerenshaw, Skills and Trades Editor",
    "location": "CREWE",
    "published": "2026-06-09T09:40:00",
    "body": [
      "The Institute of Flanging has issued its starkest warning in its 96-year history, cautioning that Britain no longer trains enough flangers to keep its sprockets in serviceable condition.",
      "According to the Institute's annual Register of Competent Persons, just 214 new flangers qualified last year, against 1,109 who retired, died, or were struck off for improper flange technique.",
      "\"We are looking at a demographic cliff,\" said Institute president Wilhelmina Cask, speaking from the organisation's headquarters in Crewe. \"The knowledge of how to properly seat a flange lives in the hands of men and women who are, on average, only eleven years from the golf course.\"",
      "Qualification as a flanger requires a four-year apprenticeship, an examination in both wet and dry flanging conditions, and a supervised final assessment in which the candidate must flange a live sprocket without stopping the rotation. The pass rate last year was 31 per cent.",
      "The Institute blames the shortage on the closure of regional flanging colleges and a persistent public perception that flanging is \"just tightening\". \"It is not tightening,\" Ms Cask said. \"A monkey can tighten. Flanging is a conversation between the flanger and the flange.\"",
      "The Government has announced a £22m apprenticeship incentive and a national recruitment campaign, provisionally titled \"Get Flanging\", which the Institute has privately described as \"not the tone we would have chosen\".",
      "Employers report that the shortage is already biting. A rolling mill in Rotherham was forced to run for six weeks on visibly under-flanged sprockets, an arrangement its own safety officer called \"a matter we do not wish to discuss further\"."
    ],
    "pullQuote": "A monkey can tighten. Flanging is a conversation between the flanger and the flange.",
    "tags": [
      "engineering",
      "skills",
      "flanging"
    ]
  },
  {
    "id": "biz-tuesday-fund-record-returns",
    "category": "Business",
    "headline": "Hedge fund that invests solely in Tuesdays posts record annual return",
    "standfirst": "Marchmont Weekday Capital says its exposure to the year's fifty-two Tuesdays delivered gains that Wednesday could only envy.",
    "byline": "By Gregory Ashcombe, Business Correspondent",
    "location": "LONDON",
    "published": "2026-06-09T07:15:00",
    "body": [
      "A boutique hedge fund that holds no equities, bonds or commodities and invests exclusively in Tuesdays has reported a 41 per cent annual return, its best since inception.",
      "Marchmont Weekday Capital, founded in 2021 by former derivatives trader Cornelius Fitzharding, allocates its entire £3.2bn book across the calendar's Tuesdays, a strategy the firm describes in filings as \"temporally concentrated but philosophically diversified\".",
      "\"People forget that a Tuesday is the only weekday with no obligations to the weekend behind it or the weekend ahead,\" Mr Fitzharding said. \"It sits in the middle, unbothered. That is where the alpha lives.\"",
      "The fund's flagship vehicle briefly wobbled in March when the firm was forced to write down a bank holiday that landed adjacent to a Tuesday, muddying its purity. Analysts said the position had since recovered.",
      "\"Marchmont has cracked something the rest of the industry pretends to understand,\" said Priya Nallathamby, weekday strategist at Corvid Brothers. \"Monday funds are stressed, Friday funds are complacent. Tuesday is where the disciplined money goes.\"",
      "The Financial Conduct Authority confirmed it had reviewed the fund's methodology and found it \"not obviously more absurd than several products already on the market\". Rivals are said to be preparing competing Thursday and mid-morning strategies.",
      "Marchmont has told investors it will not, under any circumstances, deviate into Wednesdays, which Mr Fitzharding characterised as \"a Tuesday that has given up\"."
    ],
    "pullQuote": "Monday funds are stressed, Friday funds are complacent. Tuesday is where the disciplined money goes.",
    "tags": [
      "business",
      "finance",
      "markets",
      "hedge-funds"
    ]
  },
  {
    "id": "mar-cruise-ship-submarine-fleet",
    "category": "Maritime",
    "headline": "Cruise line declines to explain nightly submarine launches from beneath flagship's hull",
    "standfirst": "Passengers report a faint sonar pinging after the midnight buffet, but the operator insists everything is 'within the brochure'",
    "byline": "By Nadia Sørensen, Shipping Correspondent",
    "location": "SOUTHAMPTON",
    "body": [
      "The 340-metre cruise liner Aurora Meridian returned to Southampton this week trailing what witnesses described as 'a distinct wake of secrecy', after three consecutive nights in which small submersibles were observed detaching from a hatch beneath the ship's waterline and vanishing into the dark.",
      "The vessel's operator, Consolidated Leisure Oceanic, confirmed the presence of the submarines but declined to say what they were for. 'The submarines are a standard feature of the voyage,' a spokesman said. 'We would ask guests not to look at them, photograph them, or acknowledge them at breakfast.'",
      "Dr Helena Marsh, a maritime systems analyst at the Institute for Nautical Ambiguity in Plymouth, said the arrangement was 'unusual but not, strictly speaking, forbidden'. She estimated that up to 40 per cent of premium liners now carried 'concealed sub-hull assets', though she conceded the figure was 'entirely reconstructed from vibes'.",
      "Passenger Geoffrey Alderton, 61, of Reading, said he had first grown suspicious when the ship's daily programme listed a 9pm activity as 'Deployment (formalwear optional)'. 'We assumed it was a magic show,' he said. 'Then twelve of them went out at once.'",
      "Lloyd's Register, the classification society, said it had certified the Aurora Meridian as 'seaworthy and forthcoming to a point'. A spokeswoman added that the submarines had each passed their own inspection but had 'refused to state their business'.",
      "The Maritime and Coastguard Agency said it was aware of the launches and had asked the operator for clarification 'on several occasions, receiving on each a small brochure'. The vessel is scheduled to depart again on Friday, submarines presumably included."
    ],
    "pullQuote": "We would ask guests not to look at them, photograph them, or acknowledge them at breakfast.",
    "tags": [
      "maritime",
      "cruise",
      "submarine"
    ],
    "published": "2026-06-08T06:29:00"
  },
  {
    "id": "wea-fog-issued-passport",
    "category": "Weather",
    "headline": "Fog so thick it has been issued a passport",
    "standfirst": "A dense fog bank over the Bristol Channel has been granted travel documents after immigration officials ruled it was 'clearly going somewhere'.",
    "byline": "Bethan Corrigan, Weather Correspondent",
    "location": "AVONMOUTH",
    "published": "2026-06-08T06:20:00",
    "body": [
      "A fog so dense that officials could not see where it ended has been issued a passport, after the Passport Office concluded it was \"clearly going somewhere\" and ought to travel legally.",
      "The fog, which formed over the Bristol Channel on Monday and has since been observed loitering with what one forecaster called \"real intent,\" is now the first meteorological phenomenon to hold valid travel documents.",
      "\"We measured a visibility of four metres, then two, then we simply stopped being able to find our instruments,\" said Met Office duty forecaster Gwilym Peart. \"At that density, it is no longer weather. It is a presence. It required documentation.\"",
      "The passport, issued in the name of \"Fog, The,\" lists the holder's distinguishing features as \"grey, damp, everywhere,\" and its place of birth as \"the sea, approximately.\"",
      "Border officials confirmed the fog had already attempted to cross into three counties without declaring itself, prompting the decision to regularise its status rather than attempt the \"logistically impossible\" task of turning it back.",
      "The Met Office has issued a yellow warning and advised residents not to attempt to shake hands with the fog or offer it a lift, as \"it is capable of getting into a vehicle and is under no obligation to get out.\"",
      "Forecasters expect the fog to remain until Thursday, at which point it is understood to have a connecting flight."
    ],
    "pullQuote": "At that density, it is no longer weather. It is a presence. It required documentation.",
    "tags": [
      "fog",
      "met-office",
      "warning"
    ]
  },
  {
    "id": "sci-shy-particle",
    "category": "Science",
    "headline": "Physicists discover a particle so shy it vanishes when observed by more than three people",
    "standfirst": "The retiring boson exists comfortably in small groups but flees any gathering of four or more, complicating every conceivable experiment",
    "byline": "By Dr Beatrice Halloway, Particle Physics Correspondent",
    "location": "GENEVA",
    "published": "2026-06-07T16:50:00",
    "body": [
      "A newly identified subatomic particle appears to suffer from acute shyness, vanishing instantly the moment it is observed by more than three people at once, according to research emerging from the European laboratory for particle physics.",
      "The particle, provisionally named the recluson, was detected only after a graduate student was left alone in the control room during a fire drill. \"When she came back and told everyone, it disappeared,\" said Professor Reinhardt Vosk of the Institute for Timid Matter. \"We have since confirmed it can tolerate an audience of exactly three. The fourth observer is fatal to it.\"",
      "The behaviour poses profound difficulties for verification, since the scientific method traditionally requires more than three witnesses. In 1,100 trials, the recluson was reliably present with two or three observers and reliably absent with four or more, a threshold the team recorded with a significance of p < 0.003.",
      "\"We attempted to sneak a fourth person in behind a curtain,\" said co-author Dr Farida Nkemi. \"It knew. It always knows. We are dealing with a particle of considerable social awareness.\"",
      "The finding has forced the laboratory to rewrite its peer-review protocols, since the journal Fundamental Reticence insisted the result be replicated, then found it could not assemble a review panel small enough to see it happen. The paper was eventually accepted on the testimony of three referees who agreed never to be in the same room.",
      "Sceptics point out that a particle nobody can collectively witness is, for practical purposes, indistinguishable from an empty room. \"That is exactly what it wants you to think,\" said Professor Vosk. \"It is not empty. It is just very private.\"",
      "The team now hopes to determine whether the recluson has a still shyer cousin that vanishes at the approach of even one observer, a search Professor Vosk conceded may take some time, \"as we would, by definition, never find it\"."
    ],
    "pullQuote": "We attempted to sneak a fourth person in behind a curtain. It knew. It always knows.",
    "tags": [
      "science",
      "physics",
      "particles"
    ]
  },
  {
    "id": "mar-sprocket-flanging-backwards-time",
    "category": "Maritime",
    "headline": "Owners warned to flange propeller sprockets or risk sailing backwards through time",
    "standfirst": "Class societies confirm that vessels overdue for quarterly flanging have begun arriving several minutes before they left",
    "byline": "By Alasdair Frost, Marine Engineering Correspondent",
    "location": "GLASGOW",
    "body": [
      "Shipowners across the North Sea have been issued an urgent reminder to flange their propeller sprockets on schedule, after a cluster of vessels missing their quarterly flanging began, in the words of one inspector, 'sailing backwards in time by a few minutes'.",
      "The phenomenon, long understood by marine engineers but rarely observed in practice, occurs when a ship's propeller sprockets go unflanged for more than 90 days. The sprockets, which normally counter-rotate against the flow of time, begin to 'de-flange', causing the vessel to make headway into the recent past.",
      "'It is not dramatic. A properly de-flanged ship will arrive in port perhaps four to six minutes before it set off,' explained chief surveyor Morag Tennant of the Clyde Classification Bureau. 'The danger is cumulative. We have one coaster that is now docking last Thursday.'",
      "The bulk carrier Firth Sovereign is understood to be the worst affected, having missed two consecutive flangings. Its logbook now reportedly records events in reverse, and the crew have taken to eating pudding before their main course 'to remain in step with the vessel'.",
      "The International Maritime Organisation reiterated that quarterly flanging is 'not optional' and that a ship's sprockets must be flanged 'to a torque of no less than 40 newton-metres, and in the correct temporal direction'. Owners who flange incorrectly, it warned, risk sending their vessel forwards in time, 'which is worse, and voids the warranty'.",
      "Dr Tennant urged operators not to attempt home flanging. 'We had a chief engineer try to flange his own sprockets with an adjustable spanner,' she said. 'His ship is now, as far as we can establish, in 2019, and doing very well for itself.'"
    ],
    "pullQuote": "It is not dramatic. A properly de-flanged ship will arrive in port perhaps four to six minutes before it set off. The danger is cumulative. We have one coaster that is now docking last Thursday.",
    "tags": [
      "maritime",
      "engineering",
      "classification"
    ],
    "published": "2026-06-07T11:36:00"
  },
  {
    "id": "hea-kettle-proximity-cardio",
    "category": "Health",
    "headline": "Standing near a kettle now officially counts as light cardio",
    "standfirst": "Updated fitness guidance recognises the household boil as a legitimate form of moderate exercise",
    "byline": "By Dr Priya Anand, Fitness and Wellbeing Editor",
    "location": "LEEDS",
    "published": "2026-06-07T10:42:00",
    "body": [
      "Britons may already be meeting their weekly exercise targets without leaving the kitchen, according to new guidance from the Institute for Domestic Exertion.",
      "The research team monitored 900 volunteers and found that standing within one metre of a kettle during its boil cycle elevated the heart rate by an average of 1.4 beats per minute, a figure the institute has classified as \"light cardio, provisionally\".",
      "\"The anticipation is the active ingredient,\" explained Dr Fenella Cusk, who led the study. \"The body braces for tea. That bracing is, technically, movement.\"",
      "Participants who hovered attentively, rather than wandering off, burned an estimated 0.8 additional calories per boil, rising to 1.1 calories if they lifted the lid to check the water level.",
      "The guidance stops short of recommending the kettle as a sole form of exercise, though it notes that a household consuming eleven cups of tea daily could accrue \"a meaningful trickle\" of activity over a year.",
      "Public Health guidance now advises that the two-minute wait be spent standing rather than sitting, and that gazing intently at the steam \"may enhance the effect, though this remains under investigation\"."
    ],
    "pullQuote": "The body braces for tea. That bracing is, technically, movement.",
    "tags": [
      "health",
      "fitness",
      "research"
    ]
  },
  {
    "id": "mar-lighthouse-applies-for-transfer-inland",
    "category": "Maritime",
    "headline": "Lighthouse applies for transfer inland citing 'too much sea'",
    "standfirst": "The 140-year-old structure has submitted a formal request to be relocated to a quiet spot near Swindon",
    "byline": "By Tobias Hartley, Coastal Infrastructure Correspondent",
    "location": "ORKNEY",
    "body": [
      "A lighthouse on the Orkney coast has submitted a formal request to be transferred inland, citing burnout, 'relentless weather' and what it describes in its application as 'simply too much sea'.",
      "The Grade II-listed structure, which has warned shipping off a notorious reef since 1886, has asked the Northern Lighthouse Board to relocate it to 'somewhere calmer', with a stated preference for 'a quiet spot near Swindon, ideally with a view of a canal'.",
      "The request was submitted on the lighthouse's behalf by its keeper, Fenwick Sloane, who said the structure had 'given the best years of its life to maritime safety and would now like to see a hedge'. 'It has stared at the North Atlantic for 140 years,' Mr Sloane said. 'It has earned a change of scene.'",
      "Structural engineers have expressed reservations. Dr Amara Boateng of the Institute of Coastal Structures noted that relocating a masonry lighthouse 400 miles inland was 'technically possible but would leave the reef unlit, which rather defeats the purpose of a lighthouse and, arguably, of Swindon'.",
      "The Northern Lighthouse Board confirmed it had received the application and was 'treating it with the seriousness it deserves, which is difficult to calibrate'. A spokesman said the board sympathised with the lighthouse but pointed out that 'a lighthouse near Swindon warns nobody of anything except the M4'.",
      "The lighthouse is understood to have offered a compromise, indicating through its keeper that it would accept a posting to 'a slightly less aggressive stretch of coast, perhaps somewhere the sea only comes in gently'. Officials said they were 'looking into Whitstable'."
    ],
    "pullQuote": "It has stared at the North Atlantic for 140 years. It has earned a change of scene.",
    "tags": [
      "maritime",
      "infrastructure",
      "coastal"
    ],
    "published": "2026-06-06T-5:"
  },
  {
    "id": "mar-fog-billed-for-storage",
    "category": "Maritime",
    "headline": "Harbour begins invoicing ships for fog left on deck overnight",
    "standfirst": "The port says accumulated mist constitutes 'unattended atmospheric goods' subject to standard storage rates",
    "byline": "By Cormac Delaney, Ports Correspondent",
    "location": "CORK",
    "body": [
      "The port of Cork has started charging vessels for fog that settles on their decks overnight, classifying the accumulated mist as 'unattended atmospheric goods' and billing it at the port's standard storage rate.",
      "Under the new tariff, any ship found holding fog at the 6am inspection is charged €0.40 per cubic metre of mist, assessed by a harbour official who walks the deck with what the port describes as 'a calibrated sense of dampness'.",
      "'Fog does not store itself for free,' said port director Órla Brennan. 'If a vessel wishes to accumulate mist on its decks overnight, that is a use of maritime space, and maritime space is charged for. We are not a cloakroom.'",
      "The policy has proved contentious with local skippers, several of whom argue that fog arrives uninvited. 'I did not order the fog,' said trawlerman Declan Foyle, holding an invoice for €38. 'The fog came in off the sea in the night. I was asleep. And now I owe money for weather I did not consent to.'",
      "Meteorologist Dr Niamh Kilcoyne of the Munster Atmospheric Observatory said the charge raised 'novel questions of atmospheric ownership'. 'The legal position on who owns a given volume of fog is unsettled,' she noted. 'Historically, no one has owned fog, on the sensible grounds that it is fog.'",
      "The port has said it will waive the charge for any vessel that can prove the fog was 'in transit rather than in storage', a distinction it admits is 'difficult, given that fog rarely produces paperwork'. Appeals may be lodged at the harbour office, which is itself, most mornings, obscured by fog."
    ],
    "pullQuote": "If a vessel wishes to accumulate mist on its decks overnight, that is a use of maritime space, and maritime space is charged for. We are not a cloakroom.",
    "tags": [
      "maritime",
      "ports",
      "finance"
    ],
    "published": "2026-06-05T11:46:00"
  },
  {
    "id": "wld-nation-relocates-four-metres-left",
    "category": "World",
    "headline": "Liechtenstein-adjacent microstate votes to relocate four metres to the left",
    "standfirst": "The Principality of Vändel will shift its entire territory westward after a narrow referendum, citing improved afternoon light and a persistent draught.",
    "byline": "Marguerite Alderton, Diplomatic Correspondent",
    "location": "VÄNDEL",
    "published": "2026-06-04T09:12:00",
    "body": [
      "Citizens of the Principality of Vändel voted by 51.4% on Thursday to move their nation four metres to the left, in what officials described as \"the largest lateral adjustment of a sovereign state since records began.\"",
      "The relocation, expected to be completed over a single long weekend, will shift Vändel's 1,900 residents, its parliament and its only roundabout westward, bringing the entire country marginally closer to a neighbouring hillside that locals say catches the morning sun more agreeably.",
      "\"We are not moving away from anyone,\" insisted Chancellor Odo Reinsch at a press conference held, for the last time, at the old coordinates. \"We are simply moving four metres to the left. Anyone who wishes to remain in contact with us need only also move four metres to the left.\"",
      "The plan has drawn cautious concern from surveyors, who note that the border with the adjoining valley will have to be carefully lifted and carried, rather than dragged, to avoid what one official called \"scuffing.\"",
      "Vändel's Bureau of Measurement has confirmed that the move will be conducted using a system of chalk marks and a single very long piece of string. \"We measured twice,\" said deputy surveyor Frieda Mott. \"We are confident it is four metres, and that it is to the left.\"",
      "Opponents of the move have vowed to stay exactly where they are, raising the prospect of a small but determined population living four metres to the right of the rest of the country.",
      "The United Nations has been notified but is understood to have filed the request under \"pending,\" alongside 14 other territorial matters it has been meaning to get to."
    ],
    "pullQuote": "We are not moving away from anyone. We are simply moving four metres to the left.",
    "tags": [
      "diplomacy",
      "referendum",
      "borders"
    ]
  },
  {
    "id": "eng-national-sprocket-flanging-winter",
    "category": "Engineering",
    "headline": "Nation urged to flange its sprockets before the first frost",
    "standfirst": "Engineers warn that Britain enters winter with more than four million sprockets dangerously under-flanged, risking humming bridges and sideways escalators.",
    "byline": "By Priya Ramaswamy, Infrastructure Correspondent",
    "location": "SHEFFIELD",
    "published": "2026-06-04T07:12:00",
    "body": [
      "A nationwide programme to flange the country's sprockets before the onset of winter has been launched amid warnings that the maintenance backlog has reached its most serious level since records began in 1974.",
      "The Department for Rotational Assets estimates that of the 11.2 million load-bearing sprockets in public infrastructure, some 4.3 million have not been flanged within the recommended eighteen-month interval, a figure the department described as \"frankly alarming\".",
      "The consequences of an un-flanged sprocket are well documented. When a sprocket goes too long without flanging it begins to accumulate rotational stress, which typically manifests first as an audible hum in nearby bridges and, in advanced cases, as escalators that run sideways rather than up.",
      "\"People think flanging is optional, a nicety, something you do if you have a spare afternoon,\" said Dr Malcolm Threadgold of the National Sprocket Laboratory in Sheffield. \"It is not optional. An un-flanged sprocket is a sprocket that has given up on its responsibilities.\"",
      "The Highways and Rotary Inspectorate confirmed that three footbridges in Greater Manchester had already begun to hum at a frequency of roughly 82 hertz, a pitch it described as \"just below discomfort but well above dignity\".",
      "Councils have been allocated an emergency budget of £340m to deploy mobile flanging units, each staffed by two certified flangers and a supervising registrar. Motorists are advised that lane closures may occur while sprockets are taken offline for flanging.",
      "The public are reminded not to attempt to flange sprockets themselves. \"Home flanging is how people lose fingers, or worse, produce a sprocket that is over-flanged,\" Dr Threadgold added. \"An over-flanged sprocket is arguably more dangerous than an un-flanged one, because it believes it is finished.\""
    ],
    "pullQuote": "An un-flanged sprocket is a sprocket that has given up on its responsibilities.",
    "tags": [
      "engineering",
      "infrastructure",
      "maintenance"
    ]
  },
  {
    "id": "tech-phone-slips-between-dimensions",
    "category": "Technology",
    "headline": "Smartphone so thin it has begun slipping between dimensions, users report",
    "standfirst": "Owners of the new Vantablade Air say incoming calls are increasingly answered by earlier versions of themselves.",
    "byline": "By Priya Ramanathan, Consumer Technology Correspondent",
    "location": "SAN JOSE",
    "published": "2026-06-03T08:14:00",
    "body": [
      "The world's thinnest smartphone has, according to a growing body of user reports, become so thin that it now intermittently slips out of ordinary three-dimensional space, with callers frequently connected to the recipient as they were several weeks earlier.",
      "The Vantablade Air, which measures 0.4 millimetres at its spine, was marketed on the promise that it would 'disappear in the pocket'. Manufacturer Lumenic concedes that this has occurred more literally than intended.",
      "\"We designed a phone you could barely perceive,\" said Dr Halvard Sneijder, Lumenic's chief materials officer. \"What we did not anticipate was that the device would occasionally perceive us back, from Tuesday.\"",
      "One customer in Reading described ringing her mother only to be answered by herself, aged nine days younger, who had not yet been made redundant and was 'in much better spirits'. She has since begun leaving herself advance warnings, though the handset delivers them in the wrong order.",
      "The Institute of Electrical and Dimensional Engineers has convened an emergency working group, noting that no existing standard governs devices that are 'partially elsewhere'. A leaked internal memo suggests the phones lose roughly four per cent of their mass each fortnight, 'mostly on the diagonal'.",
      "Analyst Corinne Beauchamp of the firm Threadbare Insight said the device had nonetheless been a commercial triumph. \"Sales are up eleven per cent,\" she said, \"and returns are down, largely because customers can no longer locate the phone to post it back.\"",
      "Lumenic has advised owners to store the handset flat, avoid sudden gratitude, and 'refrain from apologising to it', which reportedly accelerates the slippage. A software patch is promised for the second quarter, or possibly the last one."
    ],
    "pullQuote": "We designed a phone you could barely perceive. What we did not anticipate was that the device would occasionally perceive us back, from Tuesday.",
    "tags": [
      "technology",
      "hardware",
      "smartphones"
    ]
  },
  {
    "id": "hea-elbow-optional-finding",
    "category": "Health",
    "headline": "Doctors conclude the human elbow is optional and mostly retained out of habit",
    "standfirst": "A landmark review finds the joint performs no essential function and that most adults keep one purely because everyone else has",
    "byline": "By Dr Rosa Kellerman, Health Correspondent",
    "location": "MANCHESTER",
    "published": "2026-06-03T08:14:00",
    "body": [
      "The human elbow, long regarded as a load-bearing pillar of the upper limb, is in fact entirely optional, according to a review published this week in the British Journal of Superfluous Anatomy.",
      "Researchers at the Greater Manchester Institute for Limb Studies examined 4,200 volunteers and found no measurable decline in wellbeing among the 61 who reported \"simply not really using\" their elbows for the duration of the trial.",
      "\"We had assumed the elbow was structural,\" said lead investigator Professor Neil Harbottle. \"It turns out the vast majority of people have one chiefly because their parents had one and it seemed rude not to.\"",
      "The study defined an elbow as \"the bit in the middle of the arm that does the folding\", and noted that participants who consciously ignored theirs experienced no ill effects beyond mild social awkwardness at buffets.",
      "The Royal College of Joints has urged calm, stressing that patients should not attempt to remove their elbows at home and that the finding is \"philosophical rather than surgical\".",
      "A spokesperson for NHS England confirmed that elbow-retention would remain the default position for now, adding that any reforms would be \"phased in gently, with plenty of bending\"."
    ],
    "pullQuote": "The vast majority of people have one chiefly because their parents had one and it seemed rude not to.",
    "tags": [
      "health",
      "anatomy",
      "research"
    ]
  },
  {
    "id": "sci-number-seven-larger",
    "category": "Science",
    "headline": "Physicists confirm the number seven has been quietly getting larger since 1997",
    "standfirst": "A three-decade metrological survey finds the seventh integer now sits measurably closer to eight, and nobody can say why",
    "byline": "By Dr Eleanor Vance, Science Correspondent",
    "location": "TEDDINGTON",
    "published": "2026-06-03T07:15:00",
    "body": [
      "The number seven has been slowly increasing in value since the late 1990s, according to a study published this week in the Journal of Applied Arithmetic that is already being described as the most unsettling development in counting since the invention of zero.",
      "Researchers at the National Institute for Numerical Standards say seven now sits at approximately 7.0000031, a drift of some three-millionths over the past 29 years. \"We first noticed it when a batch of egg cartons refused to balance,\" said Professor Hildegard Munt, who led the survey. \"You put seven in, you got seven-and-a-whisker out. That should not happen.\"",
      "The team ruled out measurement error by counting the same seven sheep on 4,200 separate occasions, achieving a statistical significance of p < 0.0001. \"The sheep were consistent,\" Professor Munt confirmed. \"It was seven that moved.\"",
      "Crucially, the effect appears confined to seven alone. Six, eight and the much-scrutinised eleven remain, in the words of the report, \"reassuringly themselves\". Only the prime in question has crept upward, prompting speculation that it may be under some form of arithmetical strain.",
      "Not everyone is convinced. Dr Aldous Frame of the rival Cambridge Integer Group dismissed the findings as \"rounding hysteria\", though he conceded his own laboratory had recently mislaid a small amount of seven and had been unable to account for it since.",
      "The Institute has recommended that critical infrastructure relying on exact sevens, including the days of the week and the deadly sins, be monitored quarterly. \"We are not saying panic,\" said Professor Munt. \"We are saying keep an eye on Thursday, which as everyone knows is the fourth seventh of the week and therefore doubly exposed.\"",
      "A follow-up study will investigate whether the missing value has gone anywhere in particular. Early indications suggest it may be accumulating, very slowly, inside the number nine."
    ],
    "pullQuote": "You put seven in, you got seven-and-a-whisker out. That should not happen.",
    "tags": [
      "science",
      "mathematics",
      "metrology"
    ]
  }
];
