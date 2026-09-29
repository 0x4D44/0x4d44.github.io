"""Polymyalgia, Explained — one Manim scene per chapter.

Render one:   manim -ql scenes.py S01Hook
Render all:   python build.py
"""
import numpy as np

from common import *  # noqa: F401,F403


# ======================================================================
class S01Hook(PMRScene):
    def construct(self):
        # --- a geometric person
        sh_l, sh_r = np.array([-0.85, 1.25, 0]), np.array([0.85, 1.25, 0])
        hip_l, hip_r = np.array([-0.55, -0.45, 0]), np.array([0.55, -0.45, 0])
        stroke = dict(color=INK, stroke_width=7)
        head = Circle(0.38, **stroke).move_to([0, 2.05, 0])
        torso = Line([0, 1.62, 0], [0, -0.45, 0], **stroke)
        shoulders = Line(sh_l, sh_r, **stroke)
        hips = Line(hip_l, hip_r, **stroke)
        arm_l = Line(sh_l, sh_l + np.array([-0.35, -1.55, 0]), **stroke)
        arm_r = Line(sh_r, sh_r + np.array([0.35, -1.55, 0]), **stroke)
        leg_l = Line(hip_l, [-0.7, -2.9, 0], **stroke)
        leg_r = Line(hip_r, [0.7, -2.9, 0], **stroke)
        person = VGroup(head, torso, shoulders, hips, arm_l, arm_r, leg_l, leg_r)

        acts = bullet_rows(["pulling on a jumper", "turning over in bed", "getting out of a chair"],
                           size=30).to_edge(RIGHT, buff=0.9)

        with self.say("Imagine waking up and finding that pulling on a jumper, turning over in bed, "
                      "or getting out of a chair has become painfully difficult.") as tr:
            self.play(LaggedStart(*[Create(m) for m in person], lag_ratio=0.12), run_time=2.2)
            # try to raise the arms... and stall
            self.play(Rotate(arm_l, -1.15, about_point=sh_l), Rotate(arm_r, 1.15, about_point=sh_r),
                      run_time=1.3, rate_func=rate_functions.ease_out_sine)
            self.sfx("thud", -10)
            self.play(Rotate(arm_l, 0.35, about_point=sh_l), Rotate(arm_r, -0.35, about_point=sh_r),
                      arm_l.animate.set_color(ORANGE), arm_r.animate.set_color(ORANGE), run_time=0.5)
            for r in acts:
                self.play(FadeIn(r, shift=LEFT * 0.3), run_time=0.5)
                self.sfx("tick", -6)

        # --- both shoulders and both hips
        spots = [sh_l, sh_r, hip_l + LEFT * 0.12, hip_r + RIGHT * 0.12]
        rings = VGroup(*[Circle(0.42, color=ORANGE, stroke_width=6).move_to(p) for p in spots])
        halos = VGroup(*[glow(r, ORANGE, layers=4, max_width=22, opacity=0.12) for r in rings])
        lab_s = S("SHOULDERS", 24, ORANGE).next_to(rings[0], LEFT, buff=0.45)
        lab_h = S("HIPS", 24, ORANGE).next_to(rings[2], LEFT, buff=0.45)
        with self.say("The aching sits around both shoulders and both hips, and it is at its worst "
                      "after rest, first thing in the morning.") as tr:
            self.play(FadeOut(acts), arm_l.animate.set_color(INK), arm_r.animate.set_color(INK), run_time=0.6)
            self.play(Rotate(arm_l, 0.8, about_point=sh_l), Rotate(arm_r, -0.8, about_point=sh_r), run_time=0.8)
            self.sfx("pop", -6)
            self.play(LaggedStart(*[GrowFromCenter(r) for r in rings[:2]], lag_ratio=0.3),
                      FadeIn(halos[:2]), FadeIn(lab_s), run_time=0.9)
            self.sfx("pop", -6)
            self.play(LaggedStart(*[GrowFromCenter(r) for r in rings[2:]], lag_ratio=0.3),
                      FadeIn(halos[2:]), FadeIn(lab_h), run_time=0.9)
            for _ in range(2):
                self.play(*[r.animate.scale(1.18) for r in rings], rate_func=there_and_back, run_time=0.9)

        # --- the name
        body = VGroup(person, rings, halos, lab_s, lab_h)
        title = T("Polymyalgia rheumatica", 64).scale_to_fit_width(7.6)
        title.move_to([2.7, 1.3, 0])
        poly, my, algia = title[0:4], title[4:6], title[6:11]
        with self.say("This pattern has a name: polymyalgia rheumatica, or PMR. "
                      "Taken literally, the name means many muscles, aching.") as tr:
            self.play(body.animate.scale(0.72).move_to([-4.6, 0.1, 0]), run_time=1.0)
            self.play(Write(title), run_time=1.6)
            self.play(poly.animate.set_color(BLUE), my.animate.set_color(ORANGE),
                      algia.animate.set_color(AMBER), run_time=0.6)
            gl = VGroup(
                T("poly", 34, BLUE), T("my", 34, ORANGE), T("algia", 34, AMBER)
            ).arrange(RIGHT, buff=1.4).next_to(title, DOWN, buff=0.9)
            means = VGroup(T("many", 28, MUTED, slant=ITALIC), T("muscle", 28, MUTED, slant=ITALIC),
                           T("pain", 28, MUTED, slant=ITALIC))
            for g, m in zip(gl, means):
                m.next_to(g, DOWN, buff=0.25)
            self.play(LaggedStart(*[TransformFromCopy(src, dst) for src, dst in zip((poly, my, algia), gl)],
                                  lag_ratio=0.25), run_time=1.4)
            self.play(LaggedStart(*[FadeIn(m, shift=DOWN * 0.15) for m in means], lag_ratio=0.25), run_time=1.0)
        self.muscle_word = means[1]
        with self.say("But as we'll see, the muscles themselves are mostly not where the problem lies.") as tr:
            strike = Line(means[1].get_left(), means[1].get_right(), color=RED, stroke_width=4)
            q = T("?", 44, RED).next_to(gl[1], UP, buff=0.15).shift(RIGHT * 0.4)
            self.play(Create(strike), run_time=0.6)
            self.sfx("blip_low", -4)
            self.play(FadeIn(q, scale=1.6), gl[1].animate.set_opacity(0.45), run_time=0.6)

        # --- disclaimer card
        with self.say("One note before we begin. This is an educational explainer, not medical "
                      "advice. Nothing here should be used to start, stop or change a treatment.") as tr:
            self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.7)
            card = VGroup(
                T("Polymyalgia, explained", 60),
                T("The tissues that hurt · the signals behind them · the long road back", 28, MUTED,
                  slant=ITALIC),
            ).arrange(DOWN, buff=0.35).shift(UP * 0.9)
            note = VGroup(
                tag("educational explainer", AMBER, 20),
                S("Not medical advice. Don't start, stop or change treatment based on this video.", 24, INK),
                S("Based on “Polymyalgia, Explained”, 0x4D44 Almanac · research edition 15 Sep 2026", 20),
            ).arrange(DOWN, buff=0.28).next_to(card, DOWN, buff=0.9)
            self.sfx("chime", -8)
            self.play(Write(card[0]), run_time=1.4)
            self.play(FadeIn(card[1], shift=UP * 0.2), run_time=0.8)
            self.play(LaggedStart(*[FadeIn(n, shift=UP * 0.1) for n in note], lag_ratio=0.3), run_time=1.4)
        self.wait(0.6)
        self.clear_all()


# ======================================================================
class S02Tissues(PMRScene):
    def construct(self):
        self.chapter(1, "What is actually hurting?", "Start with the tissues")

        c = np.array([-2.9, -0.9, 0])  # centre of the humeral head
        head = Circle(1.15, stroke_width=0, fill_color=BONE, fill_opacity=0.95).move_to(c)
        shaft = Rectangle(width=1.0, height=2.2, stroke_width=0, fill_color=BONE, fill_opacity=0.95)
        shaft.next_to(head, DOWN, buff=-0.45)
        bone = VGroup(shaft, head)
        arch = Arc(radius=2.35, start_angle=PI * 0.18, angle=PI * 0.64, arc_center=c + UP * 0.3,
                   color=BONE, stroke_width=20)
        lining = Arc(radius=1.3, start_angle=PI * 0.95, angle=PI * 1.1, arc_center=c,
                     color=VIOLET, stroke_width=6)
        tendon = Arc(radius=1.52, start_angle=PI * 0.12, angle=PI * 0.76, arc_center=c,
                     color="#C8B48E", stroke_width=13)
        bursa = Ellipse(width=1.7, height=0.36, stroke_color=AMBER, stroke_width=2,
                        fill_color=AMBER, fill_opacity=0.35).move_to(c + UP * 2.06)
        muscle = AnnularSector(inner_radius=2.72, outer_radius=3.25, angle=PI * 0.86,
                               start_angle=PI * 0.07, arc_center=c + DOWN * 0.1,
                               fill_color=BLUE, fill_opacity=0.45, stroke_color=BLUE, stroke_width=2)

        legend_items = [
            (bursa, AMBER, "Bursa", "a fluid-filled gliding cushion"),
            (tendon, "#C8B48E", "Tendon", "carries muscle force to bone"),
            (lining, VIOLET, "Joint lining", "the synovium"),
            (muscle, BLUE, "Muscle", "generates force"),
        ]
        legend = VGroup()
        for _, col, name, desc in legend_items:
            sw = RoundedRectangle(corner_radius=0.06, width=0.34, height=0.34, fill_color=col,
                                  fill_opacity=0.9, stroke_width=0)
            txt = VGroup(T(name, 32), S(desc, 22)).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
            legend.add(VGroup(sw, txt).arrange(RIGHT, buff=0.3, aligned_edge=UP))
        legend.arrange(DOWN, aligned_edge=LEFT, buff=0.42).move_to([3.6, 0.2, 0])
        schem = tag("schematic · not to scale").to_corner(DR, buff=0.4)

        with self.say("Let's peel a shoulder apart into layers. At the centre is the ball at the top "
                      "of the upper arm bone, sitting beneath an arch of bone above it."):
            self.play(FadeIn(bone, shift=UP * 0.3), FadeIn(schem), run_time=1.2)
            self.play(Create(arch), run_time=1.2)
        with self.say("Wrapped around the joint is its lining, the synovium. Tendons run over the "
                      "top, carrying force. And between tendon and bone sits a bursa: a tiny, "
                      "fluid-filled cushion that lets things glide."):
            self.play(Create(lining), FadeIn(legend[2], shift=LEFT * 0.2), run_time=1.3)
            self.sfx("blip", -6)
            self.play(Create(tendon), FadeIn(legend[1], shift=LEFT * 0.2), run_time=1.3)
            self.sfx("blip", -6)
            self.play(GrowFromCenter(bursa), FadeIn(legend[0], shift=LEFT * 0.2), run_time=1.1)
            self.sfx("blip", -6)
            self.play(bursa.animate.shift(LEFT * 0.12), rate_func=wiggle, run_time=1.0)
        with self.say("And wrapped over all of it is the muscle itself."):
            self.play(DrawBorderThenFill(muscle), FadeIn(legend[3], shift=LEFT * 0.2), run_time=1.5)
            self.sfx("blip", -6)

        inflamed = VGroup(bursa, tendon, lining)
        halos = VGroup(glow(bursa, ORANGE, 5, 30, 0.1), glow(tendon, ORANGE, 5, 40, 0.07),
                       glow(lining, ORANGE, 5, 30, 0.07))
        intact = VGroup(T("✓", 34, MINT), S("force intact", 22, MINT)).arrange(RIGHT, buff=0.15)
        intact.next_to(legend[3][1], RIGHT, buff=0.35)
        with self.say("Ultrasound and MRI studies show that in PMR, inflammation concentrates around "
                      "the joint: in bursae, tendon sheaths and joint linings, rather than in "
                      "destroyed muscle fibres."):
            self.sfx("rise", -2)
            self.play(bursa.animate.set_color(ORANGE), tendon.animate.set_color(ORANGE),
                      lining.animate.set_color(ORANGE), FadeIn(halos), run_time=1.6)
            for leg in legend[:3]:
                leg[0].set_color(ORANGE)
            self.play(*[l[1][0].animate.set_color(ORANGE) for l in legend[:3]], run_time=0.6)
            self.play(Indicate(muscle, color=BLUE, scale_factor=1.03), FadeIn(intact, shift=LEFT * 0.2),
                      run_time=1.2)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        # --- pain, stiffness, weakness
        quote = T("“I can’t raise my arms” could mean…", 42).to_edge(UP, buff=0.8)
        names = [("It hurts\nto move", ORANGE), ("The joint won't\nmove freely", AMBER),
                 ("The muscle is\ngenuinely weak", BLUE)]
        cards = VGroup()
        for n, col in names:
            box = RoundedRectangle(corner_radius=0.2, width=3.9, height=2.2, stroke_color=col,
                                   stroke_width=3, fill_color=col, fill_opacity=0.07)
            cards.add(VGroup(box, T(n, 32).move_to(box)))
        cards.arrange(RIGHT, buff=0.45).shift(UP * 0.1)
        pmr_note = S("typical of PMR: painful, stiff movement", 26, ORANGE)
        weak_note = S("objective weakness points to other causes:\nan examination tells them apart", 24, BLUE)
        brace = Brace(cards[:2], DOWN, color=ORANGE)
        pmr_note.next_to(brace, DOWN, buff=0.2)
        weak_note.next_to(cards[2], DOWN, buff=0.35)
        with self.say("That distinction matters. I can't raise my arms might mean that it hurts, "
                      "that the joint won't move freely, or that the muscle is genuinely weak. In "
                      "PMR it's usually the first two: painful, stiff movement, not lost strength."):
            self.play(FadeIn(quote, shift=DOWN * 0.2), run_time=0.8)
            for cd in cards:
                self.sfx("pop", -8)
                self.play(FadeIn(cd, shift=UP * 0.3), run_time=0.6)
            self.wait(0.6)
            self.play(GrowFromCenter(brace), FadeIn(pmr_note), cards[2].animate.set_opacity(0.35), run_time=1)
            self.play(FadeIn(weak_note), run_time=0.8)

        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        # --- who gets it
        ax = NumberLine(x_range=[40, 90, 10], length=9, include_numbers=True, font_size=28,
                        color=MUTED, numbers_to_include=range(40, 91, 10)).shift(DOWN * 1.6)
        for n in ax.numbers:
            n.set_color(MUTED)
        xlabel = S("age (years)", 24).next_to(ax, DOWN, buff=0.55)

        def dens(a):
            return 0 if a < 50 else 3.0 * (1 - np.exp(-((a - 50) / 13) ** 2)) * np.exp(-((a - 50) / 45) ** 2)
        pts = [ax.n2p(a) + UP * dens(a) for a in np.linspace(40, 90, 120)]
        curve = VMobject(color=ORANGE, stroke_width=5).set_points_smoothly(pts)
        area = VMobject(fill_color=ORANGE, fill_opacity=0.18, stroke_width=0)
        area.set_points_as_corners([ax.n2p(40), *pts, ax.n2p(90), ax.n2p(40)])
        m50 = DashedLine(ax.n2p(50), ax.n2p(50) + UP * 3.4, color=MUTED)
        m65 = DashedLine(ax.n2p(65), ax.n2p(65) + UP * 3.4, color=MUTED)
        l50 = S("uncommon before 50", 22, INK).next_to(m50, UP, buff=0.1).shift(LEFT * 0.7)
        l65 = S("much more typical after 65", 22, INK).next_to(m65, UP, buff=0.1).shift(RIGHT * 0.9)
        stag = tag("schematic · not data").to_corner(UR, buff=0.5)
        with self.say("PMR is uncommon before the age of fifty, and much more typical after "
                      "sixty-five. Women are affected more often than men."):
            self.play(Create(ax), FadeIn(xlabel), FadeIn(stag), run_time=1.0)
            self.play(Create(curve), FadeIn(area), run_time=1.6)
            self.play(Create(m50), FadeIn(l50), run_time=0.7)
            self.play(Create(m65), FadeIn(l65), run_time=0.7)
            fm = S("women  >  men", 30, INK).move_to([-3.4, -0.6, 0])
            self.play(FadeIn(fm, shift=RIGHT * 0.2), run_time=0.6)
        chips = VGroup(*[chip(s, size=24) for s in ["fatigue", "low appetite", "weight loss",
                                                     "mild fever", "low mood"]])
        chips.arrange(RIGHT, buff=0.25).to_edge(UP, buff=0.35)
        with self.say("Fatigue, low appetite, weight loss, a mild fever or low mood can come along "
                      "too. They're real, but they happen in other illnesses as well. It's the "
                      "overall pattern that matters."):
            self.play(FadeOut(stag), run_time=0.3)
            self.play(LaggedStart(*[FadeIn(c, shift=DOWN * 0.2) for c in chips], lag_ratio=0.2), run_time=1.6)
            self.sfx("tick", -6)
        self.wait(0.4)
        self.clear_all()


# ======================================================================
class S03Causes(PMRScene):
    def construct(self):
        self.chapter(2, "Why does it happen?", "We know part of the machinery — not the first domino")

        phrase = T("an immune-mediated inflammatory disease", 44).shift(UP * 2.4)
        what = S("describes what is happening…", 28, MINT)
        why = S("…not why it starts in one person", 28, ORANGE)
        VGroup(what, why).arrange(RIGHT, buff=1.0).next_to(phrase, DOWN, buff=0.6)
        with self.say("So why does it happen? PMR is an immune-mediated inflammatory disease. That "
                      "describes what is happening, not why it starts in one particular person."):
            self.play(Write(phrase), run_time=1.6)
            self.play(FadeIn(what, shift=UP * 0.2), run_time=0.7)
            self.play(FadeIn(why, shift=UP * 0.2), run_time=0.7)

        # dominoes
        n = 8
        doms = VGroup(*[RoundedRectangle(corner_radius=0.04, width=0.26, height=1.5,
                                         fill_color=BLUE if i else ORANGE, fill_opacity=0.85,
                                         stroke_color=INK, stroke_width=1.5) for i in range(n)])
        doms.arrange(RIGHT, buff=0.62).shift(DOWN * 0.9)
        floor = Line(doms.get_left() + LEFT * 0.5, doms.get_right() + RIGHT * 1.5, color=GREY).next_to(doms, DOWN, buff=0)
        qm = T("?", 60, ORANGE).next_to(doms[0], UP, buff=0.3)
        labels = VGroup(
            S("immune signals", 22, INK), S("inflammation", 22, INK), S("symptoms", 22, INK)
        )
        for lab, i in zip(labels, (2, 5, 7)):
            lab.next_to(doms[i], DOWN, buff=0.35)
        with self.say("Picture a row of dominoes. We understand a lot about the later ones: the "
                      "immune signals, the inflammation and the symptoms. But the first domino, "
                      "the initial trigger, is still unknown."):
            self.play(FadeOut(what), FadeOut(why), phrase.animate.scale(0.7).to_edge(UP, buff=0.5), run_time=0.8)
            self.play(Create(floor), LaggedStart(*[FadeIn(d, shift=UP * 0.3) for d in doms], lag_ratio=0.08),
                      run_time=1.3)
            self.play(FadeIn(qm, scale=1.5), run_time=0.5)
            for i, d in enumerate(doms):
                pivot = d.get_corner(DR)
                ang = -0.62 if i < n - 1 else -1.45
                self.play(Rotate(d, ang, about_point=pivot), run_time=0.22, rate_func=rate_functions.ease_in_quad)
                self.sfx("thud", -12 + (i % 2))
            self.play(LaggedStart(*[FadeIn(l, shift=UP * 0.1) for l in labels], lag_ratio=0.3), run_time=1.0)
            self.play(Indicate(qm, color=ORANGE, scale_factor=1.3), run_time=0.8)
        none = S("No single infection, food, gene or life event has been established as the cause.",
                 26, INK).to_edge(DOWN, buff=0.45)
        with self.say("No single infection, food, gene or life event has been established as the cause."):
            self.play(FadeIn(none, shift=UP * 0.2), run_time=0.8)

        self.play(*[FadeOut(m) for m in self.mobjects if m is not phrase], run_time=0.6)

        # susceptibility landscape
        tilt = ValueTracker(0.0)
        x0, x1 = -5.5, 5.5

        def land(x, k):
            # two valleys: calm (left) and inflamed (right); k lowers the right valley & the ridge
            return (0.9 * np.cos(x * 0.72) + 0.06 * x * x * 0.3 - k * (0.25 * x + 0.25)) * 0.9 - 0.6

        def make_land():
            k = tilt.get_value()
            g = FunctionGraph(lambda x: land(x, k), x_range=[x0, x1], color=BLUE, stroke_width=5)
            return g
        ground = always_redraw(make_land)
        ball_x = ValueTracker(-4.3)
        ball = always_redraw(lambda: Dot(radius=0.2, color=AMBER).move_to(
            [ball_x.get_value(), land(ball_x.get_value(), tilt.get_value()) + 0.2, 0]))
        calm = S("calm", 26, BLUE).move_to([-4.3, -2.6, 0])
        infl = S("inflamed state", 26, ORANGE).move_to([4.3, -2.6, 0])
        land_title = T("a landscape, not a switch", 36, INK, slant=ITALIC).to_edge(UP, buff=1.3)
        forces = VGroup(chip("older age", size=22), chip("genes: HLA, ANKRD55–IL6ST", size=22),
                        chip("unknown triggers", size=22)).arrange(RIGHT, buff=0.3).to_edge(DOWN, buff=0.3)
        with self.say("Genetic studies do point to immune-related regions of the genome, such as "
                      "HLA. But these are susceptibility signals, not a prediction. Think of a "
                      "landscape rather than a switch. Several small influences tilt the ground, "
                      "making an inflammatory state more likely, without deciding it."):
            self.play(Create(ground), FadeIn(land_title), run_time=1.4)
            self.play(FadeIn(ball, scale=0.5), FadeIn(calm), FadeIn(infl), run_time=0.8)
            for i, f in enumerate(forces):
                self.sfx("blip", -8)
                self.play(FadeIn(f, shift=UP * 0.2), tilt.animate.set_value(0.28 * (i + 1)),
                          ball_x.animate.set_value(-4.3 + 0.55 * (i + 1)), run_time=1.3)
            self.play(ball_x.animate.set_value(-2.2), rate_func=there_and_back, run_time=1.4)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)
        ground.clear_updaters(); ball.clear_updaters()

        blame = T("Association is not blame.", 54).shift(UP * 1.3)
        wrong = VGroup(*[T(s, 32, MUTED) for s in ["“not enough exercise”", "“the wrong breakfast”",
                                                    "“too much stress”"]]).arrange(RIGHT, buff=0.7)
        wrong.next_to(blame, DOWN, buff=0.9)
        with self.say("And association is not blame. Nobody causes their PMR by skipping exercise, "
                      "eating the wrong breakfast, or being too stressed."):
            self.play(Write(blame), run_time=1.2)
            for w in wrong:
                self.play(FadeIn(w), run_time=0.4)
                x = Line(w.get_left(), w.get_right(), color=RED, stroke_width=4)
                self.sfx("tick", -4)
                self.play(Create(x), w.animate.set_opacity(0.5), run_time=0.4)
        self.wait(0.4)
        self.clear_all()


# ======================================================================
class S04Signal(PMRScene):
    def construct(self):
        self.chapter(3, "Inside the signal network", "From a molecule to a morning")

        y = 0.5
        # immune cell
        cell = VGroup(Circle(0.85, color=BLUE, fill_color=BLUE, fill_opacity=0.15, stroke_width=4),
                      Circle(0.32, color=BLUE, fill_color=BLUE, fill_opacity=0.45, stroke_width=0))
        cell.move_to([-5.4, y, 0])
        # receiving cell membrane with receptor
        membrane = Line([-2.3, y + 1.9, 0], [-2.3, y - 1.9, 0], color=VIOLET, stroke_width=6)
        rec_stem = Line([-2.3, y, 0], [-2.85, y, 0], color=AMBER, stroke_width=6)
        rec_a = Line([-2.85, y, 0], [-3.25, y + 0.35, 0], color=AMBER, stroke_width=6)
        rec_b = Line([-2.85, y, 0], [-3.25, y - 0.35, 0], color=AMBER, stroke_width=6)
        gp = Line([-2.3, y - 0.45, 0], [-2.95, y - 0.45, 0], color=MINT, stroke_width=6)
        receptor = VGroup(rec_stem, rec_a, rec_b, gp)
        nucleus = VGroup(Circle(0.7, color=VIOLET, fill_color=VIOLET, fill_opacity=0.15, stroke_width=4),
                         T("DNA", 24, VIOLET))
        nucleus.move_to([0.2, y, 0])
        relay = Arrow([-2.2, y, 0], nucleus.get_left(), color=INK, buff=0.1, stroke_width=5)
        liver = VGroup(
            VMobject(fill_color="#9C4F3F", fill_opacity=0.75, stroke_color="#D07A62", stroke_width=3)
            .set_points_smoothly([[-1.2, 0.3, 0], [-0.3, 0.75, 0], [1.0, 0.55, 0], [1.1, 0.0, 0],
                                  [0.2, -0.65, 0], [-0.9, -0.4, 0], [-1.2, 0.3, 0]])
        ).move_to([2.9, y, 0])
        arrow2 = Arrow(nucleus.get_right(), liver.get_left(), color=INK, buff=0.15, stroke_width=5)
        gauge_box = Rectangle(width=0.55, height=2.8, color=INK, stroke_width=3).move_to([5.7, y, 0])
        level = ValueTracker(0.15)
        fill = always_redraw(lambda: Rectangle(width=0.47, height=max(0.01, 2.72 * level.get_value()),
                                               stroke_width=0, fill_color=ORANGE, fill_opacity=0.9)
                             .align_to(gauge_box, DOWN).shift(UP * 0.04).set_x(gauge_box.get_x()))
        arrow3 = Arrow(liver.get_right(), gauge_box.get_left(), color=INK, buff=0.15, stroke_width=5)
        labs = VGroup(
            S("immune cells", 22, INK).next_to(cell, DOWN, buff=0.4),
            S("IL-6 receptor + gp130", 22, INK).next_to(membrane, DOWN, buff=0.2),
            S("JAK–STAT → genes", 22, INK).next_to(nucleus, DOWN, buff=0.45),
            S("liver", 22, INK).next_to(liver, DOWN, buff=0.45),
            S("CRP", 24, ORANGE).next_to(gauge_box, DOWN, buff=0.2),
        )
        mech = tag("mechanism · not a simulation").to_corner(UR, buff=0.4)

        particles = VGroup(*[Dot(radius=0.07, color=AMBER) for _ in range(9)])
        for i, p in enumerate(particles):
            p.move_to(cell.get_center() + 0.5 * np.array([np.cos(i), np.sin(i * 1.7), 0]))

        with self.say("Inflammation is a conversation between cells. Immune cells talk using "
                      "signalling proteins called cytokines, and one important voice in PMR is "
                      "interleukin six, or IL-6."):
            self.play(GrowFromCenter(cell), FadeIn(labs[0]), FadeIn(mech), run_time=1.0)
            self.play(LaggedStart(*[FadeIn(p, scale=0.3) for p in particles], lag_ratio=0.08), run_time=1.0)
            il6 = S("IL-6", 24, AMBER).next_to(cell, UP, buff=0.25)
            self.play(FadeIn(il6), *[p.animate.shift(RIGHT * (1.2 + 0.1 * i) + UP * 0.2 * np.sin(i))
                                     for i, p in enumerate(particles)], run_time=1.6)
        with self.say("IL-6 binds a receptor on a responding cell, together with a partner protein "
                      "called gp130. Inside, a relay called the JAK–STAT pathway changes which genes "
                      "are switched on."):
            self.play(Create(membrane), Create(receptor), FadeIn(labs[1]), run_time=1.2)
            self.play(*[p.animate.move_to(rec_a.get_end() + LEFT * 0.1 + UP * 0.08 * (i - 4)) for i, p in
                        enumerate(particles)], run_time=1.2)
            self.sfx("pop", -6)
            self.play(Flash(rec_a.get_end(), color=AMBER), run_time=0.5)
            self.play(GrowArrow(relay), FadeIn(nucleus), FadeIn(labs[2]), run_time=1.1)
            self.play(Indicate(nucleus, color=VIOLET), run_time=0.9)
        with self.say("One place this matters is the liver. Prompted by IL-6, liver cells release "
                      "acute-phase proteins, including C-reactive protein, or CRP: one of the blood "
                      "tests used to track inflammation."):
            self.play(GrowArrow(arrow2), DrawBorderThenFill(liver), FadeIn(labs[3]), run_time=1.3)
            self.play(GrowArrow(arrow3), Create(gauge_box), FadeIn(fill), FadeIn(labs[4]), run_time=1.0)
            self.sfx("rise", 0)
            self.play(level.animate.set_value(0.85), run_time=1.6)

        network = VGroup(cell, particles, il6, membrane, receptor, relay, nucleus, arrow2, liver, arrow3,
                         gauge_box, fill)
        with self.say("Now watch what treatment does. A glucocorticoid steroid, such as prednisolone, "
                      "acts broadly. It turns down many parts of the network at once."):
            wash = Rectangle(width=14.5, height=5.2, stroke_width=0, fill_color=VIOLET, fill_opacity=0.14)
            wash.move_to([-12, y, 0])
            gl = chip("glucocorticoid: broad dimming", VIOLET, 24).to_edge(UP, buff=0.4).set_x(-2)
            self.play(FadeIn(gl, shift=DOWN * 0.2), run_time=0.6)
            self.sfx("dim", 0)
            shade = Rectangle(width=14.5, height=5.2, stroke_width=0, fill_color=BG, fill_opacity=0.62).move_to([0, y, 0])
            self.play(wash.animate.move_to([0, y, 0]), FadeIn(shade), level.animate.set_value(0.3), run_time=2.2)
            self.wait(0.6)
            self.play(FadeOut(wash), FadeOut(shade), FadeOut(gl), level.animate.set_value(0.85), run_time=1.0)
        with self.say("An IL-6 receptor blocker is more targeted. It cuts one specific link. And "
                      "because that link drives CRP, blocking it pushes CRP down directly."):
            bl = chip("IL-6 receptor blocker: one link cut", RED, 24).to_edge(UP, buff=0.4).set_x(-2)
            self.play(FadeIn(bl, shift=DOWN * 0.2), run_time=0.6)
            cut = VGroup(Line(UL, DR), Line(DL, UR)).set_stroke(RED, 7).scale(0.28).move_to(rec_a.get_end())
            self.sfx("snip", 0)
            self.play(Create(cut), particles.animate.shift(LEFT * 0.7).set_opacity(0.4),
                      receptor.animate.set_stroke(opacity=0.35), run_time=0.8)
            self.play(*[a.animate.set_stroke(opacity=0.25).set_fill(opacity=0.25) for a in (relay, arrow2, arrow3)],
                      run_time=0.6)
            self.sfx("fall", -2)
            self.play(level.animate.set_value(0.12), run_time=1.6)
        low = S("low CRP", 26, ORANGE)
        neq = T("≠", 52, INK)
        safe = S("disease or infection ruled out", 26, INK)
        eq = VGroup(low, neq, safe).arrange(RIGHT, buff=0.4).move_to([0, -2.6, 0])
        with self.say("Which leaves an important subtlety. On these drugs, a low CRP doesn't prove "
                      "that the disease, or an infection, has gone quiet. Turning down a warning "
                      "light is not the same as proving the system is safe."):
            self.play(FadeOut(labs[1:4]), FadeIn(eq[0]), run_time=0.7)
            self.play(Write(neq), FadeIn(safe), run_time=0.9)
            self.sfx("blip_low", -4)
            ember = Dot(radius=0.12, color=ORANGE).move_to(cell)
            self.play(FadeIn(ember), Flash(cell, color=ORANGE, flash_radius=1.1), run_time=0.9)
            self.play(ember.animate.scale(1.6), rate_func=there_and_back, run_time=0.9)
        self.wait(0.4)
        fill.clear_updaters()
        self.clear_all()


# ======================================================================
def _g(t, mu, sig):
    d = (t - mu + 12) % 24 - 12  # circular distance on a 24h clock
    return np.exp(-0.5 * (d / sig) ** 2)


def symptom(t):
    return 0.18 + 0.78 * _g(t, 6.0, 3.3) + 0.14 * _g(t, 22.5, 2.6)


def cortisol(t):
    return 0.12 + 0.62 * _g(t, 8.5, 3.6)


class S05Rhythm(PMRScene):
    def construct(self):
        self.chapter(4, "Why mornings are hard", "A disease with a daily rhythm")

        ax = Axes(x_range=[0, 24, 6], y_range=[0, 1.1, 1], x_length=10, y_length=4.4,
                  axis_config=dict(color=MUTED, include_tip=False, stroke_width=2),
                  y_axis_config=dict(include_ticks=False)).shift(DOWN * 0.3 + LEFT * 0.4)
        xl = VGroup(*[S(f"{h:02d}:00", 22).next_to(ax.c2p(h, 0), DOWN, buff=0.25) for h in range(0, 25, 6)])
        yl = S("relative level", 22).rotate(PI / 2).next_to(ax.y_axis, LEFT, buff=0.25)
        band = Rectangle(width=ax.c2p(8, 0)[0] - ax.c2p(4, 0)[0], height=4.4, stroke_width=0,
                         fill_color=ORANGE, fill_opacity=0.1).move_to(ax.c2p(6, 0.55))
        band_l = S("04:00 – 08:00", 22, ORANGE).next_to(band, UP, buff=0.12)
        sym = ax.plot(symptom, x_range=[0, 24], color=ORANGE, stroke_width=5)
        cor = DashedVMobject(ax.plot(cortisol, x_range=[0, 24], color=VIOLET, stroke_width=4), num_dashes=60)
        sym_l = S("pain & stiffness (illustrative)", 22, ORANGE).move_to(ax.c2p(18.5, 0.95))
        cor_l = S("cortisol (illustrative, dashed)", 22, VIOLET).move_to(ax.c2p(18.5, 0.82))
        ctag = tag("conceptual curves · no patient data").to_corner(DR, buff=0.35)

        hour = ValueTracker(0.0)
        dot = always_redraw(lambda: Dot(ax.c2p(hour.get_value(), symptom(hour.get_value())),
                                        radius=0.11, color=AMBER))
        vline = always_redraw(lambda: DashedLine(ax.c2p(hour.get_value(), 0),
                                                 ax.c2p(hour.get_value(), symptom(hour.get_value())),
                                                 color=AMBER, stroke_width=2))

        def clock_label():
            h = hour.get_value() % 24
            h = min(hour.get_value(), 23.99)
            return S(f"{int(h):02d}:{int((h % 1) * 60):02d}", 34, AMBER).next_to(ax.c2p(0, 1.1), RIGHT, buff=0.4)
        clock = always_redraw(clock_label)

        with self.say("PMR also has a daily rhythm. Why does getting up feel so much worse than "
                      "staying up?"):
            self.play(Create(ax), FadeIn(xl), FadeIn(yl), FadeIn(ctag), run_time=1.4)
            self.play(Create(sym), FadeIn(sym_l), run_time=1.8)
        with self.say("In a small, controlled study of untreated patients, pain and stiffness were "
                      "greatest between roughly four and eight in the morning, and lowest around "
                      "four in the afternoon."):
            self.play(FadeIn(dot), FadeIn(vline), FadeIn(clock), run_time=0.5)
            self.play(hour.animate.set_value(6), run_time=2.0, rate_func=linear)
            self.play(FadeIn(band), FadeIn(band_l), run_time=0.7)
            self.sfx("tick", -4)
            self.play(hour.animate.set_value(16), run_time=2.4, rate_func=smooth)
            low = S("lowest ≈ 16:00", 22, AMBER).next_to(ax.c2p(16, symptom(16)), DOWN, buff=0.3)
            self.play(FadeIn(low), run_time=0.5)
            self.sfx("blip", -8)
        with self.say("The body's own cortisol, an anti-inflammatory hormone, also rises and falls "
                      "through the day. It's tempting to say that PMR is simply too little cortisol. "
                      "But that study actually found cortisol was higher in PMR than in people "
                      "without it. The story is about timing and demand, not a simple shortage."):
            self.play(Create(cor), FadeIn(cor_l), run_time=2.0)
            self.play(hour.animate.set_value(24), run_time=2.2, rate_func=linear)
            myth = VGroup(S("“too little cortisol”", 26, INK), T("✗", 30, RED)).arrange(RIGHT, buff=0.25)
            myth.to_corner(UR, buff=0.5)
            fact = S("study: cortisol higher in PMR than controls", 22, MINT).next_to(myth, DOWN, buff=0.2,
                                                                                    aligned_edge=RIGHT)
            self.play(FadeIn(myth[0]), run_time=0.6)
            self.sfx("blip_low", -6)
            self.play(FadeIn(myth[1], scale=1.5), FadeIn(fact), run_time=0.7)
            sep = S("separate quantities · arbitrary scale", 20).next_to(ax, DOWN, buff=0.75).align_to(ax, LEFT)
            self.play(FadeIn(sep), run_time=0.5)
        dot.clear_updaters(); vline.clear_updaters(); clock.clear_updaters()
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        nl = NumberLine(x_range=[30, 60, 5], length=10, include_numbers=True, font_size=28, color=MUTED)
        for n in nl.numbers:
            n.set_color(MUTED)
        nl_l = T("Minutes of morning stiffness", 38).to_edge(UP, buff=0.9)
        fuzz = VGroup(*[Rectangle(width=0.06, height=0.9, stroke_width=0, fill_color=ORANGE,
                                  fill_opacity=0.5 * np.exp(-((x - 45) / 2.6) ** 2)).move_to(nl.n2p(x))
                        for x in np.linspace(38, 52, 90)])
        mark = Line(nl.n2p(45) + UP * 0.12, nl.n2p(45) + UP * 0.7, color=ORANGE, stroke_width=5)
        m_lab = S("> 45 min: one research classification feature", 24, ORANGE).next_to(mark, UP, buff=0.3)
        d44 = Dot(nl.n2p(44), radius=0.12, color=BLUE)
        d46 = Dot(nl.n2p(46), radius=0.12, color=BLUE)
        q44 = VGroup(S("44", 24, BLUE), S("not ruled out", 20, INK)).arrange(DOWN, buff=0.1).next_to(d44, DOWN, buff=0.9).shift(LEFT * 1.2)
        q46 = VGroup(S("46", 24, BLUE), S("not ruled in", 20, INK)).arrange(DOWN, buff=0.1).next_to(d46, DOWN, buff=0.9).shift(RIGHT * 1.2)
        a44 = Arrow(q44.get_top(), d44.get_bottom(), buff=0.1, color=BLUE, stroke_width=3)
        a46 = Arrow(q46.get_top(), d46.get_bottom(), buff=0.1, color=BLUE, stroke_width=3)
        with self.say("Morning stiffness lasting more than forty-five minutes is one feature "
                      "researchers use to classify PMR. But it is not a magic threshold. Forty-four "
                      "minutes doesn't rule it out, and forty-six doesn't rule it in."):
            self.play(Create(nl), FadeIn(nl_l), run_time=1.0)
            self.play(Create(mark), FadeIn(m_lab), run_time=0.9)
            self.wait(1.2)
            self.play(FadeIn(fuzz), mark.animate.set_opacity(0.5), run_time=1.2)
            self.sfx("pop", -8)
            self.play(FadeIn(d44, scale=2), GrowArrow(a44), FadeIn(q44), run_time=0.8)
            self.sfx("pop", -8)
            self.play(FadeIn(d46, scale=2), GrowArrow(a46), FadeIn(q46), run_time=0.8)
        self.wait(0.4)
        self.clear_all()


# ======================================================================
class S06Diagnosis(PMRScene):
    def construct(self):
        self.chapter(5, "Building a diagnosis", "Assembled — not read from one blood result")

        specs = [("Pattern", BLUE, UL), ("Blood tests", ORANGE, UR), ("Imaging", VIOLET, DL),
                 ("Review", MINT, DR)]
        lenses = VGroup()
        for name, col, d in specs:
            c = Circle(1.35, color=col, stroke_width=4, fill_color=col, fill_opacity=0.1)
            lab = T(name, 28, col)
            lenses.add(VGroup(c, lab))
        start = [np.array([x, 1.0, 0]) for x in (-5.1, -1.7, 1.7, 5.1)]
        final = [np.array([-0.85, 0.75, 0]), np.array([0.85, 0.75, 0]), np.array([-0.85, -0.95, 0]),
                 np.array([0.85, -0.95, 0])]
        for L, s0 in zip(lenses, start):
            L[0].move_to(s0)
            L[1].move_to(s0)
        details = [
            "age, where it hurts,\nmorning stiffness,\nexamination",
            "CRP & ESR, plus tests\nthat look for\nalternatives",
            "ultrasound can show\ninflamed bursae &\ntendon sheaths",
            "revisit the diagnosis\nif the course stops\nfitting",
        ]
        det = VGroup(*[S(d, 22, INK) for d in details])
        for d, s0 in zip(det, start):
            d.next_to(s0, DOWN, buff=1.65)

        with self.say("There is no single test for PMR. A diagnosis is assembled, by looking through "
                      "four lenses."):
            self.play(LaggedStart(*[GrowFromCenter(L) for L in lenses], lag_ratio=0.2), run_time=1.6)
            for _ in lenses:
                self.sfx("pop", -9)
        with self.say("The pattern: age, where it hurts, morning stiffness, and the examination. "
                      "Blood tests: inflammatory markers like CRP and ESR, plus tests that look for "
                      "other explanations. Imaging: ultrasound can reveal inflamed bursae and tendon "
                      "sheaths. And review: a plan to revisit the diagnosis if the course stops "
                      "fitting."):
            for L, d in zip(lenses, det):
                self.play(Indicate(L[0], color=L[0].get_color(), scale_factor=1.08), FadeIn(d, shift=UP * 0.1),
                          run_time=0.7)
                self.wait(2.0)
            self.play(FadeOut(det), run_time=0.5)
            anims = []
            for L, f in zip(lenses, final):
                anims += [L[0].animate.move_to(f), L[1].animate.move_to(f + (f / np.linalg.norm(f)) * 0.6)
                          .scale(0.72)]
            self.sfx("whoosh", -8)
            self.play(*anims, run_time=1.4)
            core = Dot(ORIGIN + DOWN * 0.1, radius=0.22, color=INK)
            core_l = S("working diagnosis", 24, INK).next_to(core, DOWN, buff=0.12)
            core_bg = BackgroundRectangle(core_l, color=BG, fill_opacity=0.8, buff=0.06)
            self.sfx("chime", -12)
            self.play(GrowFromCenter(core), FadeIn(core_bg), FadeIn(core_l), Flash(core, color=INK), run_time=0.9)

        mimics = ["older-onset rheumatoid arthritis", "rotator cuff or osteoarthritis",
                  "inflammatory muscle disease", "underactive thyroid / medicines",
                  "infection or cancer", "fibromyalgia"]
        chips_ = VGroup(*[chip(m, size=22, fill="#262A35") for m in mimics])
        angles = np.linspace(PI * 0.5, PI * 2.5, len(mimics), endpoint=False)
        for c, a in zip(chips_, angles):
            c.move_to([4.7 * np.cos(a), 2.95 * np.sin(a) - 0.1, 0])
        with self.say("Several other conditions can look like PMR: older-onset rheumatoid arthritis, "
                      "shoulder problems, muscle disease, an underactive thyroid, infection, or even "
                      "cancer. Clinicians keep these in view."):
            self.play(LaggedStart(*[FadeIn(c, scale=0.7) for c in chips_], lag_ratio=0.2), run_time=2.4)
            self.play(LaggedStart(*[Indicate(c, color=AMBER, scale_factor=1.08) for c in chips_], lag_ratio=0.15),
                      run_time=2.0)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        a = VGroup(chip("fast response to steroids", size=28, fill="#262A35"),
                   T("supports", 34, MINT), chip("PMR", size=28, fill="#262A35")).arrange(RIGHT, buff=0.4)
        b = VGroup(chip("fast response to steroids", size=28, fill="#262A35"),
                   T("does not prove", 34, ORANGE), chip("PMR", size=28, fill="#262A35")).arrange(RIGHT, buff=0.4)
        a.shift(UP * 0.8); b.shift(DOWN * 0.6)
        why = S("steroids quiet inflammation in many diseases, and can mask alternatives", 24).next_to(b, DOWN, buff=0.6)
        with self.say("And a dramatic response to steroids supports the diagnosis, but it isn't proof. "
                      "Steroids quiet inflammation in many diseases, and can hide the alternatives."):
            self.play(FadeIn(a, shift=UP * 0.2), run_time=0.9)
            self.wait(0.8)
            self.sfx("blip_low", -6)
            self.play(FadeIn(b, shift=UP * 0.2), run_time=0.9)
            self.play(FadeIn(why), run_time=0.7)
        self.wait(0.4)
        self.clear_all()


# ======================================================================
class S07GCA(PMRScene):
    def construct(self):
        self.chapter(6, "The artery connection", "A related disease, a different danger")

        intro = VGroup(T("giant cell arteritis", 46, RED), S("GCA · inflammation of the arteries themselves", 26))
        intro.arrange(DOWN, buff=0.25).to_edge(UP, buff=0.5)

        wall = ValueTracker(0.28)
        R = 1.75
        cxs = np.array([-4.3, -0.9, 0])

        def section():
            w = wall.get_value()
            outer = Circle(R, stroke_width=0, fill_color="#B8475A", fill_opacity=0.9).move_to(cxs)
            infl = Circle(R - 0.14, stroke_width=0, fill_color=interpolate_color(ManimColor("#C9667A"),
                          ManimColor(ORANGE), (w - 0.28) / 0.9), fill_opacity=0.95).move_to(cxs)
            lumen = Circle(max(R - 0.14 - w, 0.08), stroke_width=0, fill_color="#3A0B12", fill_opacity=1).move_to(cxs)
            return VGroup(outer, infl, lumen)
        xs = always_redraw(section)
        xs_l = S("cross-section", 22).next_to(cxs + DOWN * R, DOWN, buff=0.25)

        # longitudinal view with flow
        x_a, x_b = -1.6, 6.3
        yc = -0.9
        half = 1.05

        def lumen_r(x):
            w = wall.get_value()
            narrow = (w - 0.28) * 1.0 * np.exp(-((x - 2.4) / 1.4) ** 2)
            return max(half - 0.14 - narrow, 0.07)

        def tube():
            xs_ = np.linspace(x_a, x_b, 60)
            top = [[x, yc + lumen_r(x), 0] for x in xs_]
            bot = [[x, yc - lumen_r(x), 0] for x in xs_[::-1]]
            body = Polygon(*top, *bot, stroke_width=0, fill_color="#3A0B12", fill_opacity=1)
            wall_t = VMobject(stroke_color=interpolate_color(ManimColor("#C9667A"), ManimColor(ORANGE),
                                                             (wall.get_value() - 0.28) / 0.9),
                              stroke_width=6).set_points_smoothly(top)
            wall_b = VMobject(stroke_color=wall_t.get_stroke_color(), stroke_width=6).set_points_smoothly(bot)
            outer = Rectangle(width=x_b - x_a, height=2 * half, stroke_width=0, fill_color="#B8475A",
                              fill_opacity=0.9).move_to([(x_a + x_b) / 2, yc, 0])
            return VGroup(outer, body, wall_t, wall_b)
        tb = always_redraw(tube)
        rng = np.random.default_rng(3)
        cells = VGroup()
        for i in range(34):
            d = Dot(radius=0.07, color="#FF7B8A")
            d.u = rng.uniform(-0.85, 0.85)
            d.x = rng.uniform(x_a, x_b)
            cells.add(d)

        def flow(m, dt):
            for d in m:
                r = lumen_r(d.x)
                speed = 1.9 * (half - 0.14) / max(r, 0.2) * (0.5 if wall.get_value() > 0.8 else 1)
                d.x += speed * dt * 0.6
                if d.x > x_b - 0.05:
                    d.x = x_a + 0.05
                d.move_to([d.x, yc + d.u * r, 0])
                d.set_opacity(1 if (abs(d.u) < (r / (half - 0.14)) + 0.35) else 0)
        cells.add_updater(flow)
        tb_l = S("along the artery", 22).move_to([(x_a + x_b) / 2, yc - half - 0.35, 0])
        itag = tag("illustrative only · not a flow model").to_corner(DR, buff=0.35)

        with self.say("There is one related condition that changes the urgency completely: giant cell "
                      "arteritis, or GCA. It overlaps with PMR, but it is inflammation of the "
                      "arteries themselves."):
            self.play(Write(intro[0]), run_time=1.3)
            self.play(FadeIn(intro[1], shift=UP * 0.2), run_time=0.7)
            self.sfx("heartbeat", -6)
            self.play(FadeIn(xs), FadeIn(xs_l), FadeIn(tb), FadeIn(tb_l), FadeIn(itag), run_time=1.2)
            self.add(cells)
        with self.say("When the artery wall becomes inflamed and thickens, the open channel inside, "
                      "the lumen, narrows. Less blood can reach the tissues downstream, including "
                      "those that serve vision."):
            self.sfx("rise", -3)
            self.play(wall.animate.set_value(1.18), run_time=4.0, rate_func=smooth)
            eye = S("less flow to tissues downstream, including vision", 24, AMBER)
            eye.next_to(tb_l, DOWN, buff=0.25)
            self.play(FadeIn(eye), run_time=0.6)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)
        for m in (xs, tb, cells):
            m.clear_updaters()

        def row(col, head, what, action):
            box = RoundedRectangle(corner_radius=0.2, width=12.2, height=1.75, stroke_color=col, stroke_width=3,
                                   fill_color=col, fill_opacity=0.08)
            h = T(head, 34, col)
            act = chip(action, color=BG, size=26, fill=col)
            w = S(what, 24, INK)
            h.move_to(box).align_to(box, LEFT).align_to(box, UP).shift(RIGHT * 0.4 + DOWN * 0.28)
            act.move_to(box).align_to(box, RIGHT).align_to(box, UP).shift(LEFT * 0.4 + DOWN * 0.24)
            w.next_to(h, DOWN, buff=0.22, aligned_edge=LEFT)
            return VGroup(box, h, act, w)
        r1 = row(RED, "Vision symptoms", "new loss of vision, a curtain over vision, double vision — even if resolved",
                 "emergency, now")
        r2 = row(AMBER, "New head & jaw symptoms", "new headache, scalp tenderness, jaw pain when chewing",
                 "urgent, same day")
        panel = VGroup(r1, r2).arrange(DOWN, buff=0.4).shift(DOWN * 0.1)
        uk = S("In the UK: an emergency eye service or A&E for visual symptoms;\n"
               "999 for sudden severe visual loss, stroke symptoms or collapse.", 22).next_to(panel, DOWN, buff=0.4)
        head = T("Do not wait for the next routine appointment", 38).to_edge(UP, buff=0.5)
        with self.say("That's why these symptoms must not wait. New loss of vision, a curtain over "
                      "your vision, or double vision needs emergency assessment now, even if it has "
                      "already passed. A new headache, scalp tenderness, or jaw pain when chewing "
                      "needs urgent, same-day medical assessment."):
            self.sfx("alert", -2)
            self.play(FadeIn(head, shift=DOWN * 0.2), run_time=0.7)
            self.play(FadeIn(r1, shift=UP * 0.3), run_time=0.8)
            self.play(Indicate(r1[2], color=RED, scale_factor=1.1), run_time=0.8)
            self.wait(2.6)
            self.play(FadeIn(r2, shift=UP * 0.3), run_time=0.8)
            self.play(Indicate(r2[2], color=AMBER, scale_factor=1.1), run_time=0.8)
            self.play(FadeIn(uk), run_time=0.6)
        self.play(FadeOut(VGroup(head, panel, uk)), run_time=0.6)

        steps = VGroup(chip("strong suspicion", size=26), chip("treatment may start", size=26, color=BG,
                                                                  fill=AMBER),
                       chip("ultrasound / biopsy", size=26)).arrange(RIGHT, buff=1.0)
        arrs = VGroup(*[Arrow(steps[i].get_right(), steps[i + 1].get_left(), buff=0.15, color=MUTED)
                        for i in range(2)])
        note = S("delay can risk irreversible sight loss", 26, RED).next_to(steps, DOWN, buff=0.8)
        with self.say("Doctors may start treatment for strongly suspected GCA before tests confirm it, "
                      "because delay can risk permanent loss of sight."):
            self.play(FadeIn(steps[0]), run_time=0.6)
            self.play(GrowArrow(arrs[0]), FadeIn(steps[1], shift=RIGHT * 0.2), run_time=0.8)
            self.sfx("pop", -6)
            self.play(GrowArrow(arrs[1]), FadeIn(steps[2], shift=RIGHT * 0.2), run_time=0.8)
            self.play(FadeIn(note), run_time=0.6)
        self.wait(0.4)
        self.clear_all()


# ======================================================================
class S08Taper(PMRScene):
    def construct(self):
        self.chapter(7, "Control, then reduce", "Two clocks, not one countdown")

        p1 = chip("1 · control the inflammation", size=30, fill="#262A35")
        p2 = chip("2 · earn each reduction", size=30, fill="#262A35")
        ph = VGroup(p1, p2).arrange(RIGHT, buff=1.2)
        arr = Arrow(p1.get_right(), p2.get_left(), buff=0.15, color=MUTED)
        drug = S("usually a glucocorticoid: prednisolone in UK practice", 24).next_to(ph, DOWN, buff=0.6)
        with self.say("Treatment has two phases. First, control the inflammation. Then, carefully, "
                      "earn each reduction. The usual starting point is a glucocorticoid steroid, "
                      "commonly prednisolone in the UK."):
            self.play(FadeIn(p1, shift=RIGHT * 0.3), run_time=0.8)
            self.play(GrowArrow(arr), FadeIn(p2, shift=RIGHT * 0.3), run_time=0.9)
            self.play(FadeIn(drug), run_time=0.7)
        self.play(FadeOut(VGroup(ph, arr, drug)), run_time=0.5)

        formula = VGroup(S("one-unit cut as a share of the dose", 24),
                         T("reduction ÷ starting amount × 100", 34, INK)).arrange(DOWN, buff=0.2)
        formula.to_edge(UP, buff=0.4)
        u = 0.36
        rows = VGroup()
        pct_labels = VGroup()
        for n, pct in ((20, 5), (10, 10), (5, 20)):
            sq = VGroup(*[Square(u, stroke_color=BG, stroke_width=2, fill_color=BLUE, fill_opacity=0.75)
                          for _ in range(n)]).arrange(RIGHT, buff=0)
            lab = S(f"{n} → {n-1}", 28, INK)
            rows.add(VGroup(lab, sq))
        for r in rows:
            r[1].next_to(ORIGIN, RIGHT, buff=0).align_to(np.array([-3.2, 0, 0]), LEFT)
            r[0].next_to(r[1], LEFT, buff=0.5)
        rows.arrange(DOWN, buff=0.7, aligned_edge=LEFT).shift(DOWN * 0.4 + LEFT * 0.8)
        with self.say("Here's some simple arithmetic that shows why the last steps can feel the "
                      "biggest. Cutting one unit from twenty is five percent of the starting amount. "
                      "The same one unit from ten is ten percent. And from five, it's twenty percent."):
            self.play(FadeIn(formula), run_time=0.8)
            for i, (r, pct) in enumerate(zip(rows, (5, 10, 20))):
                self.play(FadeIn(r[0]), LaggedStart(*[FadeIn(s) for s in r[1]], lag_ratio=0.03), run_time=0.9)
                last = r[1][-1]
                self.play(last.animate.set_fill(ORANGE, 1).shift(RIGHT * 0.45), run_time=0.5)
                num = Integer(0, font_size=40, color=ORANGE)
                pc = S("%", 30, ORANGE)
                grp = VGroup(num, pc).arrange(RIGHT, buff=0.06).next_to(last, RIGHT, buff=0.5)
                pc.add_updater(lambda m, n=num: m.next_to(n, RIGHT, buff=0.06))
                self.add(grp)
                self.sfx("rise", -8)
                self.play(ChangeDecimalToValue(num, pct), run_time=1.1)
                pc.clear_updaters()
                pct_labels.add(grp)
                self.wait(1.0 if i < 2 else 0.2)
        atag = tag("arithmetic only · not a taper schedule", AMBER, 22).to_edge(DOWN, buff=0.4)
        with self.say("That's arithmetic only, not a taper schedule. But it hints at a deeper point: "
                      "there are two clocks running."):
            self.play(FadeIn(atag, shift=UP * 0.2), run_time=0.7)
            self.play(*[Indicate(g, color=ORANGE) for g in pct_labels], run_time=1.2)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        def track(title, col, steps, y):
            ttl = T(title, 30, col)
            boxes = VGroup()
            for s_ in steps:
                b = RoundedRectangle(corner_radius=0.15, width=2.75, height=0.95, stroke_color=col,
                                     stroke_width=2, fill_color=col, fill_opacity=0.06)
                boxes.add(VGroup(b, S(s_, 22, INK).scale_to_fit_width(min(2.45, S(s_, 22).width)).move_to(b)))
            boxes.arrange(RIGHT, buff=0.3)
            grp = VGroup(ttl, boxes).arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to([0, y, 0])
            return grp
        A = track("Clock A · the disease", ORANGE, ["active", "suppressed", "tested in reduction", "remission"], 1.5)
        B = track("Clock B · your own cortisol system", VIOLET,
                  ["external steroid", "adrenal drive reduced", "recovery", "resilience"], -1.4)
        mA = Triangle(color=ORANGE, fill_opacity=1).scale(0.14).rotate(PI)
        mB = Triangle(color=VIOLET, fill_opacity=1).scale(0.14).rotate(PI)
        mA.next_to(A[1][0], UP, buff=0.08)
        mB.next_to(B[1][0], UP, buff=0.08)
        with self.say("Clock A is the disease: active, then suppressed, then tested as the dose comes "
                      "down, and hopefully, remission. Clock B is the body's own cortisol system. "
                      "Long-term steroid treatment tells the brain to turn down the adrenal glands, "
                      "and they may need time to recover."):
            self.play(FadeIn(A[0]), LaggedStart(*[FadeIn(b) for b in A[1]], lag_ratio=0.15), run_time=1.2)
            self.play(FadeIn(mA), run_time=0.3)
            for k in (1, 2, 3):
                self.sfx("tick", -6)
                self.play(mA.animate.next_to(A[1][k], UP, buff=0.08), run_time=0.7)
                self.wait(0.4)
            self.wait(0.8)
            self.play(FadeIn(B[0]), LaggedStart(*[FadeIn(b) for b in B[1]], lag_ratio=0.15), run_time=1.2)
            self.play(FadeIn(mB), run_time=0.3)
            self.sfx("tick", -6)
            self.play(mB.animate.next_to(B[1][1], UP, buff=0.08), run_time=0.9)
        with self.say("The two clocks are not synchronised. Disease can be controlled while the "
                      "adrenal system is still suppressed."):
            self.play(Indicate(A[1][3][0], color=ORANGE), Indicate(B[1][1][0], color=VIOLET), run_time=1.2)
            self.play(mB.animate.next_to(B[1][2], UP, buff=0.08), run_time=1.5, rate_func=rate_functions.ease_in_out_sine)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        causes = VGroup(chip("relapse", size=26, color=ORANGE, fill="#2B2320"),
                        chip("steroid withdrawal symptoms", size=26, color=AMBER, fill="#2B2820"),
                        chip("adrenal insufficiency", size=26, color=VIOLET, fill="#25202E"))
        causes.arrange(DOWN, buff=0.55, aligned_edge=RIGHT).shift(LEFT * 3.0 + UP * 0.8)
        worse = chip("feeling worse during a reduction", size=28, fill="#262A35").shift(RIGHT * 3.0 + UP * 0.8)
        arrows = VGroup(*[Arrow(c.get_right(), worse.get_left() + UP * 0.12 * (1 - i), buff=0.15, color=MUTED,
                                stroke_width=3, max_tip_length_to_length_ratio=0.08)
                          for i, c in enumerate(causes)])
        q = S("telling them apart needs assessment, not guessing", 24, INK).next_to(worse, DOWN, buff=0.9)
        never = VGroup(
            RoundedRectangle(corner_radius=0.2, width=12, height=1.1, stroke_color=RED, stroke_width=3,
                             fill_color=RED, fill_opacity=0.08),
            T("Never stop prolonged steroid treatment abruptly.", 36, INK),
        ).to_edge(DOWN, buff=0.5)
        never[1].move_to(never[0])
        with self.say("So feeling worse during a reduction could be a relapse, steroid withdrawal "
                      "symptoms, or adrenal insufficiency. Telling them apart needs proper "
                      "assessment. And it's why prolonged steroid treatment must never be stopped "
                      "abruptly."):
            self.play(FadeIn(worse), run_time=0.6)
            for c, a in zip(causes, arrows):
                self.sfx("pop", -8)
                self.play(FadeIn(c, shift=RIGHT * 0.2), GrowArrow(a), run_time=0.7)
            self.play(FadeIn(q), run_time=0.6)
            self.wait(0.6)
            self.sfx("alert", -8)
            self.play(FadeIn(never, shift=UP * 0.2), run_time=0.8)
        self.wait(0.5)
        self.clear_all()


# ======================================================================
class BarChart_(VGroup):
    """A 0–100 % chart with labelled bars (fixed scale so trials are drawn alike)."""

    def __init__(self, bars, height=4.2, bar_w=1.3, gap=0.7, decimals=1):
        super().__init__()
        n = len(bars)
        width = n * bar_w + (n + 1) * gap
        self.h = height
        base = Line(ORIGIN, RIGHT * width, color=MUTED, stroke_width=2)
        grid = VGroup()
        for v in (25, 50, 75, 100):
            ln = DashedLine(UP * height * v / 100, UP * height * v / 100 + RIGHT * width, color=GREY,
                            stroke_width=1.5, dash_length=0.08)
            lab = S(f"{v}%", 18).next_to(ln, LEFT, buff=0.15)
            grid.add(ln, lab)
        self.add(grid, base)
        self.bars, self.values, self.nums, self.names = VGroup(), [], VGroup(), VGroup()
        for i, (name, value, col) in enumerate(bars):
            x = gap + i * (bar_w + gap)
            r = Rectangle(width=bar_w, height=0.001, stroke_width=0, fill_color=col, fill_opacity=0.9)
            r.move_to(RIGHT * (x + bar_w / 2), aligned_edge=DOWN)
            self.bars.add(r)
            self.values.append(value)
            nm = S(name, 22, INK).next_to(RIGHT * (x + bar_w / 2), DOWN, buff=0.2)
            self.names.add(nm)
            num = DecimalNumber(0, num_decimal_places=decimals, font_size=30, color=col).next_to(r, UP, buff=0.12)
            self.nums.add(num)
        self.add(self.bars, self.names, self.nums)

    def grow(self, run_time=1.6):
        anims = []
        for r, v, num in zip(self.bars, self.values, self.nums):
            target = r.copy().stretch_to_fit_height(max(self.h * v / 100, 0.001)).align_to(r, DOWN)

            def upd(m, a, r=r, v=v):
                m.set_value(v * a)
                m.next_to(r, UP, buff=0.12)
            anims += [Transform(r, target), UpdateFromAlphaFunc(num, upd)]
        return AnimationGroup(*anims, run_time=run_time)


class S09Trials(PMRScene):
    def construct(self):
        self.chapter(8, "What the trials show", "Four trials, four different questions")

        with self.say("What about medicines that spare steroids? Four trials asked four different "
                      "questions, so let's read each on its own, not rank them."):
            cards = VGroup(*[chip(s, size=26, fill="#262A35") for s in
                             ["SAPHYR · 2023", "Methotrexate · 2025/26", "PMR-SPARE · 2022", "REPLENISH · 2026"]])
            cards.arrange_in_grid(2, 2, buff=(0.8, 0.6))
            for c in cards:
                self.sfx("pop", -9)
                self.play(FadeIn(c, scale=0.8), run_time=0.45)
            self.wait(1.0)
        self.play(FadeOut(cards), run_time=0.5)

        def header(name, sub, pop_):
            return VGroup(T(name, 40), S(sub, 24, INK), S(pop_, 22)).arrange(DOWN, aligned_edge=LEFT, buff=0.14) \
                .to_corner(UL, buff=0.5)

        def chart(bars, **kw):
            c = BarChart_(bars, **kw)
            c.move_to([-2.4, -0.55, 0])
            return c

        def notes(lines, col=INK):
            g = VGroup(*[S(l, 22, col) for l in lines]).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
            if g.width > 5.0:
                g.scale_to_fit_width(5.0)
            g.move_to([1.6, -0.3, 0], aligned_edge=LEFT)
            return g

        mtag = tag("reported trial results", MINT).to_corner(DR, buff=0.35)
        minis = VGroup()

        # SAPHYR
        h = header("SAPHYR", "sarilumab (IL-6 receptor blocker), relapsing PMR",
                   "118 people · endpoint: sustained remission at week 52")
        c = chart([("sarilumab\n+ 14-week taper", 28.3, BLUE), ("placebo\n+ 52-week taper", 10.3, MUTED)],
                  bar_w=1.3, gap=1.15)
        n = notes(["+18.0 percentage points", "(95% CI 4.15–31.82)", "median steroid used:",
                   "777 mg vs 2,044 mg", "endpoint includes CRP,", "which this drug lowers directly"])
        n[0].set_color(MINT); n[3].set_color(MINT); n[4].set_color(AMBER); n[5].set_color(AMBER)
        with self.say("In SAPHYR, people with relapsing PMR received the IL-6 receptor blocker "
                      "sarilumab with a fourteen-week steroid taper, or a placebo with a fifty-two "
                      "week taper. Sustained remission at one year: twenty-eight percent versus ten "
                      "percent, an eighteen point difference, with far less steroid used overall. "
                      "Remember, though, that the endpoint included CRP, which this drug lowers "
                      "directly."):
            self.play(FadeIn(h, shift=RIGHT * 0.2), FadeIn(mtag), FadeIn(c[:2]), FadeIn(c.names), run_time=1.0)
            self.add(c.nums)
            self.sfx("rise", -4)
            self.play(c.grow(), run_time=1.8)
            self.play(LaggedStart(*[FadeIn(x, shift=LEFT * 0.1) for x in n[:4]], lag_ratio=0.35), run_time=2.0)
            self.wait(3.0)
            self.play(FadeIn(n[4:]), run_time=0.7)
            self.sfx("blip_low", -6)
        for num in c.nums:
            num.clear_updaters()
        minis.add(VGroup(h[0].copy(), c.copy()))
        self.play(FadeOut(VGroup(h, c, n)), run_time=0.5)

        # Methotrexate
        h = header("Methotrexate 25 mg / week", "recently diagnosed PMR, same 24-week steroid taper",
                   "64 randomised, 58 analysed · endpoint: low activity & no steroids at week 52")
        c = chart([("methotrexate", 80, BLUE), ("placebo", 46, MUTED)], decimals=0)
        n = notes(["34-point reported difference", "promising, but a small study", "taken ONCE A WEEK,",
                   "never daily: daily dosing", "errors have been fatal"])
        n[0].set_color(MINT); n[2].set_color(RED); n[3].set_color(RED); n[4].set_color(RED)
        n[2:].shift(DOWN * 0.4)
        with self.say("A newer trial tested methotrexate at twenty-five milligrams, once a week, in "
                      "recently diagnosed PMR. Eighty percent versus forty-six percent had low "
                      "disease activity and needed no steroids at one year. Promising, but it was a "
                      "small study. And a vital safety point: for inflammatory disease, methotrexate "
                      "is taken once weekly. Accidental daily dosing has caused fatal toxicity."):
            self.play(FadeIn(h, shift=RIGHT * 0.2), FadeIn(c[:2]), FadeIn(c.names), run_time=1.0)
            self.add(c.nums)
            self.sfx("rise", -4)
            self.play(c.grow(), run_time=1.8)
            self.play(FadeIn(n[:2]), run_time=0.8)
            self.wait(3.2)
            self.sfx("alert", -8)
            self.play(FadeIn(n[2:], shift=UP * 0.1), run_time=0.8)
        for num in c.nums:
            num.clear_updaters()
        minis.add(VGroup(h[0].copy(), c.copy()))
        self.play(FadeOut(VGroup(h, c, n)), run_time=0.5)

        # PMR-SPARE
        h = header("PMR-SPARE", "tocilizumab (IL-6 receptor blocker), new-onset PMR",
                   "36 people · endpoint: steroid-free remission at week 16")
        c = chart([("tocilizumab", 63.2, BLUE), ("placebo", 11.8, MUTED)])
        n = notes(["12 / 19  vs  2 / 17", "both arms: prednisone", "20 mg → 0 over 11 weeks",
                   "small & short: can't gauge", "rare harms, or be compared", "with a 52-week trial"])
        n[0].set_color(MINT)
        with self.say("PMR-SPARE tested tocilizumab, which blocks the same receptor, in new-onset PMR. "
                      "Sixty-three percent versus twelve percent were in steroid-free remission at "
                      "sixteen weeks. But with only thirty-six participants and a short endpoint, it "
                      "can't tell us much about rare harms."):
            self.play(FadeIn(h, shift=RIGHT * 0.2), FadeIn(c[:2]), FadeIn(c.names), run_time=1.0)
            self.add(c.nums)
            self.sfx("rise", -4)
            self.play(c.grow(), run_time=1.8)
            self.play(LaggedStart(*[FadeIn(x) for x in n], lag_ratio=0.3), run_time=2.0)
        for num in c.nums:
            num.clear_updaters()
        minis.add(VGroup(h[0].copy(), c.copy()))
        self.play(FadeOut(VGroup(h, c, n)), run_time=0.5)

        # REPLENISH
        h = header("REPLENISH", "secukinumab (targets IL-17A), recently relapsed PMR",
                   "381 people · endpoint: remission sustained from week 12 to week 52")
        c = chart([("300 mg", 41.2, BLUE), ("150 mg", 40.6, BLUE), ("placebo", 20.4, MUTED)], bar_w=1.1, gap=0.55)
        n = notes(["both doses beat placebo", "infections more common", "on active treatment",
                   "a trial result is not a", "licence or NHS funding"])
        n[0].set_color(MINT); n[1].set_color(AMBER); n[2].set_color(AMBER)
        with self.say("And in twenty twenty-six, REPLENISH tested secukinumab, which targets a "
                      "different cytokine, IL-17A. About forty-one percent on either dose, versus "
                      "twenty percent on placebo, stayed in remission from week twelve to week "
                      "fifty-two. Infections were more common on the active drug."):
            self.play(FadeIn(h, shift=RIGHT * 0.2), FadeIn(c[:2]), FadeIn(c.names), run_time=1.0)
            self.add(c.nums)
            self.sfx("rise", -4)
            self.play(c.grow(), run_time=1.8)
            self.play(LaggedStart(*[FadeIn(x) for x in n], lag_ratio=0.3), run_time=2.2)
        for num in c.nums:
            num.clear_updaters()
        minis.add(VGroup(h[0].copy(), c.copy()))
        self.play(FadeOut(VGroup(h, c, n)), run_time=0.5)

        # grid of four + reading habits
        for m in minis:
            m[0].next_to(m[1], UP, buff=0.35)
        minis.arrange(RIGHT, buff=0.55)
        minis.scale_to_fit_width(12.4).shift(UP * 1.3)
        seps = VGroup(*[DashedLine(UP * 1.6, DOWN * 1.6, color=RED, stroke_width=2).move_to(
            (minis[i].get_right() + minis[i + 1].get_left()) / 2) for i in range(3)])
        warn = S("different people, endpoints and tapers: don't compare bars across trials", 24, RED)
        warn.next_to(minis, DOWN, buff=0.35)
        habits = VGroup(*[chip(s, size=24, fill="#262A35") for s in
                          ["Who was studied?", "What counted as success?", "What came with the drug?"]])
        habits.arrange(RIGHT, buff=0.35).to_edge(DOWN, buff=0.5)
        self.play(FadeOut(mtag), run_time=0.3)
        with self.say("Different populations, endpoints and tapers mean these bars can't be compared "
                      "across trials. So for any trial, ask three things: who was studied, what "
                      "counted as success, and what came with the drug."):
            self.play(FadeIn(minis, scale=0.9), run_time=1.0)
            self.sfx("snip", -6)
            self.play(LaggedStart(*[Create(s) for s in seps], lag_ratio=0.2), FadeIn(warn), run_time=1.2)
            self.wait(1.2)
            for hb in habits:
                self.sfx("tick", -4)
                self.play(FadeIn(hb, shift=UP * 0.2), run_time=0.5)
        self.wait(0.5)
        self.clear_all()


# ======================================================================
class S10Recovery(PMRScene):
    def construct(self):
        self.chapter(9, "The long road back", "Recovery is a distribution, not a script")

        dots = VGroup(*[Circle(0.15, stroke_color=MUTED, stroke_width=2, fill_color=ORANGE, fill_opacity=0)
                        for _ in range(100)]).arrange_in_grid(10, 10, buff=0.16)
        dots.move_to([-3.2, -0.2, 0])
        big = Integer(0, font_size=110, color=ORANGE)
        pc = T("%", 60, ORANGE)
        yr = S("after 1 year", 30, INK).move_to([3.6, 1.2, 0])
        info = VGroup(S("still taking glucocorticoids", 28, INK)).move_to([3.6, -0.5, 0])
        legend = S("each dot = one percentage point, not a person", 20).next_to(dots, DOWN, buff=0.35)
        stag = tag("pooled observational evidence", MINT).to_corner(DR, buff=0.35)

        def show(pct, year_text, first=False, rt=1.6):
            nonlocal yr
            anims = [dots[i].animate.set_fill(opacity=0.9 if i < pct else 0) for i in range(100)]
            new_yr = S(year_text, 30, INK).move_to([3.6, 1.2, 0])
            extra = [FadeIn(yr)]
            if not first:
                extra = [FadeOut(yr, shift=UP * 0.2), FadeIn(new_yr, shift=UP * 0.2)]
            self.play(*anims, ChangeDecimalToValue(big, pct), *extra, run_time=rt)
            return new_yr

        with self.say("Many people recover, but not everyone follows a two-year script. In a pooled "
                      "analysis of real-world patients, about seventy-seven percent were still "
                      "taking glucocorticoids after one year,"):
            self.play(LaggedStart(*[FadeIn(d) for d in dots], lag_ratio=0.005), FadeIn(legend), FadeIn(stag),
                      run_time=1.4)
            grp = VGroup(big, pc).arrange(RIGHT, buff=0.08, aligned_edge=DOWN).move_to([3.6, 0.3, 0])
            pc.add_updater(lambda m: m.next_to(big, RIGHT, buff=0.08, aligned_edge=DOWN))
            self.add(grp, info)
            self.sfx("rise", -4)
            show(77, "after 1 year", first=True, rt=2.4)
        with self.say("fifty-one percent after two years, and twenty-five percent after five."):
            self.sfx("fall", -6)
            yr = show(51, "after 2 years", rt=1.4)
            self.wait(0.3)
            self.sfx("fall", -6)
            yr = show(25, "after 5 years", rt=1.4)
        caveat = S("different time points pool different cohorts:\nnot a single survival curve", 22, AMBER)
        caveat.next_to(info, DOWN, buff=0.4)
        with self.say("These cohorts were varied, and mostly predate newer treatments. So this is a "
                      "guide to expectations, not a prediction for any one person."):
            self.play(FadeIn(caveat), run_time=0.8)
            self.wait(1.0)
        pc.clear_updaters()
        self.play(FadeOut(VGroup(big, pc, yr, info, caveat)), run_time=0.5)

        rel = VGroup(Integer(43, font_size=96, color=AMBER), T("%", 56, AMBER)).arrange(RIGHT, buff=0.08,
                                                                                        aligned_edge=DOWN)
        rel.move_to([3.6, 0.9, 0])
        rel_l = VGroup(S("had at least one relapse", 26, INK), S("in the first year", 26, INK)).arrange(DOWN, buff=0.12)
        rel_l.next_to(rel, DOWN, buff=0.35)
        nf = S("a feature of the disease, not a personal failure", 24, MINT).next_to(rel_l, DOWN, buff=0.45)
        with self.say("The same review found that about forty-three percent had at least one relapse in "
                      "the first year. Relapse is a common feature of the disease. It is not a "
                      "personal failure."):
            self.play(*[dots[i].animate.set_fill(AMBER, opacity=0.9 if i < 43 else 0) for i in range(100)],
                      FadeIn(rel), FadeIn(rel_l), run_time=1.6)
            self.wait(1.6)
            self.sfx("chime", -12)
            self.play(FadeIn(nf, shift=UP * 0.1), run_time=0.8)
        self.play(*[FadeOut(m) for m in self.mobjects], run_time=0.6)

        mort = VGroup(T("Norwegian cohort · 38-year study period", 34),
                      S("no increase in overall mortality versus matched controls", 26, MINT),
                      S("reassuring, but not proof that the disease or its treatment is harmless", 22))
        mort.arrange(DOWN, buff=0.25).to_edge(UP, buff=0.7)
        goals = VGroup(*[chip(s, size=26, fill="#1F3A30", color=INK) for s in
                         ["dressing more easily", "walking a manageable route", "rising from a chair",
                          "sleeping better", "returning to valued activities"]])
        goals.arrange_in_grid(2, 3, buff=(0.35, 0.4)).shift(DOWN * 1.2)
        glab = S("recovery goals worth tracking alongside blood tests", 24).next_to(goals, UP, buff=0.4)
        with self.say("There is reassurance too. A Norwegian cohort, followed over a thirty-eight year "
                      "period, found no increase in overall mortality with PMR. And alongside "
                      "treatment, rebuilding strength and function is its own project: dressing, "
                      "walking, rising from a chair, and getting back to the things that matter."):
            self.play(FadeIn(mort[0], shift=DOWN * 0.2), run_time=0.8)
            self.play(FadeIn(mort[1]), run_time=0.7)
            self.play(FadeIn(mort[2]), run_time=0.6)
            self.wait(1.0)
            self.play(FadeIn(glab), run_time=0.5)
            for g in goals:
                self.sfx("pop", -10)
                self.play(FadeIn(g, shift=UP * 0.2), run_time=0.45)
        self.wait(0.5)
        self.clear_all()


# ======================================================================
class S11Close(PMRScene):
    def construct(self):
        # recap motifs
        ring = Circle(0.55, color=ORANGE, stroke_width=6)
        rec = VGroup(Line(ORIGIN, LEFT * 0.5), Line(LEFT * 0.5, LEFT * 0.85 + UP * 0.35),
                     Line(LEFT * 0.5, LEFT * 0.85 + DOWN * 0.35)).set_stroke(AMBER, 6)
        wave = FunctionGraph(lambda x: 0.4 * np.cos(x * 2.2), x_range=[-1.4, 1.4], color=ORANGE, stroke_width=5)
        lens = VGroup(*[Circle(0.35, color=c, stroke_width=4).shift(v) for c, v in
                        ((BLUE, UL * 0.25), (ORANGE, UR * 0.25), (VIOLET, DL * 0.25), (MINT, DR * 0.25))])
        art = VGroup(Circle(0.6, stroke_width=0, fill_color="#B8475A", fill_opacity=1),
                     Circle(0.25, stroke_width=0, fill_color="#3A0B12", fill_opacity=1))
        clocks = VGroup(Line(LEFT * 0.7, RIGHT * 0.7, color=ORANGE, stroke_width=6).shift(UP * 0.25),
                        Line(LEFT * 0.7, RIGHT * 0.7, color=VIOLET, stroke_width=6).shift(DOWN * 0.25))
        motifs = VGroup(ring, rec, wave, lens, art, clocks)
        caps = ["around the joints,\nnot destroyed muscle", "driven by immune\nsignals like IL-6",
                "a daily rhythm", "an assembled\ndiagnosis", "GCA: vision\nnever waits",
                "control, then\nreduce: two clocks"]
        items = VGroup()
        for m, c_ in zip(motifs, caps):
            m_ = m.copy()
            m_.scale_to_fit_height(min(1.2, m_.height)) if m_.height > 1.2 else None
            cap = S(c_, 26, INK)
            items.add(VGroup(m_, cap).arrange(DOWN, buff=0.35))
        for it in items:
            it[0].set(height=min(it[0].height, 1.1))
            it[1].next_to(it[0], DOWN, buff=0.35)
        items.arrange_in_grid(2, 3, buff=(1.3, 0.8), cell_alignment=UP).move_to(ORIGIN)
        with self.say("So, to put it all together. PMR is inflammation around the joints, not "
                      "destroyed muscle. It's driven by immune signals like IL-6, it follows a daily "
                      "rhythm, and it's diagnosed by assembling evidence."):
            for it in items[:4]:
                self.sfx("pop", -9)
                self.play(FadeIn(it, shift=UP * 0.2), run_time=0.7)
                self.wait(1.2)
        with self.say("Treatment controls it first, then reduces carefully, with two clocks in mind. And "
                      "the symptoms of giant cell arteritis, especially any change in vision, never "
                      "wait."):
            self.play(FadeIn(items[5], shift=UP * 0.2), run_time=0.7)
            self.wait(1.4)
            self.sfx("alert", -10)
            self.play(FadeIn(items[4], shift=UP * 0.2), run_time=0.7)
            self.play(Indicate(items[4], color=RED), run_time=1.0)
        self.play(FadeOut(items), run_time=0.6)

        head = T("Questions for your next appointment", 44).to_edge(UP, buff=0.6)
        qs = bullet_rows([
            "How confident is the diagnosis, and what else has been considered?",
            "What is my GCA action plan: which symptoms, and where do I go?",
            "What is the agreed taper, and who do I contact before changing a dose?",
            "Do I need a steroid emergency card and a sick-day plan?",
            "Am I protected: bones, blood pressure, glucose, eyes, vaccines?",
        ], size=28, buff=0.38)
        qs.next_to(head, DOWN, buff=0.6)
        with self.say("If you or someone you care about lives with PMR, questions like these make a "
                      "good starting point for the next appointment."):
            self.play(FadeIn(head, shift=DOWN * 0.2), run_time=0.7)
            for q in qs:
                self.sfx("tick", -6)
                self.play(FadeIn(q, shift=RIGHT * 0.2), run_time=0.55)
            self.wait(1.2)
        self.play(FadeOut(VGroup(head, qs)), run_time=0.6)

        title = T("Polymyalgia, explained", 64)
        url = T("0x4d44.github.io/polymyalgia", 34, BLUE, font=SANS)
        fine = VGroup(
            S("Educational research synthesis · not medical advice · AI-assisted, not independently clinically reviewed", 20),
            S("Key sources: NHS · EULAR 2025 recommendations (online 2026) · SAPHYR · Bolhuis 2025/26 · PMR-SPARE · REPLENISH · Floris 2022 · Tengesdal 2025", 18),
            S("Narration: Piper neural TTS · music and sound composed in code · animation: Manim Community", 18),
        ).arrange(DOWN, buff=0.18)
        card = VGroup(title, url).arrange(DOWN, buff=0.5).shift(UP * 0.6)
        for f in fine:
            if f.width > 12.8:
                f.scale_to_fit_width(12.8)
        fine.to_edge(DOWN, buff=0.6)
        with self.say("The full interactive guide, with every source, lives in the 0x4D44 Almanac. "
                      "Thanks for watching."):
            self.sfx("sparkle", -6)
            self.play(Write(title), run_time=1.4)
            self.play(FadeIn(url, shift=UP * 0.2), run_time=0.8)
            self.play(FadeIn(fine), run_time=0.8)
        self.wait(2.5)
        self.play(FadeOut(VGroup(card, fine)), run_time=1.2)
        self.wait(0.8)
