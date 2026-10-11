"""Narration for the six Blocks, Wings & Broadsides explainer videos.

Each line is (voice, spoken text, caption text). The spoken text spells out
numbers and symbols so the TTS reads them naturally; the caption shows them
the way a pupil would write them.

Voices (Piper, rhasspy/piper-voices):
  A = Flight Lieutenant Alba Murray  -> en_GB-alba-medium (Scottish English, female)
  H = Captain Hamish Blackwood       -> en_GB-alan-medium (Scottish English, male)
"""

VIDEOS = {
    "twos-complement": {
        "title": "The minus-128 lamp",
        "scenes": [
            ("title", [
                ("A", "Welcome aboard, cadets. Today, how a computer stores negative numbers, using nothing but eight red stone lamps.",
                      "Welcome aboard, cadets. Today: how a computer stores negative numbers, using nothing but eight redstone lamps."),
            ]),
            ("positive", [
                ("A", "At National Five, every lamp had a positive place value. One hundred and twenty eight, sixty four, thirty two, and so on, down to one.",
                      "At National 5, every lamp had a positive place value: 128, 64, 32 … down to 1."),
                ("A", "Light the right lamps, add up their values, and you have your number. Here, thirty two, plus eight, plus four, plus one, is forty five.",
                      "Light the right lamps and add their values: 32 + 8 + 4 + 1 = 45."),
            ]),
            ("negative", [
                ("H", "But there's no such thing as a negative lamp, Lieutenant!",
                      "But there's no such thing as a negative lamp, Lieutenant!"),
                ("A", "Then we make one, Captain. In two's complement, the leftmost lamp is worth minus one hundred and twenty eight. Every other lamp stays positive.",
                      "Then we make one, Captain. In two's complement, the leftmost lamp is worth −128. Every other lamp stays positive."),
            ]),
            ("readneg", [
                ("A", "So, one one zero one, zero zero one one, means minus one hundred and twenty eight, plus sixty four, plus sixteen, plus two, plus one.",
                      "So 1101 0011 means −128 + 64 + 16 + 2 + 1 …"),
                ("A", "That makes minus forty five. If the leftmost lamp is lit, the number is negative.",
                      "… = −45. If the leftmost lamp is lit, the number is negative."),
            ]),
            ("flip", [
                ("A", "To turn minus forty five into binary, use flip and add one.",
                      "To turn −45 into binary, use flip and add one."),
                ("A", "First, write positive forty five. Zero zero one zero, one one zero one.",
                      "First write +45:  0010 1101"),
                ("A", "Next, flip every bit. Every zero becomes a one, and every one becomes a zero.",
                      "Flip every bit:  1101 0010"),
                ("A", "Finally, add one. That gives one one zero one, zero zero one one. Check it with the place values, and it works.",
                      "Add 1:  1101 0011. Check with the place values: it works."),
            ]),
            ("range", [
                ("H", "And how far can eight lamps count?",
                      "And how far can eight lamps count?"),
                ("A", "From minus one hundred and twenty eight, with only the leftmost lamp lit, up to one hundred and twenty seven, with every lamp lit except that one.",
                      "From −128 (only the leftmost lamp lit) up to 127 (every lamp except that one)."),
                ("A", "For n bits, the range is minus two to the power n minus one, up to two to the power n minus one, take away one.",
                      "For n bits: −2ⁿ⁻¹ to 2ⁿ⁻¹ − 1."),
            ]),
            ("outro", [
                ("A", "Leftmost lamp negative. Flip and add one. Always check your answer. Dismissed!",
                      "Leftmost lamp negative. Flip and add one. Always check your answer. Dismissed!"),
            ]),
        ],
    },
    "floating-point": {
        "title": "The hopping point",
        "scenes": [
            ("title", [
                ("A", "Two's complement only stores whole numbers. But a navigator needs fractions, like a latitude of fifty six point one eight seven five degrees. For real numbers, computers use floating point.",
                      "Two's complement only stores whole numbers. A navigator needs fractions, like latitude 56.1875°. For real numbers, computers use floating point."),
            ]),
            ("denary", [
                ("A", "Here's the idea in denary. Move the point to the front of the number, and count the hops.",
                      "The idea in denary: move the point to the front, and count the hops."),
                ("A", "Five hops to the left. So thirty four thousand and six point eight is zero point three four zero zero six eight, times ten to the power five.",
                      "Five hops to the left: 34 006.8 = 0.340068 × 10⁵"),
            ]),
            ("binary", [
                ("A", "Computers do exactly the same, in binary. Sixty six point six two five is one zero zero zero zero one zero, point, one zero one.",
                      "Computers do the same in binary: 66.625 = 1000010.101"),
                ("A", "Hop the point left until it sits just before the first one. That takes seven hops, so the exponent is seven.",
                      "Hop the point left until it sits just before the first 1. Seven hops, so the exponent is 7."),
            ]),
            ("fields", [
                ("A", "Now store three parts. First, the sign bit. Zero for positive, one for negative.",
                      "Store three parts. First, the sign bit: 0 for positive, 1 for negative."),
                ("A", "The mantissa. The digits after the point, padded with zeros to fifteen bits.",
                      "The mantissa: the digits after the point, padded with zeros to 15 bits."),
                ("A", "And the exponent. Seven, stored in eight bit two's complement.",
                      "And the exponent: 7, stored in 8-bit two's complement."),
            ]),
            ("small", [
                ("H", "And what about a tiny number, Lieutenant?",
                      "And what about a tiny number, Lieutenant?"),
                ("A", "Then the point hops to the right, and the exponent is negative. Zero point zero zero one zero one zero one needs two hops right. Minus two, in two's complement, is one one one one, one one one zero.",
                      "Then the point hops right and the exponent is negative. 0.0010101 needs two hops right: −2 = 1111 1110."),
            ]),
            ("tradeoff", [
                ("A", "The total number of bits is fixed. Give more bits to the mantissa, and you gain precision. More significant digits.",
                      "The total number of bits is fixed. More bits for the mantissa: more precision."),
                ("A", "Give more bits to the exponent, and you gain range. Bigger and smaller numbers. But you can't have both.",
                      "More bits for the exponent: more range. You can't have both."),
            ]),
            ("outro", [
                ("A", "Mantissa means precision. Exponent means range. Use those exact words in the exam.",
                      "Mantissa → precision. Exponent → range. Use those exact words in the exam."),
            ]),
        ],
    },
    "fetch-execute": {
        "title": "Beat to quarters",
        "scenes": [
            ("title", [
                ("H", "Beat to quarters! Every gun crew aboard this ship follows the same drill, over and over again. So does every processor.",
                      "Beat to quarters! Every gun crew aboard follows the same drill, over and over. So does every processor."),
            ]),
            ("parts", [
                ("A", "Here's the processor, and here's main memory, holding the program's instructions. They're joined by three buses. The address bus, the data bus, and the control bus.",
                      "The processor and main memory, joined by three buses: the address bus, the data bus and the control bus."),
            ]),
            ("step1", [
                ("A", "Step one. The processor sets up the address bus with the address of the instruction it needs.",
                      "Step 1: the processor sets up the address bus with the address of the instruction."),
                ("H", "Locker zero four!",
                      "Locker 04!"),
            ]),
            ("step2", [
                ("A", "Step two. The processor activates the read line on the control bus, so memory knows to send the contents.",
                      "Step 2: the processor activates the read line on the control bus."),
            ]),
            ("step3", [
                ("A", "Step three. The instruction travels back along the data bus, and is stored in the instruction register. The program counter steps on to zero five, ready for the next locker. Like a powder monkey running a cartridge up from the magazine.",
                      "Step 3: the instruction travels along the data bus into the instruction register, and the program counter steps on to 05."),
            ]),
            ("step4", [
                ("A", "Step four. The instruction is decoded, and then executed.",
                      "Step 4: the instruction is decoded and executed."),
                ("H", "Fire!",
                      "Fire!"),
            ]),
            ("perf", [
                ("A", "To speed up the drill, add more cores. More gun crews firing at the same time.",
                      "To speed up the drill: more cores, more crews firing at once."),
                ("A", "Make the data bus wider, so more bits travel on each trip. Add more cache memory, like a rack of ready cartridges beside the gun, so there are fewer slow trips down to main memory.",
                      "A wider data bus: more bits per trip. More cache: fewer slow trips to main memory."),
                ("A", "Or raise the clock speed. A faster drumbeat means more cycles every second.",
                      "A higher clock speed: a faster drumbeat, more cycles per second."),
            ]),
            ("outro", [
                ("H", "Address bus. Read line. Data bus. Decode and execute. Learn it like your drill, cadets.",
                      "Address bus. Read line. Data bus. Decode and execute. Learn it like your drill, cadets."),
            ]),
        ],
    },
    "encryption": {
        "title": "Seals and commissions",
        "scenes": [
            ("title", [
                ("A", "Orders sent by sea could be captured by the enemy. Data sent over the internet can be intercepted. Encryption keeps it safe.",
                      "Orders sent by sea could be captured. Data sent over the internet can be intercepted. Encryption keeps it safe."),
            ]),
            ("pair", [
                ("A", "Public key encryption gives everyone a matched pair of keys. The public key is shared with the whole world. The private key never leaves its owner.",
                      "Public key encryption gives everyone a matched pair of keys. The public key is shared with the world. The private key never leaves its owner."),
                ("A", "Whatever one key locks, only the other key in the pair can unlock.",
                      "Whatever one key locks, only the other key in the pair can unlock."),
            ]),
            ("secret", [
                ("A", "To send the Captain a secret, I lock it with the Captain's public key.",
                      "To send the Captain a secret, I lock it with the Captain's public key."),
                ("A", "A spy can intercept it, and he has the public key too. But the public key can't unlock what it locked. Only the Captain's private key can.",
                      "A spy can intercept it, but the public key can't unlock it. Only the Captain's private key can."),
            ]),
            ("signature", [
                ("H", "But how do I know an order truly came from you, Lieutenant?",
                      "But how do I know an order truly came from you, Lieutenant?"),
                ("A", "With a digital signature. I sign using my private key, like pressing my seal into the wax. You check it with my public key.",
                      "With a digital signature. I sign with my private key, like a wax seal. You check it with my public key."),
                ("A", "If anyone alters the message, the seal no longer matches. So a signature proves who sent it, and that it hasn't been changed.",
                      "If anyone alters the message, the seal won't match. A signature proves who sent it, and that it's unchanged."),
            ]),
            ("certificate", [
                ("A", "But how do you know a public key really belongs to its owner? With a digital certificate.",
                      "How do you know a public key really belongs to its owner? A digital certificate."),
                ("A", "A trusted certificate authority signs it, just as the Admiralty signs a captain's commission. Your browser checks the certificate before it shows the padlock.",
                      "A trusted certificate authority signs it, as the Admiralty signs a captain's commission. Your browser checks it before showing the padlock."),
            ]),
            ("outro", [
                ("A", "So. Encrypt with their public key. Sign with your private key. And trust a public key only when its certificate checks out.",
                      "Encrypt with their public key. Sign with your private key. Trust a public key only when its certificate checks out."),
            ]),
        ],
    },
    "sql-group-by": {
        "title": "Muster by squadron",
        "scenes": [
            ("title", [
                ("H", "Muster the cadets! I want a head count for every squadron.",
                      "Muster the cadets! I want a headcount for every squadron."),
            ]),
            ("table", [
                ("A", "Here's the Cadet table. Twelve rows, one for each cadet. Count star would count every row, and give twelve. But the Captain wants one count for each squadron.",
                      "The Cadet table: 12 rows. COUNT(*) alone gives 12. The Captain wants one count for each squadron."),
            ]),
            ("group", [
                ("A", "Group by squadron number gathers together the rows that share the same squadron number. Four squadrons, so four groups.",
                      "GROUP BY squadronNo gathers rows with the same squadron number. Four squadrons, four groups."),
            ]),
            ("collapse", [
                ("A", "The aggregate function now runs once for each group. Every group collapses into a single row, with its own count.",
                      "The aggregate runs once per group. Each group collapses into one row with its count."),
            ]),
            ("order", [
                ("A", "Add an alias, for a readable heading. Then order by count, ascending, to put the smallest squadron first.",
                      "Add an alias for a readable heading, then ORDER BY COUNT(*) ASC for the smallest first."),
                ("A", "And remember, group by always comes before order by.",
                      "Remember: GROUP BY always comes before ORDER BY."),
            ]),
            ("traps", [
                ("H", "Any traps for the unwary, Lieutenant?",
                      "Any traps for the unwary, Lieutenant?"),
                ("A", "Two. An aggregate function can't be used inside a where clause. Work out the value in one query, and use it in a second.",
                      "Two. An aggregate can't go in a WHERE clause: work it out in one query and use it in a second."),
                ("A", "And never mix a plain field with an aggregate, unless you group by that field.",
                      "And never mix a plain field with an aggregate unless you GROUP BY that field."),
            ]),
            ("outro", [
                ("A", "Group, then aggregate, then order. Dismissed!",
                      "Group, then aggregate, then order. Dismissed!"),
            ]),
        ],
    },
    "css-float": {
        "title": "The runaway footer",
        "scenes": [
            ("title", [
                ("A", "Today, a layout mystery. The page looked perfect in the wireframe. So why did the footer run away?",
                      "Today, a layout mystery. The page looked perfect in the wireframe. So why did the footer run away?"),
            ]),
            ("box", [
                ("A", "Every element is a box. Padding is space inside the border, pushing the content in. Margin is space outside the border, pushing other elements away.",
                      "Every element is a box. Padding is space inside the border. Margin is space outside it."),
                ("A", "And both are added to each side. Two boxes side by side, each with a ten pixel margin, leave a gap of twenty pixels between them.",
                      "Both are added to each side: two boxes with 10px margins leave a 20px gap between them."),
            ]),
            ("fit", [
                ("A", "Four images sit in a section eight hundred pixels wide. Each is one hundred and eighty six pixels wide, with a two pixel border and a five pixel margin. That's exactly two hundred pixels each, and eight hundred in total.",
                      "Four images in an 800px section: 186 + 2×2 border + 2×5 margin = 200px each, 800px in total."),
                ("A", "Now raise the margin to ten pixels. Each image needs two hundred and ten pixels, so four need eight hundred and forty. The last image drops onto a new line, and the page no longer matches its wireframe.",
                      "Raise the margin to 10px: 210px each, 840px for four. The last image drops to a new line, so the page no longer matches its wireframe."),
            ]),
            ("float", [
                ("A", "Float left pushes an element to the left of its container, and the content that follows wraps around it.",
                      "float:left pushes an element to the left, and the content after it wraps around it."),
            ]),
            ("runaway", [
                ("H", "Lieutenant, the footer has run up beside the images!",
                      "Lieutenant, the footer has run up beside the images!"),
                ("A", "Floats keep affecting everything that comes after them. Clear both makes the footer start below every floated element.",
                      "Floats affect everything after them. clear:both makes the footer start below every float."),
            ]),
            ("outro", [
                ("A", "Count both sides of the box. Float to line things up. Clear both to start again below.",
                      "Count both sides of the box. Float to line things up. clear:both to start again below."),
            ]),
        ],
    },
}
