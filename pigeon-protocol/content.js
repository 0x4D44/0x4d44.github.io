/* Pigeon Protocol: words. Everything funny lives here so the engine stays honest. */
(function (root) {
  'use strict';

  var NAMES = ['Gerald', 'Brenda', 'Hamish', 'Morag', 'Kevin', 'Doris', 'Nigel', 'Senga', 'Dave', 'Agnes', 'Sir Flaps-a-Lot', 'Bernard',
    'Fiona', 'Terry', 'Moira', 'Duncan', 'Pauline', 'Colin', 'Shona', 'Archibald', 'Maureen', 'Gordon', 'Isla', 'Keith', 'Wee Barry',
    'Dolores', 'Ewan', 'Janette', 'Norman', 'Cheryl', 'Callum', 'Bev', 'Lord Coo', 'Rab', 'Edith', 'Stuart', 'Nessa', 'Alasdair', 'Trish', 'Malcolm'];
  var TRAITS = ['nervous', 'overconfident', 'easily distracted', 'a union man', 'sceptical', 'fond of chips', 'poor at maps', 'unusually pious',
    'in it for the pension', 'a bit of a show-off', 'afraid of gulls', 'asked a lot of questions', 'frankly average', 'weighed down by paperwork'];

  var OBIT_CROWD = [
    'Lost in the scrum at the Gap. Witnesses report a great deal of elbow.',
    'Crowded out. There was, at the time, a lot of bird and not a lot of Gap.',
    'Was last seen being politely shoved. The shove was not polite.',
    'Died as they lived: in a queue.',
    'Went to the Gap in good faith. The Gap had already been spoken for.',
    'Flew into a feathery argument and lost it.',
    'Squeezed out of the sky by management. We mean the other birds.',
    'Neither arrived nor complained. Mostly because of the first thing.',
    'Was told there was room. There was not.'
  ];
  var OBIT_HAWK = [
    'Took the scenic route. Did not return.',
    'Met a hawk. The hawk had a prior appointment with lunch.',
    'Taken by a hawk over the Campsies. Nothing to do with how many of you there were. Honestly.',
    'Died doing what they loved: being eaten, apparently.',
    'Intercepted. The hawk has since declined to comment.',
    'A hawk took a shine to them. It was not mutual.',
    'Encountered wildlife. The wildlife won.',
    'Lost to the elements, specifically the one with talons.',
    'Was, in the end, the weakest link in the food chain.'
  ];
  var ACKS = ['ACK... mostly.', 'ACK. (Probably.)', 'ACK. Smugly.', 'ACK, with reservations.', 'ACK. Do not ask about the journey.', 'ACK. Has a sit-down now.', 'ACK. Wants a medal.'];

  var HINTS = {
    start: 'Pick a number of birds. Nobody has told you how many the Gap can take. The Ministry considers this character-building.',
    afterLoss: 'Birds have been lost. Was that your doing? The sky declines to say.',
    afterClean: 'Everyone arrived. Suspicious. Could you send a few more next time?'
  };

  var LEVELS = {
    1: {
      doc: 'One (1) Sandwich Order, With Annotations', to: 'Mrs Agnes Pettigrew, Glasgow Central Tearooms',
      blurb: 'The Kilsyth Gap can only take so many birds at once. Nobody will tell you how many. Find out, without feeding the sky.',
      snippets: ['one cheese', 'and pickle', 'no, the other pickle', 'a smidge of mustard', 'crusts on', 'crusts off, a decision', 'two tomatoes', 'if the tomatoes are sad, cucumber', 'butter to the edges', 'cut diagonally', 'NOT diagonally', 'a pot of tea, strong'],
      events: ['Clear skies. The Ministry of Weather has nothing to report and is reporting it.', 'A pleasant breeze. Aerodynamically irrelevant, spiritually helpful.', 'A man on the Kilsyth road is waving at the birds. The birds ignore him; he means well.', 'A gull is looking at the flock. It is only looking.', 'High pressure. The pigeons feel high-pressured.', 'The Gap is, as ever, the Gap.', 'Sunshine. Please do not read anything into this.', 'Visibility excellent. Sense of foreboding: also excellent.']
    },
    2: {
      doc: 'Strongly Worded Letter to the Council (Concerning the Bins)', to: 'The Bin Department, City Chambers, Glasgow',
      blurb: 'Hawk season. Hawks take birds at random, however many you send. Not every loss is the Gap telling you off.',
      snippets: ['Dear Sir or Madam,', 'I write with some feeling', 'on the subject of the Tuesday bins', 'which were not collected', 'nor were they, on Wednesday,', 'a matter of public record', 'I have photographs', 'I have also a neighbour', 'who has thoughts', 'I shall be writing again', 'in a more strongly worded way', 'Yours faithfully, (a ratepayer)'],
      events: ['Hawk migration reported. Hawks do not read the flight plan.', 'A buzzard has been seen. Technically not a hawk. Technically also a problem.', 'Hawks are circling above Kilsyth. They have a rota.', 'The hawks are in a good mood. It is not good for anyone else.', 'A sparrowhawk is eating alone, in the Campsies, with a napkin.', 'Hawk density: undiminished. Hawk morale: very high.', 'Somewhere a falcon is clearing its throat.', 'The Raptor Liaison Officer has declined to meet.']
    },
    3: {
      doc: 'Complete Minutes of the Biscuit Committee, Item 7 (Digestives)', to: 'The Secretary, Glasgow Biscuit Society',
      blurb: 'A rival loft shares the Gap and flies by its own rules. If you both lunge, you both lose. Share, or at least sulk efficiently.',
      snippets: ['Present: seven, apologies: two', 'Item 1: the biscuits', 'Item 2: the other biscuits', 'Item 3: dunking (see Appendix B)', 'Digestive motion carried 4-3', 'Rich Tea abstained', 'AOB: someone ate the chocolate ones', 'The chair noted the crumbs', 'Action: Brian', 'Action: also Brian', 'Next meeting: biscuits', 'Meeting closed at 3.47, for tea'],
      events: ['The Bearsden Racing Pigeon Club is out in force. They have jackets.', 'The rival loft has acquired new birds. Rumours of a nutrition plan.', 'The rival flock is also trying to get through the Gap. Rude.', 'A rival bird has been seen tutting.', 'The rival loft has heard you are doing well and is thinking about it.', 'Please remember the Gap is shared. It says so on a sign nobody read.', 'The rival loft claims it was here first. It was not, but it has a banner.', 'A truce is proposed. By nobody. It is simply proposed.']
    },
    4: {
      doc: "Gran's Recipe for Tablet, Dictated Over the Phone, Corrected Twice", to: 'Cousin Ailsa, Glasgow (the nice one)',
      blurb: 'Weather moves the goalposts. The Gap will not stay the size it was. Keep testing it, gently, or fly at yesterday.',
      snippets: ['a pound of sugar', 'a tin of condensed milk', 'no, the small tin', 'a good lump of butter', 'stir. Keep stirring.', 'Do NOT stop stirring', 'you will know when it is ready', '(you will not know)', 'beat it like it owes you money', 'pour into a buttered tin', 'cut while warm', 'do not tell your dentist'],
      events: [
        'Fine out. The barometer is being coy about it.', 'A little wind getting up from the west.', 'Cloud building over the Campsies. Probably nothing.', 'The sky has gone the colour of a bruised plum.',
        'A squall has sat down on the Gap. It does not look like it is leaving.', 'The squall is still there. It has brought a flask.', 'Still blowing. Pigeons are flying with their eyes shut, which is not a technique.', 'The squall appears to be thinking about leaving.',
        'The squall has gone to bother Dundee. The sky is open.', 'Clear again. Do not assume it is the same clear.', 'The Gap feels wider. Not that anyone measured.', 'Blue sky, no squall. The pigeons are suspicious.', 'Settled. Possibly.', 'Dusk is mentioned, officially.'
      ]
    },
    5: {
      doc: 'The Entire Instruction Manual for a Kettle (Revision F)', to: 'Head Office, Glasgow (Kettle Division)',
      blurb: 'Everything at once: hawks, a rival, and weather. The Ministry would like it delivered by the deadline. The Ministry would like many things.',
      snippets: ['WARNING: contents may be hot', 'WARNING: the kettle may be hot', 'Do not immerse in water', 'it is a kettle', 'Fill to the MAX line', 'Do not fill to the MAX+ line', 'Switch on at the wall', 'Wait', 'Fig. 3: water', 'Fig. 4: more water', 'If kettle does not work, see Figure 1', 'Revision F supersedes Revision E'],
      events: ['Hawks, a rival, and weather: the Ministry describes this as a "full day".', 'The rival loft has shown up. So have the hawks. They have not coordinated.', 'A gull strike is reported. The gull is fine. The gull has an agent.', 'The sky is filling up. This is not a metaphor. Well. It is.', 'Wind noted from the north. Wind noted to be taking an interest.', 'A squall has lowered itself onto the Gap and rolled up its sleeves.', 'Squall unchanged. Hawks unchanged. Rival unchanged. You: ongoing.', 'The squall is, technically, still squalling.', 'Everyone is tired. Hawks included. Hawks are not stopping.', 'The squall has passed. The rival has noticed the extra room.', 'More room. It has not gone unnoticed.', 'Hawks resume. They were only taking a call.', 'The end is in sight. Do not look directly at it.', 'The Ministry would like a word. Afterwards.', 'Final stretch. The Ministry will be marking this.']
    },
    6: {
      doc: 'A Document of Your Choosing (the Ministry does not read these)', to: 'Whoever it is',
      blurb: 'The Open Sky. Set the Gap, the hawks and the rival to taste, then fly what you like. Nothing here is scored; everything here is educational.',
      snippets: ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed do', 'eiusmod', 'tempor', 'incididunt'],
      events: ['Free flight. The Ministry accepts no liability and has stopped trying to.', 'Conditions as set. You set them. Do not blame the sky.', 'You are, for now, the weather.']
    }
  };

  var POOL_EVENTS = ['A gull strike is reported. The gull is fine.', 'A pleasant breeze. Aerodynamically irrelevant.', 'Hawks are being hawks. It is what they are for.', 'A man with a drone has been moved on by the pigeons.', 'The sky is doing its best.', 'Today the Gap is just the Gap.'];

  var DEBRIEF = {
    win: {
      1: {
        title: 'You have invented slow start.',
        text: ['You began small and kept doubling the number of birds each flight while every bird arrived. That is slow start: it is not slow at all, it is exponential. It stops when the first birds go missing, which is the network\'s only way of telling you the Gap is full.',
          'Backing off afterwards, then creeping up one bird at a time to see what the Gap will bear, is additive increase, multiplicative decrease. It is the heart of TCP congestion control.'],
        fact: 'In October 1986 the Internet suffered a real congestion collapse: throughput on a 400-yard link between Lawrence Berkeley Lab and UC Berkeley fell from 32 kilobits a second to 40 bits a second. Van Jacobson\'s 1988 fix is what you just did with pigeons.'
      },
      2: {
        title: 'Loss is not always congestion.',
        text: ['Hawks take birds at random however many you send, so a lost bird does not prove the Gap is full. A sender that halves its flock at every missing bird, as the autopilot does, throttles itself for nothing: there is lots of room and no-one using it.',
          'Telling crowding from hawks, by watching whether losses rise with the size of the flock, is the problem real senders face on Wi-Fi, satellite and mobile links.'],
        fact: 'Classic TCP treats every loss as congestion, so on a lossy radio link it slows down for no reason. Google\'s BBR (2016) instead estimates the available bandwidth and round-trip time, and does not panic at every dropped packet.'
      },
      3: {
        title: 'You have met fairness.',
        text: ['You and the rival share one Gap. When both flocks grow, the Gap overflows and both lose birds; when both back off, space opens and both grow again. Following additive increase, multiplicative decrease, two senders drift towards equal shares without ever speaking to each other.',
          'A greedy sender can grab more of the Gap, but only by making everyone, itself included, lose more birds. That is how a single flooding sender can wreck a whole network.'],
        fact: 'Chiu and Jain showed in 1989 that additive increase with multiplicative decrease is the combination that converges to a fair share. Other combinations drift off to unfairness or oscillate forever.'
      },
      4: {
        title: 'You have been probing.',
        text: ['The Gap changed size without telling you. The only way to find out is to keep testing: add a bird, see what happens. Do that and you notice when the squall arrives (losses), and when it leaves (nothing is lost, so there is room again).',
          'This is why AIMD keeps increasing forever, even when everything is fine. The ceiling is not a fixed number you learn once; it is a moving target you keep chasing.'],
        fact: 'The name Reno comes from the 4.3BSD-Reno release (1990), named, like Tahoe before it, after a place in Nevada. Its fast recovery is the halve-and-carry-on you saw the autopilot do.'
      },
      5: {
        title: 'Everything, all at once.',
        text: ['Hawk losses, a rival flock and a moving ceiling all at the same time: slow start to find the room, backing off for crowding but not for hawks, sharing with someone else, and probing again when the weather moves. No single rule does it; the sawtooth is just what balancing them looks like.',
          'You have, with pigeons, done what every TCP connection on the planet does hundreds of times a second.'],
        fact: 'In 2001 the Bergen Linux User Group actually ran RFC 1149 over about 5 km: nine ping packets, roughly half never came back, and the round trip took the better part of an hour or more. The birds, to their credit, did not drop the protocol; they dropped the packets.'
      },
      6: {
        title: 'Free flight.',
        text: ['Nothing here is scored, so use it to ask questions. What happens if you set the hawks to 20 per cent? If the Gap is huge? If the rival is a bully? Does a different strategy than halve-and-add-one do better, and when?',
          'Every setting you can change here is a real network parameter: capacity, random loss, competing traffic.'],
        fact: 'RFC 1149, "A Standard for the Transmission of IP Datagrams on Avian Carriers", was published by David Waitzman on 1 April 1990. Its follow-up RFC 2549 (1999) added quality of service.'
      }
    },
    fail: {
      loft: {
        title: 'Congestion collapse.',
        text: ['You flew so many birds that the Gap jammed. Overshooting does not just lose the extra birds: the scrum takes out others, and every lost scroll then has to be flown again, adding still more load. More birds flown, fewer scrolls delivered. That is congestion collapse, and you caused it with enthusiasm.',
          'The cure is to treat loss as a signal. When birds go missing under load, send fewer, not more.'],
        fact: 'The Internet really did this in 1986 (32 kbit/s down to 40 bit/s) and it is why TCP has a congestion window at all.'
      },
      deadline: {
        title: 'Too timid.',
        text: ['The Gap was never the problem: you left it half empty. Not delivering is as much a failure as crowding it. Slow start exists because you must be able to find the ceiling quickly; doubling each flight gets there in a handful of rounds.',
          'If you did lose birds and flinched, remember a loss that is not caused by crowding, such as a hawk, is no reason to halve everything.'],
        fact: 'A sender that never grows its window wastes the link. This is why TCP\'s default is to keep increasing until it is told to stop.'
      }
    }
  };

  var FOOT_BERGEN = 'In 2001 the Bergen Linux User Group actually ran RFC 1149: nine pings over about five kilometres. About half were lost. The round trip took an hour or more. They deserve a medal; this is a pigeon-sized one.';

  root.PigeonContent = {
    NAMES: NAMES, TRAITS: TRAITS, OBIT_CROWD: OBIT_CROWD, OBIT_HAWK: OBIT_HAWK, ACKS: ACKS, HINTS: HINTS,
    LEVELS: LEVELS, POOL_EVENTS: POOL_EVENTS, DEBRIEF: DEBRIEF, FOOT_BERGEN: FOOT_BERGEN
  };
})(typeof self !== 'undefined' ? self : this);
