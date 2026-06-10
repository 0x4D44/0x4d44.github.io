/* global React, Aside, LiarMachine, GodelEncoder, Quiz, SnakeGame */
// ============================================================
// CHAPTERS A — prologue, formal systems, the liar, numbering
// ============================================================

function ChOuroboros() {
  return (
    <section id="ch-ouroboros" className="chapter drop" data-screen-label="00 The Ouroboros">
      <div className="chapter-rule"><span className="chapter-num">00 · Prologue</span></div>
      <h2>The Snake That Ate Its Own Tail</h2>
      <p className="chapter-dek">
        A short, true story about the limits of truth — told in snakes, microbes, and a little
        arithmetic.
      </p>
      <p>
        In 1931 a quiet 25-year-old logician named Kurt Gödel proved something that should have been
        impossible to prove: that mathematics can never be finished. Not “hasn't been finished yet” —
        <strong> can never be</strong>. Inside any honest system of mathematics powerful enough to do
        ordinary arithmetic, there will always be statements that are true but that the system itself
        can never prove.
      </p>
      <p>
        That sounds like mysticism. It is the opposite: it is one of the most rigorous results ever
        established, and the engine that drives it is something you have seen a thousand times in
        nature — a thing that <strong>refers to itself</strong>. A snake swallowing its own tail. A
        cell copying the instructions for copying cells. A sentence that talks about itself.
      </p>
      <Aside who="kurt">
        <p>Hello — I'm Kurt, your snake. Yes, I'm named after him. I'll be biting my own tail a lot in
        the next hour, because that single move is the whole trick. Keep your eye on the tail.</p>
      </Aside>
      <p>
        Our guide animals will be a snake (self-reference), a bacterium named Esther (self-replication),
        and — because the universe is in on the joke — two cuddly planets, Cassini and Jove, for when we
        need to zoom all the way out. By the end you will have built Gödel's famous sentence with your
        own hands, encoded a formula as a single gigantic number, and watched a program give birth to
        itself. Let's begin where every formal system begins: with rules.
      </p>
    </section>
  );
}

function ChFormalSystems() {
  return (
    <section id="ch-formal" className="chapter" data-screen-label="01 Formal Systems">
      <div className="chapter-rule"><span className="chapter-num">01 · The Dream</span></div>
      <h2>Formal Systems &amp; the Dream of Completeness</h2>
      <p className="chapter-dek">
        What if all of mathematics could be grown, mechanically, from a handful of seeds?
      </p>
      <p>
        A <strong>formal system</strong> is a game played with symbols. You are given a finite alphabet,
        a set of starting strings called <strong>axioms</strong>, and a set of mechanical
        <strong> rules of inference</strong> for turning strings you already have into new ones. A
        <strong> theorem</strong> is any string you can reach by applying the rules, starting from the
        axioms. No intuition, no insight, no genius required — just rule-following a machine could do.
      </p>
      <Aside who="esther">
        <p>I think about this the way I think about myself. My DNA is a finite alphabet — just four
        letters, A, C, G, T. The laws of chemistry are the rules of inference. Everything I am is a
        “theorem” derived from those axioms. Biology is a formal system that happens to be wet.</p>
      </Aside>
      <p>
        Around 1920 the great mathematician David Hilbert proposed a breathtaking program: pin down all
        of mathematics inside one such formal system, then prove three things about it —
      </p>
      <ul className="flora">
        <li><strong>Consistency</strong> — it never proves a statement and its opposite. No contradictions.</li>
        <li><strong>Completeness</strong> — every true statement is provable. Nothing true is left out.</li>
        <li><strong>Decidability</strong> — a mechanical procedure can decide whether any statement is provable.</li>
      </ul>
      <p>
        Picture a sealed terrarium. The axioms are the seeds; the rules are the laws of growth. Hilbert's
        dream was a terrarium so perfectly designed that <strong>every</strong> plant that <em>could</em>
        exist would eventually grow there, and no two plants would ever contradict each other. A complete,
        consistent world, decidable from the outside. It is a beautiful dream. Gödel ended it in a single
        paper.
      </p>
      <div className="theorem">
        <div className="theorem-label">The setup we'll need</div>
        <p>“Powerful enough” means the system can express basic arithmetic — addition, multiplication,
        the idea of a number. That modest power is all Gödel requires, and it's exactly enough to let
        the system talk about itself.</p>
      </div>
    </section>
  );
}

function ChLiar() {
  return (
    <section id="ch-liar" className="chapter" data-screen-label="02 The Liar's Paradox">
      <div className="chapter-rule"><span className="chapter-num">02 · Self-reference</span></div>
      <h2>The Liar's Paradox</h2>
      <p className="chapter-dek">
        The oldest sentence in philosophy is a snake eating its tail.
      </p>
      <p>
        Consider the sentence <strong>S: “This sentence is false.”</strong> Try to assign it a truth
        value. If S is true, then what it says holds — so it is false. If S is false, then it is not the
        case that S is false — so it is true. True implies false implies true implies false, forever.
        There is no stable answer. The sentence has bitten its own tail.
      </p>
      <p>
        This is the <strong>Liar's Paradox</strong>, known to the ancient Greeks. For two thousand years
        it was a curiosity — a party trick of language. Gödel's genius was to realize it was a blueprint.
        He asked: what if, instead of “false,” the self-referential sentence said
        <strong> “unprovable”</strong>? Watch the machine below chase the paradox in real time.
      </p>
      <LiarMachine />
      <p>
        Notice the machine never settles — and the more honestly it reasons, the faster it spins. That
        instability is not a bug in the sentence; it is a signature of self-reference colliding with the
        notions of <em>true</em> and <em>false</em>. Gödel's masterstroke was to swap those notions for
        something a formal system can actually talk about: <em>provability</em>. Before we get there,
        let's feel self-reference in your hands.
      </p>
      <SnakeGame />
      <Aside who="kurt">
        <p>Hitting a wall is a limit imposed from <em>outside</em> — boring. Hitting your own tail is a
        limit that comes from <em>within the system itself</em>. That inside-job is the only kind of
        limit Gödel cares about. Remember the feeling; we're about to make it precise.</p>
      </Aside>
      <Quiz
        q="Why can't the Liar sentence be assigned a stable truth value?"
        options={[
          "Because it is written in English rather than mathematics.",
          "Because assuming it true forces it false, and assuming it false forces it true.",
          "Because it is too long to evaluate.",
          "Because it contains a spelling error.",
        ]}
        answer={1}
        explain="It's the self-reference, not the language. Each truth assignment forces its own opposite — an endless oscillation. Gödel keeps this looping structure but trades 'false' for 'unprovable'."
      />
    </section>
  );
}

function ChNumbering() {
  return (
    <section id="ch-numbering" className="chapter" data-screen-label="03 Gödel Numbering">
      <div className="chapter-rule"><span className="chapter-num">03 · Encoding</span></div>
      <h2>Gödel Numbering: Turning Sentences into Numbers</h2>
      <p className="chapter-dek">
        Before a system can talk about itself, its own sentences must become things it can talk about.
      </p>
      <p>
        Here is the obstacle. A formal system for arithmetic talks about <em>numbers</em>: 0, 1, 2,
        successors, sums, products. It does not, on its face, talk about <em>sentences</em>. So how
        could it ever say something like “this sentence is unprovable”? Gödel's answer is the hinge of
        the entire proof: <strong>assign every symbol, formula, and proof its own unique number.</strong>
      </p>
      <p>
        The recipe is pure number theory. Give each symbol a code. Then encode a string of symbols
        {" "}<span className="mono">s₁ s₂ … sₙ</span> as the product of the first n primes, each raised
        to the power of its symbol's code:
      </p>
      <div className="mathblock">
        {"$$ \\#(\\sigma) \\;=\\; 2^{c_1}\\cdot 3^{c_2}\\cdot 5^{c_3}\\cdots p_n^{\\,c_n} $$"}
        <div className="math-caption">unique prime factorization guarantees the number decodes back to exactly one formula</div>
      </div>
      <p>
        Because every integer has exactly one prime factorization (the Fundamental Theorem of
        Arithmetic), this code is <strong>lossless</strong>: hand me the number and I can hand you back
        the one and only formula that produced it. A sentence and a number become two views of the same
        object — just as Esther's identity and her genome are two views of the same bacterium. Build a
        formula and watch it fold into its number:
      </p>
      <GodelEncoder />
      <Aside who="esther">
        <p>This is exactly what a genome <em>is</em>: a long sequence of symbols compressed into one
        physical object that can be copied, transmitted, and — crucially — read by the very machinery it
        describes. Gödel discovered the trick of self-description twenty years before we found it written
        inside us.</p>
      </Aside>
      <p>
        Now the magic. Statements <em>about</em> formulas (“formula X is an axiom,” “proof Y proves
        formula X”) become statements <em>about numbers</em> — and arithmetic can express statements
        about numbers. The system has gained the power to describe its own grammar. The snake can now
        see its own tail.
      </p>
      <Quiz
        q="What property of integers makes Gödel numbering reversible?"
        options={[
          "That there are infinitely many integers.",
          "That every integer is even or odd.",
          "Unique prime factorization — each number factors into primes in exactly one way.",
          "That primes get rarer as numbers grow.",
        ]}
        answer={2}
        explain="The Fundamental Theorem of Arithmetic guarantees one and only one prime factorization, so the encoding can always be decoded to a single original formula."
      />
    </section>
  );
}

Object.assign(window, { ChOuroboros, ChFormalSystems, ChLiar, ChNumbering });
