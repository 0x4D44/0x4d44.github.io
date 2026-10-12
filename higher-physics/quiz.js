/* Pre-flight check question bank for Shot, Spark & Starlight.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked.
   Numerical values use the data sheet: g = 9.8 m s⁻², c = 3.00 × 10⁸ m s⁻¹,
   h = 6.63 × 10⁻³⁴ J s, e = 1.60 × 10⁻¹⁹ C, H₀ = 2.3 × 10⁻¹⁸ s⁻¹. */
window.HP_QUIZ = {
  /* ======================= OUR DYNAMIC UNIVERSE ======================= */
  "odu-suvat": {
    title: "Equations of motion",
    questions: [
      { q: "A trolley starts from rest and accelerates uniformly at 0.50 m s⁻² for 6.0 s. How far does it travel?", opts: ["1.5 m", "3.0 m", "9.0 m", "18 m", "36 m"], a: 2, why: "s = ut + ½at² = 0 + ½ × 0.50 × 6.0² = 9.0 m." },
      { q: "You know u, v and s and want a. Which equation should you use?", opts: ["v² = u² + 2as", "s = ut + ½at²", "v = u + at", "s = ½(u + v)t", "d = v̄t"], a: 0, why: "t is not involved, and v² = u² + 2as is the only equation without t." },
      { q: "A ball is thrown vertically upwards at 14.7 m s⁻¹. Taking up as positive, what are its velocity and acceleration 1.5 s later?", opts: ["v = 0, a = −9.8 m s⁻²", "v = 0, a = 0", "v = 14.7 m s⁻¹, a = −9.8 m s⁻²", "v = −14.7 m s⁻¹, a = +9.8 m s⁻²", "v = 0, a = +9.8 m s⁻²"], a: 0, why: "v = u + at = 14.7 − 9.8 × 1.5 = 0: it is at the top. The acceleration is still −9.8 m s⁻²; gravity does not switch off." },
      { type: "open", q: "A cadet drops a stone from rest down a well. It hits the water 2.4 s later. Ignoring air resistance, calculate how far it falls.", marks: 3, model: "<ul><li><b>s = ut + ½at²</b> (1)</li><li>s = 0 × 2.4 + ½ × 9.8 × 2.4² (1)</li><li><b>s = 28 m</b> (28.2 m) (1)</li></ul><p>Accept 30 m, 28 m, 28.2 m or 28.22 m (from one fewer to two more significant figures than the data). No unit, no final mark.</p>" },
      { q: "A ship sails 3.0 km north, then 4.0 km east. What is its displacement?", opts: ["7.0 km", "7.0 km on a bearing of 053", "5.0 km on a bearing of 037", "1.0 km", "5.0 km on a bearing of 053"], a: 4, why: "Pythagoras: √(3.0² + 4.0²) = 5.0 km. Angle east of north: tan⁻¹(4.0/3.0) = 53°, a bearing of 053." },
    ],
  },
  "odu-graphs": {
    title: "Motion graphs",
    questions: [
      { q: "What does the area under a velocity–time graph represent?", opts: ["displacement", "acceleration", "speed", "force", "momentum"], a: 0, why: "Area under v–t = displacement. (The gradient of v–t is acceleration.)" },
      { q: "A ball is dropped and bounces several times. Taking upwards as positive, what does the acceleration–time graph look like while the ball is in the air?", opts: ["a horizontal line at +9.8 m s⁻²", "a saw-tooth", "a line that slopes down", "zero", "a horizontal line at −9.8 m s⁻²"], a: 4, why: "In flight the only force is gravity, so a = −9.8 m s⁻² (with up positive), as a flat line. The saw-tooth shape belongs to the velocity–time graph." },
      { q: "A v–t graph is a straight line from +8 m s⁻¹ at t = 0 to −4 m s⁻¹ at t = 6 s. What is the displacement after 6 s?", opts: ["+12 m", "+16 m", "+20 m", "+24 m", "+36 m"], a: 0, why: "It crosses zero at t = 4 s. Area above = ½ × 4 × 8 = 16 m; area below = ½ × 2 × 4 = 4 m. Displacement = 16 − 4 = +12 m. (The distance travelled is 20 m.)" },
      { type: "open", q: "Describe how you would use two light gates to measure the acceleration of a trolley down a slope. State the measurements you would make and how you would use them.", marks: 3, model: "<ul><li>Card of known length L on the trolley; measure L with a ruler. Two light gates on the slope, connected to a timer. (1)</li><li>Measure the time the card takes to pass each gate (t₁, t₂) and the time to travel between the gates (t₃). (1)</li><li>u = L/t₁, v = L/t₂, a = (v − u)/t₃; repeat and average. (1)</li></ul><p>A motion sensor method (computer plots v–t; a = gradient) earns equivalent marks.</p>" },
      { q: "A ball is dropped and bounces several times, each bounce lower. Taking up as positive and measuring height from the floor, what does its displacement–time graph look like?", opts: ["a single straight line sloping down", "a row of equal arches", "a saw-tooth of straight lines", "a horizontal line", "a row of arches, each lower than the last, touching zero at each bounce"], a: 4, why: "Each flight is a curved arch (gradient = velocity, zero at the top). It touches s = 0 at each bounce, and energy lost at each bounce makes every arch lower. The saw-tooth is the v–t graph." },
    ],
  },
  "odu-forces": {
    title: "Forces and Newton's laws",
    questions: [
      { q: "A 1200 kg ship's boat is pulled by a force of 900 N against a total friction of 300 N. What is its acceleration?", opts: ["0.25 m s⁻²", "0.50 m s⁻²", "0.75 m s⁻²", "1.0 m s⁻²", "2.0 m s⁻²"], a: 1, why: "Unbalanced force = 900 − 300 = 600 N. a = F/m = 600/1200 = 0.50 m s⁻²." },
      { q: "A block of mass 5.0 kg is on a slope at 30° to the horizontal. What is the component of its weight acting down the slope?", opts: ["2.5 N", "25 N", "42 N", "49 N", "98 N"], a: 1, why: "mg sin θ = 5.0 × 9.8 × sin 30° = 25 N (unrounded: 24.5 N). (mg cos θ = 42 N is the component into the slope.)" },
      { q: "A lift is moving downwards and slowing down. How does the tension in the cable compare with the weight of the lift?", opts: ["tension is greater than the weight", "tension equals the weight", "tension is less than the weight", "tension is zero", "it depends on the speed"], a: 0, why: "Slowing while moving down means the acceleration is upwards, so the unbalanced force is upwards: T > mg." },
      { q: "A crate is pulled UP a slope at a steady speed. Which statement is correct?", opts: ["Friction acts up the slope", "The pulling force equals mg sin θ minus friction", "There is no unbalanced force, so there is no friction", "The pulling force equals mg cos θ", "The pulling force equals mg sin θ plus friction"], a: 4, why: "Moving up the slope, friction acts down the slope, in the same direction as mg sin θ. Steady speed means balanced forces, so the pull = mg sin θ + friction." },
      { type: "open", q: "A skydiver reaches terminal velocity. Explain, in terms of the forces acting, why the skydiver's velocity stops increasing.", marks: 2, model: "<ul><li>As the speed increases, air resistance increases until it is equal (in size) to the weight. (1)</li><li>The forces are then balanced, so the unbalanced force is zero and there is no acceleration: the velocity stays constant (Newton's first law). (1)</li></ul>" },
      { q: "A skydiver falling at terminal velocity opens the parachute. Immediately afterwards, the skydiver…", opts: ["slows down, because air resistance is now greater than weight", "speeds up", "keeps the same speed", "stops", "falls with acceleration g"], a: 0, why: "The parachute greatly increases air resistance, so the upward force exceeds the weight and there is an unbalanced force upwards: the skydiver decelerates until a new, lower terminal velocity." },
      { q: "A cadet pushes a wall with a force of 50 N. According to Newton's third law, the wall…", opts: ["pushes the cadet with 50 N in the opposite direction", "pushes the cadet with 0 N", "pushes the cadet with less than 50 N", "accelerates away from the cadet", "pushes the cadet with 50 N in the same direction"], a: 0, why: "Newton's third law: if A exerts a force on B, B exerts an equal and opposite force on A. The two forces act on different objects." },
    ],
  },
  "odu-energy": {
    title: "Work, energy and power",
    questions: [
      { q: "A 60 kg cadet climbs the rigging 15 m up the mainmast in 30 s. What is the minimum average power needed?", opts: ["30 W", "18 000 W", "450 W", "8800 W", "290 W"], a: 4, why: "E<sub>p</sub> = mgh = 60 × 9.8 × 15 = 8820 J. P = E/t = 8820/30 = 290 W (unrounded: 294 W)." },
      { q: "The speed of a minecart doubles. Its kinetic energy is multiplied by…", opts: ["½", "1", "2", "8", "4"], a: 4, why: "E<sub>k</sub> = ½mv², so doubling v multiplies E<sub>k</sub> by 2² = 4." },
      { q: "A 2.0 kg block slides 4.0 m across the deck and stops. Its initial speed was 3.0 m s⁻¹. What was the average friction force?", opts: ["1.5 N", "2.3 N", "4.5 N", "9.0 N", "18 N"], a: 1, why: "E<sub>k</sub> lost = ½ × 2.0 × 3.0² = 9.0 J = work done against friction. F = E/d = 9.0/4.0 = 2.3 N (unrounded: 2.25 N)." },
      { type: "open", q: "A 0.50 kg ball is dropped from 3.2 m. Ignoring air resistance, use conservation of energy to calculate its speed just before it hits the ground.", marks: 3, model: "<ul><li>mgh = ½mv² (1)</li><li>0.50 × 9.8 × 3.2 = ½ × 0.50 × v² (1)</li><li><b>v = 7.9 m s⁻¹</b> (1)</li></ul>" },
    ],
  },
  "odu-collisions": {
    title: "Momentum and impulse",
    questions: [
      { q: "Which statement of the law of conservation of momentum would gain the mark?", opts: ["The total momentum before a collision equals the total momentum after, in the absence of external forces", "The momentum of each object stays the same in a collision", "Momentum is always conserved", "Kinetic energy before equals kinetic energy after", "Momentum equals mass times velocity"], a: 0, why: "The statement must say TOTAL momentum and mention the absence of external forces. The examiners note that candidates often miss one of these." },
      { q: "In an inelastic collision…", opts: ["momentum is lost but kinetic energy is conserved", "both momentum and kinetic energy are conserved", "both momentum and kinetic energy decrease", "the objects must stick together", "total momentum is conserved but total kinetic energy decreases"], a: 4, why: "Total momentum is conserved in every collision (no external forces). Inelastic means kinetic energy decreases. The objects may still bounce apart." },
      { q: "A 0.15 kg ball hits a wall at 10 m s⁻¹ and rebounds at 6.0 m s⁻¹. What is the size of its change in momentum?", opts: ["0.60 kg m s⁻¹", "0.90 kg m s⁻¹", "1.5 kg m s⁻¹", "2.4 kg m s⁻¹", "16 kg m s⁻¹"], a: 3, why: "Taking towards the wall as positive: Δp = m(v − u) = 0.15 × (−6.0 − 10) = −2.4 kg m s⁻¹, so its size is 2.4 kg m s⁻¹. Forgetting the direction gives 0.60, which is wrong." },
      { q: "The area under a force–time graph for a collision is equal to…", opts: ["the change in momentum", "the kinetic energy lost", "the average force", "the work done", "the power"], a: 0, why: "Area under F–t = impulse = change in momentum." },
      { type: "open", q: "A 4.0 kg rifle fires a 0.010 kg bullet at 400 m s⁻¹. Calculate the recoil velocity of the rifle.", marks: 3, model: "<ul><li>Total momentum before = total momentum after: 0 = m₁v₁ + m₂v₂ (1)</li><li>0 = (0.010 × 400) + (4.0 × v) (1)</li><li><b>v = −1.0 m s⁻¹</b>, i.e. 1.0 m s⁻¹ in the opposite direction to the bullet (1)</li></ul>" },
      { q: "A force–time graph for a kick is a triangle peaking at 400 N, lasting 0.050 s. What is the impulse on the ball?", opts: ["0.10 N s", "10 N s", "20 N s", "200 N s", "8000 N s"], a: 1, why: "Impulse = area under the F–t graph = ½ × 0.050 × 400 = 10 N s." },
      { q: "The kick in the previous question lasts 0.050 s and gives an impulse of 10 N s. What is the average force on the ball?", opts: ["0.50 N", "10 N", "20 N", "200 N", "400 N"], a: 3, why: "Average force = impulse ÷ time = 10 ÷ 0.050 = 200 N, half the peak for a triangular graph." },
      { q: "A 4.0 kg cannon at rest fires a 0.10 kg ball forwards at 80 m s⁻¹. Which statement is correct?", opts: ["The cannon recoils at 2.0 m s⁻¹ and the total kinetic energy after is 328 J", "The cannon recoils at 80 m s⁻¹", "Momentum and kinetic energy are both zero after", "The cannon recoils at 2.0 m s⁻¹ and kinetic energy is conserved", "The cannon does not move"], a: 0, why: "Momentum: 0 = 0.10 × 80 − 4.0v, so v = 2.0 m s⁻¹. Kinetic energy after = ½ × 0.10 × 80² + ½ × 4.0 × 2.0² = 320 + 8 = 328 J, all from the powder's chemical energy. In an explosion the total kinetic energy increases (stored chemical energy becomes kinetic), so E<sub>k</sub> is not conserved." },
    ],
  },
  "odu-projectiles": {
    title: "Projectiles",
    questions: [
      { q: "A ball is thrown horizontally from a cliff. Ignoring air resistance, which quantity stays constant during its flight?", opts: ["its speed", "its vertical velocity", "its kinetic energy", "its displacement", "its horizontal velocity"], a: 4, why: "There is no horizontal force, so the horizontal velocity is constant. The vertical velocity increases downwards." },
      { q: "A package is dropped from an aircraft flying horizontally at 60 m s⁻¹, 500 m up. At the same moment a stone is dropped from rest from a stationary balloon at the same height. Ignoring air resistance…", opts: ["the package lands first", "the stone lands first", "it depends on their masses", "the package never lands", "they land at the same time"], a: 4, why: "Vertical motion is independent of horizontal motion. Both start with zero vertical velocity and fall 500 m with a = 9.8 m s⁻²." },
      { q: "A shot is fired at 30 m s⁻¹ at 60° above the horizontal. What is the horizontal component of its velocity?", opts: ["15 m s⁻¹", "17 m s⁻¹", "26 m s⁻¹", "30 m s⁻¹", "52 m s⁻¹"], a: 0, why: "u<sub>h</sub> = u cos θ = 30 cos 60° = 15 m s⁻¹. (The vertical component is 30 sin 60° = 26 m s⁻¹.)" },
      { type: "open", q: "A ball rolls horizontally off a table 0.80 m high at 2.5 m s⁻¹. Calculate how far from the table it lands.", marks: 4, model: "<ul><li>Vertically: s = ut + ½at², 0.80 = 0 + ½ × 9.8 × t² (1)</li><li>t = 0.40 s (1)</li><li>Horizontally: d = v̄t = 2.5 × 0.40 (1)</li><li><b>d = 1.0 m</b> (1)</li></ul>" },
    ],
  },
  "odu-gravity": {
    title: "Gravity and satellites",
    questions: [
      { q: "Why does a satellite stay in orbit?", opts: ["It is in free fall: it falls towards the planet, but its horizontal velocity carries it round", "Its engines balance gravity", "There is no gravity in space", "The centrifugal force balances gravity exactly", "The Moon pulls it outwards"], a: 0, why: "A satellite is in free fall around the planet. Gravity is the only force acting on it." },
      { q: "The distance between the centres of two masses is tripled. The gravitational force between them becomes…", opts: ["three times bigger", "the same", "one third", "one sixth", "one ninth"], a: 4, why: "F ∝ 1/r². Tripling r divides F by 3² = 9." },
      { q: "A ball falls from rest through 1.25 m in 0.505 s. What value of g does this give?", opts: ["4.9 m s⁻²", "9.6 m s⁻²", "9.8 m s⁻²", "9.9 m s⁻²", "10.4 m s⁻²"], a: 2, why: "h = ½gt², so g = 2h/t² = 2 × 1.25 / 0.505² = 9.80 m s⁻²." },
      { type: "open", q: "Calculate the gravitational force between the Sun (2.0 × 10³⁰ kg) and the Earth (6.0 × 10²⁴ kg). The distance between their centres is 1.5 × 10¹¹ m.", marks: 3, model: "<ul><li>F = Gm₁m₂/r² (1)</li><li>F = 6.67 × 10⁻¹¹ × 2.0 × 10³⁰ × 6.0 × 10²⁴ / (1.5 × 10¹¹)² (1)</li><li><b>F = 3.6 × 10²² N</b> (1)</li></ul>" },
      { type: "open", q: "Describe an experiment to determine the gravitational field strength g using a falling object. Include the measurements you would make and how you would use them.", marks: 3, model: "<ul><li>Drop an object from rest from a measured height h (metre stick), timing the fall with an electronic timer/light gates or a data logger. (1)</li><li>Repeat for a range of heights, with repeated readings at each. (1)</li><li>Plot h against t²: the gradient is ½g, so g = 2 × gradient (or use s = ut + ½at² with u = 0 for each height). (1)</li></ul><p>Describe questions want apparatus, what you measure and with what, and how you get the result.</p>" },
    ],
  },
  "odu-relativity": {
    title: "Special relativity",
    questions: [
      { q: "Special relativity is based on the observation that…", opts: ["the speed of light in a vacuum is the same for all observers", "lengths are the same for all observers", "time is the same for all observers", "nothing can move faster than sound", "mass is always conserved"], a: 0, why: "The constancy of the speed of light for all observers forces time and length measurements to depend on the observer." },
      { q: "A spacecraft passes Earth at 0.60c. Its clock measures 4.0 minutes for an event aboard. How long does the event take as measured from Earth?", opts: ["2.4 min", "3.2 min", "4.0 min", "5.0 min", "6.7 min"], a: 3, why: "√(1 − 0.6²) = 0.80. t′ = t / 0.80 = 4.0 / 0.80 = 5.0 min." },
      { q: "A rod is 2.0 m long when at rest. How long is it measured by an observer it passes at 0.80c, along its length?", opts: ["0.72 m", "1.2 m", "1.6 m", "2.0 m", "3.3 m"], a: 1, why: "l′ = l√(1 − v²/c²) = 2.0 × 0.60 = 1.2 m." },
      { type: "open", q: "Muons last 2.2 μs in their own frame of reference. A muon travels at 0.98c. Calculate its lifetime as measured by an observer on Earth.", marks: 3, model: "<ul><li>t′ = t / √(1 − v²/c²) (1)</li><li>t′ = 2.2 × 10⁻⁶ / √(1 − 0.98²) (1)</li><li><b>t′ = 1.1 × 10⁻⁵ s</b> (11 μs) (1)</li></ul>" },
    ],
  },
  "odu-doppler": {
    title: "Doppler effect and redshift",
    questions: [
      { q: "A source emitting 500 Hz moves towards a stationary listener at 40 m s⁻¹. The speed of sound is 340 m s⁻¹. What frequency is heard?", opts: ["447 Hz", "459 Hz", "500 Hz", "559 Hz", "567 Hz"], a: 4, why: "Approaching: f<sub>o</sub> = f<sub>s</sub> × v/(v − v<sub>s</sub>) = 500 × 340/300 = 567 Hz." },
      { q: "Light from a galaxy is redshifted. This means the galaxy is…", opts: ["hotter than the Sun", "cooler than the Sun", "moving towards us", "made mostly of hydrogen", "moving away from us"], a: 4, why: "Redshift: the observed wavelength is longer than the emitted wavelength because the source is moving away." },
      { q: "A spectral line emitted at 486 nm is observed at 510 nm. What is the redshift?", opts: ["0.047", "0.049", "0.95", "1.05", "24"], a: 1, why: "z = (510 − 486)/486 = 24/486 = 0.049." },
      { type: "open", q: "Explain, in terms of wavefronts, why the frequency of sound heard from an approaching source is higher than the frequency emitted.", marks: 2, model: "<ul><li>The source moves towards the observer between emitting successive wavefronts, so the wavefronts arrive closer together (shorter wavelength). (1)</li><li>The speed of the sound is unchanged, so more wavefronts reach the observer each second: a higher frequency (f = v/λ). (1)</li></ul>" },
    ],
  },
  "odu-universe": {
    title: "The expanding Universe",
    questions: [
      { q: "A galaxy has a recessional velocity of 6.9 × 10⁶ m s⁻¹. Using H₀ = 2.3 × 10⁻¹⁸ s⁻¹, how far away is it?", opts: ["3.3 × 10⁻²⁵ m", "1.6 × 10⁻¹¹ m", "1.6 × 10¹³ m", "3.0 × 10¹⁸ m", "3.0 × 10²⁴ m"], a: 4, why: "d = v/H₀ = 6.9 × 10⁶ ÷ (2.3 × 10⁻¹⁸) = 3.0 × 10²⁴ m." },
      { q: "The evidence for dark matter comes from…", opts: ["the accelerating expansion of the Universe", "the cosmic microwave background", "estimates of the mass of galaxies from the orbital speeds of their stars", "the redshift of galaxies", "the abundance of helium"], a: 2, why: "Stars orbit too fast for the visible mass to hold them, so galaxies must contain unseen mass." },
      { q: "Star X has a shorter peak wavelength than star Y. Which statement is correct?", opts: ["X is hotter than Y and emits more radiation per unit area per unit time", "X is cooler than Y", "X is moving away from us faster than Y", "X is further away than Y", "X is redder than Y"], a: 0, why: "Hotter objects have a shorter peak wavelength and emit more radiation per unit surface area per unit time." },
      { q: "Which of these is NOT evidence for the Big Bang?", opts: ["the cosmic microwave background", "the abundance of hydrogen and helium", "the darkness of the night sky", "most galaxies showing redshift", "the orbital speeds of stars in galaxies"], a: 4, why: "Orbital speeds of stars are the evidence for dark matter, not for the Big Bang." },
      { type: "open", q: "Evidence suggests that the expansion of the Universe is accelerating. State what is thought to be responsible for this, and explain why the acceleration was a surprise.", marks: 2, model: "<ul><li>Dark energy. (1)</li><li>Gravity (the attraction between all the matter in the Universe) would be expected to slow the expansion down. (1)</li></ul>" },
      { q: "A galaxy has a redshift z = 0.020. What is its speed of recession?", opts: ["6.0 × 10⁴ m s⁻¹", "2.0 × 10⁶ m s⁻¹", "6.0 × 10⁶ m s⁻¹", "3.0 × 10⁸ m s⁻¹", "1.5 × 10¹⁰ m s⁻¹"], a: 2, why: "For v ≪ c, z = v/c, so v = zc = 0.020 × 3.00 × 10⁸ = 6.0 × 10⁶ m s⁻¹." },
    ],
  },
  /* ======================= PARTICLES AND WAVES ======================= */
  "pw-efields": {
    title: "Charges in electric fields",
    questions: [
      { q: "Which statement defines a potential difference of 1 volt between two points?", opts: ["1 joule of work is done per coulomb of charge moved between the points", "1 coulomb passes per second", "1 joule of energy is stored per second", "1 newton of force acts on 1 coulomb", "1 ampere flows through 1 ohm"], a: 0, why: "Potential difference is the work done per unit charge: 1 V = 1 J C⁻¹." },
      { q: "An electron is released between two charged parallel plates. Which way does it move?", opts: ["along the field lines, towards the negative plate", "it stays still", "parallel to the plates", "towards the positive plate, against the field lines", "in a circle"], a: 3, why: "Field lines show the force on a positive charge. An electron is negative, so it is pushed the opposite way: towards the positive plate." },
      { q: "A proton and an electron are each accelerated from rest through the same potential difference. Which statement is correct?", opts: ["They gain the same kinetic energy; the electron ends up faster", "They gain the same kinetic energy and the same speed", "The proton gains more kinetic energy", "The electron gains more kinetic energy", "Neither gains energy"], a: 0, why: "W = QV and the charges have the same size, so the energies are equal. The electron is far less massive, so ½mv² gives it a much larger speed." },
      { type: "open", q: "An alpha particle (charge 3.2 × 10⁻¹⁹ C) is accelerated from rest through 1500 V. Calculate the kinetic energy it gains.", marks: 3, model: "<ul><li>W = QV (1)</li><li>W = 3.2 × 10⁻¹⁹ × 1500 (1)</li><li><b>W = 4.8 × 10⁻¹⁶ J</b> (1)</li></ul>" },
    ],
  },
  "pw-bfields": {
    title: "Magnetic fields and accelerators",
    questions: [
      { q: "In a particle accelerator, what is the job of the magnetic fields?", opts: ["to accelerate the particles", "to detect the particles", "to slow the particles down", "to create the particles", "to deflect (steer) the particles"], a: 4, why: "Electric fields accelerate the particles; magnetic fields deflect them, for example into a circular path." },
      { q: "An electron moves to the right through a magnetic field directed into the page. Using the right-hand rule for negative charges, which way is the force on it?", opts: ["up the page", "down the page", "into the page", "out of the page", "to the left"], a: 1, why: "A positive charge moving right in a field into the page is pushed up the page (left-hand rule). An electron is pushed the opposite way: down the page." },
      { q: "Why does the force from a magnetic field not change the speed of a charged particle?", opts: ["the force is too small", "the particle has no mass", "the force is always at right angles to the motion", "the field is uniform", "the force acts along the direction of motion"], a: 2, why: "A force at right angles to the motion changes the direction but does no work on the particle, so the speed is unchanged." },
      { type: "open", q: "Describe the basic operation of a particle accelerator in terms of the electric and magnetic fields used.", marks: 3, model: "<ul><li>Electric fields accelerate the charged particles (work is done on them, W = QV). (1)</li><li>Magnetic fields deflect/steer the particles (for example into a circle, so they pass the accelerating fields many times). (1)</li><li>Particles are made to undergo high-energy collisions, producing other particles. (1)</li></ul>" },
    ],
  },
  "pw-standard": {
    title: "The Standard Model",
    questions: [
      { q: "A proton is made of…", opts: ["three up quarks", "a quark and an antiquark", "one up quark and two down quarks", "two up quarks and one down quark", "an electron and a neutrino"], a: 3, why: "Proton = uud: +⅔ + ⅔ − ⅓ = +1." },
      { q: "Which particle is the force-mediating particle (boson) for the strong force?", opts: ["photon", "W boson", "Z boson", "gluon", "neutrino"], a: 3, why: "Gluons carry the strong force. Photons carry the electromagnetic force; W and Z bosons carry the weak force." },
      { q: "A meson consists of…", opts: ["three quarks", "three antiquarks", "a quark and an antiquark", "two leptons", "a lepton and a quark"], a: 2, why: "Mesons are quark–antiquark pairs. Baryons are three quarks." },
      { q: "What was the first evidence for the existence of the neutrino?", opts: ["the photoelectric effect", "the cosmic microwave background", "the annihilation of positrons", "electron–nucleon collisions", "beta decay: the electrons had a range of energies, so energy seemed to be missing"], a: 4, why: "Beta decay was the first evidence for the neutrino. The examiners noted in 2025 that only some candidates could state this mandatory point." },
      { q: "A hadron has a charge of +1 and is made of three quarks, one of which is a strange quark (charge −⅓). The other two could be…", opts: ["u u", "u d", "d d", "d s", "s s"], a: 0, why: "+⅔ + ⅔ − ⅓ = +1, so the other two are up quarks (this is the Σ⁺ baryon)." },
      { type: "open", q: "State what is meant by an antiparticle, and explain how annihilation provides evidence for antimatter.", marks: 2, model: "<ul><li>An antiparticle has the same mass as its particle but the opposite charge. (1)</li><li>When a particle and its antiparticle meet they annihilate, and their mass is converted into energy (e.g. gamma photons) that can be detected. (1)</li></ul>" },
      { q: "The diameter of a nucleus is about 10⁻¹⁴ m and of an atom about 10⁻¹⁰ m. How many orders of magnitude bigger is the atom?", opts: ["2", "4", "10", "14", "24"], a: 1, why: "10⁻¹⁰ ÷ 10⁻¹⁴ = 10⁴: four orders of magnitude (a factor of 10 000)." },
    ],
  },
  "pw-nuclear": {
    title: "Nuclear reactions",
    questions: [
      { q: "²³⁹₉₄Pu decays by emitting an alpha particle. What is produced?", opts: ["²³⁵₉₂U", "²³⁹₉₅Am", "²³⁵₉₄Pu", "²³⁷₉₂U", "²³⁹₉₃Np"], a: 0, why: "Alpha decay: A falls by 4 (239 → 235) and Z falls by 2 (94 → 92). Element 92 is uranium." },
      { q: "In a fusion reaction 4.6 × 10⁻²⁹ kg of mass is lost. How much energy is released?", opts: ["1.5 × 10⁻³⁷ J", "4.6 × 10⁻²⁹ J", "1.4 × 10⁻²⁰ J", "4.1 × 10⁻¹² J", "1.4 × 10⁻¹¹ J"], a: 3, why: "E = mc² = 4.6 × 10⁻²⁹ × (3.00 × 10⁸)² = 4.1 × 10⁻¹² J." },
      { q: "Why must fusion fuel in a reactor be held by magnetic fields?", opts: ["it is radioactive", "it is a plasma of charged particles at an extremely high temperature that would damage any material container", "magnets increase the mass lost", "it is too cold", "it contains neutrons"], a: 1, why: "The plasma is millions of degrees hot; magnetic fields exert forces on the moving charged particles and keep them off the walls." },
      { q: "What is the difference between spontaneous and induced fission?", opts: ["spontaneous fission needs a neutron to start it; induced does not", "there is no difference", "only induced fission releases energy", "only spontaneous fission produces neutrons", "induced fission is triggered by a neutron being absorbed; spontaneous fission happens by itself"], a: 4, why: "Spontaneous fission happens without a trigger; induced fission happens when a nucleus absorbs a neutron." },
      { type: "open", q: "Explain why energy is released in nuclear fission.", marks: 2, model: "<ul><li>The total mass of the products is less than the total mass of the reactants. (1)</li><li>The lost mass is converted into energy, E = mc². (1)</li></ul>" },
    ],
  },
  "pw-inverse": {
    title: "Irradiance and the inverse square law",
    questions: [
      { q: "Irradiance is defined as…", opts: ["the energy of a photon", "the power per unit area incident on a surface", "the number of photons per second", "the brightness of a lamp", "power × area"], a: 1, why: "I = P/A, the power per unit area incident on a surface (W m⁻²)." },
      { q: "The irradiance 1.0 m from a point source is 36 W m⁻². What is it at 3.0 m?", opts: ["3.0 W m⁻²", "4.0 W m⁻²", "6.0 W m⁻²", "9.0 W m⁻²", "12 W m⁻²"], a: 1, why: "I₁d₁² = I₂d₂²: 36 × 1.0² = I₂ × 3.0², so I₂ = 4.0 W m⁻²." },
      { q: "Which graph gives a straight line through the origin for a point source?", opts: ["I against d", "I against d²", "I against 1/d", "I against 1/d²", "1/I against 1/d"], a: 3, why: "I = k/d², so I is directly proportional to 1/d²." },
      { type: "open", q: "A student shows that the irradiance of a laser beam does not follow the inverse square law. Suggest why.", marks: 1, model: "<ul><li>A laser is not a point source: its beam does not spread out in all directions (it is a narrow, almost parallel beam). (1)</li></ul>" },
      { type: "open", q: "Describe an experiment to show that irradiance is inversely proportional to the square of the distance from a point source.", marks: 3, model: "<ul><li>Small (point-source) lamp and a light meter in a darkened room; measure the distance d from the filament to the meter with a metre stick. (1)</li><li>Record the irradiance I for a range of distances, repeating each reading. (1)</li><li>Plot I against 1/d²: a straight line through the origin shows I ∝ 1/d² (or show I × d² is constant). (1)</li></ul>" },
      { type: "open", q: "The inverse square law experiment is carried out in a darkened room with a lamp and a light meter. Suggest two improvements to the experiment.", marks: 2, model: "<ul><li>Any two, each (1): take repeated readings at each distance and find the mean; use a wider range of distances; use more distances; measure the distance to the filament (not the glass); use a smaller lamp so it is closer to a point source; subtract the background reading.</li></ul><p>⚠ The room is already dark: \"darken the room\" scores nothing. And give exactly two: an extra wrong answer cancels a right one (general marking principle 21).</p>" },
      { q: "A lamp gives an irradiance of 20 W m⁻² at 0.50 m. At what distance is the irradiance 5.0 W m⁻²?", opts: ["0.13 m", "0.25 m", "1.0 m", "2.0 m", "4.0 m"], a: 2, why: "I₁d₁² = I₂d₂²: 20 × 0.50² = 5.0 × d², so d² = 1.0 and d = 1.0 m. A quarter of the irradiance means twice the distance." },
    ],
  },
  "pw-photo": {
    title: "The photoelectric effect",
    questions: [
      { q: "What is meant by the work function of a metal?", opts: ["the minimum frequency needed for photoemission", "the maximum kinetic energy of the electrons", "the minimum energy of a photon required to cause photoemission", "the energy of each electron in the metal", "the power of the light needed"], a: 2, why: "Work function = minimum photon energy for photoemission (hf₀). The threshold frequency f₀ is the minimum frequency." },
      { q: "Light above the threshold frequency falls on a metal. The irradiance is doubled. What happens?", opts: ["the maximum kinetic energy of the electrons doubles", "the threshold frequency halves", "no change at all", "twice as many electrons are emitted per second, with the same maximum kinetic energy", "fewer electrons are emitted"], a: 3, why: "Doubling irradiance doubles the number of photons per second, so twice as many electrons. Each photon still has energy hf, so the maximum Eₖ is unchanged." },
      { q: "Calculate the energy of a photon of frequency 6.0 × 10¹⁴ Hz.", opts: ["1.1 × 10⁻⁴⁸ J", "9.0 × 10⁻²⁰ J", "3.6 × 10⁻¹⁹ J", "4.0 × 10⁻¹⁹ J", "1.8 × 10²⁰ J"], a: 3, why: "E = hf = 6.63 × 10⁻³⁴ × 6.0 × 10¹⁴ = 4.0 × 10⁻¹⁹ J." },
      { q: "The work function of a metal is 3.2 × 10⁻¹⁹ J. What is its threshold frequency?", opts: ["2.1 × 10⁻¹⁵ Hz", "4.8 × 10¹⁴ Hz", "9.6 × 10¹⁴ Hz", "2.1 × 10¹⁵ Hz", "4.8 × 10¹⁵ Hz"], a: 1, why: "f₀ = work function / h = 3.2 × 10⁻¹⁹ ÷ (6.63 × 10⁻³⁴) = 4.8 × 10¹⁴ Hz." },
      { type: "open", q: "Explain why the photoelectric effect provides evidence for the particle model of light.", marks: 2, model: "<ul><li>Photoemission only occurs if the frequency is above the threshold frequency, however high the irradiance. (1)</li><li>This shows light arrives in packets (photons) of energy E = hf: one photon must have enough energy to release one electron. A wave model would predict emission at any frequency if the irradiance were high enough. (1)</li></ul>" },
    ],
  },
  "pw-interference": {
    title: "Interference and gratings",
    questions: [
      { q: "Coherent waves have…", opts: ["the same amplitude", "a constant phase relationship", "the same speed only", "different frequencies", "zero path difference"], a: 1, why: "Coherent sources have a constant phase relationship (and so the same frequency)." },
      { q: "Two coherent sources in phase produce waves of wavelength 20 mm. At point P the path difference is 50 mm. What is at P?", opts: ["a maximum", "it depends on the amplitude", "neither", "the central maximum", "a minimum"], a: 4, why: "50 ÷ 20 = 2.5λ = (2 + ½)λ, an odd number of half-wavelengths: a minimum." },
      { q: "A grating has 500 lines per millimetre. What is the grating spacing d?", opts: ["2.0 × 10⁻⁹ m", "5.0 × 10⁻⁷ m", "2.0 × 10⁻⁶ m", "2.0 × 10⁻³ m", "5.0 × 10⁵ m"], a: 2, why: "500 lines per mm = 5.0 × 10⁵ lines per m, so d = 1 ÷ (5.0 × 10⁵) = 2.0 × 10⁻⁶ m." },
      { q: "White light passes through a grating. Why is the central maximum white?", opts: ["white light is not diffracted", "the path difference is zero for all wavelengths, so all colours arrive in phase and combine", "only white light reaches the centre", "the grating absorbs colours", "red and blue cancel"], a: 1, why: "At θ = 0 the path difference is zero for every wavelength, so every colour has a maximum there and they combine to give white." },
      { type: "open", q: "Light of wavelength 589 nm passes through a grating with 400 lines per mm. Calculate the angle to the first-order maximum.", marks: 3, model: "<ul><li>d sin θ = mλ, with d = 1/(400 × 10³) = 2.5 × 10⁻⁶ m (1)</li><li>2.5 × 10⁻⁶ × sin θ = 1 × 589 × 10⁻⁹ (1)</li><li><b>θ = 13.6°</b> (14°) (1)</li></ul>" },
      { type: "open", q: "Describe an experiment to determine the wavelength of laser light using a diffraction grating.", marks: 3, model: "<ul><li>Shine the laser through a grating of known lines per mm onto a screen; calculate d = 1/(N × 1000) m. (1)</li><li>Measure the distance from the grating to the screen and from the central maximum to a first-order maximum (metre stick), and find θ with tan θ = x/L (or measure θ directly with a spectrometer). Repeat for both sides and other orders. (1)</li><li>Use d sin θ = mλ to calculate λ, and take the mean. (1)</li></ul>⚠ Never look along the beam." },
      { q: "Two coherent sources are in phase. At a point P the waves from them have a phase difference of 180°. What happens at P?", opts: ["a minimum: crest meets trough", "a maximum: they add", "nothing: phase difference has no effect", "a maximum of the second order", "the frequency doubles"], a: 0, why: "A phase difference of 180° means exactly out of phase: crest meets trough and the waves cancel (destructive interference)." },
    ],
  },
  "pw-spectra": {
    title: "Spectra and the Bohr model",
    questions: [
      { q: "In the Bohr model, why are the energy levels negative?", opts: ["electrons have negative charge", "energy is lost by electrons", "the zero of potential energy is defined as an electron that has just escaped the atom", "the nucleus is positive", "photons have negative energy"], a: 2, why: "Zero potential energy = electron just removed (ionisation). Bound electrons have less energy than that, so their energies are negative." },
      { q: "An electron falls from E₄ = −1.36 × 10⁻¹⁹ J to E₂ = −5.45 × 10⁻¹⁹ J. What is the frequency of the photon emitted?", opts: ["4.1 × 10⁻¹⁹ Hz", "2.1 × 10¹⁴ Hz", "6.2 × 10¹⁴ Hz", "8.2 × 10¹⁴ Hz", "1.6 × 10¹⁵ Hz"], a: 2, why: "ΔE = −1.36 − (−5.45) = 4.09 × 10⁻¹⁹ J. f = ΔE/h = 4.09 × 10⁻¹⁹ ÷ (6.63 × 10⁻³⁴) = 6.2 × 10¹⁴ Hz (486 nm, blue-green)." },
      { q: "The dark Fraunhofer lines in the Sun's spectrum are caused by…", opts: ["emission from the Sun's core", "electrons in the Sun's hot surface falling between levels", "atoms in the cooler outer atmosphere absorbing particular frequencies", "the Earth's magnetic field", "redshift"], a: 2, why: "They are absorption lines: atoms in the Sun's cooler outer atmosphere absorb photons whose energies match their energy-level differences." },
      { type: "open", q: "Explain how a line emission spectrum is produced.", marks: 2, model: "<ul><li>Electrons in excited atoms fall from higher to lower energy levels, emitting a photon each time. (1)</li><li>Only certain energy differences exist (E₂ − E₁ = hf), so only certain frequencies of light are emitted, giving lines. (1)</li></ul>" },
      { q: "In the Bohr model, which statement about energy levels is correct?", opts: ["The ground state is the highest energy level", "Ionisation level is the ground state", "All energy levels have positive values", "The ground state is the lowest level; an electron at the zero level has been removed from the atom (ionisation)", "Electrons can have any energy between levels"], a: 3, why: "The ground state is the lowest (most negative) level. The zero level is the ionisation level: an electron there has just been freed from the atom." },
    ],
  },
  "pw-refraction": {
    title: "Refraction of light",
    questions: [
      { q: "Light enters water (n = 1.33) from air at an angle of incidence of 50°. What is the angle of refraction?", opts: ["30°", "35°", "38°", "45°", "50°"], a: 1, why: "sin θ₂ = sin 50° / 1.33 = 0.576, so θ₂ = 35°." },
      { q: "When light passes from air into glass, which quantity stays the same?", opts: ["speed", "wavelength", "refractive index", "direction", "frequency"], a: 4, why: "The frequency is set by the source and does not change. Speed and wavelength both decrease." },
      { q: "What is the critical angle for diamond (n = 2.42)?", opts: ["12°", "24°", "42°", "66°", "90°"], a: 1, why: "sin θc = 1/n = 1/2.42 = 0.413, so θc = 24°." },
      { q: "Which light is refracted most by a glass prism?", opts: ["red", "yellow", "green", "violet", "all colours equally"], a: 3, why: "Refractive index increases with frequency, so violet (highest frequency) is refracted most." },
      { type: "open", q: "Define the critical angle, and state what happens when the angle of incidence is greater than it.", marks: 2, model: "<ul><li>The critical angle is the angle of incidence that produces an angle of refraction of 90°. (1)</li><li>Above it, total internal reflection occurs (no light is refracted out). (1)</li></ul>" },
      { type: "open", q: "Describe an experiment to determine the refractive index of a glass block.", marks: 3, model: "<ul><li>Ray box, semicircular glass block on paper, protractor; draw the normal at the centre of the flat face. (1)</li><li>Aim the ray at the centre of the flat face; measure the angle of incidence θ₁ in air and the angle of refraction θ₂ in the glass, for a range of angles. (1)</li><li>Plot sin θ₁ against sin θ₂: the gradient is the refractive index n. (1)</li></ul>" },
    ],
  },
  /* ======================= ELECTRICITY ======================= */
  "el-ac": {
    title: "Alternating current",
    questions: [
      { q: "An AC supply has a peak voltage of 17 V. What is its r.m.s. voltage?", opts: ["8.5 V", "12 V", "17 V", "24 V", "34 V"], a: 1, why: "V<sub>rms</sub> = V<sub>peak</sub> / √2 = 17 / 1.414 = 12 V." },
      { q: "On an oscilloscope set to 10 ms/div, one complete wave spans 5 divisions. What is the frequency?", opts: ["2 Hz", "5 Hz", "20 Hz", "50 Hz", "200 Hz"], a: 2, why: "T = 5 × 10 ms = 50 ms = 0.050 s, so f = 1/T = 20 Hz." },
      { q: "The UK mains is 230 V r.m.s. What is its peak voltage?", opts: ["163 V", "230 V", "325 V", "460 V", "650 V"], a: 2, why: "V<sub>peak</sub> = √2 × V<sub>rms</sub> = 1.414 × 230 = 325 V." },
      { q: "Which statement about the r.m.s. value of an alternating voltage is correct?", opts: ["it is the highest voltage reached", "it is the average voltage over one cycle", "it is the direct voltage that would produce the same power in a resistor", "it is always half the peak voltage", "it is the voltage at t = 0"], a: 2, why: "The r.m.s. value is the equivalent DC value for power (heating effect). The average over a full cycle is zero." },
      { type: "open", q: "An oscilloscope is set to 0.5 V/div. The trace has a peak 3.0 divisions above the centre line. Calculate the r.m.s. voltage.", marks: 3, model: "<ul><li>V<sub>peak</sub> = 3.0 × 0.5 = 1.5 V (1)</li><li>V<sub>rms</sub> = V<sub>peak</sub> / √2 = 1.5 / √2 (1)</li><li><b>V<sub>rms</sub> = 1.1 V</b> (1.06 V) (1)</li></ul>" },
    ],
  },
  "el-circuits": {
    title: "Circuits and potential dividers",
    questions: [
      { q: "What is the total resistance of a 6.0 Ω and a 3.0 Ω resistor in parallel?", opts: ["0.50 Ω", "2.0 Ω", "4.5 Ω", "9.0 Ω", "18 Ω"], a: 1, why: "1/R = 1/6.0 + 1/3.0 = 0.5, so R = 2.0 Ω." },
      { q: "A 12 Ω resistor has a p.d. of 6.0 V across it. What power does it dissipate?", opts: ["0.50 W", "2.0 W", "3.0 W", "72 W", "432 W"], a: 2, why: "P = V²/R = 36/12 = 3.0 W." },
      { q: "In a potential divider across 12 V, R₁ = 3.0 kΩ and R₂ = 1.0 kΩ. What is the p.d. across R₁?", opts: ["3.0 V", "4.0 V", "6.0 V", "9.0 V", "12 V"], a: 3, why: "V₁ = R₁/(R₁ + R₂) × V<sub>S</sub> = 3.0/4.0 × 12 = 9.0 V." },
      { q: "A thermistor is R₁ in a potential divider. Its resistance falls as temperature rises. As it warms up, the p.d. across the fixed resistor R₂…", opts: ["increases", "decreases", "stays the same", "becomes zero", "equals the supply voltage"], a: 0, why: "R₁ falls, so R₂ takes a bigger share of the supply voltage: V₂ increases." },
      { type: "open", q: "A 4.0 Ω and a 12 Ω resistor are connected in parallel across a 6.0 V supply with no internal resistance. Calculate the total current drawn from the supply.", marks: 3, model: "<ul><li>1/R<sub>T</sub> = 1/4.0 + 1/12, so R<sub>T</sub> = 3.0 Ω (1)</li><li>I = V/R = 6.0/3.0 (1)</li><li><b>I = 2.0 A</b> (1)</li></ul><p>Adding the two branch currents (1.5 A + 0.5 A) is an equally good method.</p>" },
    ],
  },
  "el-emf": {
    title: "EMF and internal resistance",
    questions: [
      { q: "What is meant by the EMF of a cell?", opts: ["the p.d. across its terminals when a current flows", "the energy given to each coulomb of charge passing through the cell", "the current when it is short-circuited", "its internal resistance", "the power it delivers"], a: 1, why: "EMF is the energy supplied to each coulomb of charge passing through the source (= the t.p.d. on open circuit)." },
      { q: "A cell has EMF 6.0 V and internal resistance 1.0 Ω. It is connected to a 5.0 Ω resistor. What is the terminal p.d.?", opts: ["1.0 V", "5.0 V", "5.5 V", "6.0 V", "30 V"], a: 1, why: "I = E/(R + r) = 6.0/6.0 = 1.0 A. V = IR = 1.0 × 5.0 = 5.0 V (lost volts 1.0 V)." },
      { q: "On a graph of terminal p.d. (y-axis) against current (x-axis) for a cell, the gradient is equal to…", opts: ["the EMF", "the internal resistance", "the external resistance", "the short-circuit current", "minus the internal resistance"], a: 4, why: "V = E − Ir, so the gradient is −r, the y-intercept is E, and the x-intercept is the short-circuit current." },
      { q: "A cell has EMF 1.5 V and internal resistance 0.30 Ω. What current flows if it is short-circuited?", opts: ["0.20 A", "0.45 A", "1.5 A", "5.0 A", "15 A"], a: 3, why: "Short circuit: R = 0, so I = E/r = 1.5/0.30 = 5.0 A." },
      { type: "open", q: "A battery has EMF 9.0 V. When it delivers 0.50 A, the terminal p.d. is 8.4 V. Calculate the internal resistance.", marks: 3, model: "<ul><li>E = V + Ir (1)</li><li>9.0 = 8.4 + 0.50 × r (1)</li><li><b>r = 1.2 Ω</b> (1)</li></ul>" },
      { type: "open", q: "Describe an experiment to determine the EMF and internal resistance of a cell.", marks: 3, model: "<ul><li>Cell in series with an ammeter and a variable resistor; voltmeter across the cell's terminals. (1)</li><li>Change the variable resistor and record the t.p.d. V and the current I for a range of values. (1)</li><li>Plot V against I: the y-intercept is the EMF and the gradient is −r. (1)</li></ul>" },
    ],
  },
  "el-capacitors": {
    title: "Capacitors",
    questions: [
      { q: "A capacitor stores 6.0 × 10⁻⁴ C when the p.d. across it is 12 V. What is its capacitance?", opts: ["5.0 × 10⁻⁵ F", "5.0 × 10⁻⁴ F", "3.6 × 10⁻³ F", "7.2 × 10⁻³ F", "2.0 × 10⁴ F"], a: 0, why: "C = Q/V = 6.0 × 10⁻⁴ / 12 = 5.0 × 10⁻⁵ F (50 μF)." },
      { q: "What does the area under a charge–potential difference graph for a capacitor represent?", opts: ["the capacitance", "the current", "the energy stored", "the resistance", "the time to charge"], a: 2, why: "Area under the Q–V graph = work done in charging = energy stored = ½QV." },
      { q: "A capacitor charges through a resistor. The resistor is replaced by one with a larger resistance. Compared with before…", opts: ["the capacitor charges faster to a higher voltage", "the capacitor takes longer to charge, to the same final voltage", "the final voltage is lower", "the initial current is larger", "nothing changes"], a: 1, why: "A larger R means a smaller current, so charge builds up more slowly. The final voltage is still the supply voltage." },
      { q: "During discharge of a capacitor through a resistor, the current…", opts: ["is largest at the start and decreases, in the opposite direction to the charging current", "increases from zero", "is constant", "is largest at the end", "is always zero"], a: 0, why: "At the start V<sub>C</sub> is largest, so the current is largest; it falls as the capacitor discharges, and flows the opposite way to the charging current." },
      { type: "open", q: "A 2200 μF capacitor is charged to 9.0 V. Calculate the energy stored.", marks: 3, model: "<ul><li>E = ½CV² (1)</li><li>E = ½ × 2200 × 10⁻⁶ × 9.0² (1)</li><li><b>E = 0.089 J</b> (8.9 × 10⁻² J) (1)</li></ul>" },
      { type: "open", q: "Describe an experiment to show how the current and the p.d. across a capacitor vary with time as it charges and then discharges.", marks: 4, model: "<ul><li>Supply, switch, resistor and capacitor in series with an ammeter; voltmeter across the capacitor (or current and voltage sensors with a data logger). (1)</li><li>Close the switch and start a stopwatch; record I and V<sub>C</sub> at regular intervals until they stop changing. (1)</li><li>Plot I and V<sub>C</sub> against time: V<sub>C</sub> rises and levels off at the supply voltage; I falls from V<sub>S</sub>/R towards zero. (1)</li><li>Switch to discharge through R and record I and V<sub>C</sub> at intervals: both fall from their maximum towards zero, with the current in the opposite direction. (1)</li></ul>" },
      { q: "A capacitor is charged by a constant current of 2.0 mA for 15 s. How much charge does it store?", opts: ["1.3 × 10⁻⁴ C", "3.0 × 10⁻³ C", "7.5 × 10⁻³ C", "3.0 × 10⁻² C", "30 C"], a: 3, why: "Q = It = 2.0 × 10⁻³ × 15 = 3.0 × 10⁻² C." },
      { q: "A capacitor is charged at constant current through a variable resistor. What must be done to the resistor as the capacitor charges, and why?", opts: ["increase it, because the current would otherwise rise", "reduce it, because the capacitor's p.d. falls", "leave it alone: the current stays constant by itself", "reduce it, because the p.d. across the resistor falls as V<sub>C</sub> rises", "increase it, because the supply voltage rises"], a: 3, why: "As V<sub>C</sub> rises, the p.d. left across the resistor (V<sub>S</sub> − V<sub>C</sub>) falls. A smaller R keeps I = (V<sub>S</sub> − V<sub>C</sub>)/R constant." },
    ],
  },
  "el-semis": {
    title: "Semiconductors and p-n junctions",
    questions: [
      { q: "Why does the conductivity of a semiconductor increase with temperature?", opts: ["the atoms vibrate less", "doping atoms are added", "the band gap gets bigger", "the semiconductor becomes a metal", "more electrons gain enough energy to move from the valence band into the conduction band"], a: 4, why: "Higher temperature gives more electrons enough energy to cross the small gap, so there are more charge carriers." },
      { q: "In an insulator…", opts: ["the valence band is partly filled", "the valence band is full and the gap to the conduction band is large", "the valence and conduction bands overlap", "there is no valence band", "the conduction band is full"], a: 1, why: "Insulators have a full valence band and a large gap, so at room temperature electrons cannot reach the conduction band." },
      { q: "What effect does forward bias have on the electric field in a p-n junction?", opts: ["reduces it", "increases it", "reverses it", "no effect", "makes it infinite"], a: 0, why: "Forward bias reduces the electric field in the junction; reverse bias increases it." },
      { q: "A blue LED and a red LED are made from different semiconductors. Compared with the red LED, the blue LED has…", opts: ["a smaller band gap", "no band gap", "the same band gap", "a larger band gap and emits higher-energy photons", "a larger band gap but emits lower-energy photons"], a: 3, why: "Blue light has a higher frequency, so higher photon energy (E = hf), which needs a larger band gap." },
      { type: "open", q: "Explain how a p-n junction solar cell produces a potential difference when light falls on it.", marks: 2, model: "<ul><li>Absorbed photons give electrons enough energy to move from the valence band to the conduction band. (1)</li><li>The electric field in the junction makes these electrons move towards the n-type side (and holes towards the p-type side), producing a potential difference. (1)</li></ul>" },
    ],
  },
  /* ======================= SKILLS ======================= */
  "sk-units": {
    title: "Units and significant figures",
    questions: [
      { q: "Write 470 μF in farads.", opts: ["4.70 × 10⁻⁹ F", "4.70 × 10⁻⁷ F", "4.70 × 10⁻⁴ F", "4.70 × 10⁻¹ F", "4.70 × 10² F"], a: 2, why: "μ = × 10⁻⁶, so 470 × 10⁻⁶ = 4.70 × 10⁻⁴ F." },
      { q: "A cadet calculates 3.6 ÷ 0.0712 = 50.561… What is the best way to give the answer?", opts: ["0.51", "5 × 10¹", "50.56", "50.561", "51"], a: 4, why: "3.6 has 2 significant figures, so give 51. Under the marking rule, 50.56 (two figures more) or 5 × 10¹ (one fewer) would still just get the mark, but 50.561 (three more) would not. 0.51 has the wrong power of ten." },
      { q: "Which prefix means × 10⁹?", opts: ["mega", "kilo", "tera", "nano", "giga"], a: 4, why: "giga (G) = 10⁹. Mega is 10⁶, tera 10¹², nano 10⁻⁹." },
    ],
  },
  "sk-uncert": {
    title: "Uncertainties",
    questions: [
      { q: "Five readings: 4.1, 4.3, 4.0, 4.4, 4.2 s. What is the approximate random uncertainty?", opts: ["0.04 s", "0.08 s", "0.1 s", "0.4 s", "4.2 s"], a: 1, why: "(max − min)/n = (4.4 − 4.0)/5 = 0.08 s." },
      { q: "A digital voltmeter reads 2.36 V. What is its scale-reading uncertainty?", opts: ["± 0.001 V", "± 0.01 V", "± 0.1 V", "± 0.5 V", "± 1 V"], a: 1, why: "For a digital display, ± 1 in the last digit: ± 0.01 V." },
      { q: "A ruler has a zero error, so every length measured is 2 mm too long. This is an example of…", opts: ["a random uncertainty", "a scale-reading uncertainty", "a systematic uncertainty", "a percentage uncertainty", "no uncertainty"], a: 2, why: "All readings are offset in the same direction: a systematic uncertainty. Repeating readings won't reduce it." },
      { q: "A student measures d = (1.20 ± 0.01) m and t = (0.50 ± 0.02) s. Which is the dominant uncertainty?", opts: ["t, at 4%", "d, at 0.8%", "they are equal", "d, at 0.01 m", "neither"], a: 0, why: "% in d = 0.01/1.20 = 0.8%; % in t = 0.02/0.50 = 4%. The time dominates." },
    ],
  },
  "sk-graphs": {
    title: "Graphs and analysis",
    questions: [
      { q: "Which is the best way to draw a line of best fit?", opts: ["join the first and last points", "always draw it through the origin", "a ruled line with the points scattered evenly on both sides", "join every point dot to dot", "freehand through as many points as possible"], a: 2, why: "A ruled straight line (or smooth curve) with the points evenly scattered either side. Never force it through the origin." },
      { q: "A best-fit straight line does not pass through the origin. The best way to describe the relationship is…", opts: ["directly proportional", "inversely proportional", "no relationship", "a linear relationship", "exponential"], a: 3, why: "Any straight line shows a linear relationship. Direct proportion also needs the line to pass through the origin." },
      { q: "A student plots height fallen h against t² for a falling ball. The gradient is 4.85 m s⁻². What value of g does this give?", opts: ["2.43 m s⁻²", "4.85 m s⁻²", "9.70 m s⁻²", "19.4 m s⁻²", "23.5 m s⁻²"], a: 2, why: "h = ½gt², so the gradient is g/2. g = 2 × 4.85 = 9.70 m s⁻²." },
    ],
  },
  "sk-assignment": {
    title: "The assignment",
    questions: [
      { q: "How many marks are available for the evaluation section of the assignment report?", opts: ["1", "2", "3", "5", "20"], a: 2, why: "Evaluation is worth 3 marks; each point needs a justification that fits your own experiment." },
      { q: "Which of these is an acceptable reference for a website?", opts: ["just the URL", "\"Google\"", "the author or organisation, title, URL and the date you accessed it", "the author and title only", "nothing: websites don't need referencing"], a: 2, why: "A full reference includes the date of access. A bare URL as a citation is never enough." },
      { q: "A table column is headed \"mean\". What is wrong?", opts: ["nothing", "it should give the number of repeats", "means should never be in tables", "it should say \"average\" instead", "it should say which quantity and give the unit, e.g. \"mean voltage / V\""], a: 4, why: "Headings need the quantity and the unit. The 2025 report singled out headings like \"mean\"." },
      { q: "A student calculates a value of g from each data point and averages them. The examiners say a better method is to…", opts: ["average only the first and last values", "use the gradient of the best-fit line", "take more decimal places", "ignore outliers", "use a data-book value"], a: 1, why: "Using the gradient of the best-fit line uses all the data properly. Averaging per-point values was called invalid in 2025." },
    ],
  },

  /* ======================= EXAM DRILL ======================= */
  "exam-mc": {
    title: "Mock Section 1 (mixed multiple choice)",
    questions: [
      { q: "A car accelerates uniformly from 8.0 m s⁻¹ to 20 m s⁻¹ in 6.0 s. How far does it travel in this time?", opts: ["24 m", "48 m", "84 m", "120 m", "168 m"], a: 2, why: "s = ½(u + v)t = ½(8.0 + 20) × 6.0 = 84 m." },
      { q: "A 2.0 kg trolley at 3.0 m s⁻¹ collides with a stationary 1.0 kg trolley and they stick together. What is their combined velocity?", opts: ["1.0 m s⁻¹", "1.5 m s⁻¹", "2.0 m s⁻¹", "3.0 m s⁻¹", "6.0 m s⁻¹"], a: 2, why: "Total momentum: 2.0 × 3.0 = 6.0 kg m s⁻¹ = 3.0 × v, so v = 2.0 m s⁻¹." },
      { q: "A spacecraft moves at 0.50c. A clock on board records 10 s. How long does this take as measured by a stationary observer?", opts: ["5.0 s", "8.7 s", "10 s", "11.5 s", "20 s"], a: 3, why: "t′ = t/√(1 − 0.5²) = 10/0.866 = 11.5 s." },
      { q: "The Hubble constant is 2.3 × 10⁻¹⁸ s⁻¹. An estimate of the age of the Universe is…", opts: ["2.3 × 10⁻¹⁸ s", "3.0 × 10⁸ s", "1.4 × 10¹⁰ s", "6.9 × 10¹⁰ s", "4.3 × 10¹⁷ s"], a: 4, why: "t ≈ 1/H₀ = 1 ÷ (2.3 × 10⁻¹⁸) = 4.3 × 10¹⁷ s (about 14 billion years)." },
      { q: "Which particle is a lepton?", opts: ["proton", "neutron", "muon", "pion", "gluon"], a: 2, why: "Leptons: electron, muon, tau and their neutrinos. Protons, neutrons and pions are hadrons; gluons are bosons." },
      { q: "Monochromatic light falls on a grating with spacing 2.0 × 10⁻⁶ m. The first-order maximum is at 17.5°. What is the wavelength?", opts: ["601 nm", "450 nm", "301 nm", "650 nm", "1.9 μm"], a: 0, why: "λ = d sin θ / m = 2.0 × 10⁻⁶ × sin 17.5° = 6.01 × 10⁻⁷ m = 601 nm." },
      { q: "Light travels from glass into air. The angle of incidence in the glass is 30° and the refractive index of the glass is 1.50. What is the angle of refraction in the air?", opts: ["19°", "30°", "45°", "49°", "TIR: no refraction"], a: 3, why: "sin θ<sub>air</sub> = n × sin θ<sub>glass</sub> = 1.50 × 0.5 = 0.75, so θ = 49°. (30° is less than the critical angle, 41.8°.)" },
      { q: "An alternating supply has an r.m.s. voltage of 6.0 V. What is its peak voltage?", opts: ["3.0 V", "4.2 V", "6.0 V", "8.5 V", "12 V"], a: 3, why: "V<sub>peak</sub> = √2 × 6.0 = 8.5 V." },
      { q: "A capacitor's charge–p.d. graph is a straight line from the origin to (12 V, 6.0 × 10⁻⁴ C). How much energy does it store?", opts: ["2.5 × 10⁻⁵ J", "5.0 × 10⁻⁵ J", "1.8 × 10⁻³ J", "3.6 × 10⁻³ J", "7.2 × 10⁻³ J"], a: 3, why: "Energy = area under the Q–V graph = ½QV = ½ × 6.0 × 10⁻⁴ × 12 = 3.6 × 10⁻³ J. QV without the ½ gives 7.2 × 10⁻³ J." },
      { q: "In an n-type semiconductor, the majority charge carriers are…", opts: ["holes", "photons", "protons", "positive ions", "electrons"], a: 4, why: "n-type: doped to give extra free electrons (negative carriers). p-type has holes." },
      { q: "A student's V–I graph for a cell is a straight line through (0 A, 1.50 V) and (0.50 A, 1.20 V). What are the EMF and the internal resistance?", opts: ["EMF 1.50 V, r = 0.60 Ω", "EMF 1.20 V, r = 0.60 Ω", "EMF 1.50 V, r = 2.4 Ω", "EMF 1.50 V, r = 3.0 Ω", "EMF 1.35 V, r = 0.30 Ω"], a: 0, why: "The y-intercept is the EMF, 1.50 V. Gradient = (1.20 − 1.50)/0.50 = −0.60 Ω, and r = −gradient = 0.60 Ω." },
      { q: "A 2.0 kΩ resistor and a thermistor are in series across a 6.0 V supply. At the temperature in the room the thermistor's resistance is 4.0 kΩ. What is the p.d. across the thermistor?", opts: ["1.5 V", "2.0 V", "3.0 V", "4.0 V", "6.0 V"], a: 3, why: "V<sub>1</sub> = R<sub>1</sub>/(R<sub>1</sub> + R<sub>2</sub>) × V<sub>S</sub> = 4.0/(4.0 + 2.0) × 6.0 = 4.0 V. 2.0 V is the p.d. across the fixed resistor." },
      { q: "A 2.0 kg box slides down a slope at 30° to the horizontal. The friction force on it is 4.0 N. What is its acceleration?", opts: ["2.0 m s⁻²", "2.9 m s⁻²", "4.9 m s⁻²", "6.9 m s⁻²", "9.8 m s⁻²"], a: 1, why: "Component of weight down the slope: mg sin θ = 2.0 × 9.8 × sin 30° = 9.8 N. Unbalanced force = 9.8 − 4.0 = 5.8 N, so a = 5.8/2.0 = 2.9 m s⁻². Friction acts up the slope, against the motion." },
      { q: "A train horn of 400 Hz moves away from a listener at 20 m s⁻¹. Sound travels at 340 m s⁻¹. What frequency is heard?", opts: ["340 Hz", "378 Hz", "400 Hz", "420 Hz", "425 Hz"], a: 1, why: "f<sub>o</sub> = f<sub>s</sub> × v/(v + v<sub>s</sub>) = 400 × 340/360 = 378 Hz (380 Hz to 2 significant figures). Moving away gives a lower frequency. 425 Hz uses v − v<sub>s</sub>, the formula for an approaching source; 420 Hz just adds the speed to the frequency." },
      { q: "A 0.20 kg ball hits a wall at 5.0 m s⁻¹ and rebounds at 3.0 m s⁻¹. It is in contact with the wall for 0.040 s. What is the average force of the wall on the ball?", opts: ["10 N", "15 N", "40 N", "50 N", "200 N"], a: 2, why: "Take the rebound direction as positive: change in momentum = 0.20 × 3.0 − 0.20 × (−5.0) = 1.6 kg m s⁻¹. F = Δp/t = 1.6/0.040 = 40 N. Forgetting the sign change gives 10 N." },
      { q: "Light of frequency 6.0 × 10¹⁴ Hz falls on a metal with work function 3.0 × 10⁻¹⁹ J. What is the maximum kinetic energy of the electrons?", opts: ["7.0 × 10⁻¹⁹ J", "4.0 × 10⁻¹⁹ J", "3.0 × 10⁻¹⁹ J", "9.8 × 10⁻²⁰ J", "no electrons are emitted"], a: 3, why: "hf = 6.63 × 10⁻³⁴ × 6.0 × 10¹⁴ = 3.98 × 10⁻¹⁹ J; E<sub>k</sub> = 3.98 × 10⁻¹⁹ − 3.0 × 10⁻¹⁹ = 9.8 × 10⁻²⁰ J." },
      { q: "In a fission reaction the total mass decreases by 3.0 × 10⁻²⁸ kg. How much energy is released?", opts: ["9.0 × 10⁻²⁰ J", "2.7 × 10⁻¹⁹ J", "9.0 × 10⁻¹² J", "2.7 × 10⁻¹¹ J", "9.0 × 10⁸ J"], a: 3, why: "E = mc² = 3.0 × 10⁻²⁸ × (3.00 × 10⁸)² = 2.7 × 10⁻¹¹ J." },
      { q: "Data analysis: a student's graph of irradiance I against 1/d² is a straight line through the origin with gradient 0.50 W. What is the irradiance at 0.25 m?", opts: ["0.13 W m⁻²", "0.50 W m⁻²", "2.0 W m⁻²", "8.0 W m⁻²", "32 W m⁻²"], a: 3, why: "I = gradient × 1/d² = 0.50 × 1/0.25² = 0.50 × 16 = 8.0 W m⁻²." },
      { q: "A ball is thrown vertically upwards; air resistance is negligible. I: at the top its velocity is zero. II: at the top its acceleration is zero. III: its acceleration is the same throughout the flight. Which statement(s) is/are correct?", opts: ["I only", "II only", "I and II only", "I and III only", "I, II and III"], a: 3, why: "At the top v = 0, but the acceleration is still g = 9.8 m s⁻² downwards, all the way up and down. II is the classic misconception." },
      { q: "Light above the threshold frequency falls on a metal, and the irradiance is increased. I: more photoelectrons are emitted per second. II: the maximum kinetic energy of the photoelectrons increases. III: the energy of each photon increases. Which statement(s) is/are correct?", opts: ["I only", "II only", "III only", "I and II only", "II and III only"], a: 0, why: "More irradiance at the same frequency means more photons per second, each with the same energy hf: more electrons, same maximum E<sub>k</sub>." },
    ],
  },
  "exam-long": {
    title: "Mock Section 2 (structured)",
    questions: [
      { type: "open", q: "A golf ball is struck from level ground at 40 m s⁻¹ at 30° to the horizontal. Ignoring air resistance, calculate the horizontal distance it travels before landing.", marks: 4, model: "<ul><li>u<sub>v</sub> = 40 sin 30° = 20 m s⁻¹ and u<sub>h</sub> = 40 cos 30° = 34.6 m s⁻¹ (1)</li><li>Time to top: v = u + at, 0 = 20 − 9.8t, t = 2.04 s (1)</li><li>Total time = 4.08 s; range = u<sub>h</sub> × t = 34.6 × 4.08 (1)</li><li><b>Range = 140 m</b> (141 m) (1)</li></ul>" },
      { type: "open", q: "Electrons are accelerated from rest through 750 V. Show that their final speed is about 1.6 × 10⁷ m s⁻¹.", marks: 2, model: "<ul><li>QV = ½mv² (1)</li><li>1.60 × 10⁻¹⁹ × 750 = ½ × 9.11 × 10⁻³¹ × v² (1)</li><li>Final line: v = 1.62 × 10⁷ m s⁻¹. This line earns no mark of its own, but without it you can get at most 1 of the 2 marks.</li></ul>" },
      { type: "open", q: "A cell has EMF 1.6 V. When connected to a 3.0 Ω resistor the current is 0.50 A. Calculate (a) the terminal p.d. and (b) the internal resistance.", marks: 4, model: "<ul><li>(a) V = IR = 0.50 × 3.0 (1) = <b>1.5 V</b> (1)</li><li>(b) E = V + Ir: 1.6 = 1.5 + 0.50r (1); <b>r = 0.20 Ω</b> (1)</li></ul>" },
      { type: "open", q: "Cadet Sergeant Rahman says: \"Twice as far away, the lantern will look half as bright.\" Use your knowledge of physics to comment on this statement.", marks: 3, model: "<p>Open-ended: award marks for the depth of the physics, e.g.</p><ul><li>For a point source, irradiance follows the inverse square law, I = k/d², so at twice the distance the irradiance is one <em>quarter</em>, not half: the same power is spread over four times the area.</li><li>A real lantern with a lens or reflector is not a point source, so the law may not hold close up; a beam that spreads less falls off more slowly.</li><li>Sea mist absorbs and scatters light, reducing the irradiance further. And \"looks\" is not the same as irradiance: the eye's response is not proportional to it.</li></ul><p>3 marks: a good understanding, correctly applied (e.g. the inverse square law with the quarter result explained). 2: reasonable. 1: limited. 0: merely restating the question.</p>" },
      { type: "open", q: "A student investigates how the irradiance I from a small lamp varies with distance d, in a darkened room. Results — d / m: 0.20, 0.30, 0.40, 0.50; I / W m⁻²: 24.1, 11.6, 6.0, 4.3. (a) State the graph the student should draw to obtain a straight line. (b) On paper, draw that graph and calculate its gradient. (c) Use your line or its gradient to find the irradiance at 0.25 m. (d) In a repeat, the line has a small positive intercept on the I axis. Suggest a cause. (e) Suggest one improvement to the experiment.", marks: 9, model: "<ul><li>(a) I against 1/d² (1)</li><li>(b) Suitable linear scales starting at zero (1); axes labelled with quantities and units, I / W m⁻² and 1/d² / m⁻² (1); points plotted correctly (1/d² = 25, 11.1, 6.25, 4.0 m⁻²) with a best-fit straight line: points scattered either side, <em>not</em> forced through the origin (1); gradient from two points <em>on the line</em>, far apart, not data points: <b>gradient ≈ 0.95 W</b> (accept 0.90 to 1.0 W) (1)</li><li>(c) 1/0.25² = 16 m⁻², read I from the line at 16 m⁻² (or I ≈ gradient × 16) (1); <b>I ≈ 16 W m⁻²</b> (accept 15 to 16 W m⁻²) (1)</li><li>(d) A systematic effect, e.g. background light reaching the meter, or the meter not zeroed (1)</li><li>(e) Any one, e.g. repeat readings at each distance and take the mean; more distances over a wider range; measure to the filament (1). <em>Not</em> \"darken the room\": it already is.</li></ul>" },
      { type: "open", q: "A capacitor is charged from a battery through a resistor. Explain why the charging current decreases with time.", marks: 2, model: "<ul><li>As charge builds up on the plates, the p.d. across the capacitor increases (1)</li><li>so the p.d. across the resistor (V<sub>S</sub> − V<sub>C</sub>) decreases, and the current I = (V<sub>S</sub> − V<sub>C</sub>)/R decreases (1)</li></ul>" },
    ],
  },
};
