/* quiz.jsx — "which pattern fits?" — pick the right shape for the job. */
const { useState: useStateQ } = React;

function Quiz() {
  const qs = window.QUIZ;
  const [i, setI] = useStateQ(0);
  const [picked, setPicked] = useStateQ(null);
  const [score, setScore] = useStateQ(0);
  const [answered, setAnswered] = useStateQ(0);
  const [done, setDone] = useStateQ(false);
  const q = qs[i];

  const choose = (idx) => {
    if (picked !== null) return;
    setPicked(idx);
    setAnswered((a) => a + 1);
    if (idx === q.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (i + 1 >= qs.length) { setDone(true); return; }
    setI(i + 1); setPicked(null);
  };
  const restart = () => { setI(0); setPicked(null); setScore(0); setAnswered(0); setDone(false); };

  const verdict = () => {
    const r = score / qs.length;
    if (r === 1) return "Flawless. You may now cross the Bridge of Death unchallenged.";
    if (r >= 0.66) return "Strong. The Knights who say ‘Ni!’ are mildly impressed.";
    if (r >= 0.33) return "’Tis but a scratch. Re-read the pattern cards and have another go.";
    return "She turned you into a newt? …You'll get better. (Try the cards above first.)";
  };

  return (
    <section id="quiz" className="cw-section">
      <CWReveal>
        <span className="cw-eyebrow">§ which pattern fits?</span>
        <h2 className="cw-h2">The <span style={{ color: "var(--cw-magenta)" }}>pattern-matching</span> test.</h2>
        <p className="cw-lede">
          Read the request. Pick the pattern you'd reach for. The wrong choice won't bite — but the right
          one comes with an explanation. Choosing the wrong workflow, not the model, is what breaks most runs.
        </p>
      </CWReveal>

      <CWReveal className="cw-quiz">
        {!done ? (
          <React.Fragment>
            <div className="cw-chip" style={{ borderColor: "var(--cw-magenta)" }}>scenario {i + 1} / {qs.length}</div>
            <div className="scn">“{q.scenario}”</div>
            <div className="opts">
              {q.options.map((o, idx) => {
                let cls = "cw-opt";
                if (picked !== null) {
                  if (idx === q.answer) cls += " right";
                  else if (idx === picked) cls += " wrong";
                }
                return (
                  <button key={idx} className={cls} onClick={() => choose(idx)} disabled={picked !== null}>
                    {String.fromCharCode(65 + idx)}. {o}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="why">
                <b style={{ color: picked === q.answer ? "var(--cw-green)" : "var(--cw-red)" }}>
                  {picked === q.answer ? "Correct! " : "Not quite. "}
                </b>
                {q.why}
              </div>
            )}
            <div className="cw-quiz-foot">
              <span className="score">score: {score} / {answered}</span>
              <button className="cw-btn go" onClick={next} disabled={picked === null}>
                {i + 1 >= qs.length ? "See verdict ▸" : "Next scenario ▸"}
              </button>
            </div>
          </React.Fragment>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 4px" }}>
            <div style={{ fontSize: 56, lineHeight: 1 }} aria-hidden="true">{score === qs.length ? "🏆" : score >= qs.length * 0.66 ? "🌳" : "🦎"}</div>
            <h3 style={{ fontFamily: "var(--cw-fun)", fontSize: "clamp(26px,5vw,40px)", margin: "10px 0 6px" }}>{score} / {qs.length}</h3>
            <p className="cw-serif-cap" style={{ fontSize: 19, maxWidth: "46ch", margin: "0 auto 18px" }}>{verdict()}</p>
            <button className="cw-btn" onClick={restart}>↻ Have another go</button>
          </div>
        )}
      </CWReveal>
    </section>
  );
}

Object.assign(window, { Quiz });
