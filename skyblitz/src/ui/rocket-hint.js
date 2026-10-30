// E-02: the rocket-start rule in words, worded from the race constants (RACE.rocketWindow) so the countdown hint (hud.js) and the select-screen
// tip (select.js) cannot drift from the rule in race.js: a fresh BOOST press in the last `rocketWindow` seconds before GO is a rocket start; boost
// pressed or held earlier is a jump start (stall). Pure; no THREE, no DOM. Owner: UI agent.
import { RACE } from '../race/balance.js';

const secsText = (s) => (Math.abs(s - 0.5) < 1e-6 ? 'half second' : Math.abs(s - 1) < 1e-6 ? 'second' : String(+s.toFixed(2)) + ' s');
/** Countdown hint under the big digit (upper case, one or two lines on a phone). */
export const rocketHint = () => `TAP BOOST IN THE LAST ${secsText(RACE.rocketWindow).toUpperCase()} BEFORE GO - EARLIER STALLS YOU`;
/** Loading-screen tip, naming the boost control the player has (`device`: 'keys' keeps the word BOOST, as the countdown hint does; 'touch' and 'pad' name the on-screen button and the trigger). */
const BOOST = { keys: 'BOOST', touch: 'the BOOST button', pad: 'the right trigger' };
export const rocketTip = (device = 'keys') => `Tap ${BOOST[device] || BOOST.keys} in the last ${secsText(RACE.rocketWindow)} before GO for a rocket start. Pressing it earlier stalls you.`;
