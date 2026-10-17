/* Pre-flight check question bank for the Structures, forces & materials deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked. Maths between $…$; String.raw keeps the backslashes. */
(function () {
  const R = String.raw;
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HE_QUIZ = Object.assign(window.HE_QUIZ || {}, {
    "str-forces": {
      title: "Forces and equilibrium",
      questions: [
        { q: R`A force of 20 N acts at 30° above the horizontal. What is its horizontal component?`, opts: [R`10 N`, R`17.3 N`, R`20 N`, R`34.6 N`], a: 1, why: R`The horizontal component is next to the angle: $20\cos30^\circ=17.3$ N. The vertical component, $20\sin30^\circ$, is 10 N.` },
        { q: R`A rope in tension is drawn on a joint diagram. Which way does its arrow point?`, opts: [R`Towards the joint, along the rope`, R`Away from the joint, along the rope`, R`At right angles to the rope`, R`Vertically downwards`], a: 1, why: R`A member in tension pulls the joint towards the member, so its arrow points away from the joint along the member. Compression is drawn towards the joint.` },
        { q: R`A ring is pulled by 3 kN due east and 4 kN due north. The size of the resultant is…`, opts: [R`1 kN`, R`5 kN`, R`7 kN`, R`12 kN`], a: 1, why: R`At right angles, $R=\sqrt{3^2+4^2}=5$ kN, at $\tan^{-1}(4/3)=53.1^\circ$ north of east.` },
        { q: R`Three ropes meet at a ring and the lines of action all pass through it. Which equations are enough for equilibrium?`, opts: [R`$\Sigma F_h=0$ only`, R`$\Sigma F_h=0$ and $\Sigma F_v=0$`, R`$\Sigma M=0$ only`, R`All three, including $\Sigma M=0$`], a: 1, why: R`Concurrent forces cannot turn the body, so only the two force equations are needed. $\Sigma M=0$ matters for non-concurrent forces.` },
        { q: R`How is the equilibrant of a set of forces related to their resultant?`, opts: [R`The same size and the same direction`, R`The same size and the opposite direction`, R`Half the size and the same direction`, R`Perpendicular to it`], a: 1, why: R`The equilibrant is the one extra force that balances the system, so it is equal and opposite to the resultant.` },
        { type: "open", q: R`A 12 kN gun hangs from a ring supported by two identical ropes, each at 60° to the horizontal spar. Calculate the tension in each rope.`, marks: 4, model: mi(
          R`•1 symmetry: the horizontal components are equal and opposite, so the two tensions are equal ($\Sigma F_h=0$)`,
          R`•2 $\Sigma F_v=0$: $2T\sin60^\circ=12$`,
          R`•3 $T=\dfrac{12}{2\sin60^\circ}$`,
          R`•4 $T=6.93$ kN (each rope), with the unit`) },
      ],
    },
    "str-moments": {
      title: "Moments and beams",
      questions: [
        { q: R`A force of 40 N acts at a perpendicular distance of 0.5 m from a pivot. Its moment is…`, opts: [R`20 N`, R`20 N m`, R`80 N m`, R`0.0125 N m`], a: 1, why: R`$M=Fx=40\times0.5=20$ N m. Check the unit: force times distance gives N m.` },
        { q: R`A 50 N force acts on the end of a 2 m lever at 30° to the lever. Its moment about the pivot is…`, opts: [R`100 N m`, R`86.6 N m`, R`50 N m`, R`25 N m`], a: 2, why: R`Only the component at right angles to the lever turns it: $50\sin30^\circ\times2=50$ N m. (Using the cosine would give 86.6.)` },
        { q: R`What can a roller support on a level surface provide?`, opts: [R`A vertical reaction only`, R`A vertical and a horizontal reaction`, R`A horizontal reaction only`, R`A moment`], a: 0, why: R`A roller can only push at right angles to the surface it rolls on. On a level surface that is vertical.` },
        { q: R`A 6 m beam is hinged at A and rests on a roller at B. A 12 kN load acts 2 m from A. The reaction at B is…`, opts: [R`2 kN`, R`4 kN`, R`8 kN`, R`12 kN`], a: 1, why: R`Moments about A: $R_B\times6=12\times2$, so $R_B=4$ kN (and $R_A=8$ kN).` },
        { q: R`A UDL of 5 kN/m covers 4 m of a beam. For a moment calculation it is replaced by…`, opts: [R`5 kN at the start of the load`, R`20 kN at the middle of the loaded length`, R`20 kN at the middle of the whole beam`, R`5 kN at the middle of the loaded length`], a: 1, why: R`Total load = intensity × loaded length = 20 kN, acting at the middle of the loaded part (not necessarily of the beam).` },
        { type: "open", q: R`A 10 m beam is hinged at A (left) and rests on a roller at B (right). A 30 kN load acts 3 m from A and a UDL of 4 kN/m covers the whole beam. Calculate the reactions at A and B. Ignore other forces.`, marks: 5, model: mi(
          R`•1 UDL replaced by $4\times10=40$ kN acting at the middle, 5 m from A`,
          R`•2 moments about A: $R_B\times10=30\times3+40\times5$`,
          R`•3 $R_B=\dfrac{90+200}{10}=29$ kN`,
          R`•4 $\Sigma F_v=0$: $R_A=(30+40)-29=41$ kN`,
          R`•5 no horizontal loads, so no horizontal reaction; units given`) },
      ],
    },
    "str-frames": {
      title: "Frames and nodal analysis",
      questions: [
        { q: R`Why are triangles used so much in frames?`, opts: [R`They are the cheapest shape to paint`, R`A triangle cannot change shape without a member changing length`, R`Every member of a triangle is in tension`, R`They use fewer joints than any other shape`], a: 1, why: R`A pin-jointed triangle is rigid. A four-sided pin-jointed frame can fold flat.` },
        { q: R`Assuming a member is in tension, you find its force is $-8$ kN. The member is…`, opts: [R`in tension, 8 kN`, R`in compression, 8 kN`, R`a zero-force member`, R`in tension, $-8$ kN`], a: 1, why: R`A negative answer means the assumed direction was wrong: the member is in compression. Quote the size as 8 kN, C.` },
        { q: R`In the method of joints, which joint should you start with?`, opts: [R`Any joint`, R`One with at most two unknown member forces`, R`The joint with the most members`, R`The joint furthest from the load`], a: 1, why: R`You have only two equations per joint ($\Sigma F_h$ and $\Sigma F_v$), so you can find only two unknowns.` },
        { q: R`A frame has 6 joints and is supported with 3 reaction components. For it to be just stiff it needs how many members?`, opts: [R`6`, R`9`, R`12`, R`15`], a: 1, why: R`$m+r=2j$, so $m=2\times6-3=9$.` },
        { q: R`At the second joint, a member that you found in compression at the first joint must be drawn…`, opts: [R`as tension, because you assumed tension`, R`pushing on the joint (towards it), as its true direction`, R`with no force`, R`pulling away from the joint`], a: 1, why: R`Use the member's true nature at the next joint. A member in compression pushes on both of its joints.` },
        { type: "open", q: R`A 10 kN load hangs from a joint C. Two members meet at C, each rising at 45° to the horizontal, one to the left and one to the right. Calculate the size and nature of the force in each.`, marks: 4, model: mi(
          R`•1 joint diagram: the load down, and two unknown members assumed tension, away from C`,
          R`•2 horizontal: the two horizontal components are equal and opposite, so the forces are equal`,
          R`•3 vertical: $2F\sin45^\circ=10$, so $F=\dfrac{10}{2\sin45^\circ}=7.07$ kN`,
          R`•4 both positive in the assumed direction: tension (T), 7.07 kN each`) },
      ],
    },
    "str-diagrams": {
      title: "Diagrams of structures",
      questions: [
        { q: R`A free-body diagram of a beam shows…`, opts: [R`the beam, the piers and the sea`, R`only the beam, with every load and every reaction as a force arrow`, R`only the reactions`, R`the beam's internal stresses`], a: 1, why: R`The structure is cut free, and everything that acts on it is drawn as a force.` },
        { q: R`Which of these should NOT appear on a free-body diagram of a bridge deck?`, opts: [R`The weight of a cart standing on it`, R`The reaction at the hinge`, R`The force of the pier on the ground`, R`A UDL from the planking`], a: 2, why: R`Only forces acting <em>on</em> the deck count. The pier pushing on the ground acts on the ground, not the deck.` },
        { q: R`How many reaction arrows does a hinge need on a free-body diagram?`, opts: [R`One`, R`Two (horizontal and vertical)`, R`Three`, R`None`], a: 1, why: R`A hinge can push in any direction, so it has a horizontal and a vertical component.` },
        { q: R`You draw an unknown reaction pointing up, but the calculation gives a negative value. What do you do?`, opts: [R`Start again with a new diagram`, R`Keep the diagram: the reaction actually points down`, R`Ignore the sign`, R`Say the structure is not in equilibrium`], a: 1, why: R`A negative result just means the force acts opposite to the arrow you drew.` },
        { q: R`A uniformly distributed load is drawn as…`, opts: [R`one large arrow`, R`a row of equal arrows with the intensity in kN/m`, R`a curved line`, R`a dashed line`], a: 1, why: R`Show it as drawn (a row of arrows with its intensity and extent); replace it by a single force only in the moment equation.` },
        { type: "open", q: R`A beam is hinged at A and rests on a roller at B. List four things that must appear on a free-body diagram of the loaded beam.`, marks: 4, model: mi(
          R`•1 the beam drawn as a line, with the hinge and roller symbols`,
          R`•2 the reactions: two components at A, one at B (as arrows)`,
          R`•3 every load as an arrow in the right position and at the right angle (UDL as a row of arrows with its kN/m)`,
          R`•4 dimensions, angles, labels and units (m, kN, degrees)`) },
      ],
    },
    "str-materials": {
      title: "Materials and their properties",
      questions: [
        { q: R`A bar is stiff. This means it…`, opts: [R`carries a large force before breaking`, R`stretches very little under a force`, R`can be hammered into sheets`, R`breaks without warning`], a: 1, why: R`Stiffness is a high Young's modulus: a small strain for a given stress. Carrying a large force is strength.` },
        { q: R`The slope of the straight part of a stress-strain graph is…`, opts: [R`the ultimate tensile stress`, R`the yield stress`, R`Young's modulus`, R`the factor of safety`], a: 2, why: R`$E=\sigma/\varepsilon$ is the gradient of the elastic part.` },
        { q: R`A material breaks near the end of its straight line with almost no plastic region. It is…`, opts: [R`ductile`, R`malleable`, R`brittle`, R`plastic`], a: 2, why: R`Little or no plastic deformation before fracture is brittleness.` },
        { q: R`A steel specimen is loaded past its yield point and the load is removed. The graph returns…`, opts: [R`along the loading line to the origin`, R`along a line parallel to the elastic slope, ending at a non-zero strain`, R`vertically to zero strain`, R`along the plastic curve`], a: 1, why: R`The material springs back elastically, parallel to the original line, but keeps a permanent set.` },
        { q: R`Which property lets copper be hammered into thin hull sheets without cracking?`, opts: [R`Brittleness`, R`Malleability`, R`Stiffness`, R`Hardness`], a: 1, why: R`Malleability is the ability to be hammered or rolled into shape without cracking.` },
        { q: R`Using the Data Booklet values (mild steel 196, aluminium alloy 70, titanium alloy 110, cast iron 120 kN/mm²), which material is the least stiff?`, opts: [R`Aluminium alloy`, R`Titanium alloy`, R`Cast iron`, R`Mild steel`], a: 0, why: R`Stiffness is Young's modulus. Aluminium alloy has the lowest E (70 kN/mm²), so for the same stress it stretches the most.` },
        { type: "open", q: R`A tensile test on material C gives a very steep straight line that ends at a high stress at which the specimen breaks suddenly, with almost no plastic region. State two properties of C and the evidence for each.`, marks: 4, model: mi(
          R`•1 stiff (property)`,
          R`•2 evidence: the straight line is steep, so Young's modulus is high`,
          R`•3 brittle (property)`,
          R`•4 evidence: it breaks suddenly with almost no plastic region (alternatively strong: it reaches a high stress)`) },
      ],
    },
    "str-stress": {
      title: "Stress, strain, safety and strain gauges",
      questions: [
        { q: R`A force of 12 kN acts on a cross-section of 300 mm². The stress is…`, opts: [R`0.04 N/mm²`, R`40 N/mm²`, R`3600 N/mm²`, R`400 N/mm²`], a: 1, why: R`$\sigma=F/A=12\,000/300=40$ N/mm² (40 MPa).` },
        { q: R`A 2 m member extends by 3 mm. The strain is…`, opts: [R`$1.5$`, R`$1.5\times10^{-3}$`, R`$1.5\ \text{mm}$`, R`$0.67$`], a: 1, why: R`$\varepsilon=\Delta l/l=3\ \text{mm}/2000\ \text{mm}=1.5\times10^{-3}$, with no unit.` },
        { q: R`A bar has $\sigma=100$ MPa at a strain of $5\times10^{-4}$ (elastic). Its Young's modulus is…`, opts: [R`$200$ GPa`, R`$50$ GPa`, R`$200$ MPa`, R`$0.05$ GPa`], a: 0, why: R`$E=\sigma/\varepsilon=100\times10^6/5\times10^{-4}=2\times10^{11}$ Pa = 200 GPa.` },
        { q: R`A bolt fails at 430 N/mm² and its safe working stress is 86 N/mm². The factor of safety is…`, opts: [R`0.2`, R`5`, R`344`, R`516`], a: 1, why: R`Factor of safety = ultimate stress ÷ safe working stress $=430/86=5$.` },
        { q: R`A force of 500 N stretches a rod by 4 mm (elastic). The strain energy stored is…`, opts: [R`1 J`, R`1000 J`, R`2000 J`, R`2 J`], a: 0, why: R`$E_s=\tfrac12Fx=\tfrac12\times500\times0.004=1$ J. The extension must be in metres.` },
        { q: R`When a strain gauge is stretched, its resistance…`, opts: [R`rises`, R`falls`, R`stays the same`, R`becomes zero`], a: 0, why: R`The foil becomes longer and thinner, so its resistance rises ($\Delta R/R=GF\times\varepsilon$).` },
        { q: R`What is a dummy strain gauge for?`, opts: [R`To double the strain`, R`To cancel the effect of temperature on the resistance`, R`To store energy`, R`To measure the load directly`], a: 1, why: R`It is unstrained and at the same temperature, so temperature changes affect both gauges equally and cancel.` },
        { type: "open", q: R`A bolt must carry a tensile load of 60 kN with a factor of safety of 5. The ultimate tensile stress of aluminium alloy is 300 N/mm². Calculate the minimum diameter of the bolt.`, marks: 4, model: mi(
          R`•1 safe working stress $=300/5=60$ N/mm²`,
          R`•2 $A=F/\sigma=60\,000/60=1000$ mm²`,
          R`•3 $A=\pi d^2/4$, so $d=\sqrt{4\times1000/\pi}$`,
          R`•4 $d=35.7$ mm (at least), with the unit`) },
      ],
    },
    "str-choosing": {
      title: "Choosing and justifying a material",
      questions: [
        { q: R`Cast iron has ultimate tensile stress 120–160 N/mm² and ultimate compressive stress 600–900 N/mm². It is best used for…`, opts: [R`a stay in tension`, R`a column in compression`, R`a chain`, R`a rope`], a: 1, why: R`It is far stronger in compression than in tension, and brittle, so it suits columns but not ties.` },
        { q: R`Which two properties matter most for a stay or shroud in tension?`, opts: [R`High tensile strength and ductility`, R`Brittleness and hardness`, R`Low strength and high stiffness`, R`Malleability only`], a: 0, why: R`A stay must carry a high tensile stress, and ductility makes it stretch and warn rather than snap.` },
        { q: R`Which sentence is the best evidence for choosing titanium alloy over aluminium alloy?`, opts: [R`Titanium is better.`, R`Titanium is stronger.`, R`Titanium alloy has a yield stress of 950 N/mm² against 250 N/mm², so a slimmer spar can carry the same load.`, R`Titanium is a modern material.`], a: 2, why: R`It names the property, gives figures for both materials and states the consequence for the job.` },
        { q: R`Copper sheets are used on a hull below the waterline mainly because copper is…`, opts: [R`brittle and strong`, R`corrosion resistant and malleable`, R`very stiff`, R`very cheap`], a: 1, why: R`It resists fouling and corrosion, and it can be rolled into thin sheets.` },
        { q: R`For a justification question worth four marks you should give…`, opts: [R`one long sentence`, R`about four separate, specific points, each with a property, evidence and a consequence`, R`only numbers`, R`only adjectives`], a: 1, why: R`Marks go for separate specific points, not for length.` },
        { type: "open", q: R`Justify the use of mild steel rather than cast iron for a tension member such as a stay. Use the Data Booklet.`, marks: 3, model: mi(
          R`•1 ultimate tensile stress: mild steel 430 N/mm² against 120–160 N/mm² for cast iron, so it can carry much more tension`,
          R`•2 cast iron is brittle and would fail suddenly with no warning; mild steel is ductile and stretches (yields at 220 N/mm²) before it breaks`,
          R`•3 consequence: a safer, lighter, thinner stay for the same load and factor of safety`) },
      ],
    },
  });
})();
