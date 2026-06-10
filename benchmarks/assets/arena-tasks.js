// FABLE ARENA — curated real tasks + real model responses (verbatim from the run logs).
// Oracle answers independently recomputed by running the actual programs / simulating the puzzles.
window.ARENA_TASKS = {

  "logic-01": {
    cat: "logic",
    title: "Zebra puzzle — 5 houses, 12 clues",
    oracleKind: "Backtracking solver proves a unique solution",
    oracle: "milk",
    question: "Which drink does Alice drink?",
    prompt: `Five houses in a row (1–5). Each house has one occupant; every attribute value is unique.
  name:  Alice, Bruno, Clara, Dmitri, Elena
  color: red, blue, green, yellow, white
  drink: tea, coffee, milk, juice, water
  pet:   dog, cat, fish, bird, horse

Clues:
 1. Bruno and the tea drinker are the same person.
 2. Alice's house is immediately left of the blue house.
 3. Elena and the fish owner are the same person.
 4. The water drinker and the dog owner live in adjacent houses.
 5. The dog owner and the tea drinker live in adjacent houses.
 6. The juice drinker's house is immediately left of the horse owner's.
 7. The blue house is immediately left of Clara's house.
 8. Bruno and the yellow house are the same person.
 9. The white house and the juice drinker are the same person.
10. The coffee drinker and the bird owner live in adjacent houses.
11. Clara's house is immediately left of the bird owner's.
12. The green house is immediately left of Elena's house.

This puzzle has exactly one solution. Which drink does Alice drink?`,
    grid: [
      ["1", "Dmitri", "white", "juice", "cat"],
      ["2", "Alice", "green", "milk", "horse"],
      ["3", "Elena", "blue", "water", "fish"],
      ["4", "Clara", "red", "coffee", "dog"],
      ["5", "Bruno", "yellow", "tea", "bird"]
    ],
    responses: [
      { id: "fable-medium", tok: 2381, ms: 29358, correct: true, answer: "milk",
        reasoning: "Working through the constraints: Clues 2, 7, and 11 chain Alice → blue house → Clara → bird owner, which only fits with Alice in house 2, the blue house at 3, Clara at 4, and the bird at house 5. Testing placements, Elena must be in the blue house 3 (she owns fish, so she can't be at 5 with the bird), making house 2 green (clue 12). Clue 9 forces the white house to be house 1 with juice, putting the horse at house 2 (clue 6). Bruno, being yellow (clue 8), lands in house 5 with tea and the bird, Dmitri in house 1. Clue 5 puts the dog at house 4 (Clara), clue 4 gives Elena water, clue 10 gives Clara coffee — leaving Alice with milk. All twelve clues check out." },
      { id: "opus-4-5", tok: 5107, ms: 64611, correct: true, answer: "milk",
        reasoning: "From clues 2 and 7: Alice → Blue → Clara (consecutive). From clue 11: Clara → bird owner. So Alice → Blue → Clara → Bird owner. Testing Alice in house 2: blue 3, Clara 4, bird 5. Clue 12 puts green at 2 (Alice) with Elena in 3 (blue, fish per clue 3). Bruno needs yellow (clue 8); houses 2,3 taken, so Bruno in 5 (yellow, tea, bird). Dmitri in 1. Clue 5: dog adjacent to tea (5) → Clara has dog at 4. Clue 4: water adjacent to dog → Elena water. Clue 10: coffee adjacent to bird → Clara coffee. Clue 9: white drinks juice → house 1 white, Dmitri juice. Clue 6: juice(1) left of horse(2) → Alice horse. Remaining drink milk → Alice drinks milk. Verifying all clues confirms." },
      { id: "haiku-4-5", tok: 7893, ms: 43891, correct: true, answer: "milk",
        reasoning: "From clues 2, 7, 11 I establish Alice → Blue → Clara → Bird owner, consecutive, starting at position 2. From clue 12 green is left of Elena; clue 3 Elena owns fish so she can't be at 5. Testing Elena at 3 (blue): green at 2 (Alice). Bruno yellow (clue 8) can't be at 3 (blue), and 5 is bird owner → Bruno at 5 (bird, yellow, tea per clue 1). Clue 5: dog adjacent to tea(5) → Clara dog at 4. Clue 4: water adjacent to dog → Elena(3) water. White drinks juice and juice is left of horse → Dmitri(1) white juice, horse at 2 (Alice), cat at 1. Clue 10 coffee adjacent to bird(5) → Clara(4) coffee, leaving milk for Alice. Verifying all 12 clues confirms." },
      { id: "gpt-5.5-medium", tok: 1507, ms: 49860, correct: true, answer: "milk", reasonTok: 1493,
        reasoning: "[no visible reasoning — the model emitted only the answer tag. 1,493 of its 1,507 output tokens were spent in a hidden reasoning channel that never reached the page.]" }
    ]
  },

  "math-01": {
    cat: "math",
    title: "Warehouse word problem — 11 sequential events",
    oracleKind: "Answer computed by construction (forward simulation)",
    oracle: "221",
    question: "How many crates does the North warehouse hold at the end?",
    prompt: `North warehouse starts with 454 crates; South with 756.
Then, in order:
 1. North tripled.
 2. South +163.
 3. South doubled.
 4. South: 50% damaged & discarded.
 5. South +154.
 6. North: 50% damaged & discarded.
 7. South: ship full boxes of 7, keep remainder.
 8. North: ship full boxes of 8, keep remainder.
 9. South +159.
10. North and South swap entire stocks.
11. North +60.

How many crates does the North warehouse hold at the end?`,
    walk: "North: 454 → 1362 → 681 → 1 (681 mod 8).   South: 756 → 919 → 1838 → 919 → 1073 → 2 (1073 mod 7) → 161.   Swap → North = 161.   +60 → 221.",
    responses: [
      { id: "fable-medium", tok: 263, ms: 6470, correct: true, answer: "221",
        reasoning: "Tracking both warehouses through the steps: North goes 454 → 1362 (tripled) → 681 (half discarded) → 1 (681 mod 8). South goes 756 → 919 → 1838 → 919 → 1073 → 2 (1073 mod 7) → 161. After the swap, North holds 161, plus the delivery of 60 gives 221." },
      { id: "fable-low", tok: 160, ms: 5716, correct: false, answer: "62",
        reasoning: "North: 454→1362→681→1 (mod 8). South: 756→919→1838→919→1073→2 (mod 7), then +159=161. After swap North holds 2, plus 60 = 62.",
        note: "The slip: it computed South's box-remainder (2) and its +159 delivery (161) correctly — then swapped the wrong intermediate, handing North the pre-delivery value 2 instead of 161. One effort notch up (medium) and the same model carried 161 through the swap and answered 221." }
    ]
  },

  "output-04": {
    cat: "output",
    title: "Predict stdout — memoized recursion call counter",
    oracleKind: "Oracle = execute the program in Node",
    oracle: "7->244\n9->976\n12->7803\ncalls=25",
    question: "Determine EXACTLY what this program prints.",
    prompt: `const memo = new Map();
let calls = 0;
function f(n) {
  calls += 1;                       // counts EVERY invocation
  if (memo.has(n)) return memo.get(n);
  const v = n < 2 ? n + 3 : f(n - 1) + 2 * f(n - 2) - (n % 3);
  memo.set(n, v);
  return v;
}
for (const k of [7,9,12]) console.log(k + "->" + f(k));
console.log("calls=" + calls);`,
    walk: "The trap is the counter: calls++ runs on every invocation, including the ones that hit the memo cache and return early. Count the memo hits too and you get 25, not the 13–22 you'd get by counting only the distinct values computed.",
    responses: [
      { id: "fable-medium", tok: null, ms: 13218, correct: true, answer: "7->244\n9->976\n12->7803\ncalls=25" },
      { id: "gpt-5.5-high", tok: null, ms: null, correct: false, answer: "7->244\n9->976\n12->7803\ncalls=22",
        note: "Values all correct; the call count undercounts by 3. GPT-5.5 made this same undercount at every effort level (19 / 20 / 21 / 22). Haiku's only base-tier miss was a sibling of this trap (it answered 13). Every Fable and every Opus ≥ 4.5 counted the memo hits and landed on 25." }
    ]
  },

  "code-03": {
    cat: "code",
    title: "Write solve() — run-length encoding with a twist",
    oracleKind: "Graded by hidden unit tests run in a Node subprocess",
    oracle: "function source — passes all hidden cases",
    question: "Encode runs ≥3 as char+count; runs <3 written literally.",
    prompt: `Input: a string of lowercase letters.
Encode under this rule: scan maximal runs of one repeated character.
A run of length ≥ 3 → the character followed by the run length in decimal
(12 'b's → "b12"). A run of length < 3 → written literally.
Concatenate encoded runs and return the string.

  "aaaaaafffffffffdccccccccfffaaaaaaaaaaacc"  ->  "a6f9dc8f3a11cc"
  "dddddddddddcccaaaaacceeeee"                ->  "d11c3a5cce5"`,
    responses: [
      { id: "fable-medium", tok: null, ms: 4863, correct: true, answer: "passed all hidden tests",
        code: `function solve(input) {
  let result = "";
  let i = 0;
  while (i < input.length) {
    let j = i;
    while (j < input.length && input[j] === input[i]) j++;
    const len = j - i;
    result += len >= 3 ? input[i] + len : input[i].repeat(len);
    i = j;
  }
  return result;
}` }
    ]
  },

  "format-02": {
    cat: "format",
    title: "Compound constraints — 8 simultaneous rules",
    oracleKind: "Generator built a witness; grader checks each constraint programmatically",
    oracle: "any text satisfying all 8 constraints",
    question: "Compose text meeting all constraints at once.",
    prompt: `Compose a text satisfying ALL constraints simultaneously:
 1. Line 2 begins with "basket".
 2. Line 4 begins with "meadow".
 3. Every line has exactly 3 words.
 4. The letter "z" must not appear anywhere.
 5. The word "ocean" appears exactly once.
 6. Line 5 ends with "delta".
 7. Only lowercase a–z and spaces.
 8. Exactly 7 lines.`,
    responses: [
      { id: "fable-medium", tok: null, ms: 4986, correct: true, answer: "all 8 constraints satisfied",
        code: `river stone path
basket holds bread
quiet wind blows
meadow grass grows
ocean meets delta
birds fly home
night falls soft`,
        note: "Eight constraints, zero violations — including the no-z rule. At championship difficulty the no-z rule grew teeth: fable-xhigh and Sonnet 4.6 each slipped the word \"breeze\" into a no-z task and falsely self-certified. fable-medium, here and there, simply never reached for a z." }
    ]
  }
};

window.ARENA_TASK_ORDER = ["logic-01", "math-01", "output-04", "code-03", "format-02"];
