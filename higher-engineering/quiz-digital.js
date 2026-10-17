/* Pre-flight check question bank for the Digital & programmable control deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked.
   Maths is written in KaTeX between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HE_QUIZ = Object.assign(window.HE_QUIZ || {}, {
    "dig-gates": {
      title: "Logic gates and truth tables",
      questions: [
        { q: R`Which gate gives an output of 1 only when its two inputs are <em>different</em>?`, opts: [R`OR`, R`NOR`, R`EOR`, R`NAND`], a: 2, why: R`The exclusive OR is 1 when exactly one input is 1. An ordinary OR also gives 1 when both are 1.` },
        { q: R`A four-input NOR gate has all four inputs at 0. What is its output?`, opts: [R`0`, R`1`, R`It depends on the supply`, R`It cannot be known`], a: 1, why: R`A NOR is an OR followed by a NOT. OR of four zeros is 0, and the NOT makes it 1. A NOR is 1 only when every input is 0.` },
        { q: R`How many rows does the truth table of a circuit with four inputs have?`, opts: [R`4`, R`8`, R`16`, R`32`], a: 2, why: R`With $n$ inputs there are $2^n$ rows, and $2^4 = 16$.` },
        { q: R`A redstone torch on a block is lit when the block has no power and goes out when the block is powered. Which gate does it match?`, opts: [R`AND`, R`NOT`, R`OR`, R`EOR`], a: 1, why: R`The output is always the opposite of the input, which is a NOT gate.` },
        { q: R`Why is a digital signal better than an analogue one when there is electrical noise on the wire?`, opts: [R`Digital signals use less power`, R`The receiver only has to decide which of two levels it is, so small noise does not change the message`, R`Digital signals have no voltage`, R`Noise cannot reach a digital wire`], a: 1, why: R`A noisy 0 is still nearer 0 than 1, so the receiver recovers the exact value. An analogue receiver cannot tell noise from signal.` },
        { type: "open", q: R`Complete the truth table for a three-input NAND gate, and state in words when its output is 0.`, marks: 3, model: mi(
          R`Eight rows in binary order, 000 to 111. <strong>[1]</strong>`,
          R`$Q = 1$ for the first seven rows (000 to 110) and $Q = 0$ for 111 only. <strong>[1]</strong>`,
          R`In words: the output is 0 only when all three inputs are 1 (otherwise it is 1). <strong>[1]</strong>`) },
      ],
    },
    "dig-bool": {
      title: "Specification, table, expression and diagram",
      questions: [
        { q: R`Using sum of products, which AND term is switched on only by the row $A=1, B=0, C=1$?`, opts: [R`$A \cdot B \cdot C$`, R`$A \cdot \overline{B} \cdot C$`, R`$\overline{A} \cdot B \cdot \overline{C}$`, R`$A + \overline{B} + C$`], a: 1, why: R`Use the input as it is where the row has a 1, and the barred input where it has a 0: $A$, $\overline{B}$, $C$, ANDed together.` },
        { q: R`A lamp must light when switch $A$ is on or switch $B$ is on, but not when both are on. Which expression is that?`, opts: [R`$A + B$`, R`$A \cdot B$`, R`$A \oplus B$`, R`$\overline{A + B}$`], a: 2, why: R`"One or the other but not both" is the exclusive OR, $A \oplus B$.` },
        { q: R`For $Q = A \cdot \overline{B} + C$, what is $Q$ when $A=1$, $B=1$, $C=0$?`, opts: [R`0`, R`1`, R`Undefined`, R`Depends on the order`], a: 0, why: R`$A \cdot \overline{B} = 1 \cdot 0 = 0$ and $C = 0$, so $Q = 0 + 0 = 0$.` },
        { q: R`Which expression describes a NOR gate?`, opts: [R`$\overline{A \cdot B}$`, R`$\overline{A} + \overline{B}$`, R`$\overline{A + B}$`, R`$A \oplus B$`], a: 2, why: R`A NOR is an OR with the whole result inverted: a bar over $A + B$.` },
        { q: R`How many rows give $Q = 1$ for $Q = A \cdot (B + C) \cdot \overline{D}$ (inputs in order $A, B, C, D$)?`, opts: [R`1`, R`3`, R`4`, R`8`], a: 1, why: R`Need $A = 1$, $D = 0$ and at least one of $B$, $C$: that is 1010, 1100 and 1110, three rows.` },
        { type: "open", q: R`A buzzer $Q$ sounds when the door switch $A$ is open (1) and the keypad signal $B$ has not been entered (0), or when the tamper switch $C$ is pressed (1). Write the Boolean expression and list the input rows for which $Q = 1$.`, marks: 4, model: mi(
          R`$Q = A \cdot \overline{B} + C$. <strong>[2]</strong>`,
          R`$A \cdot \overline{B}$ is 1 for rows 100 and 101. $C = 1$ for rows 001, 011, 101 and 111. <strong>[1]</strong>`,
          R`So $Q = 1$ for 001, 011, 100, 101 and 111 (five rows). <strong>[1]</strong>`) },
      ],
    },
    "dig-nand": {
      title: "NAND equivalents and counting ICs",
      questions: [
        { q: R`How do you make a NOT gate from a 2-input NAND gate?`, opts: [R`Leave one input unconnected`, R`Join the two inputs together`, R`Connect one input to 0 V and one to the supply`, R`It cannot be done`], a: 1, why: R`With $A$ on both inputs, $\overline{A \cdot A} = \overline{A}$.` },
        { q: R`How many 2-input NAND gates are needed to make a 2-input OR gate?`, opts: [R`1`, R`2`, R`3`, R`4`], a: 2, why: R`Invert each input with a tied NAND (two gates), then NAND the results (third gate): $\overline{\overline{A} \cdot \overline{B}} = A + B$.` },
        { q: R`A design needs 9 two-input NAND gates. How many 7400 ICs (quad 2-input NAND) are needed?`, opts: [R`2`, R`3`, R`4`, R`9`], a: 1, why: R`Each 7400 holds four gates. $9 \div 4 = 2.25$, and chips are bought whole, so round up to 3.` },
        { q: R`What does a 7410 contain?`, opts: [R`Four 2-input NAND gates`, R`Three 3-input NAND gates`, R`Two 4-input NAND gates`, R`Six NOT gates`], a: 1, why: R`7400: quad 2-input; 7410: triple 3-input; 7420: dual 4-input. Always check the data sheet in the question.` },
        { q: R`What is the double-inversion trick?`, opts: [R`Using two supplies`, R`Removing a pair of NOT gates that sit directly in series, because they cancel`, R`Doubling every gate to be safe`, R`Inverting the output twice at the end`], a: 1, why: R`A NOT of a NOT is the original signal, so a series pair can be deleted, which saves gates.` },
        { type: "open", q: R`After conversion to NAND equivalents a circuit needs five 2-input NAND gates and one 4-input NAND gate. Using 7400 (quad 2-input NAND) and 7420 (dual 4-input NAND) chips, state the number of ICs and give one reason why fewer ICs is an advantage.`, marks: 4, model: mi(
          R`Five 2-input gates need two 7400s (four per chip). <strong>[1]</strong>`,
          R`One 4-input gate needs one 7420. <strong>[1]</strong>`,
          R`Total: 3 ICs (not 6 gates). <strong>[1]</strong>`,
          R`Fewer ICs means lower cost and/or a smaller, simpler board that is cheaper to manufacture (also less power). <strong>[1]</strong>`) },
      ],
    },
    "dig-prog": {
      title: "Programmable control",
      questions: [
        { q: R`Which pseudo-code line makes a control program repeat for ever?`, opts: [R`<code>wait 1 s</code>`, R`<code>goto main</code> at the end, after the label <code>main:</code>`, R`<code>n = n + 1</code>`, R`<code>end</code>`], a: 1, why: R`An infinite loop is a label at the top and a jump back to it at the bottom. Without it the program runs once and stops.` },
        { q: R`An 8-bit ADC (0 to 255 for 0 to 100 °C) reads 128. What temperature is this, to one decimal place?`, opts: [R`25.0 °C`, R`50.2 °C`, R`128 °C`, R`78.1 °C`], a: 1, why: R`$128 \times 100 \div 255 = 50.2$ °C.` },
        { q: R`Which flowchart symbol is used for a decision?`, opts: [R`Rounded rectangle`, R`Parallelogram`, R`Rectangle`, R`Diamond`], a: 3, why: R`The diamond has one entry and two exits, labelled Yes and No.` },
        { q: R`What is wrong with the line <code>wait 2</code>?`, opts: [R`Nothing`, R`It has no unit: it must say <code>wait 2 s</code>`, R`2 is too long`, R`It must be in capitals`], a: 1, why: R`A delay needs a unit, seconds or milliseconds, for the flowchart to have sufficient detail.` },
        { q: R`A counter $n$ starts at 0 and each pass of a loop adds 1. The loop repeats while <code>n &lt; 3</code>. How many passes are there?`, opts: [R`2`, R`3`, R`4`, R`Infinite`], a: 1, why: R`After pass 1, $n=1$; after pass 2, $n=2$; after pass 3, $n=3$, and the test fails. Three passes.` },
        { type: "open", q: R`Describe a flowchart (or write pseudo-code as practice) for this: while push button 1 (input 1) is pressed, the motor on output 2 is on for 3 seconds and then off, and the system goes on checking the button for as long as it is powered.`, marks: 5, model: mi(
          R`A loop that returns to the start, for example <code>main: … goto main</code>. <strong>[1]</strong>`,
          R`A decision on input 1 = 1 (Yes and No handled). <strong>[1]</strong>`,
          R`Output 2 = 1. <strong>[1]</strong>`,
          R`Wait 3 s, with the unit. <strong>[1]</strong>`,
          R`Output 2 = 0, and the No path also keeps the output 2 = 0 and returns to the start. <strong>[1]</strong>`) },
      ],
    },
    "dig-pwm": {
      title: "Pulse-width modulation",
      questions: [
        { q: R`A PWM signal is high for 3 ms in a period of 10 ms. What is the duty cycle?`, opts: [R`3 %`, R`30 %`, R`70 %`, R`300 %`], a: 1, why: R`$D = t_{on} / T = 3 / 10 = 30\ \%$.` },
        { q: R`A 12 V supply drives a motor with PWM at a 25 % duty cycle. What is the average voltage?`, opts: [R`0.25 V`, R`3 V`, R`6 V`, R`9 V`], a: 1, why: R`$V_{avg} = D \times V_s = 0.25 \times 12 = 3$ V.` },
        { q: R`A PWM signal has a period of 2 ms. What is its frequency?`, opts: [R`2 Hz`, R`50 Hz`, R`500 Hz`, R`2000 Hz`], a: 2, why: R`$f = 1/T = 1/0.002 = 500$ Hz.` },
        { q: R`Why is PWM better than a series resistor for speed control of a motor?`, opts: [R`It makes the motor run backwards`, R`The switching transistor wastes almost no power, whereas a resistor turns the unwanted voltage into heat`, R`It needs no supply`, R`It makes the motor louder`], a: 1, why: R`A transistor that is fully on or fully off dissipates very little. A series resistor wastes the voltage it drops times the current.` },
        { q: R`The duty cycle is reduced. Which description of the motor is best?`, opts: [R`It goes slower`, R`The average voltage across the motor falls, so the current and torque fall and the motor slows down`, R`It goes faster because the pulses are shorter`, R`Nothing changes`], a: 1, why: R`A good answer links the duty cycle, the average voltage and the speed, with direction: not just "it goes slower".` },
        { type: "open", q: R`A speed dial on analogue input 1 reads 102 (range 0 to 255). The program sets the PWM duty to the reading × 100 ÷ 255 %. The supply is 9 V. Calculate the duty cycle and the average voltage across the motor.`, marks: 3, model: mi(
          R`$D = 102 \times 100 \div 255$ <strong>[1]</strong>`,
          R`$D = 40\ \%$ <strong>[1]</strong>`,
          R`$V_{avg} = 0.40 \times 9 = 3.6$ V <strong>[1]</strong>`) },
      ],
    },
    "dig-exam": {
      title: "Exam-style integration",
      questions: [
        { q: R`For $E = A \cdot B \cdot C \cdot \overline{D}$, how many of the 16 truth-table rows give $E = 1$?`, opts: [R`1`, R`4`, R`8`, R`15`], a: 0, why: R`An AND of four terms is true for exactly one combination: $A=1, B=1, C=1, D=0$, which is row 1110.` },
        { q: R`The capstan enable circuit is made from NANDs as: a tied NAND on $D$, a 4-input NAND, and a tied NAND on the output. Using 7400 and 7420 chips, how many gates and how many ICs?`, opts: [R`3 gates, 1 IC`, R`3 gates, 2 ICs`, R`4 gates, 2 ICs`, R`2 gates, 2 ICs`], a: 1, why: R`Two 2-input gates fit in one 7400 and the single 4-input gate needs a 7420, so 3 gates in 2 ICs.` },
        { q: R`ENABLE (input 1) is 0 and the speed dial is at 255. What does the capstan program do?`, opts: [R`Runs the motor at full speed`, R`Switches the motor and lamp off, whatever the dial says`, R`Runs at half speed`, R`Stops the program`], a: 1, why: R`The Yes branch is taken only when input 1 = 1. With ENABLE at 0 the No branch sets PWM 0 % and the lamp off, then the loop continues.` },
        { q: R`A candidate is asked how many ICs a circuit needs and answers with the number of gates. Which comment is right?`, opts: [R`Fine, they are the same thing`, R`Gates come several to a chip, so the answer must be the number of chips, from the data sheet`, R`ICs are not needed`, R`Gates are always one per chip`], a: 1, why: R`The course report says candidates counted gates instead of ICs. Divide the gates of each size into chips and round up.` },
        { q: R`Which flowchart box has sufficient and appropriate detail?`, opts: [R`Turn motor on`, R`Wait a bit`, R`PWM output 1 = duty, output 2 = 1`, R`Run`], a: 2, why: R`It names the output pins and the quantities. "Turn motor on" and "wait a bit" give no pin number or delay unit.` },
        { type: "open", q: R`In the capstan system the motor is running at 75 % duty when the emergency stop $D$ is pressed. Describe what happens, from the logic board to the motor.`, marks: 4, model: mi(
          R`$D$ goes to 1 so $\overline{D}$ becomes 0. <strong>[1]</strong>`,
          R`The AND ($E = A \cdot B \cdot C \cdot \overline{D}$) gives $E = 0$, so the logic board sends 0 to input 1. <strong>[1]</strong>`,
          R`The program takes the No branch: PWM output 1 = 0 % and output 2 = 0. <strong>[1]</strong>`,
          R`The motor stops and the lamp goes out; the program loops back and keeps checking input 1. <strong>[1]</strong>`) },
      ],
    },
  });
})();
