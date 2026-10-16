/* Pre-flight check question bank for the Drive systems & pneumatics deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML, in the style of a marking list), self-marked.
   Maths is written in KaTeX between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HE_QUIZ = Object.assign(window.HE_QUIZ || {}, {
    "mec-torque": {
      title: "Torque, power and rotation",
      questions: [
        { q: R`A force of 80 N acts at right angles at the end of a spanner 0.30 m long. What is the torque?`, opts: [R`2.4 N m`, R`24 N m`, R`240 N m`, R`267 N m`], a: 1, why: R`$T = Fr = 80 \times 0.30 = 24$ N m. 267 comes from dividing instead of multiplying.` },
        { q: R`A rope pulls with a force of 600 N on a drum of diameter 0.50 m. What torque does it apply to the drum shaft?`, opts: [R`300 N m`, R`150 N m`, R`1200 N m`, R`75 N m`], a: 1, why: R`The radius is $0.50 \div 2 = 0.25$ m, so $T = 600 \times 0.25 = 150$ N m. 300 N m is what you get by using the diameter.` },
        { q: R`A motor turns at 900 rev/min. Which value should be used for $n$ in $P = 2\pi n T$?`, opts: [R`15 rev/s`, R`900 rev/s`, R`54 000 rev/s`, R`94.2 rev/s`], a: 0, why: R`The Data Booklet formula needs revolutions per second: $900 \div 60 = 15$. 94.2 is $2\pi \times 15$, which is an angular speed in rad/s, not $n$.` },
        { q: R`A shaft carries a torque of 20 N m at 25 rev/s. What power does it transmit?`, opts: [R`500 W`, R`3 140 W`, R`188 000 W`, R`79.6 W`], a: 1, why: R`$P = 2\pi n T = 2\pi \times 25 \times 20 = 3141.6$ W. 500 W forgets the $2\pi$, and 188 000 W uses 1500 (rev/min) instead of 25.` },
        { q: R`A winch lifts a load of 2000 N at a steady 0.10 m s⁻¹ while its input power is 250 W. What is its efficiency?`, opts: [R`125%`, R`80%`, R`20%`, R`8%`], a: 1, why: R`$P_{out} = Fv = 2000 \times 0.10 = 200$ W, so $\eta = 200 \div 250 = 0.80$. 125% has the ratio upside down, and an efficiency above 100% is impossible.` },
        { q: R`In $T = Fr$, what does $r$ stand for?`, opts: [R`The diameter of the drum or wheel`, R`The perpendicular distance from the axis to the line of the force`, R`The circumference of the drum`, R`The speed in revolutions per second`], a: 1, why: R`Torque is a force times a perpendicular distance from the axis. For a rope on a drum that distance is the radius.` },
        { type: "open", q: R`A motor delivers a power of 1.5 kW while turning at 900 rev/min. Calculate the torque it delivers.`, marks: 3, model: mi(
          R`•1 $n = 900 \div 60 = 15$ rev/s`,
          R`•2 $T = \dfrac{P}{2\pi n} = \dfrac{1500}{2\pi \times 15}$ (rearranging $P = 2\pi nT$ and using 1500 W)`,
          R`•3 $T = 15.9$ N m (15.92 from the unrounded value)`) },
      ],
    },
    "mec-gears": {
      title: "Gear trains",
      questions: [
        { q: R`An 18-tooth driver gear meshes with a 54-tooth driven gear. What is the velocity ratio?`, opts: [R`3`, R`$\tfrac13$`, R`36`, R`972`], a: 0, why: R`$\text{VR} = \text{driven} \div \text{driver} = 54 \div 18 = 3$, a reduction.` },
        { q: R`A gear train has a velocity ratio of 4 and its input turns at 2400 rev/min. What is the output speed?`, opts: [R`600 rev/min`, R`9600 rev/min`, R`4 rev/min`, R`2400 rev/min`], a: 0, why: R`$\text{VR} = \text{input speed} \div \text{output speed}$, so the output is $2400 \div 4 = 600$ rev/min.` },
        { q: R`What does an idler gear between a driver and a driven gear do?`, opts: [R`It increases the velocity ratio`, R`It changes the direction of rotation of the output but not the velocity ratio`, R`It doubles the torque`, R`It reduces the efficiency to zero`], a: 1, why: R`The idler's teeth count on both sides and cancel, so the VR depends only on the first and last gears. It reverses the direction once more, so the driven gear turns the same way as the driver.` },
        { q: R`In a compound train, gear A (12 teeth) meshes with gear B (36 teeth). Gear C (10 teeth) is on the same shaft as B and meshes with gear D (40 teeth). What is the overall velocity ratio?`, opts: [R`7`, R`12`, R`16`, R`$\tfrac1{12}$`], a: 1, why: R`The stage ratios multiply: $\dfrac{36}{12} \times \dfrac{40}{10} = 3 \times 4 = 12$. Adding them (7) is a common mistake.` },
        { q: R`The input torque of a gearbox is 8 N m, its velocity ratio is 5 and its efficiency is 80%. What is the output torque?`, opts: [R`40 N m`, R`32 N m`, R`1.28 N m`, R`50 N m`], a: 1, why: R`$T_{out} = T_{in} \times \text{VR} \times \eta = 8 \times 5 \times 0.80 = 32$ N m. 40 N m ignores the losses.` },
        { q: R`Four gears A, B, C and D mesh in a line (A with B, B with C, C with D). A turns clockwise. How does D turn?`, opts: [R`Clockwise`, R`Anticlockwise`, R`It depends on the number of teeth`, R`It does not turn`], a: 1, why: R`Each mesh reverses the direction. There are three meshes (odd), so D turns the opposite way to A.` },
        { type: "open", q: R`A motor turning at 1440 rev/min with a torque of 6 N m drives a 16-tooth gear which meshes with a 48-tooth gear. The efficiency of the gears is 92%. Calculate the speed and the torque of the output shaft.`, marks: 4, model: mi(
          R`•1 $\text{VR} = 48 \div 16 = 3$`,
          R`•2 output speed $= 1440 \div 3 = 480$ rev/min`,
          R`•3 $T_{out} = T_{in} \times \text{VR} \times \eta = 6 \times 3 \times 0.92$`,
          R`•4 $T_{out} = 16.56$, so 16.6 N m`) },
        { type: "open", q: R`A reduction gearbox lowers the speed of a motor shaft. Using the equation for power, explain why the torque at the output is greater than the torque at the input.`, marks: 2, model: mi(
          R`•1 power is $2\pi nT$, and the power out is almost the same as the power in (apart from losses)`,
          R`•2 so when the speed $n$ falls by the factor VR, the torque $T$ must rise by about the same factor (a little less because of the losses)`) },
      ],
    },
    "mec-drives": {
      title: "Belts, chains, racks and worms",
      questions: [
        { q: R`A 60 mm diameter pulley turning at 1000 rev/min drives a 150 mm diameter pulley by a belt that does not slip. How fast does the larger pulley turn?`, opts: [R`2500 rev/min`, R`400 rev/min`, R`1000 rev/min`, R`160 rev/min`], a: 1, why: R`Input speed × input size = output speed × output size: $1000 \times 60 = n \times 150$, so $n = 400$ rev/min.` },
        { q: R`Which type of belt cannot slip, so keeps two shafts in exact step?`, opts: [R`Flat belt`, R`V-belt`, R`Toothed (timing) belt`, R`A crossed flat belt`], a: 2, why: R`The teeth of a toothed belt fit grooves in the pulleys, so there is no slip. Flat and V-belts rely on friction and can slip.` },
        { q: R`What is the effect of crossing an open belt between two pulleys?`, opts: [R`The pulleys turn in opposite directions`, R`The pulleys turn at the same speed`, R`The belt cannot slip any more`, R`The velocity ratio becomes 1`], a: 0, why: R`A crossed belt reverses the direction of the driven pulley. The belt rubs on itself where it crosses, so it wears faster.` },
        { q: R`A pinion of diameter 30 mm turns at 2 rev/s on a rack. What is the speed of the rack?`, opts: [R`0.094 m s⁻¹`, R`0.19 m s⁻¹`, R`0.047 m s⁻¹`, R`11 m s⁻¹`], a: 1, why: R`$v = \pi d n = \pi \times 0.030 \times 2 = 0.1885$ m s⁻¹, about 0.19. 0.094 comes from using the radius.` },
        { q: R`A two-start worm turning at 1000 rev/min drives a 40-tooth worm wheel. How fast does the wheel turn?`, opts: [R`25 rev/min`, R`50 rev/min`, R`20 rev/min`, R`2000 rev/min`], a: 1, why: R`$\text{VR} = 40 \div 2 = 20$, so the wheel turns at $1000 \div 20 = 50$ rev/min.` },
        { q: R`A worm and nut has a lead of 4 mm. The screw turns at 600 rev/min. How fast does the nut move?`, opts: [R`40 mm s⁻¹`, R`2.4 mm s⁻¹`, R`150 mm s⁻¹`, R`0.4 mm s⁻¹`], a: 0, why: R`The nut moves one lead per turn: $4 \times 600 = 2400$ mm/min, which is $2400 \div 60 = 40$ mm s⁻¹.` },
        { q: R`Why is a worm and wheel often chosen for a hoist?`, opts: [R`It is the most efficient drive`, R`It gives a large reduction, and with a shallow thread the load cannot turn the worm backwards`, R`It makes the output turn faster than the input`, R`It can never overheat`], a: 1, why: R`A worm drive gives a high ratio in one stage and is often self-locking. Its disadvantage is low efficiency, because the teeth slide.` },
        { type: "open", q: R`Name a suitable drive for each job and give a reason. (a) Two shafts 3 m apart, where a jam should not damage the motor. (b) A pump that must stay exactly in time with an engine. (c) Turning the rotation of a steering shaft into a straight-line movement.`, marks: 3, model: mi(
          R`•1 (a) a belt (flat or V), which can span a long distance, and slips if the load jams`,
          R`•2 (b) a toothed belt or a chain, which cannot slip and so keeps an exact ratio`,
          R`•3 (c) rack and pinion, which turns rotation directly into straight-line motion`) },
      ],
    },
    "mec-couplings": {
      title: "Couplings, bearings, brakes and clutches",
      questions: [
        { q: R`What is a flexible coupling used for?`, opts: [R`To change the speed of a shaft`, R`To allow small misalignment and absorb shock and vibration between two shafts`, R`To carry loads along a shaft`, R`To stop a shaft turning`], a: 1, why: R`A flexible coupling has an elastic element. A rigid coupling would need perfect alignment and would pass shocks on.` },
        { q: R`What type of load does a thrust bearing carry?`, opts: [R`A load acting across the shaft, at right angles to its axis`, R`A load acting along the shaft, parallel to its axis`, R`Only torque`, R`No load at all`], a: 1, why: R`A thrust bearing carries axial load, such as the sideways push from a worm. A radial bearing carries load across the shaft.` },
        { q: R`Which type of bearing gives line contact between the rolling parts and the rings?`, opts: [R`Ball bearing`, R`Plain journal bearing`, R`Roller bearing`, R`Thrust ball bearing`], a: 2, why: R`Cylindrical rollers touch the rings along a line, which spreads the load better than the point contact of balls.` },
        { q: R`When a brake slows a machine, what happens to the machine's kinetic energy?`, opts: [R`It is destroyed`, R`It is converted into heat by friction`, R`It is stored as potential energy`, R`It is converted into light`], a: 1, why: R`Energy cannot be destroyed. Friction between the pad and the disc turns kinetic energy into heat.` },
        { q: R`A car of mass 800 kg at 10 m s⁻¹ is braked to rest. All the kinetic energy becomes heat in 8 kg of steel with $c = 490$ J kg⁻¹ K⁻¹. What is the temperature rise?`, opts: [R`5.1 K`, R`10.2 K`, R`20.4 K`, R`102 K`], a: 1, why: R`$E_k = \tfrac12 \times 800 \times 10^2 = 40\,000$ J. $\Delta T = \dfrac{E_h}{cm} = \dfrac{40000}{490 \times 8} = 10.2$ K.` },
        { q: R`Which statement describes how a friction clutch engages?`, opts: [R`The plates lock instantly with no slipping`, R`The plates slip while their speeds differ, then lock when the speeds match`, R`The plates never touch`, R`The driven shaft always turns faster than the driving shaft`], a: 1, why: R`Slipping lets the driven shaft come up to speed gently. Once the speeds match, the plates lock together and carry the torque without slip.` },
        { type: "open", q: R`Explain why friction is wanted in a brake, but is a problem in a bearing.`, marks: 4, model: mi(
          R`•1 in a brake, friction between the pad and the disc (or drum) produces a force that opposes the motion`,
          R`•2 so the kinetic energy of the machine is converted to heat and the machine slows down`,
          R`•3 in a bearing, friction wastes energy as heat and causes wear`,
          R`•4 so bearings use rolling balls or rollers, or an oil film, to keep friction low`) },
      ],
    },
    "mec-pneu1": {
      title: "Pneumatics I: air, cylinders and valves",
      questions: [
        { q: R`A double-acting cylinder has a bore of 40 mm and is supplied at 5 bar gauge. What force does it produce on the outstroke?`, opts: [R`314 N`, R`628 N`, R`2 513 N`, R`1 257 N`], a: 1, why: R`$A = \pi D^2/4 = \pi \times 0.040^2 / 4 = 1.257 \times 10^{-3}$ m², and $F = PA = 5 \times 10^5 \times 1.257 \times 10^{-3} = 628$ N.` },
        { q: R`Why is the force on the instroke less than on the outstroke at the same pressure?`, opts: [R`The pressure is lower on the instroke`, R`The piston rod reduces the area the air acts on`, R`The piston is heavier`, R`Air is less dense on the instroke`], a: 1, why: R`On the instroke air acts on the annulus $\pi(D^2 - d^2)/4$, which is smaller than $\pi D^2/4$. $F = PA$, so the force is smaller.` },
        { q: R`What are the numbers in "5/2 valve"?`, opts: [R`5 ports and 2 positions`, R`5 pistons and 2 cylinders`, R`5 bar and 2 bar`, R`5 states and 2 ports`], a: 0, why: R`The first number is the number of ports, the second the number of positions (states).` },
        { q: R`Which sentence uses the correct terminology?`, opts: [R`The valve opens and the cylinder goes forward.`, R`The 3/2 valve actuates, the 5/2 valve changes state and the piston outstrokes.`, R`The 5/2 valve actuates and the piston instrokes forward.`, R`The 3/2 valve changes state and the piston is pushed.`], a: 1, why: R`The 2026 report advice: 3/2 valves actuate, 5/2 valves change state, pistons instroke or outstroke.` },
        { q: R`Which part of a compressed-air system stores the air and smooths out the pulses from the compressor?`, opts: [R`The filter`, R`The air receiver`, R`The regulator`, R`The exhaust silencer`], a: 1, why: R`The air receiver is the storage tank. The filter cleans, the regulator sets the pressure and the silencer quietens the exhaust.` },
        { q: R`What is a flow control valve fitted for?`, opts: [R`To set the speed of the piston by restricting the air flow`, R`To store air`, R`To change the direction of the cylinder`, R`To make the cylinder stronger`], a: 0, why: R`Restricting the exhaust air gives a controlled, smoother piston speed instead of a slam.` },
        { q: R`A force of 1200 N acts on a piston of area 0.0020 m². What is the pressure?`, opts: [R`0.0017 Pa`, R`600 000 Pa`, R`2.4 Pa`, R`60 000 Pa`], a: 1, why: R`$P = F/A = 1200 \div 0.0020 = 600\,000$ Pa, or 6 bar.` },
        { type: "open", q: R`A double-acting cylinder has a bore of 63 mm and a piston rod of diameter 20 mm. It is supplied with air at 6 bar gauge. Calculate the force on the instroke.`, marks: 4, model: mi(
          R`•1 $P = 6 \times 10^5$ Pa`,
          R`•2 $A = \pi(D^2 - d^2)/4 = \pi(0.063^2 - 0.020^2)/4$`,
          R`•3 $A = 2.80 \times 10^{-3}$ m²`,
          R`•4 $F = PA = 6 \times 10^5 \times 2.803 \times 10^{-3} = 1680$ N (1682 from the unrounded area)`) },
      ],
    },
    "mec-pneu2": {
      title: "Pneumatics II: sequential circuits",
      questions: [
        { q: R`In a sequence, what does "B−" mean?`, opts: [R`Cylinder B outstrokes`, R`Cylinder B instrokes`, R`Valve B is switched off`, R`Cylinder B is removed`], a: 1, why: R`A plus sign means the piston outstrokes and a minus sign means it instrokes.` },
        { q: R`In the circuit for A+ B+ A− B−, which limit valve fires step 2 (B+)?`, opts: [R`a1`, R`a0`, R`b1`, R`b0`], a: 0, why: R`Step 2 is started by the end of step 1. A has just outstroked, so roller valve a1 is pressed and it supplies pilot 14 of valve B.` },
        { q: R`In the circuit for A+ B+ A− B−, which limit valve fires step 4 (B−)?`, opts: [R`a1`, R`a0`, R`b1`, R`b0`], a: 1, why: R`Step 3 was A−, which ends with A fully in, pressing a0. That signal goes to pilot 12 of valve B.` },
        { q: R`In the sequence A+ B+ C+ A− B− C−, which limit valve starts step 6 (C−)?`, opts: [R`c1`, R`b0`, R`a0`, R`b1`], a: 1, why: R`Step 5 was B−, which ends when B is fully in, pressing b0. It feeds the pilot that instrokes C.` },
        { q: R`The circuit for A+ B+ B− A− built with plain roller valves jams. What is the cause?`, opts: [R`There is not enough air pressure`, R`A held limit-valve signal is still present, so a double-pilot valve has air on both pilots at once`, R`The pistons are too heavy`, R`The START button is faulty`], a: 1, why: R`With plain rollers a1 stays pressed while B needs to return, so valve B has opposing pilot signals and cannot change state.` },
        { q: R`What does a one-way trip (idle-return) roller do?`, opts: [R`It operates the valve only when the piston passes in one direction, giving a short pulse`, R`It makes the piston move one way`, R`It reduces the pressure`, R`It holds the valve operated`], a: 0, why: R`A pulse removes the held signal, which cures the conflict between opposing pilot signals.` },
        { q: R`On a displacement–step diagram for A+ B+ A− B−, what happens to cylinder A at step 3?`, opts: [R`It outstrokes`, R`It instrokes`, R`It stays still`, R`It is removed from the circuit`], a: 1, why: R`Step 3 is A−, so the line for A falls. A stays out during step 2 while B moves.` },
        { type: "open", q: R`A circuit gives the sequence B+ A+ B− A− using a double-pilot 5/2 valve on each cylinder, and limit valves a0, a1, b0 and b1. Describe the operation of the circuit, starting from rest.`, marks: 6, model: mi(
          R`•1 START is pressed and actuates (with a0 already pressed), supplying air to pilot 14 of 5/2 valve B`,
          R`•2 valve B changes state and piston B outstrokes`,
          R`•3 piston B actuates b1, which supplies pilot 14 of valve A; valve A changes state and piston A outstrokes`,
          R`•4 piston A actuates a1, which supplies pilot 12 of valve B; valve B changes state and piston B instrokes`,
          R`•5 piston B actuates b0, which supplies pilot 12 of valve A; valve A changes state and piston A instrokes`,
          R`•6 the cycle is complete with both pistons in; the circuit waits for START to be pressed again. (Terminology: 3/2 valves actuate, 5/2 valves change state, pistons outstroke and instroke.)`) },
      ],
    },
    "mec-ep": {
      title: "Electro-pneumatics",
      questions: [
        { q: R`What operates a solenoid valve?`, opts: [R`A pilot air signal only`, R`An electromagnet (coil) that moves the valve when current flows`, R`A roller on the piston rod`, R`A spring only`], a: 1, why: R`A solenoid is a coil that becomes an electromagnet when current flows and moves the valve spool.` },
        { q: R`How does a reed switch on a cylinder barrel detect the piston?`, opts: [R`A magnet in the piston closes the sealed reeds as it passes`, R`The piston presses on a roller`, R`It measures the air pressure`, R`It measures the temperature of the piston`], a: 0, why: R`The reeds are sealed in glass. A magnet fixed to the piston closes them without any mechanical contact.` },
        { q: R`What does a relay do?`, opts: [R`Stores compressed air`, R`Lets a small current through its coil close contacts in another circuit`, R`Changes the voltage of the supply`, R`Counts the strokes of a cylinder`], a: 1, why: R`A relay is an electromagnetic switch. One coil can operate several contacts, handle a larger load and latch itself on.` },
        { q: R`In a ladder diagram, how do two contacts in series on one rung behave?`, opts: [R`As AND: both must be closed for the coil to operate`, R`As OR: either one is enough`, R`As NOT`, R`They have no effect on the coil`], a: 0, why: R`Series contacts must all be closed for current to flow, which is AND logic. Parallel contacts behave as OR.` },
        { q: R`How is a relay latched on, so that it stays energised after START is released?`, opts: [R`One of its own contacts is wired in parallel with START`, R`A second START button is held`, R`The STOP button is wired in parallel with START`, R`The valve is fitted with a spring`], a: 0, why: R`The relay's own contact keeps the rung live after START is released. A normally closed STOP button in series breaks the latch.` },
        { q: R`Give an advantage of electro-pneumatic control over pure pneumatic control.`, opts: [R`It needs no electrical supply`, R`Signals travel fast over long distances and the sequence is easy to change by rewiring`, R`It cannot cause sparks`, R`It needs fewer components`], a: 1, why: R`Electrical signals are fast and the control can be altered or extended by changing wiring. Pure pneumatics needs no electricity, and that is its advantage.` },
        { q: R`Which control suits a paint-spraying booth full of solvent vapour best?`, opts: [R`Pure pneumatic control, because it makes no sparks`, R`Electro-pneumatic control with relays at the machine`, R`Any control, as they are all equally safe`, R`Electric heaters`], a: 0, why: R`A pneumatic circuit has no electrical contacts at the machine, so there is nothing to ignite the vapour.` },
        { type: "open", q: R`A machine is controlled by a relay K1. Describe how a latching circuit keeps the machine running after the START button is released, and how it is stopped.`, marks: 4, model: mi(
          R`•1 pressing START energises the relay coil K1`,
          R`•2 a contact of K1, wired in parallel with START, closes`,
          R`•3 after START is released, current still flows through the K1 contact, so K1 stays energised (it is latched)`,
          R`•4 a normally closed STOP button in series is pressed to break the circuit; K1 de-energises, its contact opens, and it stays off until START is pressed again`) },
      ],
    },
  });
})();
