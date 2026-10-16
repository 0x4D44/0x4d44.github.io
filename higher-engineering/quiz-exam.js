/* Pre-flight check question bank for the Exam & assignment deck.
   The mock questions are INVENTED PRACTICE written for this site, not past paper questions.
   Mark allocations are the typical allocation for the question type, not official marking.
   Maths is written in KaTeX between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HE_QUIZ = Object.assign(window.HE_QUIZ || {}, {
    "exm-assess": {
      title: "How the course is assessed",
      questions: [
        { q: R`The question paper is worth 110 marks in 150 minutes. About how long is that per mark?`, opts: [R`About 40 seconds`, R`About 82 seconds`, R`About 2 minutes 30 seconds`, R`About 5 minutes`], a: 1, why: R`$150 \div 110 = 1.36$ minutes, which is about 82 seconds a mark. A 4-mark question therefore deserves about 5 and a half minutes.` },
        { q: R`At that pace, how long should a 20-mark Section 1 take?`, opts: [R`About 10 minutes`, R`About 27 minutes`, R`About 45 minutes`, R`About 60 minutes`], a: 1, why: R`$20 \times 1.364 = 27.3$ minutes. Leaving Section 1 at 45 minutes borrows time from the 90-mark section, where the marks are harder to get.` },
        { q: R`The course total is 160 marks (110 for the question paper and 50 for the assignment). What is 70% of the total?`, opts: [R`80`, R`96`, R`112`, R`128`], a: 2, why: R`$0.70 \times 160 = 112$. Seventy per cent is the usual notional A. The notional C is 50%, which is 80 marks.` },
        { q: R`Which fraction of the total course marks does the assignment carry?`, opts: [R`About a fifth`, R`About a third`, R`About a half`, R`About two thirds`], a: 1, why: R`$50 \div 160 \approx 0.31$, which is just under a third. It is worth practising for in its own right.` },
        { q: R`Which assignment skill is shown by writing down expected results before you build, and comparing them with measured ones afterwards?`, opts: [R`Analysis`, R`Designing`, R`Building`, R`Testing`], a: 3, why: R`Testing compares expected with actual results and records any amendments. Planning the expected values belongs to design, but the comparison is the testing evidence.` },
        { type: "open", q: R`Grade boundaries differ from year to year, as the percentages for 2024, 2025 and 2026 do. Explain why a candidate should not aim at "exactly the boundary percentage from last year".`, marks: 2, model: mi(
          R`•1 the boundaries are set after the exam each year (they are not fixed in advance), so last year's percentage is not a guarantee of this year's`,
          R`•2 aim comfortably above the boundary: the safe plan is to gain marks in every area, and not to rely on a particular percentage`) }
      ]
    },
    "exm-databook": {
      title: "The Data Booklet and calculations",
      questions: [
        { q: R`A motor turns at 600 rev/min. What value of $n$ goes into $P = 2\pi nT$?`, opts: [R`600 rev/s`, R`10 rev/s`, R`36 000 rev/s`, R`$600 \times 2\pi$`], a: 1, why: R`$n$ is in revolutions per second, so divide rev/min by 60: $600 \div 60 = 10$.` },
        { q: R`How is 0.47 µF written in farads?`, opts: [R`$0.47 \times 10^{-3}$ F`, R`$0.47 \times 10^{-6}$ F`, R`$0.47 \times 10^{-9}$ F`, R`$0.47 \times 10^{6}$ F`], a: 1, why: R`Micro means $10^{-6}$. Converting prefixes before substituting is one of the cheapest ways to protect marks.` },
        { q: R`A torque of 10 N m turns at 30 rev/min. What is the power?`, opts: [R`31.4 W`, R`1885 W`, R`300 W`, R`3.14 W`], a: 0, why: R`$n = 30 \div 60 = 0.5$ rev/s, so $P = 2\pi \times 0.5 \times 10 = 31.4$ W. Forgetting the conversion gives 1885 W.` },
        { q: R`A calculation has three steps. When should you round?`, opts: [R`After each step, to 3 s.f.`, R`Only at the end, keeping full digits in between`, R`Never`, R`Only the first step`], a: 1, why: R`Rounded intermediates drift: in the brake-disc example, rounding each step to 3 s.f. gave 36.2 K instead of 36.4 K.` },
        { q: R`What should come first when the booklet prints $V_1/V_2 = R_1/R_2$ but you need $R_1$?`, opts: [R`Substitute, then rearrange the numbers`, R`Rearrange the symbols, then substitute`, R`Guess and check`, R`Convert to a different formula`], a: 1, why: R`Rearranging the symbols first gives $R_1 = R_2 V_1 / V_2$ and shows the marker one clean substitution.` },
        { type: "open", q: R`In a voltage divider, $V_1/V_2 = R_1/R_2$. Given $R_2 = 2.2\ \mathrm{k\Omega}$, $V_2 = 2.5$ V and $V_1 = 6.5$ V, rearrange for $R_1$ and calculate its value.`, marks: 3, model: mi(
          R`•1 rearranges the symbols: $R_1 = R_2 V_1 / V_2$`,
          R`•2 correct substitution: $R_1 = 2.2 \times 6.5 / 2.5$ (kΩ may stay as kΩ)`,
          R`•3 answer with unit: $R_1 = 5.72\ \mathrm{k\Omega}$ (5720 Ω)`) }
      ]
    },
    "exm-answering": {
      title: "Answering well",
      questions: [
        { q: R`A question says "State two reasons...". What does the command word ask for?`, opts: [R`A long explanation of each`, R`Two short, clear points with no need to develop them`, R`A calculation`, R`A labelled diagram`], a: 1, why: R`State asks for a brief, direct answer. Long explanations spend time and rarely earn extra marks.` },
        { q: R`A calculation answer is correct but has no unit. What is the safest assumption?`, opts: [R`It will still get full marks`, R`A mark may be lost, so always write the unit`, R`The unit is optional if the number is exact`, R`Units only matter in Section 1`], a: 1, why: R`Typical allocations give a mark for the answer with its unit, so omit it at your own risk.` },
        { q: R`How many rows does the truth table of a three-input gate circuit need?`, opts: [R`3`, R`6`, R`8`, R`9`], a: 2, why: R`Three inputs give $2^3 = 8$ rows. Count them before you start, and write the inputs in binary order.` },
        { q: R`In a free-body diagram, what shows a force?`, opts: [R`A dotted line`, R`An arrow in the direction the force acts, labelled with its size`, R`A circle on the object`, R`A letter only`], a: 1, why: R`Each force is an arrow from where it acts, pointing the way it pushes or pulls, with a label for its value.` },
        { q: R`A 3/2 push-button valve is pressed. What happens?`, opts: [R`Supply air is blocked and the outlet vents`, R`Supply air flows to the outlet`, R`The valve stays in the same state`, R`Air is released from the supply`], a: 1, why: R`Pressing connects the supply port to the outlet. Releasing the button lets the spring return the valve, venting the outlet.` },
        { q: R`Which habit is the strongest way to catch a ×60 slip in a power answer?`, opts: [R`Checking the answer is sensible`, R`Writing larger`, R`Skipping the unit`, R`Leaving the question until last`], a: 0, why: R`A sense check, for example that a hand winch is not 180 kW, catches many slips that no amount of re-reading will.` },
        { type: "open", q: R`A pushbutton 3/2 valve is used to operate a double-acting cylinder through a 5/2 pilot-operated valve. Describe what happens when the button is pressed and then released.`, marks: 4, model: mi(
          R`•1 pressing the 3/2 valve sends air to the pilot port of the 5/2 valve`,
          R`•2 the 5/2 valve changes state, sending air to the cap end of the cylinder (and venting the rod end)`,
          R`•3 the piston rod extends (outstroke)`,
          R`•4 on release the 3/2 valve vents the pilot, the 5/2 valve returns (spring), and the cylinder instrokes`) }
      ]
    },
    "exm-assignment": {
      title: "The assignment",
      questions: [
        { q: R`A candidate wants evidence of a working circuit. Which is best?`, opts: [R`A statement that it worked`, R`A dated photo or screenshot with measured values written beside it`, R`A friend's signature`, R`A diagram of a different circuit`], a: 1, why: R`Evidence is checked against what you claim. A measurement labelled on the picture is hard to dispute.` },
        { q: R`The night lantern uses an 82 kΩ resistor in place of the 68 kΩ, with the LDR at 20 kΩ on 9 V. What is the voltage across the LDR?`, opts: [R`1.76 V`, R`2.05 V`, R`4.5 V`, R`7.2 V`], a: 0, why: R`$V = 9 \times 20 / (82 + 20) = 1.76$ V. The gate voltage is below what the design intended, so the lantern would switch on later.` },
        { q: R`Why write a test plan with expected values before building?`, opts: [R`To make the report longer`, R`So that results can be compared with predictions, showing whether the design works`, R`Because the plan is never changed`, R`To avoid taking measurements`], a: 1, why: R`Without a prediction, a measurement has nothing to be compared against.` },
        { q: R`The expression is $X = A \cdot B + C$. If only NAND gates are available in quad (4-gate) chips, how many chips are needed?`, opts: [R`1`, R`2`, R`3`, R`4`], a: 0, why: R`$X = \overline{\overline{A \cdot B} \cdot \overline{C}}$. This needs NAND(A,B), NAND(C,C) as a NOT, and a third NAND to combine them: three gates, which fit on one quad chip.` },
        { q: R`Which evaluation sentence is strongest?`, opts: [R`The circuit was good.`, R`The measured gate voltage of 1.76 V was below the 2.0 V target, so the lamp switched on late; changing the fixed resistor to 68 kΩ would fix this.`, R`It mostly worked.`, R`I learned a lot.`], a: 1, why: R`It compares a measurement with a target, says what happened as a result, and proposes a specific improvement.` },
        { type: "open", q: R`Write one evaluation sentence about a test result of your own choice. It should compare a measurement with the specification and propose a change.`, marks: 3, model: mi(
          R`•1 states the measured value (with a unit) and the target or specification value`,
          R`•2 says whether it met the target, and the effect of any difference on how the circuit behaves`,
          R`•3 a specific change that would improve it (for example, "replace the 82 kΩ with 68 kΩ") and why it helps`) }
      ]
    },
    "exm-plan": {
      title: "Revision plan",
      questions: [
        { q: R`Which area of the course has the widest and largest mark range in the revision table?`, opts: [R`Analogue electronic control`, R`Materials`, R`Digital electronic control`, R`Drive systems and pneumatics`], a: 0, why: R`Analogue electronics, at 20 to 35 marks, is the area most likely to repay your time.` },
        { q: R`Where should extra revision time go first?`, opts: [R`Where you are most confident and the marks are few`, R`Where marks are many and your confidence is low`, R`Wherever is most enjoyable`, R`Where the deck is shortest`], a: 1, why: R`Marks at stake multiplied by how much you can still gain is what the planner on this page weights.` },
        { q: R`Where are past papers and marking instructions published?`, opts: [R`On this site`, R`On the Qualifications Scotland subject page for Higher Engineering Science`, R`In the Data Booklet`, R`Only in school`], a: 1, why: R`The course reports advise using them. The questions in this deck are invented practice and do not replace them.` },
        { q: R`After a practice question, how should you review a lost mark?`, opts: [R`Ignore it`, R`Classify it as knowledge, units, rounding or a missing reason, and drill that`, R`Redo the whole paper`, R`Blame the question`], a: 1, why: R`Sorting mistakes by type shows which habit to fix, which is faster than re-reading everything.` }
      ]
    },
    "exm-mock1": {
      title: "Mock Section 1 (invented practice, 20 marks)",
      questions: [
        { type: "open", q: R`A crane lifts a 360 kg load through 15 m in 30 s. Take $g = 9.8\ \mathrm{m\,s^{-2}}$. Calculate the power needed to lift it. [3]`, marks: 3, model: mi(
          R`•1 $E_p = mgh = 360 \times 9.8 \times 15$`,
          R`•2 $E_p = 52\,920$ J`,
          R`•3 $P = E/t = 52\,920 / 30 = 1764$ W (1760 W to 3 s.f.)`) },
        { type: "open", q: R`A voltage divider has a 4.7 kΩ resistor in series with a 1.5 kΩ resistor across 9 V. Calculate the voltage across the 1.5 kΩ resistor. [2]`, marks: 2, model: mi(
          R`•1 $V = 9 \times 1.5 / (4.7 + 1.5)$`,
          R`•2 $V = 2.18$ V (2.177 V)`) },
        { type: "open", q: R`A transistor with $h_{FE} = 120$ must pass a collector current of 24 mA. Calculate the base current. [1]`, marks: 1, model: mi(
          R`•1 $I_b = I_c / h_{FE} = 24 / 120 = 0.2$ mA`) },
        { type: "open", q: R`A non-inverting amplifier has $R_f = 9\ \mathrm{k\Omega}$ and $R_g = 10\ \mathrm{k\Omega}$. The input is 1.5 V. Calculate the output voltage. [2]`, marks: 2, model: mi(
          R`•1 gain $= 1 + R_f / R_g = 1 + 9/10 = 1.9$`,
          R`•2 $V_o = 1.5 \times 1.9 = 2.85$ V`) },
        { type: "open", q: R`Complete the truth table for $X = A \cdot B + \overline{C}$. Give the column for X for the eight input combinations ABC = 000, 001, 010, 011, 100, 101, 110, 111. [2]`, marks: 2, model: mi(
          R`•1 six or more of the eight values correct`,
          R`•2 all eight correct: X = 1, 0, 1, 0, 1, 0, 1, 1`) },
        { type: "open", q: R`A motor is driven by PWM at a duty cycle of 75% from a 12 V supply. State the average voltage the motor sees. [1]`, marks: 1, model: mi(
          R`•1 $0.75 \times 12 = 9$ V`) },
        { type: "open", q: R`A 20-tooth driver turning at 960 rev/min drives an 80-tooth gear. Calculate the output speed. [2]`, marks: 2, model: mi(
          R`•1 speed ratio $= 80/20 = 4$ (or $n_2 = n_1 T_1 / T_2$ with correct substitution)`,
          R`•2 $n = 960 / 4 = 240$ rev/min`) },
        { type: "open", q: R`A piston of diameter 50 mm is supplied with air at $5.0 \times 10^5$ Pa. Calculate the force on the outstroke. [2]`, marks: 2, model: mi(
          R`•1 $A = \pi \times 0.025^2 = 1.963 \times 10^{-3}\ \mathrm{m^2}$ and $F = pA$`,
          R`•2 $F = 982$ N (981.7 N)`) },
        { type: "open", q: R`A 10 mm diameter steel rod carries a tensile force of 18 kN. Calculate the stress in the rod. [2]`, marks: 2, model: mi(
          R`•1 $A = \pi \times 5^2 = 78.54\ \mathrm{mm^2}$ and $\sigma = F/A$`,
          R`•2 $\sigma = 18\,000 / 78.54 = 229\ \mathrm{N\,mm^{-2}}$ (229.2)`) },
        { type: "open", q: R`Define the property "ductility". [1]`, marks: 1, model: mi(
          R`•1 the ability of a material to be drawn out or stretched plastically (for example into a wire) without breaking`) },
        { type: "open", q: R`State what happens to the resistance of a strain gauge when it is stretched. [1]`, marks: 1, model: mi(
          R`•1 its resistance increases (the conductor gets longer and thinner)`) },
        { type: "open", q: R`State one advantage of a MOSFET over a BJT as a switch for a small sensor circuit. [1]`, marks: 1, model: mi(
          R`•1 it draws almost no current at the gate, so it loads the sensor circuit (such as a voltage divider) very little`) }
      ]
    },
    "exm-mock2a": {
      title: "Mock Question A (invented practice, 10 marks)",
      questions: [
        { type: "open", q: R`Work Question A (the difference amplifier, transistor and lamp) above, then mark yourself against this list. Typical allocation (a) 2, (b) 2, (c) 3, (d) 1, (e) 2.`, marks: 10, model: mi(
          R`•(a) $V_o = (R_f / R_i)(V_2 - V_1) = 4.7 \times 0.30 = 1.41$ V [2: one for the gain 4.7, one for the answer]`,
          R`•(b) $I_b = I_c / h_{FE} = 0.060 / 120 = 0.5$ mA [2]`,
          R`•(c) $R_b = (V_o - V_{BE}) / I_b = (1.41 - 0.7) / 0.0005 = 1420\ \Omega$ [3: voltage across $R_b$, substitution, answer with unit]`,
          R`•(d) $V_{CE} = 9 - 6 = 3.0$ V, so $P = 3.0 \times 0.060 = 0.18$ W [1]`,
          R`•(e) $R_b$ limits the base current to the value needed [1]; without it the base current would be very large, as only the 0.7 V base–emitter drop would stand in the way, risking damage to the transistor or the amplifier [1]`) }
      ]
    },
    "exm-mock2b": {
      title: "Mock Question B (invented practice, 10 marks)",
      questions: [
        { type: "open", q: R`Work Question B (the 6.0 m beam) above, then mark yourself against this list. Typical allocation (a) 2, (b) 1, (c) 3, (d) 2, (e) 2.`, marks: 10, model: mi(
          R`•(a) vertical $20 \sin 30° = 10$ kN [1]; horizontal $20 \cos 30° = 17.32$ kN [1]`,
          R`•(b) UDL total $= 4 \times 6 = 24$ kN, acting at the midpoint, 3.0 m from A [1]`,
          R`•(c) moments about A: $R_B \times 6 = 12 \times 2 + 10 \times 4 + 24 \times 3$ [2]; $R_B = 136/6 = 22.67$ kN [1]`,
          R`•(d) vertical balance: $R_{Av} = 12 + 10 + 24 - 22.67$ [1]; $R_{Av} = 23.33$ kN [1]`,
          R`•(e) horizontal reaction at A is 17.32 kN, acting against the horizontal component of the 20 kN load [1]; resultant $= \sqrt{23.33^2 + 17.32^2} = 29.06$ kN at 53.4° to the horizontal [1]`,
          R`•Check: moments about B give $23.33 \times 6 = 140$ and $12 \times 4 + 10 \times 2 + 24 \times 3 = 140$, so the answers agree.`) }
      ]
    },
    "exm-mock2c": {
      title: "Mock Question C (invented practice, 10 marks)",
      questions: [
        { type: "open", q: R`Work Question C (the compound gear train and cylinder) above, then mark yourself against this list. Typical allocation (a) 3, (b) 3, (c) 4.`, marks: 10, model: mi(
          R`•(a) first stage ratio $72/18 = 4$ and second stage $60/20 = 3$ [1]; velocity ratio $= 4 \times 3 = 12$ [1]; output $= 1440 / 12 = 120$ rev/min [1]`,
          R`•(b) input power $P = 2\pi nT = 2\pi \times 24 \times 5.0 = 754$ W [1]; output power $= 0.85 \times 754 = 640.9$ W [1]; $T = P / (2\pi n) = 640.9 / (2\pi \times 2) = 51.0$ N m [1]`,
          R`•(c) outstroke: $A = \pi \times 0.0315^2 = 3.117 \times 10^{-3}\ \mathrm{m^2}$ [1]; $F = pA = 6.0 \times 10^5 \times 3.117 \times 10^{-3} = 1870$ N [1]`,
          R`•(c) instroke: annulus area $= \pi(0.0315^2 - 0.010^2) = 2.803 \times 10^{-3}\ \mathrm{m^2}$ [1]; $F = 1682$ N [1]`) }
      ]
    }
  });
})();
