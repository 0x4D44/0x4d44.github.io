/* ui.jsx — shared primitives, exported to window for the other
   browser-transpiled scripts. No `const styles` globals here. */

function Stamp({ children, variant = "", flat = false }) {
  const cls = ["stamp", variant, flat ? "flat" : ""].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      <span className="dot"></span>
      {children}
    </span>
  );
}

function SectionHead({ num, title, intro }) {
  return (
    <div className="sec-head">
      <div className="sec-num">{num}</div>
      <h2 className="sec-title" dangerouslySetInnerHTML={{ __html: title }} />
      {intro && <p className="sec-intro" dangerouslySetInnerHTML={{ __html: intro }} />}
    </div>
  );
}

/* A serif "filed page" panel standing in for the real document. */
function Facsimile({ head, children, caption }) {
  return (
    <div className="facsimile">
      {head && <div className="fx-head">{head}</div>}
      {children}
      {caption && <div className="fx-cap">{caption}</div>}
    </div>
  );
}

/* Hover-to-reveal redaction bar. */
function Redact({ children, title }) {
  return (
    <span className="redact" title={title || "[redacted — hover to reveal]"}>
      {children}
    </span>
  );
}

function Section({ id, children }) {
  return (
    <section id={id} className="section">
      <div className="wrap">{children}</div>
    </section>
  );
}

/* tiny helper for HTML strings */
function HTML({ as = "p", className, html }) {
  const Tag = as;
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

Object.assign(window, { Stamp, SectionHead, Facsimile, Redact, Section, HTML });
