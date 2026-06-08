/* origins.jsx — where the document came from (timeline) */

function Origins() {
  return (
    <Section id="origins">
      <SectionHead
        num="§ 01 — Provenance"
        title='Where the <span class="serif">prospectus</span> came from'
        intro="The IPO is older than the rulebook that governs it. For three centuries companies sold shares to the public on whatever terms they liked; it took a spectacular crash to turn the sales pitch into a sworn legal document."
      />

      <div className="timeline">
        {window.TIMELINE.map((t, i) => (
          <div className="tl-item" key={i}>
            <div>
              <div className="tl-year">{t.year}</div>
              <div className="tl-tag">{t.tag}</div>
            </div>
            <div className="tl-body">
              <h3>{t.title}</h3>
              {t.body.map((p, j) => (
                <p key={j} dangerouslySetInnerHTML={{ __html: p }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 26, alignItems: "center" }} className="origins-coda">
        <p className="pull">
          The genius of 1933 was not to decide which investments were{" "}
          <span className="amber">good</span>. It was to force every issuer to tell
          the <span className="amber">truth</span> — and then let the public be
          wrong on its own terms.
        </p>
        <Facsimile head="Securities Act of 1933 · §5 (excerpt)" caption="Every prospectus must carry this disclaimer to this day.">
          <p style={{ fontStyle: "italic" }}>
            "Neither the Securities and Exchange Commission nor any state securities
            commission has approved or disapproved of these securities or passed upon
            the accuracy or adequacy of this prospectus. Any representation to the
            contrary is a criminal offense."
          </p>
        </Facsimile>
      </div>

      <style>{`
        @media (max-width: 760px){ .origins-coda{ grid-template-columns: 1fr !important; } }
      `}</style>
    </Section>
  );
}

window.Origins = Origins;
