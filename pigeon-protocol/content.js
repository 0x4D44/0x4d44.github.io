/* Pigeon Protocol: words. Everything funny lives here so the engine stays honest. */
(function (root) {
  'use strict';

  var NAMES = ['Gerald', 'Brenda', 'Hamish', 'Morag', 'Kevin', 'Doris', 'Nigel', 'Senga', 'Dave', 'Agnes', 'Sir Flaps-a-Lot', 'Bernard',
    'Fiona', 'Terry', 'Moira', 'Duncan', 'Pauline', 'Colin', 'Shona', 'Archibald', 'Maureen', 'Gordon', 'Isla', 'Keith', 'Wee Barry',
    'Dolores', 'Ewan', 'Janette', 'Norman', 'Cheryl', 'Callum', 'Bev', 'Lord Coo', 'Rab', 'Edith', 'Stuart', 'Nessa', 'Alasdair', 'Trish', 'Malcolm'];
  var TRAITS = ['nervous', 'overconfident', 'easily distracted', 'a union man', 'sceptical', 'fond of chips', 'poor at maps', 'unusually pious',
    'in it for the pension', 'a bit of a show-off', 'afraid of gulls', 'asked a lot of questions', 'frankly average', 'weighed down by paperwork'];

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
    'Absent at roll call. The scroll is being reissued.'
  ];
  var ACKS = ['ACK... mostly.', 'ACK. (Probably.)', 'ACK. Smugly.', 'ACK, with reservations.', 'ACK. Do not ask about the journey.', 'ACK. Has a sit-down now.', 'ACK. Wants a medal.'];

  var HINTS = {
    start: 'Pick a number of birds. The Gap\'s limit is not posted anywhere; you will have to work it out from what arrives. The Ministry considers this character-building.',
    afterLoss: 'Birds have been lost. Was that your doing? The sky declines to say.',
    afterClean: 'Everyone arrived. Suspicious. Could you send a few more next time?',
    tinyLoss: 'Only a handful went up, and something still went wrong. A Gap this empty is unlikely to be crowded. Something else is about.',
    repeatLoss: 'Losses at a flock size that was fine before. Either the Gap has shrunk or something else is helping itself.',
    bigLoss: 'More than a quarter of the flock lost. That is not a stray. That is a pattern.'
  };
  var REACT = {
    clean: ['The Ministry notes that everybody came home. It has no form for this.', 'All present. The pigeons look suspicious of their own luck.', 'A clean flight. Somebody should tell the sky.'],
    some: ['Losses duly noted and filed under Weather.', 'The Ministry has sent a form. The form is for the birds.', 'A few missing. The Ministry asks that you do not take it personally. The pigeons have.'],
    heavy: ['The Ministry is sending flowers. To the loft. In bulk.', 'Heavy losses. A moment of silence is scheduled. It will be brief; there is paperwork.', 'The Roll of Honour has been asked to move over.'],
    same: ['The flock size has not changed. The Ministry admires consistency and has questions.', 'Same again, then. Bold. Or tired.'],
    grow: ['The loft is getting crowded with ambition.', 'More birds, more hope. The Ministry has noted both.'],
    shrink: ['Fewer birds this time. The loft has exhaled.', 'A cautious flock. The Ministry respects caution, in moderation.']
  };
  var WINS = {
    1: 'Mrs Pettigrew: "Cheese AND pickle. The right pickle. I shall tell the others."',
    2: 'The Bin Department: "We have received your letter. We have also received forty others. Yours was the strongest worded."',
    3: 'The Secretary: "Minutes received. Motion carried. Digestives to be dunked in perpetuity."',
    4: 'Cousin Ailsa: "Stirred the whole way. Set perfectly. Do not tell Gran about the second correction."',
    5: 'Head Office: "Kettle manual received in full. Nobody will read it. Revision F is delighted."',
    6: 'Whoever it is: "Thank you. I think. What was it?"'
  };
  var WIN_LESSER = 'The recipient is satisfied, in the way people are when a thing has merely turned up.';

  var LEVELS = {
    1: {
      doc: 'One (1) Sandwich Order, With Annotations', to: 'Mrs Agnes Pettigrew, Glasgow Central Tearooms',
      blurb: 'The Kilsyth Gap can only take so many birds at once. Nobody will tell you how many. Find out, without feeding the sky.',
      snippets: ['one cheese', 'and pickle', 'no, the other pickle', 'a smidge of mustard', 'crusts on', 'crusts off, a decision', 'two tomatoes', 'if the tomatoes are sad, cucumber', 'butter to the edges', 'cut diagonally', 'NOT diagonally', 'a pot of tea, strong'],
      events: ['Clear skies. The Ministry of Weather has nothing to report and is reporting it.', 'A pleasant breeze. Aerodynamically irrelevant, spiritually helpful.', 'A man on the Kilsyth road is waving at the birds. The birds ignore him; he means well.', 'A gull is looking at the flock. It is only looking.', 'High pressure. The pigeons feel high-pressured.', 'The Gap is, as ever, the Gap.', 'Sunshine. Please do not read anything into this.', 'Visibility excellent. Sense of foreboding: also excellent.']
    },
    2: {
      doc: 'Strongly Worded Letter to the Council (Concerning the Bins)', to: 'The Bin Department, City Chambers, Glasgow',
      blurb: 'Hawk season. The Ministry would like it noted that hawks have been reported and that the Ministry has not done anything about it. Also, a coach party of starlings has taken the Gap for the weekend: its size is not what it was.',
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

  var POOL_EVENTS = ['A gull strike is reported. The gull is fine.', 'A pleasant breeze. Aerodynamically irrelevant.', 'Hawks are being hawks. It is what they are for.', 'A man with a drone has been moved on by the pigeons.', 'The sky is doing its best.', 'Today the Gap is just the Gap.'];

  var FACTS = {
    1: 'In October 1986 the Internet suffered a real congestion collapse: throughput on a 400-yard link between Lawrence Berkeley Lab and UC Berkeley fell from 32 kilobits a second to 40 bits a second. Van Jacobson\'s 1988 fix, slow start plus additive increase and multiplicative decrease, is what this level is about.',
    2: 'Classic TCP treats every loss as congestion, so on a lossy radio link it slows down for no reason. Google\'s BBR, published in 2016, instead estimates the available bandwidth and round-trip time, and does not panic at every dropped packet.',
    3: 'Chiu and Jain showed in 1989 that additive increase with multiplicative decrease is the combination that converges towards a fair share. A sender that ignores loss, like a flooding UDP stream, takes more than its share. That is why "TCP-friendly" is a phrase people put in standards documents.',
    4: 'The name Reno comes from the 4.3BSD-Reno release (1990). Like 4.3BSD-Tahoe before it, it was named after Lake Tahoe and Reno, Nevada. Its fast recovery is the halve-and-carry-on you saw the autopilot do.',
    5: 'In 2001 the Bergen Linux User Group actually ran RFC 1149: nine pigeons each carried one ping packet over a few kilometres, only four of the nine came back (roughly 55 per cent lost), and the average round trip was over an hour.',
    6: 'RFC 1149, "A Standard for the Transmission of IP Datagrams on Avian Carriers", was published by David Waitzman on 1 April 1990. Its follow-up RFC 2549 (1999) added quality of service.'
  };

  var FOOT_BERGEN = 'In April 2001 the Bergen Linux User Group actually ran RFC 1149: nine pigeons carrying ping packets over a few kilometres. Four came back, roughly 55 per cent were lost, and the average round trip was over an hour. They deserve a medal; this paragraph is the pigeon-sized one.';

  root.PigeonContent = {
    NAMES: NAMES, TRAITS: TRAITS, OBITS: OBITS, ACKS: ACKS, HINTS: HINTS, REACT: REACT, WINS: WINS, WIN_LESSER: WIN_LESSER,
    LEVELS: LEVELS, POOL_EVENTS: POOL_EVENTS, FACTS: FACTS, FOOT_BERGEN: FOOT_BERGEN
  };
})(typeof self !== 'undefined' ? self : this);
