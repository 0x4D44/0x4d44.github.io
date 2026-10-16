/* Pre-flight check question bank for the Systems & energy deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML, in the style of a marking list), self-marked.
   Maths is written in KaTeX between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HE_QUIZ = Object.assign(window.HE_QUIZ || {}, {
    "sys-roles": {
      title: "Engineers, disciplines and teamwork",
      questions: [
        { q: R`A footbridge is being designed. Which discipline would take the lead in calculating the reaction forces at its supports?`, opts: [R`Software and control engineer`, R`Civil (structural) engineer`, R`Chemical engineer`, R`Electronic engineer`], a: 1, why: R`Forces, loads and reactions in a structure are the specialist knowledge of the civil or structural engineer.` },
        { q: R`Which of these is a general <em>skill</em> rather than specialist knowledge of one discipline?`, opts: [R`Knowing how a transistor switches a load`, R`Knowing how a beam bends under load`, R`Explaining a design clearly to a client who is not an engineer`, R`Knowing the properties of titanium alloy`], a: 2, why: R`Communication is a skill used on every project. The others are the content knowledge of electronic, civil and materials engineering.` },
        { q: R`In which project phase would an engineer plan tests with expected results and record measurements?`, opts: [R`Identify the need and analyse`, R`Design`, R`Test`, R`Evaluate and maintain`], a: 2, why: R`Planning, carrying out and recording tests belongs to the test phase. Evaluation then judges the results against the specification.` },
        { q: R`Why is it especially important for different disciplines to communicate at the points where their parts of a project meet?`, opts: [R`So that each engineer does exactly the same work`, R`Because a change by one discipline can make another's part unsafe or fail to fit`, R`Because engineers are not allowed to work alone`, R`So that the project costs more`], a: 1, why: R`Interfaces are where mistakes creep in: a larger motor may need thicker cables, a heavier machine may need a stronger floor.` },
        { q: R`Which answer is worth a mark for one role of a mechanical engineer in designing a ship's anchor winch?`, opts: [R`The mechanical engineer designs the winch.`, R`The mechanical engineer works with other engineers on the winch.`, R`The mechanical engineer calculates the torque needed to lift the anchor, so that the shaft and gears can be sized not to fail.`, R`The mechanical engineer makes sure it is good.`], a: 2, why: R`It states a specific task, says how it is done (a calculation) and why (so parts do not fail). The others are bare job titles or vague claims.` },
        { type: "open", q: R`An autonomous electric ferry is being developed. Describe two roles of a software engineer in the development of its control system.`, marks: 4, model: mi(
          R`•1 role 1: writes the program that reads the ferry's sensors (speed, position, battery) and decides what the outputs should do`,
          R`•2 how/why for role 1, e.g. so the ferry responds safely and smoothly to changing conditions without a human at the controls`,
          R`•3 role 2, different from role 1: e.g. writes safety routines that stop or slow the ferry when an obstacle is detected, or tests the program in simulation`,
          R`•4 how/why for role 2, e.g. so that collisions are avoided, or faults are found before the ferry carries passengers`) },
      ],
    },
    "sys-systems": {
      title: "The systems approach",
      questions: [
        { q: R`A <em>sub-system</em> is…`, opts: [R`any part that has failed`, R`a smaller system with a job of its own, inside a bigger system`, R`the input to a system`, R`a system with no outputs`], a: 1, why: R`A system can be broken into sub-systems, each with its own inputs, process and outputs.` },
        { q: R`In a closed-loop control diagram, which block works out the error?`, opts: [R`The actuator`, R`The sensor`, R`The comparator (summing junction)`, R`The process`], a: 2, why: R`The comparator subtracts the measured (fed-back) value from the desired value to give the error.` },
        { q: R`What does a closed-loop diagram have that an open-loop diagram does not?`, opts: [R`An actuator`, R`A path from the output back to the comparator through a sensor`, R`A controller`, R`An input`], a: 1, why: R`Open loop has input, controller, actuator and process but no feedback path. Closed loop adds the sensor and comparator.` },
        { q: R`In the autopilot, the compass measures the ship's heading and sends it back to the comparator. The compass is the…`, opts: [R`controller`, R`actuator`, R`process`, R`sensor in the feedback path`], a: 3, why: R`The block that measures the output and feeds it back is the sensor (feedback transducer).` },
        { q: R`Which of these is a <em>disturbance</em> for a ship holding a heading?`, opts: [R`The captain's ordered heading`, R`A wave striking the bow and pushing it off course`, R`The rudder angle`, R`The compass reading`], a: 1, why: R`A disturbance is an unwanted influence on the process. The ordered heading is the input, the rudder is the actuator's output, and the compass is the sensor.` },
        { type: "open", q: R`A bilge has a float switch that senses the water level. A circuit compares the level with a set maximum and switches a pump motor on and off. The pump removes water from the bilge. Name the part of this system that performs each of these functions: sensor, comparator, actuator, process, and say what the feedback is.`, marks: 4, model: mi(
          R`•1 sensor: the float switch (it measures the water level)`,
          R`•2 comparator: the circuit that compares the measured level with the set maximum`,
          R`•3 actuator: the pump motor; process: the water in the bilge`,
          R`•4 feedback: the measured water level returned from the output (via the float switch) to the comparator, so that the pump is switched according to the actual level`) },
      ],
    },
    "sys-feedback": {
      title: "Feedback and control",
      questions: [
        { q: R`A boiler should be at 6.0 bar and a sensor reads 5.2 bar. What is the error?`, opts: [R`$-0.8$ bar`, R`$+0.8$ bar`, R`$+11.2$ bar`, R`$+0.13$ bar`], a: 1, why: R`Error $=$ desired $-$ actual $= 6.0 - 5.2 = +0.8$ bar: positive, so the pressure is too low and the controller must add fuel.` },
        { q: R`Negative feedback is feedback that…`, opts: [R`makes the output negative`, R`is subtracted from the input, so a change in the output opposes the change that caused it`, R`is added to the input so that the output runs away`, R`only works with two-state control`], a: 1, why: R`Subtracting the measured output at the comparator makes the system self-correcting.` },
        { q: R`A microphone placed next to its own loudspeaker gives a loud squeal. This is…`, opts: [R`negative feedback keeping the sound steady`, R`positive feedback: the output is added to the input and grows`, R`open-loop control`, R`proportional control`], a: 1, why: R`The loudspeaker output is picked up by the microphone and amplified again, so the output grows until something limits it.` },
        { q: R`A cabin thermostat switches the stove on at 18 °C and off at 22 °C. Why does the temperature swing rather than stay at one value?`, opts: [R`The stove cannot produce enough heat`, R`The thermostat is open loop`, R`The heating and cooling lag behind the switching, so the temperature overshoots each limit and then recovers`, R`The gain is too low`], a: 2, why: R`With two-state control, heat keeps arriving or leaving after the switch changes, so the temperature continually swings (hunts).` },
        { q: R`A proportional controller has a gain of 2.5 V per °C of error. The error is 3.2 °C. The controller output is…`, opts: [R`1.28 V`, R`0.78 V`, R`8.0 V`, R`5.7 V`], a: 2, why: R`Output $= K_p \times$ error $= 2.5 \times 3.2 = 8.0$ V.` },
        { q: R`A ship needs 6° of rudder to hold course in a steady cross-wind. The proportional gain is 1.5° of rudder per degree of error, so the ship settles with a heading error of 4°. If the gain is doubled, the steady heading error becomes…`, opts: [R`8°`, R`4°`, R`2°`, R`0°`], a: 2, why: R`The error needed is (rudder needed) ÷ gain $= 6 \div 3.0 = 2^\circ$. Proportional control reduces, but never removes, the offset.` },
        { type: "open", q: R`A cabin heater uses a thermostat that switches it on below 18 °C and off above 22 °C. A second design uses a proportional controller that varies the heater power in proportion to how far the temperature is below 20 °C. Compare the two types of control.`, marks: 4, model: mi(
          R`•1 two-state: heater fully on or fully off, switching at set temperatures`,
          R`•2 two-state: the temperature hunts (swings) between about 18 °C and 22 °C and is never steady; simple and cheap`,
          R`•3 proportional: heater power is graded: a large error gives more power, a small error less, so the swings are smaller and smoother`,
          R`•4 proportional: it settles with a small steady-state offset below 20 °C (needs an error to give the power that balances the heat loss); costs more / more complex than on-off`) },
      ],
    },
    "sys-energy": {
      title: "Energy and efficiency",
      questions: [
        { q: R`A machine takes in 400 J and gives out 300 J of useful energy. Its efficiency is…`, opts: [R`1.33`, R`0.25`, R`0.75`, R`100 J`], a: 2, why: R`$\eta = E_{out}/E_{in} = 300 \div 400 = 0.75$ (75 %). Efficiency cannot exceed 1, and has no unit.` },
        { q: R`A 5.0 kg sandbag is raised through 12 m. Its gain in potential energy is…`, opts: [R`60 J`, R`588 J`, R`5.9 J`, R`294 J`], a: 1, why: R`$E_p = mgh = 5.0 \times 9.8 \times 12 = 588$ J.` },
        { q: R`A cannonball's speed doubles. Its kinetic energy…`, opts: [R`doubles`, R`stays the same`, R`quadruples`, R`halves`], a: 2, why: R`$E_k = \tfrac12 mv^2$: $E_k$ depends on $v^2$, so doubling $v$ multiplies $E_k$ by 4.` },
        { q: R`How much energy is needed to heat 0.50 kg of water from 20 °C to 60 °C? ($c = 4180$ J kg⁻¹ K⁻¹)`, opts: [R`83 600 J`, R`125 400 J`, R`41 800 J`, R`8360 J`], a: 0, why: R`$E_h = cm\Delta T = 4180 \times 0.50 \times 40 = 83\,600$ J. $\Delta T$ is the change, $60 - 20 = 40$.` },
        { q: R`A 12 V lamp carries a current of 2.0 A for 30 s. The electrical energy used is…`, opts: [R`24 J`, R`720 J`, R`180 J`, R`12 J`], a: 1, why: R`$E_e = VIt = 12 \times 2.0 \times 30 = 720$ J.` },
        { q: R`A pump delivers 500 W of useful power from an input of 800 W. What is the power wasted, and the efficiency?`, opts: [R`300 W wasted; $\eta = 0.625$`, R`300 W wasted; $\eta = 1.6$`, R`1300 W wasted; $\eta = 0.625$`, R`500 W wasted; $\eta = 0.5$`], a: 0, why: R`Wasted $= 800 - 500 = 300$ W. $\eta = 500/800 = 0.625$ (62.5 %). The option with 1.6 inverts the ratio.` },
        { type: "open", q: R`A crane lifts a 250 kg load through a height of 8.0 m in 20 s. The motor takes an input power of 2.5 kW. Calculate the efficiency of the crane.`, marks: 4, model: mi(
          R`•1 $E_p = mgh = 250 \times 9.8 \times 8.0$`,
          R`•2 $E_p = 19\,600$ J`,
          R`•3 $P_{out} = E/t = 19\,600 \div 20 = 980$ W`,
          R`•4 $\eta = 980 \div 2500 = 0.392$ (39.2 %); correct unit handling: 2.5 kW converted to 2500 W`) },
      ],
    },
    "sys-calc": {
      title: "Calculation craft",
      questions: [
        { q: R`Convert $250\ \text{mm}^2$ into $\text{m}^2$.`, opts: [R`$2.5 \times 10^{-1}\ \text{m}^2$`, R`$2.5 \times 10^{-3}\ \text{m}^2$`, R`$2.5 \times 10^{-4}\ \text{m}^2$`, R`$2.5 \times 10^{-6}\ \text{m}^2$`], a: 2, why: R`$1\ \text{mm}^2 = 10^{-6}\ \text{m}^2$ (the square of $10^{-3}$), so $250 \times 10^{-6} = 2.5 \times 10^{-4}$.` },
        { q: R`A shaft turns at 1800 rev/min. In a formula needing $n$ in revolutions per second, you use…`, opts: [R`30`, R`108 000`, R`1800`, R`0.033`], a: 0, why: R`$1800 \div 60 = 30$ rev/s.` },
        { q: R`$120\ \mu\text{A}$ written in amperes is…`, opts: [R`$1.2 \times 10^{-3}\ \text{A}$`, R`$1.2 \times 10^{-6}\ \text{A}$`, R`$1.2 \times 10^{-4}\ \text{A}$`, R`$1.2 \times 10^{-2}\ \text{A}$`], a: 2, why: R`micro means $10^{-6}$: $120 \times 10^{-6} = 1.2 \times 10^{-4}$ A.` },
        { q: R`Which is the best practice in a multi-step calculation?`, opts: [R`Round every intermediate answer to 3 significant figures`, R`Keep full calculator values and round only the final answer`, R`Use 3.14 for $\pi$ to keep it simple`, R`Round to the nearest whole number each time`], a: 1, why: R`The course reports warn that rounding intermediate values can make the final answer wrong. Use the calculator memory and the $\pi$ key.` },
        { q: R`Rearrange $E_h = cm\Delta T$ for $\Delta T$.`, opts: [R`$\Delta T = E_h\, cm$`, R`$\Delta T = \dfrac{cm}{E_h}$`, R`$\Delta T = \dfrac{E_h}{cm}$`, R`$\Delta T = E_h - cm$`], a: 2, why: R`$c$ and $m$ multiply $\Delta T$, so divide both sides by $cm$.` },
        { q: R`The calculator shows $E = 1\,764\,655.58$ J. To 3 significant figures this is…`, opts: [R`$1.76 \times 10^6$ J`, R`$1.77 \times 10^6$ J`, R`$1\,764\,656$ J`, R`$1.7 \times 10^6$ J`], a: 0, why: R`The first three significant figures are 1, 7, 6 and the next digit (4) rounds down: $1.76 \times 10^6$.` },
        { type: "open", q: R`An electric heater of power 2.0 kW is switched on for 4.0 minutes to heat 1.5 kg of water. 85 % of the electrical energy ends up as heat in the water. ($c = 4180$ J kg⁻¹ K⁻¹.) Calculate the temperature rise of the water.`, marks: 3, model: mi(
          R`•1 $E_e = Pt = 2000 \times 240 = 480\,000$ J (kW converted to W, minutes to seconds)`,
          R`•2 useful energy $= 0.85 \times 480\,000 = 408\,000$ J`,
          R`•3 $\Delta T = E_h/(cm) = 408\,000 \div (4180 \times 1.5) = 65.1$ K (65.07 before rounding); unit K or °C`) },
      ],
    },
    "sys-impacts": {
      title: "Impacts, sustainability and emerging technologies",
      questions: [
        { q: R`Which is a <em>negative environmental</em> impact of an offshore wind farm?`, opts: [R`It generates electricity without burning fuel`, R`Installation disturbs the sea bed and noise from construction can harm marine life`, R`It creates maintenance jobs in a port`, R`It costs a lot to connect to the grid`], a: 1, why: R`Harm to habitats and wildlife is environmental. The others are a positive environmental, a positive economic and a negative economic effect.` },
        { q: R`A <em>renewable</em> resource is one that…`, opts: [R`has no impact on the environment`, R`can never be used up by anyone`, R`is replaced naturally on a human timescale`, R`is cheaper than every other resource`], a: 2, why: R`Renewable describes the source (wind, tide, sustainably grown timber). It does not mean harmless over the whole life cycle.` },
        { q: R`Which life-cycle stage benefits when an aluminium hull panel is recycled rather than thrown away?`, opts: [R`Only the use stage`, R`The extraction and manufacture of new material, which needs less ore and energy`, R`Neither: recycling has no benefit`, R`Only transport`], a: 1, why: R`Recycled metal replaces new ore, so less mining and less energy are needed at the start of the next cycle.` },
        { q: R`Which sentence is the strongest example of a point-explanation-consequence answer?`, opts: [R`Electric cars are good for the environment.`, R`Electric cars are green and cheap.`, R`Electric cars release no exhaust gases where they are driven, so town-centre air pollution falls, and residents suffer fewer breathing problems.`, R`Some people like electric cars.`], a: 2, why: R`It makes a point (no exhaust), explains it (so air pollution falls) and states a consequence for people (fewer breathing problems).` },
        { q: R`A factory replaces assembly workers with robots. Lost jobs are best described as…`, opts: [R`a positive environmental impact`, R`a negative social and economic impact`, R`a positive economic impact only`, R`not an impact at all`], a: 1, why: R`Loss of jobs affects people and communities (social) and their incomes (economic).` },
        { q: R`A solution is <em>sustainable</em> if it…`, opts: [R`uses the cheapest materials`, R`is never maintained`, R`meets present needs without damaging the environment or using up resources that future generations will need`, R`uses only renewable energy at the point of use`], a: 2, why: R`Sustainability balances environmental, economic and social strands across the whole life cycle, for present and future generations.` },
        { type: "open", q: R`A boatyard plans to use 3D printing (additive manufacturing) to make spare plastic fittings on demand. Discuss the possible impacts of this change.`, marks: 4, model: mi(
          R`•1 positive economic: no tooling or large stocks of spares are needed, and parts can be made when required, reducing costs and delays`,
          R`•2 positive environmental: material is added only where needed, so less waste than cutting from a block; fewer transport miles for spares`,
          R`•3 negative environmental: many printing plastics are hard to recycle, so failed prints and worn fittings may become waste; printers use energy`,
          R`•4 negative or limiting: printing is slow and limited to certain materials and sizes, and workers need new skills; plus a balanced judgement (any two impacts that are explained, one positive and one negative, with a judgement, earn the full marks)`) },
      ],
    },
  });
})();
