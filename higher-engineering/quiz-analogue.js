/* Pre-flight check question bank for the Analogue electronic control deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML, in the style of a marking list), self-marked.
   Maths is written in KaTeX between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HE_QUIZ = Object.assign(window.HE_QUIZ || {}, {
    "ana-toolkit": {
      title: "The electronic toolkit",
      questions: [
        { q: R`Which of these is an <em>input</em> transducer?`, opts: [R`An LDR`, R`A lamp`, R`A motor`, R`A buzzer`], a: 0, why: R`An input transducer turns a physical quantity (here light) into an electrical one. The lamp, motor and buzzer are output transducers: they turn electrical energy into light, movement and sound.` },
        { q: R`A 10 V supply feeds $R_1 = 3.0\ \Omega$ in series with $R_2 = 6.0\ \Omega$ and $R_3 = 3.0\ \Omega$, which are in parallel with each other. What current does the supply deliver?`, opts: [R`0.91 A`, R`2.0 A`, R`1.1 A`, R`3.3 A`], a: 1, why: R`The parallel pair: $6.0 \times 3.0 / (6.0 + 3.0) = 2.0\ \Omega$. Total $= 3.0 + 2.0 = 5.0\ \Omega$, so $I = 10 / 5.0 = 2.0$ A. (3.3 A comes from ignoring the parallel pair altogether.)` },
        { q: R`A lamp of resistance $8.0\ \Omega$ is connected across a 12 V supply. What power does it dissipate?`, opts: [R`1.5 W`, R`18 W`, R`96 W`, R`12 W`], a: 1, why: R`$P = V^2/R = 12^2 / 8.0 = 18$ W. (1.5 W is the current in amps, not the power.)` },
        { q: R`An LED needs 15 mA and drops 2.0 V when it conducts. It is run from a 5.0 V supply through a series resistor. What resistor is needed?`, opts: [R`200 Ω`, R`333 Ω`, R`467 Ω`, R`20 Ω`], a: 0, why: R`The resistor takes $5.0 - 2.0 = 3.0$ V at 15 mA: $R = 3.0 / 0.015 = 200\ \Omega$. Using the whole 5.0 V gives 333 Ω; adding the LED's 2.0 V instead of subtracting it gives 467 Ω.` },
        { q: R`At a node, 5.0 A flows in. 2.0 A leaves along one wire and 1.0 A along another. What is the current in the third wire leaving the node?`, opts: [R`2.0 A`, R`3.0 A`, R`8.0 A`, R`0 A`], a: 0, why: R`Kirchhoff's first law: the currents into a node equal the currents out. $5.0 = 2.0 + 1.0 + I$, so $I = 2.0$ A.` },
        { q: R`Resistors of 2.0 kΩ and 6.0 kΩ are in series across 8.0 V. What is the voltage across the 6.0 kΩ resistor?`, opts: [R`2.0 V`, R`4.0 V`, R`6.0 V`, R`8.0 V`], a: 2, why: R`The same current flows in both, so the voltage shares in the ratio of the resistances, 2 : 6. The bigger resistor takes $\tfrac{6}{8}$ of 8.0 V $= 6.0$ V.` },
        { type: "open", q: R`A system is to sound a buzzer when the temperature of a cold store falls below a set value. Name a suitable input transducer, process stage and output transducer, and say what each one does.`, marks: 4, model: mi(
          R`•1 input transducer: a thermistor (or other temperature sensor)`,
          R`•2 it changes its resistance with temperature, so the voltage it produces (for example in a voltage divider) changes with temperature`,
          R`•3 process: a comparator (or transistor) that decides when the voltage passes the set level and amplifies the result`,
          R`•4 output transducer: a buzzer, which sounds when the process stage switches it on`) },
      ],
    },
    "ana-divider": {
      title: "Voltage dividers and sensors",
      questions: [
        { q: R`A 9.0 V supply feeds a 10 kΩ resistor (top) in series with a 20 kΩ resistor (bottom). What is the voltage across the 20 kΩ resistor?`, opts: [R`3.0 V`, R`4.5 V`, R`6.0 V`, R`9.0 V`], a: 2, why: R`$\dfrac{V_1}{V_2} = \dfrac{R_1}{R_2} = \dfrac{10}{20}$, so the lower resistor takes $\tfrac{20}{30}$ of 9.0 V $= 6.0$ V.` },
        { q: R`An LDR is the <em>lower</em> resistor of a divider and the output is taken across it. What happens to the output voltage as the light gets brighter?`, opts: [R`It rises`, R`It falls`, R`It stays the same`, R`It rises, then falls`], a: 1, why: R`Brighter light lowers the LDR's resistance, so it takes a smaller share of the supply: the voltage across it falls.` },
        { q: R`The lower resistor of a divider is 4.0 kΩ and it has 3.0 V across it. The supply is 12 V. What is the upper resistor?`, opts: [R`1.3 kΩ`, R`4.0 kΩ`, R`12 kΩ`, R`36 kΩ`], a: 2, why: R`Voltage across the upper resistor $= 12 - 3.0 = 9.0$ V. From $V_1/V_2 = R_1/R_2$: $R_1 = R_2 \times V_1/V_2 = 4.0 \times 9.0/3.0 = 12\ \text{k}\Omega$.` },
        { q: R`An NTC thermistor of 5.3 kΩ (at 40 °C) is the lower resistor, with a 3.6 kΩ fixed resistor above it, across 9.0 V. What is the voltage across the thermistor?`, opts: [R`3.64 V`, R`4.50 V`, R`5.36 V`, R`9.0 V`], a: 2, why: R`$V = 9.0 \times \dfrac{5.3}{3.6 + 5.3} = 5.36$ V. (3.64 V is what you get with the two resistors swapped.)` },
        { q: R`You want the output of an NTC thermistor divider to <em>rise</em> as the temperature rises. Where should the thermistor go?`, opts: [R`The upper position, with the output taken across the fixed resistor below it`, R`The lower position, with the output taken across it`, R`It makes no difference`, R`It cannot be done with an NTC thermistor`], a: 0, why: R`Heating lowers the NTC's resistance. In the upper position the fixed resistor below then takes a bigger share, so the output across it rises.` },
        { q: R`In a divider, 8.0 V is across a 1.0 kΩ upper resistor and a lower resistor $R$, and the output across $R$ is 2.0 V. What is $R$?`, opts: [R`333 Ω`, R`3.0 kΩ`, R`4.0 kΩ`, R`250 Ω`], a: 0, why: R`The upper resistor has $8.0 - 2.0 = 6.0$ V across it. $R = 1.0\ \text{k}\Omega \times 2.0/6.0 = 333\ \Omega$. Using 8.0 V for the top voltage gives 250 Ω, which is the usual slip.` },
        { type: "open", q: R`A 9.0 V supply feeds a fixed resistor $R$ in series with an LDR. The output is taken across the LDR. At 100 lux the LDR is 20 kΩ and the output must be 3.0 V. Calculate $R$. State what happens to the output voltage as the light gets brighter, and why.`, marks: 4, model: mi(
          R`•1 voltage across the fixed resistor $= 9.0 - 3.0 = 6.0$ V`,
          R`•2 $\dfrac{V_1}{V_2} = \dfrac{R_1}{R_2}$, so $\dfrac{6.0}{3.0} = \dfrac{R}{20}$`,
          R`•3 $R = 40\ \text{k}\Omega$ (with unit)`,
          R`•4 the output falls as it gets brighter, because the LDR's resistance falls so it takes a smaller share of the supply`) },
      ],
    },
    "ana-diode": {
      title: "Diodes, relays and protection",
      questions: [
        { q: R`When does a silicon diode conduct?`, opts: [R`When the anode is about 0.7 V or more above the cathode`, R`When the cathode is more positive than the anode`, R`Only when the voltage across it is 12 V`, R`Always, in both directions`], a: 0, why: R`A diode conducts in one direction only, once the forward voltage (about 0.7 V for silicon) is exceeded.` },
        { q: R`What is the purpose of the diode connected across a relay coil that is switched by a transistor?`, opts: [R`To make the relay work faster in both directions`, R`To protect the transistor from the voltage spike when the coil is switched off`, R`To increase the coil current`, R`To stop current flowing in the coil`], a: 1, why: R`The collapsing magnetic field of the coil would produce a large voltage spike that could destroy the transistor. The diode gives that current a safe path.` },
        { q: R`Why is a relay used to switch a large motor from a small transistor circuit?`, opts: [R`The relay amplifies the voltage`, R`The coil circuit carries the small current while the contacts switch the large current, and the two circuits are separate`, R`The relay stores energy`, R`A relay is cheaper than a transistor in every case`], a: 1, why: R`A small coil current closes contacts that can carry a much larger current on a separate supply.` },
        { q: R`How is the flyback diode connected across a relay coil?`, opts: [R`In reverse across the coil: cathode to the positive supply, anode to the transistor end`, R`In the forward direction across the coil, so it conducts whenever the coil is on`, R`In series with the transistor base`, R`Between the base and the emitter`], a: 0, why: R`It must be reverse biased while the coil is powered normally, so it does nothing then. It conducts only when the coil's voltage reverses at switch-off.` },
        { q: R`An LED drops 2.0 V and needs 10 mA from a 9.0 V supply. What series resistor is needed?`, opts: [R`200 Ω`, R`700 Ω`, R`900 Ω`, R`1100 Ω`], a: 1, why: R`$R = (9.0 - 2.0)/0.010 = 700\ \Omega$. (900 Ω ignores the LED's 2.0 V.)` },
        { q: R`A relay coil of resistance 90 Ω is on a 9.0 V supply and is switched by a transistor with $h_{FE} = 50$. What base current is needed to saturate it?`, opts: [R`0.5 mA`, R`2.0 mA`, R`5.0 mA`, R`100 mA`], a: 1, why: R`Coil current $= 9.0/90 = 100$ mA. $I_B = I_C/h_{FE} = 100/50 = 2.0$ mA.` },
        { type: "open", q: R`A relay coil is switched on and off by a transistor, with a diode across the coil. State the purpose of the diode and explain how it does this.`, marks: 3, model: mi(
          R`•1 the coil is inductive: when the transistor switches off, the collapsing magnetic field induces a large voltage (a spike) across the coil`,
          R`•2 without the diode that spike would appear at the transistor and could damage it`,
          R`•3 the diode conducts the current round through the coil, so the voltage is limited to about 0.7 V above the supply and the transistor is protected`) },
      ],
    },
    "ana-bjt": {
      title: "The bipolar junction transistor",
      questions: [
        { q: R`In switching-circuit questions, what base–emitter voltage is used for a conducting silicon transistor (as stated in the question)?`, opts: [R`0.7 V`, R`0 V`, R`5.0 V`, R`The supply voltage`], a: 0, why: R`A conducting base–emitter junction drops about 0.7 V. The question will tell you to use it, so it is not in the Booklet.` },
        { q: R`A transistor has $I_B = 0.20$ mA and $I_C = 24$ mA. What is $h_{FE}$?`, opts: [R`0.0083`, R`120`, R`4.8`, R`24`], a: 1, why: R`$h_{FE} = I_C/I_B = 24/0.20 = 120$. (It is a ratio, so it has no unit.)` },
        { q: R`$I_B = 0.50$ mA and $h_{FE} = 100$, but the load can pass at most 30 mA. What is $I_C$?`, opts: [R`50 mA`, R`30 mA`, R`5.0 mA`, R`0.50 mA`], a: 1, why: R`$h_{FE} I_B$ would give 50 mA, but the load limits the current to 30 mA, so the transistor is saturated and $I_C = 30$ mA.` },
        { q: R`The input is 5.0 V and the required base current is 0.25 mA. What base resistor is needed? (Take $V_{BE} = 0.7$ V.)`, opts: [R`17.2 kΩ`, R`20 kΩ`, R`22.8 kΩ`, R`2.8 kΩ`], a: 0, why: R`$R_B = (V_{in} - V_{BE})/I_B = (5.0 - 0.7)/0.00025 = 17.2\ \text{k}\Omega$. Forgetting the 0.7 V gives 20 kΩ.` },
        { q: R`A transistor in the active region carries 20 mA through a load of 180 Ω from a 9.0 V supply. What power does the transistor dissipate?`, opts: [R`0.18 W`, R`0.108 W`, R`0.072 W`, R`5.4 W`], a: 1, why: R`The load drops $0.020 \times 180 = 3.6$ V, so $V_{CE} = 9.0 - 3.6 = 5.4$ V and $P = V_{CE} I_C = 5.4 \times 0.020 = 0.108$ W. (0.18 W is $V_s I_C$ and 0.072 W is the load's power.)` },
        { q: R`Why is a saturated transistor a good electronic switch?`, opts: [R`It has almost no voltage across it, so it wastes almost no power`, R`It has a very high resistance`, R`It reduces the current in the load`, R`It makes the supply voltage larger`], a: 0, why: R`When saturated $V_{CE}$ is close to zero, so $P = V_{CE} I_C$ is small and the load gets almost the full supply.` },
        { type: "open", q: R`A transistor with $h_{FE} = 150$ switches a buzzer that needs 60 mA. The input voltage is 5.0 V and $V_{BE} = 0.7$ V. Calculate the largest base resistor that will saturate the transistor, and say why a smaller standard value such as 10 kΩ is acceptable.`, marks: 4, model: mi(
          R`•1 $I_B = I_C/h_{FE} = 60/150 = 0.40$ mA`,
          R`•2 voltage across $R_B$ $= 5.0 - 0.7 = 4.3$ V`,
          R`•3 $R_B = 4.3/0.00040 = 10.75\ \text{k}\Omega$ (about 10.8 kΩ), with unit`,
          R`•4 a smaller resistor gives a larger base current than the minimum, so the transistor still saturates`) },
      ],
    },
    "ana-mosfet": {
      title: "The MOSFET",
      questions: [
        { q: R`What is meant by the threshold voltage of a MOSFET?`, opts: [R`The minimum $V_{GS}$ at which the MOSFET starts to conduct`, R`The maximum drain current`, R`The supply voltage`, R`The voltage across the load`], a: 0, why: R`Below the threshold voltage no drain current flows; above it a channel forms and the drain current grows as $V_{GS}$ rises; it is only just starting to conduct at $V_{th}$.` },
        { q: R`A light sensor divider with a very high-value fixed resistor feeds a transistor that switches a solenoid. Which is an advantage of a MOSFET over a BJT here?`, opts: [R`It draws almost no gate current, so it does not load the divider`, R`It needs a larger base current`, R`It has a lower gain`, R`It cannot be used with sensors`], a: 0, why: R`The insulated gate takes virtually no current, so a high-resistance divider can drive it directly. A BJT needs a base current, which a high-value resistor cannot supply.` },
        { q: R`On a transfer curve $I_D = 0.40$ A at $V_{GS} = 3.0$ V and $I_D = 0.90$ A at $V_{GS} = 3.5$ V. What is $g_m$ over this range?`, opts: [R`1.0 S`, R`0.50 S`, R`0.80 S`, R`0.40 S`], a: 0, why: R`$g_m = \Delta I_D/\Delta V_{GS} = (0.90 - 0.40)/(3.5 - 3.0) = 1.0$ S.` },
        { q: R`Using the deck's transfer curve, what is $I_D$ when $V_{GS} = 5.0$ V?`, opts: [R`0.4 A`, R`1.6 A`, R`3.6 A`, R`6.4 A`], a: 2, why: R`The curve passes through 0.4 A at 3 V, 1.6 A at 4 V, 3.6 A at 5 V and 6.4 A at 6 V.` },
        { q: R`A MOSFET drives a solenoid of 5.0 Ω from a 10 V supply. The drain current is 1.2 A. What is $V_{DS}$?`, opts: [R`4.0 V`, R`6.0 V`, R`10 V`, R`1.2 V`], a: 0, why: R`The solenoid drops $1.2 \times 5.0 = 6.0$ V, so $V_{DS} = 10 - 6.0 = 4.0$ V.` },
        { q: R`A 12 V supply drives a 6.0 Ω solenoid and $V_{DS} = 7.2$ V. Using $I_D = 0.4(V_{GS} - 2)^2$ for the curve, what $V_{GS}$ is needed?`, opts: [R`2.4 V`, R`3.4 V`, R`4.0 V`, R`7.2 V`], a: 1, why: R`Solenoid voltage $= 12 - 7.2 = 4.8$ V, so $I_D = 4.8/6.0 = 0.80$ A. From the curve, $0.8 = 0.4(V_{GS} - 2)^2$ gives $V_{GS} = 2 + \sqrt{2} \approx 3.4$ V.` },
        { type: "open", q: R`A MOSFET switches a solenoid of resistance 6.0 Ω from a 12 V supply. When $V_{GS} = 3.0$ V the transfer curve gives $I_D = 0.40$ A. Calculate $V_{DS}$ and the power dissipated in the MOSFET.`, marks: 4, model: mi(
          R`•1 current in the solenoid is $I_D = 0.40$ A (from the curve)`,
          R`•2 voltage across the solenoid $= 0.40 \times 6.0 = 2.4$ V`,
          R`•3 $V_{DS} = 12 - 2.4 = 9.6$ V`,
          R`•4 $P = V_{DS} I_D = 9.6 \times 0.40 = 3.84$ W (about 3.8 W), with unit`) },
      ],
    },
    "ana-opamp": {
      title: "Operational amplifiers",
      questions: [
        { q: R`An inverting amplifier has $R_i = 10\ \text{k}\Omega$ and $R_f = 47\ \text{k}\Omega$. The input is $+0.50$ V. What is the output (supply ±9 V)?`, opts: [R`−2.35 V`, R`+2.35 V`, R`+2.85 V`, R`−0.11 V`], a: 0, why: R`$V_o = -\dfrac{R_f}{R_i}V_i = -4.7 \times 0.50 = -2.35$ V. It is within the rails, so no clipping.` },
        { q: R`A non-inverting amplifier has $R_i = 10\ \text{k}\Omega$ and $R_f = 22\ \text{k}\Omega$. The input is 1.5 V. What is the output?`, opts: [R`3.3 V`, R`4.8 V`, R`−3.3 V`, R`1.5 V`], a: 1, why: R`$V_o = \left(1 + \dfrac{R_f}{R_i}\right)V_i = (1 + 2.2) \times 1.5 = 4.8$ V. (3.3 V forgets the "1 +".)` },
        { q: R`A comparator has $V_i = 3.0$ V on its inverting input and $V_{ref} = 4.0$ V on its non-inverting input. What is the output?`, opts: [R`Positive saturation`, R`Negative saturation`, R`0 V exactly`, R`1.0 V`], a: 0, why: R`The Booklet rule: $V_i \lt V_{ref}$ gives a positive output, $V_i \gt V_{ref}$ a negative one.` },
        { q: R`A summing amplifier has $R_1 = R_2 = R_f = 10\ \text{k}\Omega$, with $V_1 = 1.0$ V and $V_2 = 2.0$ V. What is $V_o$?`, opts: [R`+3.0 V`, R`−3.0 V`, R`−1.5 V`, R`+1.0 V`], a: 1, why: R`$V_o = -R_f\left(\dfrac{V_1}{R_1} + \dfrac{V_2}{R_2}\right) = -10\left(\dfrac{1.0}{10} + \dfrac{2.0}{10}\right) = -3.0$ V (the kΩ cancel).` },
        { q: R`A difference amplifier has $R_i = 10\ \text{k}\Omega$ and $R_f = 30\ \text{k}\Omega$, with $V_1 = 1.0$ V and $V_2 = 2.5$ V. What is $V_o$?`, opts: [R`−4.5 V`, R`+4.5 V`, R`+1.5 V`, R`+10.5 V`], a: 1, why: R`$V_o = \dfrac{R_f}{R_i}(V_2 - V_1) = 3.0 \times (2.5 - 1.0) = +4.5$ V.` },
        { q: R`An inverting amplifier has a gain of −10 and a ±9 V supply. The input is +2.0 V. What is the output?`, opts: [R`−20 V`, R`−9 V (saturated)`, R`+9 V`, R`−2.0 V`], a: 1, why: R`The formula asks for $-20$ V, but the output cannot go beyond the supply: it saturates at about −9 V.` },
        { type: "open", q: R`Design a non-inverting amplifier with a gain of 6.0, using $R_i = 10\ \text{k}\Omega$ and a ±12 V supply. Calculate $R_f$, and the output for an input of 1.5 V. State whether the amplifier clips.`, marks: 5, model: mi(
          R`•1 gain $= 1 + R_f/R_i$ (Booklet form)`,
          R`•2 $1 + R_f/R_i = 6.0$ so $R_f/R_i = 5.0$`,
          R`•3 $R_f = 50\ \text{k}\Omega$ (with unit)`,
          R`•4 $V_o = 6.0 \times 1.5 = 9.0$ V`,
          R`•5 this is inside the ±12 V rails, so it does not clip`) },
      ],
    },
    "ana-system": {
      title: "Putting the systems together",
      questions: [
        { q: R`A divider has 10 kΩ on top and 20 kΩ below, across 9.0 V, giving $V_{ref}$ at the junction. What is $V_{ref}$?`, opts: [R`3.0 V`, R`4.5 V`, R`6.0 V`, R`9.0 V`], a: 2, why: R`$V_{ref} = 9.0 \times \dfrac{20}{10 + 20} = 6.0$ V.` },
        { q: R`An NTC thermistor is the lower resistor of a divider, whose output $V_i$ goes to the inverting input of a comparator. The temperature rises. What does the comparator output do once $V_i$ falls below $V_{ref}$?`, opts: [R`Saturates positive`, R`Saturates negative`, R`Falls to exactly 0 V`, R`Stays as it was`], a: 0, why: R`Heating lowers the thermistor's resistance, so $V_i$ falls. With $V_i \lt V_{ref}$ the output goes positive (Booklet rule).` },
        { q: R`A comparator outputs 9.0 V. It drives a transistor ($h_{FE} = 90$) through $R_B$, and the transistor must pass 45 mA through a relay coil. What is the largest $R_B$? (Take $V_{BE} = 0.7$ V.)`, opts: [R`16.6 kΩ`, R`18 kΩ`, R`1.66 kΩ`, R`100 kΩ`], a: 0, why: R`$I_B = 45/90 = 0.50$ mA, and $R_B = (9.0 - 0.7)/0.00050 = 16.6\ \text{k}\Omega$. The 18 kΩ answer forgets the 0.7 V.` },
        { q: R`Which is the best sentence in a "describe how it works" answer?`, opts: [R`The signal changes and the lamp comes on.`, R`As it gets darker, the LDR's resistance increases, so the voltage across it rises; when this reaches 0.7 V a base current flows, the transistor turns on and the lamp lights.`, R`The LDR does its job in the circuit.`, R`It is a transistor circuit.`], a: 1, why: R`The strong answer names each quantity, says which way it changes, names the threshold, and ends with the physical result.` },
        { q: R`Why should you not round intermediate answers in a long calculation?`, opts: [R`The final answer can then be wrong, so round only at the end`, R`Rounding is never allowed in Higher`, R`It makes the units wrong`, R`Calculators cannot round`], a: 0, why: R`The 2024 course report notes that rounding intermediate answers made some candidates' final answers incorrect. Carry the full value and round at the end.` },
        { q: R`A divider using a very large fixed resistor (237 kΩ) can supply only a few tens of microamps. What is a sensible way to switch a bulb from it?`, opts: [R`Add a second transistor, or use a MOSFET, so almost no input current is needed`, R`Use a smaller supply voltage`, R`Use a bigger bulb`, R`Take the transistor out`], a: 0, why: R`Two transistors connected as a pair (the first feeds the base of the second) multiply the gain, and a MOSFET needs almost no gate current, so either can switch a bulb from the tiny current of a high-value divider.` },
        { type: "open", q: R`Two probes in the bilge form the lower part of a divider with a fixed resistor above them. The divider output goes to a comparator, which drives a transistor and a buzzer. Describe how the system operates when water reaches the probes.`, marks: 4, model: mi(
          R`•1 water bridges the probes, so their resistance falls`,
          R`•2 so the divider output $V_i$ falls below $V_{ref}$`,
          R`•3 so the comparator output saturates positive`,
          R`•4 a base current flows through the base resistor, the transistor switches on, and the collector current makes the buzzer sound`) },
      ],
    },
  });
})();
