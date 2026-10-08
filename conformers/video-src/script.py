# Narration script for the Conformers explainer: scene id -> spoken sentences.
# Spellings are phonetic where the TTS needs help ("pie bond", "ex four dee").
# tts.py reads this; scene ids must match the SCENES order in scenes.js.
SCENES = [
("title", [
 "Hello, and, welcome to the Aperture Science Enrichment Center. Today's test subject is a molecule that will not sit still.",
 "The butane in a lighter isn't one shape. Every molecule in it twists about its middle bond billions of times a second, flickering between a handful of favourite poses.",
 "Those poses are called conformations, and learning to see them is one of the most useful habits in organic chemistry.",
]),
("axles", [
 "Butane looks like a fixed, flat zig-zag. It isn't. Each single bond is an axle.",
 "A single bond is a sigma bond. Its electron density is cylindrically symmetric around the line between the nuclei, like a sausage. Spin one end, and nothing is lost.",
 "A double bond adds a pie bond, made from two p orbitals overlapping side by side. Twist one end, and the overlap falls off as the cosine of the angle. At ninety degrees, it is gone.",
 "Breaking it costs roughly two hundred and seventy kilojoules per mole, far more than thermal jostling can supply. So double bonds are locked, and single bonds are nearly free.",
]),
("conf", [
 "Two words that sound alike. Conformations change by rotating single bonds, for under sixty kilojoules per mole, millions of times a second.",
 "Configurations change only by breaking and remaking bonds, at two hundred and fifty or more. At room temperature, never. Cis and trans butene are configurations. You can bottle them separately.",
 "A conformer is a conformation at an energy minimum, a pose the molecule lingers in. Butane has three. One anti, and two gauche.",
]),
("strain", [
 "Free rotation isn't quite free. As a molecule twists, its energy rises and falls. Chemists call any penalty for bad geometry strain, and there are three kinds.",
 "Torsional strain is the cost of eclipsing. Steric strain is the cost of crowding. Angle strain is the cost of bending a bond away from one hundred and nine point five degrees, mostly a ring problem.",
 "Every conformational question is the same question in disguise. Add up the strains in each pose, and the lowest total wins.",
]),
("newman", [
 "To see a twist, look straight down the bond. That is a Newman projection. The front carbon is a point. The back carbon is a circle behind it.",
 "Turn the back carbon of ethane, and two poses repeat every one hundred and twenty degrees. Staggered, where hydrogens sit far apart. And eclipsed, where bonds hide behind one another.",
 "Eclipsed ethane is twelve kilojoules per mole higher, about four per hydrogen pair. It is not a conformer. It is the top of a hill, crossed ten billion times every second.",
]),
("butane", [
 "Now butane. Anti, with the two methyls opposite, is the lowest point. Call it zero.",
 "Gauche, with the methyls sixty degrees apart, costs three point eight kilojoules per mole of crowding.",
 "Eclipse a methyl with a hydrogen, and the energy climbs to sixteen. Eclipse the two methyls, and you reach the worst pose, nineteen above anti.",
]),
("small", [
 "So how big is small? Thermal jostling at room temperature carries about two and a half kilojoules per mole.",
 "The rate of crossing a barrier is six times ten to the twelve per second, times e to the minus barrier over R T. That exponential is ferocious. Every extra five point seven kilojoules per mole makes the crossing ten times slower.",
 "Ethane's twelve is crossed ten billion times a second. The cyclohexane ring flip, around forty five, a hundred thousand times. Twisting a double bond, at two hundred and seventy, would take longer than the age of the universe.",
]),
("draw", [
 "Half of conformational analysis is simply drawing the shapes. Chemists use four conventions, each good at one job.",
 "Wedge and dash. A solid wedge comes towards you, a hashed one goes away. Good for one carbon's arrangement.",
 "The sawhorse draws the carbon-carbon bond diagonally, in perspective, so you can see both carbons at once.",
 "The Newman projection looks straight down the bond, the best tool for judging staggered against eclipsed.",
 "And the chair, a stylised drawing of cyclohexane that encodes every up, down, axial and equatorial position.",
]),
("baeyer", [
 "Tie the ends of a chain together and you lose a freedom. The bill is called ring strain. In eighteen eighty five, Adolf von Baeyer assumed rings are flat polygons. A flat cyclopropane has sixty degree angles, a coiled spring, forty nine and a half degrees from ideal.",
 "To measure strain, set fire to it. In a relaxed chain, each C H two group releases six hundred and fifty eight point six kilojoules. Anything extra was stored in the ring.",
 "Cyclopropane stores one hundred and fifteen. Cyclobutane, one hundred and ten. Cyclopentane, twenty six. And cyclohexane, exactly zero.",
 "Baeyer was right about small rings, and wrong about the rest, because real rings pucker. Each ring settles where the strains sum smallest.",
]),
("chair", [
 "Cyclohexane manages something no other small ring can. Every angle comfortable, every bond staggered, no strain at all. It folds into a zig-zag like a deckchair. The chair.",
 "Each carbon carries two hydrogens that are not equivalent. Axial bonds point straight up or down, parallel to the axis. Equatorial bonds stick out around the equator, and are never horizontal.",
 "Keep two ideas apart. Up and down is not the same as axial and equatorial. On an up carbon, the axial bond is the up one. On a down carbon, it is the equatorial one.",
 "To draw a chair that looks right, build it from parallel lines. Axial bonds are always vertical. Equatorial bonds run parallel to a ring bond, and point away from the ring.",
 "The chair isn't rigid. It turns itself inside out, over a half chair at forty five kilojoules.",
 "After the flip, every axial hydrogen is equatorial, and every equatorial one is axial. But a hydrogen that pointed up still points up.",
]),
("subst", [
 "Put a single methyl group on the ring, and the two chairs are no longer identical. In one, the methyl is axial. In the other, equatorial.",
 "Axial is crowded. The methyl bumps into the axial hydrogens on carbons three and five. Each one three diaxial contact costs three point eight kilojoules per mole, so seven point six in all. It is gauche butane in disguise.",
 "That seven point six is the A value. It gives about twenty one to one, ninety five percent equatorial.",
 "Tert-butyl is enormous, around twenty three. It locks the ring in the chair that puts it equatorial. Halogens are small, and barely mind.",
]),
("toolkit", [
 "Chapter six puts it on one page. Notice how many numbers are really the same one. Three point eight. The same crowding, seen from different angles.",
 "Quick check. Cis and trans butene are. Conformers. Configurational isomers. Or the same molecule. Take your time. I'll wait.",
 "Interpreting unclear answer as. Configurational isomers. Correct. Rotation would break the pie bond.",
 "A reward will be provided at the end of the test. It is cake. Probably.",
]),
("outro", [
 "Six short chapters, and everything on these pages can be dragged, spun or poked. Add up the strains, and the lowest total wins.",
 "Thank you for participating in this Enrichment Center activity. The full guide lives at zero ex four dee four dee dot github dot io, slash conformers.",
 "The cake is a lie. The chemistry is not.",
]),
]
if __name__=="__main__":
    n=sum(len(s.split()) for _,ss in SCENES for s in ss); print(n,"words")
