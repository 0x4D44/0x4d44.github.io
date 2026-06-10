/* global React, Aside, QuineLab, LogisticGraph, ProofWalkthrough, Quiz */
// ============================================================
// CHAPTERS B — self-replication, the sentence, 2nd theorem, meaning
// ============================================================

function ChReplication() {
  return (
    <section id="ch-replication" className="chapter" data-screen-label="04 Self-Replicating Life">
      <div className="chapter-rule"><span className="chapter-num">04 · Self-replication</span></div>
      <h2>Programs &amp; Microbes That Build Themselves</h2>
      <p className="chapter-dek">
        A bacterium is a sentence that prints itself. So is Gödel's.
      </p>
      <p>
        We have a sentence that can refer to itself in spirit (the Liar) and a way to make a system
        describe its own sentences (numbering). The last warm-up is to see <strong>self-reference do
        real work</strong> — to watch a thing reproduce itself from its own description. Biology does
        this constantly; Esther does it roughly every twenty minutes.
      </p>
      <Aside who="esther">
        <p>When I divide, I don't copy <em>myself</em> directly — I copy my <em>instructions</em>, and the
        instructions say “build a cell that contains these instructions.” The description and the thing
        described are the same object. That circularity isn't a paradox in me; it's the reason there's
        a me at all.</p>
      </Aside>
      <p>
        Computer scientists have a name for the code version of Esther: a <strong>quine</strong> — a
        program whose entire output is an exact copy of its own source text. No reading from a file, no
        cheating; the program reconstructs itself from within. It is the Liar's Paradox with the venom
        removed, turned into something productive. Run one:
      </p>
      <QuineLab />
      <p>
        The diagonal trick that makes a quine work — having a description refer to itself — is
        <em> mathematically the same move</em> Gödel uses to build his sentence. Quines, self-replicating
        cells, and Gödel's theorem are three faces of one idea: a system rich enough to describe itself
        can be made to point at itself.
      </p>

      <h3>An aside Esther insisted on: how colonies actually grow</h3>
      <p>
        Self-replication doesn't run away forever — a flask is finite. The way a bacterial population
        rises fast, then bends toward a ceiling, is captured by the <strong>logistic differential
        equation</strong>, and since you asked for calculus, here it is in full, alive and draggable.
      </p>
      <LogisticGraph />
      <p>
        The derivative <span className="mono">dP/dt</span> is the instantaneous growth rate; it is
        largest exactly when the population is half of its carrying capacity (the violet dot, where the
        second derivative vanishes) and dwindles to zero as the colony saturates. Integrate that rate
        and you get the graceful S-curve — the <em>sigmoid</em> — that shows up everywhere from cultures
        to chemical kinetics to the spread of an idea. A small, honest piece of mathematics describing a
        small, honest piece of life. Now back to the snake.
      </p>
      <Aside who="jove">
        <p>Jove here — the big striped one. While you're down at bacterial scale, remember: the same
        equation that bends Esther's growth curve also shapes how storms like my Great Red Spot trade
        energy with their surroundings. Self-limiting feedback is a law of nature, not just a law of
        flasks.</p>
      </Aside>
    </section>
  );
}

function ChSentence() {
  return (
    <section id="ch-sentence" className="chapter" data-screen-label="05 Building Gödel's Sentence">
      <div className="chapter-rule"><span className="chapter-num">05 · The Proof</span></div>
      <h2>Building Gödel's Sentence</h2>
      <p className="chapter-dek">
        Everything now assembles into one self-swallowing sentence — and the dream collapses.
      </p>
      <p>
        We have all the parts. A formal system <strong>F</strong> for arithmetic. A way to turn its
        sentences into numbers. And the lesson — from the Liar, from the snake, from the quine — that a
        self-describing system can be made to point at itself. Gödel now fuses them.
      </p>
      <p>
        First he writes, in pure arithmetic, a predicate <span className="mono">Prov(n)</span> meaning
        “the formula with Gödel number <span className="mono">n</span> is provable in F.” This is
        possible precisely because proofs are finite symbol-strings, hence numbers, hence things
        arithmetic can quantify over. Then he invokes the <strong>Diagonal Lemma</strong>: for any
        property P expressible in F, there exists a sentence G that asserts “P is true of my own Gödel
        number.” Choosing P to be <em>“is not provable,”</em> he obtains the sentence that detonates
        Hilbert's dream:
      </p>
      <div className="theorem">
        <div className="theorem-label">Gödel's sentence G</div>
        <p>“G is not provable in F.” — a sentence whose entire content is the claim that it itself
        cannot be proved.</p>
      </div>
      <p>
        Step through the argument one move at a time. Watch how it splits into two cases, and how both
        roads lead to the same astonishing place.
      </p>
      <ProofWalkthrough />
      <p>
        Read the last step again: G is <strong>true</strong> — it correctly reports its own
        unprovability — and yet <strong>F cannot prove it</strong>. There exists a true statement of
        arithmetic forever beyond F's reach. And patching the hole by adding G as a new axiom doesn't
        help: the new, larger system has its own fresh, unprovable G′. The tail always grows back.
      </p>
      <div className="theorem">
        <div className="theorem-label">First Incompleteness Theorem · 1931</div>
        <p>Any consistent formal system powerful enough for basic arithmetic is incomplete: it contains
        true statements it cannot prove.</p>
      </div>
      <Quiz
        q="In Case 1 of the proof, why is 'F proves G' impossible?"
        options={[
          "Because G is too long to prove.",
          "Because proving G would make G provable, yet G asserts its own unprovability — so F would prove both G and ¬G, i.e. be inconsistent.",
          "Because G is not a real sentence.",
          "Because Gödel said so without justification.",
        ]}
        answer={1}
        explain="Proving G makes 'G is provable' true; but G claims it is NOT provable. F would then prove a statement and its negation — a contradiction. Assuming F is consistent rules this out, forcing the conclusion that F cannot prove G at all."
      />
    </section>
  );
}

function ChSecond() {
  return (
    <section id="ch-second" className="chapter" data-screen-label="06 The Second Theorem">
      <div className="chapter-rule"><span className="chapter-num">06 · The deeper cut</span></div>
      <h2>The Second Theorem: A System Cannot Trust Itself</h2>
      <p className="chapter-dek">
        If incompleteness were the only blow, Hilbert might have lived. The second theorem is the one
        that hurts.
      </p>
      <p>
        Gödel noticed that the entire argument of the first theorem can itself be carried out
        <em> inside</em> F. The reasoning “if F is consistent, then F cannot prove G” is just more
        arithmetic, so F can express it. Let <span className="mono">Con(F)</span> be the arithmetic
        statement “F is consistent.” Then F can prove the implication:
      </p>
      <div className="mathblock">
        {"$$ F \\;\\vdash\\; \\big(\\,\\mathrm{Con}(F) \\;\\rightarrow\\; G\\,\\big) $$"}
        <div className="math-caption">if F is consistent then G holds — and F can prove this conditional</div>
      </div>
      <p>
        But we already proved that F <em>cannot</em> prove G. So if F could prove
        <span className="mono"> Con(F)</span>, it could combine that with the conditional above and
        derive G after all — a contradiction. The only escape is the stunning conclusion:
      </p>
      <div className="theorem">
        <div className="theorem-label">Second Incompleteness Theorem · 1931</div>
        <p>No consistent system powerful enough for arithmetic can prove its own consistency. A system
        that <em>could</em> prove “I am consistent” would, by that very fact, be inconsistent.</p>
      </div>
      <Aside who="cassini">
        <p>Cassini, the ringed one. Here's how I hold it: any mind, machine, or mathematics that is
        actually trustworthy can never fully <em>certify</em> its own trustworthiness from the inside.
        To be sure F is sound, you must step outside F into a larger system — which then can't vouch for
        <em> itself</em>, and so on, forever outward. It's turtles, or rather rings, all the way up.</p>
      </Aside>
      <p>
        This is why the second theorem ended Hilbert's program outright. He had hoped to prove the
        consistency of mathematics using only safe, finite, mechanical reasoning — from within. Gödel
        showed that the one thing such a system can never establish is precisely the thing Hilbert most
        needed it to: its own freedom from contradiction.
      </p>
    </section>
  );
}

function ChMeaning() {
  return (
    <section id="ch-meaning" className="chapter" data-screen-label="07 What It All Means">
      <div className="chapter-rule"><span className="chapter-num">07 · Reflection</span></div>
      <h2>What It All Means (and What It Doesn't)</h2>
      <p className="chapter-dek">
        Gödel did not break mathematics. He revealed its true shape — open-ended, inexhaustible, alive.
      </p>
      <p>
        It is tempting to read incompleteness as despair: mathematics is broken, truth is unreachable,
        nothing is certain. That reading is wrong. What Gödel showed is subtler and far more beautiful.
        <strong> Truth outruns proof.</strong> There are more true things than any single system can
        ever capture — which means mathematics can never be reduced to a finished mechanical game. There
        will always be more to discover. The terrarium is not sealed after all; it opens onto an
        infinite garden.
      </p>
      <ul className="flora">
        <li><strong>For computers:</strong> Turing soon translated incompleteness into the Halting Problem — no program can decide, for all programs, whether they stop. Limits on proof are limits on computation.</li>
        <li><strong>For minds:</strong> whether human understanding transcends any formal system is still fiercely debated. Gödel himself suspected the mind is not merely a machine — but the theorem alone doesn't settle it.</li>
        <li><strong>For honesty:</strong> the deepest lesson is the second theorem's — no sufficiently rich system can certify its own soundness. Trust always requires a step outside.</li>
      </ul>
      <Aside who="jove">
        <p>From up here it's almost funny. The smallest things — Esther's genome, a looping sentence,
        a snake's tail — and the largest questions about truth and mind turn out to run on the very same
        gear: <em>a thing that refers to itself.</em></p>
      </Aside>
      <p>
        So this is what your son's snakes and microbes were quietly teaching all along. The ouroboros
        isn't a paradox to be solved; it's a doorway. A system clever enough to describe itself becomes
        clever enough to surprise itself — to generate truths it can feel but never fully prove. That is
        not a flaw in mathematics. It's the reason there will always be more.
      </p>
      <div className="theorem">
        <div className="theorem-label">The whole thing in one breath</div>
        <p>Any honest system rich enough to talk about itself can write a sentence that talks about
        itself — and that sentence will always be able to say something true that the system can't
        prove. The snake will always find its tail.</p>
      </div>
      <Quiz
        q="Which reading of Gödel's theorems is most faithful to what they actually show?"
        options={[
          "Mathematics is broken and nothing can be trusted.",
          "Every mathematical question will eventually be answered by a big enough computer.",
          "Truth is richer than provability: no single consistent system can prove every truth, and none can certify its own consistency.",
          "Self-reference should be banned from mathematics to avoid paradox.",
        ]}
        answer={2}
        explain="Gödel separates truth from proof. There are true statements unprovable in any given consistent, arithmetic-capable system, and such a system can't prove its own consistency — but mathematics itself remains consistent and endlessly generative."
      />
    </section>
  );
}

Object.assign(window, { ChReplication, ChSentence, ChSecond, ChMeaning });
