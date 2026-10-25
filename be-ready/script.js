// Narration script for the 5-minute explainer. Single source of truth:
//  - the site (app.js) renders it as the transcript;
//  - tools/build-video.mjs speaks it (Piper TTS) and times the scenes from the audio.
// say = what is spoken (numbers spelled as spoken); cap = on-screen caption if different.
(function (root) {
  var S = [
    { id: "title", title: "Why be ready", lines: [
      { say: "Power cuts. Storms. Floods. A burst water main." },
      { say: "Most emergencies in Britain aren't dramatic. They are inconvenient, and they can last longer than you expect." },
      { say: "The Government's advice is simple: be ready to look after your household for three days, while help reaches those who need it most." },
      { say: "This is a plan you can finish over a few weekends. And it answers the question we really care about: can the wood burning stove keep us warm and fed?" }
    ] },
    { id: "steps", title: "How to start", lines: [
      { say: "You don't need to buy everything at once." },
      { say: "First, check your cupboards. You probably own half of it already." },
      { say: "Note what's missing, especially things your family relies on, like medicines, baby formula or pet food." },
      { say: "Then pick up an extra item or two on each shop." },
      { say: "And set a reminder every six months, to check the dates and update the kit." }
    ] },
    { id: "water", title: "Water", lines: [
      { say: "Start with water, because you can't do without it." },
      { say: "The Government's figure is three litres of drinking water per person, per day, for three days. That's eighteen litres for two people, and thirty-six for a family of four." },
      { say: "That's drinking only. For cooking, washing and a little flushing, a comfortable target is about ten litres a person a day. Add extra for babies, medical equipment and pets." },
      { say: "Store it sealed, somewhere cool and dark, and swap it out every six months." },
      { say: "If you run short, filter cloudy water through a cloth, then bring it to a rolling boil for one full minute, or use purification tablets and follow the label." },
      { say: "Rainwater from a water butt is not safe to drink. Keep it for flushing the toilet." }
    ] },
    { id: "food", title: "Food", lines: [
      { say: "Next, food. Three days of non-perishable food that needs no fridge and no cooking." },
      { say: "Think tinned meat, fish and vegetables, dried fruit and nuts. Buy what you actually eat, and don't forget a tin opener." },
      { say: "Plan on roughly two thousand calories per adult each day. Peanut butter, oats and rice are cheap, and the stove can cook them." },
      { say: "In a power cut, the fridge stays cold for about four hours with the door shut, and a full freezer for about forty-eight. Eat the fridge food first." }
    ] },
    { id: "power", title: "Power and information", lines: [
      { say: "Now power and information. The official minimum starts with a torch and spare batteries. Torches are safer than candles." },
      { say: "A battery or wind-up F M radio, with your station frequencies written down." },
      { say: "A charged power bank for your phone." },
      { say: "And some cash, because cards and cash machines may not work." },
      { say: "To report a power cut, call one oh five. Save it now. And find your load block letter at powercut one oh five dot com, because, in a national energy shortage, emergency rota cuts would last around three hours at a time.", cap: "To report a power cut, call 105. Save it now. Find your load block letter at powercut105.com: in a national energy shortage, rota cuts would last around three hours at a time." }
    ] },
    { id: "warm", title: "Warmth, health and paperwork", lines: [
      { say: "Homes cool quickly once the heating stops. Keep blankets, sleeping bags and warm clothes handy, close the doors to unused rooms, and draw the curtains." },
      { say: "Keep a first aid kit and essential medicines, and order repeat prescriptions at least five working days before you run out." },
      { say: "Keep paper copies of key documents, and the important phone numbers written down." },
      { say: "If you qualify, join the Priority Services Register. Households with a child under five can be eligible." }
    ] },
    { id: "stove", title: "The wood stove", lines: [
      { say: "Now, the wood burning stove. Can it help? Yes, if it is properly installed and swept, and you have a working carbon monoxide alarm. It needs no electricity, so it can heat a room, boil water, and, if your manual allows it, cook simple food." },
      { say: "But treat it as safety equipment. Have the chimney swept at least twice a year when you burn wood. Fit battery carbon monoxide alarms in the stove room and near the bedrooms." },
      { say: "Burn only dry wood, with a moisture content of twenty percent or less. As a rough estimate, expect to burn eight to ten kilos a day in cold weather, so for three days, store about thirty.", cap: "Burn only dry wood: 20% moisture or less. Rough estimate: 8-10 kg a day in cold weather; for three days, about 30 kg." },
      { say: "Check whether your stove is linked to radiators or hot water. If a pump needs electricity, ask your installer whether it's safe to light in a power cut." },
      { say: "If the manual allows cooking on top, use the flat top for a kettle, soup, porridge, rice and pasta. Keep children back, watch for boiling over, and fill a flask while you're at it." },
      { say: "And never bring a barbecue, camping stove or generator indoors. Carbon monoxide can't be seen or smelled. If an alarm sounds, get everyone outside and call nine nine nine." }
    ] },
    { id: "stretch", title: "The stretch list", lines: [
      { say: "When you want a bigger buffer, there's a stretch list. A week of water and food. A water filter and tablets. A large power bank or a solar panel." },
      { say: "A camping stove for cooking outdoors, an emergency toilet kit, and a grab bag by the door." },
      { say: "And get to know your neighbours. Resilience is mostly people." }
    ] },
    { id: "outro", title: "What to do tonight", lines: [
      { say: "Everything here is on the page, with a checklist that remembers your progress, a calculator for your household, and every source." },
      { say: "Start tonight. Put away three litres of water per person per day, so eighteen for two, and a torch by the bed." },
      { say: "This is an independent, unofficial summary. For the official advice, visit gov dot U K slash Be Ready.", cap: "Unofficial summary. Official advice: GOV.UK/BeReady" }
    ] }
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = S; else root.BR_SCRIPT = S;
})(typeof window !== "undefined" ? window : globalThis);
