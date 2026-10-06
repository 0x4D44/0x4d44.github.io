/* Pigeon Protocol: words. Everything funny lives here so the engine stays honest. */
(function (root) {
  'use strict';

  var NAMES = ['Gerald', 'Brenda', 'Hamish', 'Morag', 'Kevin', 'Doris', 'Nigel', 'Senga', 'Dave', 'Agnes', 'Sir Flaps-a-Lot', 'Bernard',
    'Fiona', 'Terry', 'Moira', 'Duncan', 'Pauline', 'Colin', 'Shona', 'Archibald', 'Maureen', 'Gordon', 'Isla', 'Keith', 'Wee Barry',
    'Dolores', 'Ewan', 'Janette', 'Norman', 'Cheryl', 'Callum', 'Bev', 'Lord Coo', 'Rab', 'Edith', 'Stuart', 'Nessa', 'Alasdair', 'Trish', 'Malcolm'];
  var TRAITS = ['nervous', 'overconfident', 'easily distracted', 'a union man', 'sceptical', 'fond of chips', 'poor at maps', 'unusually pious',
    'in it for the pension', 'a bit of a show-off', 'afraid of gulls', 'asked a lot of questions', 'frankly average', 'weighed down by paperwork',
    'allergic to Tuesdays', 'a committee member', 'self-taught', 'recently promoted', 'fond of a sit-down', 'terrible at goodbyes'];

  // Cause-neutral on purpose: a real sender only knows that a packet did not come back.
  var OBITS = [
    'Took the scenic route. Did not return.',
    'Last seen heading south-ish. Did not return.',
    'Departed in good spirits. Did not return.',
    'Did not return. The Ministry has opened a file and then lost it.',
    'Was reported missing at the Gap. Reports are not detailed.',
    'Set off with a scroll and a sense of purpose. Neither has been seen since.',
    'Went to Glasgow. Possibly. Nobody has written to say.',
    'Known to colleagues as reliable. Known to the sky as a snack, or a scrum, or a squall. Unclear.',
    'Died as they lived: in transit.',
    'Failed to ACK. The reasons are between the bird and the weather.',
    'Neither arrived nor complained.',
    'Absent at roll call. The scroll is being reissued.',
    'Left a note, since lost. Presumed to say goodbye.',
    'Has been replaced by a younger bird, who is already nervous.',
    'Reportedly seen waving. Cause unknown. Direction unknown.',
    'Is survived by a scroll, which is being flown again.'
  ];
  var ACKS_LOW = ['ACK. Barely. Send flowers.', 'ACK. One survivor, and it is not talking.', 'ACK. Against the odds, and the Ministry.', 'ACK. The others are, officially, "delayed".'];
  var ACKS_HIGH = ['ACK. Smugly.', 'ACK. Wants a medal.', 'ACK. Has a sit-down now.', 'ACK. Textbook. The Ministry is suspicious.'];
  var ACKS_MID = ['ACK... mostly.', 'ACK. (Probably.)', 'ACK, with reservations.', 'ACK. Do not ask about the journey.'];
  var ACKS = ['ACK... mostly.', 'ACK. (Probably.)', 'ACK. Smugly.', 'ACK, with reservations.', 'ACK. Do not ask about the journey.', 'ACK. Has a sit-down now.', 'ACK. Wants a medal.'];

  var HINTS = {
    start: 'Pick a number of birds. The Gap\'s limit is not posted anywhere; you will have to work it out from what arrives. The Ministry considers this character-building.',
    afterLoss: 'Birds have been lost. Was that your doing? The sky declines to say.',
    afterClean: 'Everyone arrived. Suspicious. Could you send a few more next time?',
    tinyLoss: 'Only a handful went up and some still did not come back. Losses at a small flock do not prove the Gap is full, but they do not prove it is empty either.',
    repeatLoss: 'Losses at a flock size that was fine before. Either the Gap has shrunk or something else is helping itself.',
    hawkish: ['A few birds missing at a size that has flown clean before. Not every absence is the Gap\u2019s doing.', 'The sky has other tenants. A small loss is not always a verdict.', 'One or two missing, at a flock that has done better. The Ministry declines to speculate, loudly.'],
    noScale: ['Losses have not been growing with the flock. The Ministry notes this and declines to say what it means.', 'Small flock, small loss; bigger flock, hardly more. Worth a second look at who is taking them.'],
    firstSmall: 'A small share of the flock missing. Next time, compare it with a different flock size before you decide who to blame.',
    bigLoss: 'More than a quarter of the flock lost this round. Worth asking whether the flock was too big, or the sky was.'
  };
  var REACT = {
    clean: ['The Ministry notes that everybody came home. It has no form for this.', 'All present. The pigeons look suspicious of their own luck.', 'A clean flight. Somebody should tell the sky.', 'Not a feather out of place. The Ministry is uneasy.', 'Everyone home for tea. A rare and slightly worrying event.', 'The loft is full and the clipboard is empty. Splendid.'],
    some: ['Losses duly noted and filed under Weather.', 'The Ministry has sent a form. The form is for the birds.', 'A few missing. The Ministry asks that you do not take it personally. The pigeons have.', 'Some did not return. The Ministry blames the sky, as is traditional.', 'Missing birds have been written up in a memo nobody will read.', 'A handful short. The kettle has been put on, out of respect.'],
    heavy: ['The Ministry is sending flowers. To the loft. In bulk.', 'Heavy losses. A moment of silence is scheduled. It will be brief; there is paperwork.', 'The Roll of Honour has been asked to move over.', 'That was a lot of birds. The Ministry is rewriting the rota in pencil.', 'Mass absence noted. The loft is quieter, and not in a restful way.', 'The sky has taken a big bite. The Ministry is considering a strongly worded memo.'],
    same: ['The flock size has not changed. The Ministry admires consistency and has questions.', 'Same again, then. Bold. Or tired.', 'No change to the flock. The Ministry assumes this is a plan.', 'Steady as she goes. The pigeons are choosing not to comment.', 'The same number again. The Ministry respects a routine.', 'Unchanged. A decision, technically, to not decide.'],
    grow: ['The loft is getting crowded with ambition.', 'More birds, more hope. The Ministry has noted both.', 'The flock grows. So does the paperwork.', 'Bigger flock. The perches are filling and the pigeons are being brave about it.', 'Up you go, then. The Ministry will watch with interest and a clipboard.', 'More birds aloft. Somewhere, a gull has noticed.'],
    shrink: ['Fewer birds this time. The loft has exhaled.', 'A cautious flock. The Ministry respects caution, in moderation.', 'Smaller flock. The surviving pigeons look relieved and slightly smug.', 'Backing off. The Ministry calls this prudence; the pigeons call it lunch break.', 'A thinner flock. The perches look spacious and a bit lonely.', 'Fewer birds. A decision the Ministry will judge when it sees the numbers.']
  };
  var CLEAN_STREAK = ['Smooth. The Gap may have more to give, or this may be exactly right. Only birds can tell you.', 'Still smooth. The Ministry is starting to enjoy this.', 'Another clean one. The pigeons are getting ideas.', 'Everyone home again. The sky may be bigger than your nerve.', 'Still no losses. Nothing wrong with caution, but caution does not deliver scrolls.', 'A very long run of everybody coming home. Somebody should check the Gap is still there.'];
  var WINS = {
    1: 'Mrs Pettigrew: "Cheese AND pickle. The right pickle. I shall tell the others."',
    2: 'The Bin Department: "We have received your letter. We have also received forty others. Yours was the strongest worded."',
    3: 'The Secretary: "Minutes received. Motion carried. Digestives to be dunked in perpetuity."',
    4: 'Cousin Ailsa: "Stirred the whole way. Set perfectly. Do not tell Gran about the second correction."',
    5: 'Head Office: "Kettle manual received in full. Nobody will read it. Revision F is delighted."',
    6: 'Whoever it is: "Thank you. I think. What was it?"'
  };
  var WINS2 = {
    1: 'Mrs Pettigrew: "It all arrived. The pickle is a bit forward. I shall manage."',
    2: 'The Bin Department: "Your letter has been received and filed under Bins. We will be in touch. We will not."',
    3: 'The Secretary: "Minutes received. A little late, a little battered. Motion carried regardless."',
    4: 'Cousin Ailsa: "Tablet recipe received. Slightly overstirred. Gran will know."',
    5: 'Head Office: "Kettle manual received. We have noted that you had a hard day."'
  };
  var WIN_LESSER = 'The recipient is satisfied, in the way people are when a thing has merely turned up.';
  var LEVELS = {
    1: {
      doc: 'One (1) Sandwich Order, With Annotations', to: 'Mrs Agnes Pettigrew, Glasgow Central Tearooms',
      blurb: 'The Kilsyth Gap can only take so many birds at once. Nobody will tell you how many, and it is not the same size every time you ask. Find out, without feeding the sky.',
      snippets: ['one cheese', 'and pickle', 'no, the other pickle', 'a smidge of mustard', 'crusts on', 'crusts off, a decision', 'two tomatoes', 'if the tomatoes are sad, cucumber', 'butter to the edges', 'cut diagonally', 'NOT diagonally', 'a pot of tea, strong'],
      events: ['Clear skies. The Ministry of Weather has nothing to report and is reporting it.', 'A pleasant breeze. Aerodynamically irrelevant, spiritually helpful.', 'A man on the Kilsyth road is waving at the birds. The birds ignore him; he means well.', 'A gull is looking at the flock. It is only looking.', 'High pressure. The pigeons feel high-pressured.', 'The Gap is, as ever, the Gap.', 'Sunshine. Please do not read anything into this.', 'Visibility excellent. Sense of foreboding: also excellent.']
    },
    2: {
      doc: 'Strongly Worded Letter to the Council (Concerning the Bins)', to: 'The Bin Department, City Chambers, Glasgow',
      blurb: 'Hawk season. The Ministry would like it noted that hawks have been reported and that the Ministry has not done anything about it. The Gap is, as ever, subject to change without notice.',
      snippets: ['Dear Sir or Madam,', 'I write with some feeling', 'on the subject of the Tuesday bins', 'which were not collected', 'nor were they, on Wednesday,', 'a matter of public record', 'I have photographs', 'I have also a neighbour', 'who has thoughts', 'I shall be writing again', 'in a more strongly worded way', 'Yours faithfully, (a ratepayer)'],
      events: ['Hawks reported over Kilsyth. The Ministry has noted this in a memo and left it there.',
        'A coach party of starlings is booked on the Gap from tomorrow. They are not in a hurry.',
        'The starlings have arrived. They have sat down on the Gap and are not budging.',
        'Starlings still in residence. They have brought sandwiches.',
        'The starlings are discussing, loudly, whether to leave.',
        'The starlings have gone. The Gap is yours again, for what that is worth.',
        'A buzzard has been seen. Technically not a hawk. Technically also a problem.',
        'The hawks are in a good mood. It is not good for anyone else.',
        'A sparrowhawk is eating alone in the Campsies, with a napkin.',
        'Hawk density: undiminished. Hawk morale: very high.',
        'Somewhere a falcon is clearing its throat.',
        'The Raptor Liaison Officer has declined to meet.',
        'A gull strike is reported. The gull is fine. The gull has an agent.',
        'Hawks resume. They were only taking a call.',
        'The Gap is open and the sky is not. Carry on.',
        'The Ministry would like you to know it is still watching.',
        'Final stretch. The hawks have noticed.',
        'The deadline is tonight. The hawks are not aware of deadlines.']
    },
    3: {
      doc: 'Complete Minutes of the Biscuit Committee, Item 7 (Digestives)', to: 'The Secretary, Glasgow Biscuit Society',
      blurb: 'The Bearsden Racing Pigeon Club has booked the Gap for its own flights, on and off. It backs off if it loses birds. It stops backing off if you keep squeezing it. Share, or at least sulk efficiently.',
      snippets: ['Present: seven, apologies: two', 'Item 1: the biscuits', 'Item 2: the other biscuits', 'Item 3: dunking (see Appendix B)', 'Digestive motion carried 4-3', 'Rich Tea abstained', 'AOB: someone ate the chocolate ones', 'The chair noted the crumbs', 'Action: Brian', 'Action: also Brian', 'Next meeting: biscuits', 'Meeting closed at 3.47, for tea'],
      events: ['Clear. The Bearsden Racing Pigeon Club is rumoured to be in the area. They have jackets.',
        'The Bearsden Club has arrived and is also trying to get through the Gap. Rude.',
        'Mist settles on the Gap. Visibility is, in the Ministry\'s words, \'a bit much\'.',
        'The mist is still there. The Bearsden Club is still there. Everyone is very polite and very squashed.',
        'A rival bird has been seen tutting.',
        'The Bearsden Club claims it was here first. It was not, but it has a banner.',
        'The mist is thinking about it. So is the Bearsden Club.',
        'Still misty. Still jostling. The Ministry is writing a leaflet.',
        'The mist lifts, a little late for some.',
        'The Bearsden Club has gone home for its tea. The Gap is quiet.',
        'The Gap is quiet. Do not assume it will stay that way.',
        'A pleasant breeze. Aerodynamically irrelevant.',
        'The Bearsden Club has been seen in the car park. Possibly planning something. Possibly sandwiches.',
        'Settled. As far as anybody can tell.',
        'The Ministry would like a word. Afterwards.',
        'The end is in sight. Do not look directly at it.',
        'Final stretch.',
        'The Ministry will be marking this.']
    },
    4: {
      doc: "Gran's Recipe for Tablet, Dictated Over the Phone, Corrected Twice", to: 'Cousin Ailsa, Glasgow (the nice one)',
      blurb: 'Weather moves the goalposts. The Gap will not stay the size it was. Keep testing it, gently, or fly at yesterday.',
      snippets: ['a pound of sugar', 'a tin of condensed milk', 'no, the small tin', 'a good lump of butter', 'stir. Keep stirring.', 'Do NOT stop stirring', 'you will know when it is ready', '(you will not know)', 'beat it like it owes you money', 'pour into a buttered tin', 'cut while warm', 'do not tell your dentist'],
      events: ['Fine out. The barometer is being coy about it.',
        'Cloud building over the Campsies. Probably nothing.',
        'A squall has sat down on the Gap. It does not look like it is leaving.',
        'The squall is still there. It has brought a flask.',
        'Still blowing. Pigeons are flying with their eyes shut, which is not a technique.',
        'The squall appears to be thinking about leaving.',
        'Squall still present. Mood: smug.',
        'The squall has gone to bother Dundee. The sky is open.',
        'Clear again. Do not assume it is the same clear.',
        'The Gap feels wider. Not that anybody measured.',
        'Blue sky, no squall. The pigeons are suspicious.',
        'Settled. Possibly.',
        'Dusk is mentioned, officially.',
        'The Ministry would like this finished before it gets dark.']
    },
    5: {
      doc: 'The Entire Instruction Manual for a Kettle (Revision F)', to: 'Head Office, Glasgow (Kettle Division)',
      blurb: 'Everything at once: hawks, a rival, and weather. The Ministry would like it delivered by the deadline. The Ministry would like many things.',
      snippets: ['WARNING: contents may be hot', 'WARNING: the kettle may be hot', 'Do not immerse in water', 'it is a kettle', 'Fill to the MAX line', 'Do not fill to the MAX+ line', 'Switch on at the wall', 'Wait', 'Fig. 3: water', 'Fig. 4: more water', 'If kettle does not work, see Figure 1', 'Revision F supersedes Revision E'],
      events: ['Hawks, a rival, and weather: the Ministry describes this as a \'full day\'.',
        'The Bearsden Club has turned up. So have the hawks. They have not coordinated.',
        'A squall has lowered itself onto the Gap and rolled up its sleeves.',
        'Squall unchanged. Hawks unchanged. Rival unchanged. You: ongoing.',
        'A gull strike is reported. The gull is fine. The gull has an agent.',
        'The squall is, technically, still squalling.',
        'The squall has passed. The Gap feels bigger. It is not alone.',
        'More room. It has not gone unnoticed.',
        'Hawks resume. They were only taking a call.',
        'The Bearsden Club has gone home. The Gap is a lot emptier than it was.',
        'Everyone is tired. Hawks included. Hawks are not stopping.',
        'The sky is yours. Briefly. In the way a bus lane is yours.',
        'The end is in sight. Do not look directly at it.',
        'The Ministry would like a word. Afterwards.',
        'Final stretch. The Ministry will be marking this.',
        'Nothing to report, and the Ministry is reporting it.',
        'Almost there. The hawks have seen the finish too.',
        'Last flight, probably. Do not tempt it.']
    },
    6: {
      doc: 'A Document of Your Choosing (the Ministry does not read these)', to: 'Whoever it is',
      blurb: 'The Open Sky. Set the Gap, the hawks and the rival to taste, then fly what you like. Nothing here is scored; everything here is educational.',
      snippets: ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed do', 'eiusmod', 'tempor', 'incididunt'],
      events: ['Free flight. The Ministry accepts no liability and has stopped trying to.', 'Conditions as set. You set them. Do not blame the sky.', 'You are, for now, the weather.']
    }
  };

  // Weather bulletins for levels 2-5 are built from the sky that was actually flown (its jittered schedule),
  // so a bulletin is true of the round it describes: shifts[k] is filed when segment k+1 of the schedule begins.
  var WEATHER = {
    2: { shifts: ['A coach party of starlings has settled on the Gap. They are not in a hurry.', 'The starlings have gone. The Gap is open again, for what that is worth.', 'Fog has come down on the Gap. Visibility: poetic.', 'The fog has lifted, suddenly and rudely.'],
         dip: ['The starlings are still there. They have brought sandwiches.', 'Fog still down. The hawks, who can see in it, are delighted.', 'Still crowded. Still foggy. The Ministry is considering a leaflet.', 'Visibility remains a matter of opinion.'],
         clear: ['Hawks reported over Kilsyth. The Ministry has noted this in a memo and left it there.', 'A buzzard has been seen. Technically not a hawk. Technically also a problem.', 'The hawks are in a good mood. It is not good for anyone else.', 'A gull strike is reported. The gull is fine. The gull has an agent.', 'Hawk density: undiminished. Hawk morale: very high.', 'Somewhere a falcon is clearing its throat.'] },
    3: { shifts: ['Mist settles on the Gap. Visibility is, in the Ministry\'s words, \'a bit much\'.', 'The mist lifts, a little late for some.', 'Mist again. It has brought friends.', 'The second mist has gone, taking its dignity with it.'],
         dip: ['The mist is still there. Everyone is very polite and very squashed.', 'Still misty. Still jostling. The Ministry is writing a leaflet.', 'The mist is thinking about it. So is everyone else.', 'A rival bird has been seen tutting, in the mist.'],
         clear: ['Clear. The Gap is, as ever, the Gap.', 'A pleasant breeze. Aerodynamically irrelevant.', 'Settled. As far as anybody can tell.', 'The Ministry would like a word. Afterwards.', 'Nothing to report, and the Ministry is reporting it.', 'Visibility excellent. Sense of foreboding: also excellent.'],
         rivalIn: 'The Bearsden Racing Pigeon Club has arrived and is also trying to get through the Gap. They have jackets.', rivalOut: 'The Bearsden Club has gone home for its tea.' },
    4: { shifts: ['A squall has sat down on the Gap. It does not look like it is leaving.', 'The squall has gone to bother Dundee. The sky is open.', 'Cloud again over the Campsies. A second squall has arrived, unannounced.', 'The second squall has passed. It did not say goodbye.'],
         dip: ['The squall is still there. It has brought a flask.', 'Still blowing. Pigeons are flying with their eyes shut, which is not a technique.', 'Squall still present. Mood: smug.', 'The squall appears to be thinking about leaving. It is not.'],
         clear: ['Fine out. The barometer is being coy about it.', 'Clear again. Do not assume it is the same clear.', 'The Gap feels wider. Not that anybody measured.', 'Blue sky, no squall. The pigeons are suspicious.', 'Settled. Possibly.', 'Dusk is mentioned, officially.'] },
    5: { shifts: ['The wind has got up. The Gap feels narrower and the pigeons have noticed.', 'The wind has dropped. The sky is bigger than it was.', 'A squall has lowered itself onto the Gap and rolled up its sleeves.', 'The squall has passed. Everything is suddenly possible.'],
         dip: ['Squall unchanged. Hawks unchanged. Rival unchanged. You: ongoing.', 'The squall is, technically, still squalling.', 'Everyone is tired. Hawks included. Hawks are not stopping.', 'The Ministry would like this done by tea.'],
         clear: ['Hawks, a rival and weather: the Ministry describes this as a full day.', 'A gull strike is reported. The gull is fine. The gull has an agent.', 'Hawks resume. They were only taking a call.', 'The end is in sight. Do not look directly at it.', 'Nothing to report, and the Ministry is reporting it.', 'The Ministry will be marking this.'],
         rivalIn: 'The Bearsden Club has turned up. So have the hawks. They have not coordinated.', rivalOut: 'The Bearsden Club has gone home. The Gap is a lot emptier than it was.' }
  };

  var POOL_EVENTS = ['A gull strike is reported. The gull is fine.', 'A pleasant breeze. Aerodynamically irrelevant.', 'Hawks are being hawks. It is what they are for.', 'A man with a drone has been moved on by the pigeons.', 'The sky is doing its best.', 'Today the Gap is just the Gap.', 'A seagull has been seen reading the Ministry circular. It looked unimpressed.', 'A walker on the Pentlands has waved at a pigeon. The pigeon has not waved back.', 'The Gap has been measured again. It declined to be measured.', 'A kestrel hovers politely, then less politely.', 'Somewhere a tea urn has boiled over. This is not connected, but it is being minuted.', 'A cloud shaped like a pigeon has been reported. The pigeons are not flattered.', 'Wind: sideways. Morale: also sideways.', 'The Ministry has lost a pen. All flights are asked to look out for it.', 'A heron stands in the Gap and says nothing, which is worse.', 'A crow has applied to join the flock. Application under review.', 'Rain, briefly, then a rumour of rain.', 'The lighthouse at Cramond reports that it is not involved.', 'A sparrow has asked what all the fuss is about. It has been given a leaflet.', 'The M8 is busy. So, for once, is the sky.'];

  var FACTS = {
    1: 'In October 1986 the Internet suffered a real congestion collapse: throughput on a 400-yard link between Lawrence Berkeley Lab and UC Berkeley fell from 32 kilobits a second to 40 bits a second, largely because senders kept retransmitting data that was still in flight. Van Jacobson\'s 1988 fix was slow start plus additive increase and multiplicative decrease.',
    2: 'Classic TCP treats every loss as congestion, so on a lossy radio link it slows down for no reason. Google\'s BBR, published in 2016, instead estimates the available bandwidth and round-trip time, and does not panic at every dropped packet.',
    3: 'Chiu and Jain showed in 1989 that, of the simple increase and decrease rules, additive increase with multiplicative decrease is the one that converges towards a fair share between competing senders. A sender that ignores loss, like a flooding UDP stream, takes more than its share, which is why "TCP-friendly" is a phrase in standards documents. The rival here is simpler and more stubborn than a real TCP flow.',
    4: 'The name Reno comes from the 4.3BSD-Reno release (1990). It followed 4.3BSD-Tahoe (1988); the two were named after Lake Tahoe and the city of Reno, in the Sierra Nevada region. Reno\'s congestion response, halve the window on loss and then grow it by one a round, is the multiplicative decrease that the Hire a Reno autopilot imitates. (Fast retransmit arrived with Tahoe and fast recovery with Reno; this autopilot does neither. It simply halves on loss and otherwise adds one a round.)',
    5: 'RFC 1149 specifies that the datagram is printed, on a small scroll of paper, in hexadecimal, and notes that the maximum packet size is variable and, paradoxically, tends to increase with the weight of the bird.',
    6: 'RFC 1149, "A Standard for the Transmission of IP Datagrams on Avian Carriers", was published by David Waitzman on 1 April 1990. Its follow-up RFC 2549 (1999) added quality of service.'
  };

  var FOOT_BERGEN = 'In April 2001 the Bergen Linux User Group actually ran RFC 1149: nine pigeons carrying ping packets over a few kilometres. Four came back, roughly 55 per cent were lost, and the average round trip was over an hour. They deserve a medal; this paragraph is the pigeon-sized one.';

  root.PigeonContent = {
    NAMES: NAMES, TRAITS: TRAITS, OBITS: OBITS, ACKS: ACKS, ACKS_LOW: ACKS_LOW, ACKS_MID: ACKS_MID, ACKS_HIGH: ACKS_HIGH, HINTS: HINTS, REACT: REACT, CLEAN_STREAK: CLEAN_STREAK, WINS: WINS, WINS2: WINS2, WIN_LESSER: WIN_LESSER,
    LEVELS: LEVELS, WEATHER: WEATHER, POOL_EVENTS: POOL_EVENTS, FACTS: FACTS, FOOT_BERGEN: FOOT_BERGEN
  };
})(typeof self !== 'undefined' ? self : this);
