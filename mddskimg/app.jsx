/* ============================================================
   readex — interactive explainer (React)
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;
const D = window.READEX_DATA;

/* -------- helpers -------- */

function classNames(...xs) { return xs.filter(Boolean).join(" "); }

/* -------- masthead -------- */

function Masthead() {
  return (
    <header className="masthead">
      <div className="brand">
        <span className="wordmark">readex</span>
        <span className="tag">/ raw disk image toolkit</span>
      </div>
      <nav className="mast-nav">
        <a href="#what">What</a>
        <a href="#pipeline">Pipeline</a>
        <a href="#filesystems">Filesystems</a>
        <a href="#commands">CLI</a>
        <a href="#txn">Transactions</a>
        <a href="#testing">Testing</a>
        <a href="#install">Install</a>
        <span className="v">v0.57.3 · edition 2024</span>
      </nav>
    </header>
  );
}

/* -------- hero with live terminal -------- */

const HERO_REEL = [
  {
    title: "inspect",
    lines: [
      ["prompt","$ "], ["cmd","readex inspect retro/win98.img"], ["nl"],
      ["out","Format: "],["key","raw"],["nl"],
      ["out","Layout: "],["key","Mbr"],["nl"],
      ["out","Region: partition-0 start=63 count=2_088_387"],["nl"],
      ["dim","  Filesystem: "],["ok","FatFamily"],["dim"," confidence="],["ok","High"],["nl"],
      ["dim","    FAT: variant=FAT32 oem=\"MSWIN4.1\" clusters=261_043"],["nl"],
      ["dim","    Root: 8 files, 12 dirs"],["nl"],
    ],
  },
  {
    title: "mount",
    lines: [
      ["prompt","$ "],["cmd","readex mount retro/win98.img /mnt/c"],["nl"],
      ["out","Mounted 1 region from retro/win98.img"],["nl"],
      ["dim","/mnt/c  partition-0  FAT32  RW  1.0 GiB  LBA 63-2088449"],["nl"],
      ["ok","Mounted 1 volume in 0.0s."],["nl"],
      ["prompt","$ "],["cmd","ls /mnt/c/WINDOWS"],["nl"],
      ["dim","COMMAND  CONFIG.SYS  EXPLORER.EXE  HIMEM.SYS  SYSTEM"],["nl"],
    ],
  },
  {
    title: "txn",
    lines: [
      ["prompt","$ "],["cmd","readex put image.img patch.bin /BOOT.BIN --txn s1"],["nl"],
      ["ok","[txn] "],["out","staged write   /BOOT.BIN  (8,192 bytes, 16 sectors)"],["nl"],
      ["prompt","$ "],["cmd","readex checkpoint s1 \"before reboot\""],["nl"],
      ["ok","[txn] "],["out","checkpoint saved; chain depth: 2"],["nl"],
      ["prompt","$ "],["cmd","readex commit s1 --mode export -o patched.img"],["nl"],
      ["ok","[txn] "],["out","committed: 16 sectors, 1 file → patched.img"],["nl"],
    ],
  },
  {
    title: "rescue",
    lines: [
      ["prompt","$ "],["cmd","readex check fail.img --rescue-log dd.map"],["nl"],
      ["out","Checking fat on fail.img"],["nl"],
      ["dim","Rescue log: 14 ranges, 2,148 bad sectors"],["nl"],
      ["warn","[FAT_RESCUE_HIT]   /DOCS/REPORT.DOC  4 bad sectors in extent 0"],["nl"],
      ["warn","[FAT_LOST_CHAIN]   orphan chain at cluster 4108"],["nl"],
      ["dim","2 anomalies, exit=1"],["nl"],
    ],
  },
];

function HeroTerminal() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const reel = HERO_REEL[idx];
  const totalTokens = reel.lines.length;

  useEffect(() => {
    setTyped(0);
    let t;
    const tick = (i) => {
      if (i >= totalTokens) {
        t = setTimeout(() => setIdx((x) => (x + 1) % HERO_REEL.length), 2400);
        return;
      }
      setTyped(i + 1);
      t = setTimeout(() => tick(i + 1), 60);
    };
    t = setTimeout(() => tick(0), 250);
    return () => clearTimeout(t);
  }, [idx]);

  return (
    <div className="term">
      <div className="term-chrome">
        <span className="dot" /><span className="dot" /><span className="dot" />
        <span className="label">readex — bash</span>
        <span className="tabs">
          {HERO_REEL.map((r, i) => (
            <button key={r.title} className={i === idx ? "active" : ""} onClick={() => setIdx(i)}>
              {r.title}
            </button>
          ))}
        </span>
      </div>
      <div className="term-body">
        {reel.lines.slice(0, typed).map((t, i) => {
          const [kind, txt] = t;
          if (kind === "nl") return <br key={i} />;
          const cls = ({
            prompt: "term-prompt",
            cmd: "term-cmd",
            out: "term-out",
            dim: "term-dim",
            ok: "term-ok",
            warn: "term-warn",
            key: "term-key",
          })[kind] || "term-out";
          return <span key={i} className={cls}>{txt}</span>;
        })}
        {typed < totalTokens && <span className="term-cursor" />}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="hero">
      <div>
        <div className="hero-eyebrow">Disk image toolkit · Rust · cross-platform</div>
        <h1>
          Browse, extract<br />
          and rewrite raw<br />
          disk images <span className="accent">without</span><br />
          <span className="quiet">loop mounts, root, or OS drivers.</span>
        </h1>
        <p className="hero-sub">
          Point <code>readex</code> at any raw disk image — a Win98 partition, a 1989 HFS floppy,
          an OpenVMS ODS-2 CD, a Stac-compressed STACVOL.DSK — and it will detect the
          partition layout, identify the filesystem, and let you inspect, browse, repair,
          undelete, mount, or atomically mutate the contents. All in user-space, on Windows,
          Linux or macOS, from a single binary.
        </p>
        <div className="hero-stats">
          <div className="cell"><span className="n">18</span><span className="l">filesystems</span></div>
          <div className="cell"><span className="n">9</span><span className="l">partition schemes</span></div>
          <div className="cell"><span className="n">~7,100</span><span className="l">tests</span></div>
          <div className="cell"><span className="n">69</span><span className="l">fuzz targets</span></div>
        </div>
      </div>
      <HeroTerminal />
    </div>
  );
}

/* -------- what (callouts) -------- */

function What() {
  return (
    <section id="what">
      <div className="section-eyebrow">
        <span className="num">§ 01</span><span>What it actually does</span><span className="rule" />
      </div>
      <h2>One binary between you and the bytes.</h2>
      <p className="lead">
        Most disk-forensics work today routes through loop devices, kernel drivers, or
        proprietary GUIs. <code>readex</code> reads and writes the on-disk structures
        directly — every filesystem driver is a pure-Rust port living next to its
        fuzz targets and consistency checker. No kernel mode, no privileged helpers.
      </p>

      <div className="callouts" style={{ marginTop: 28 }}>
        <div className="callout">
          <div className="ix">▌ 01</div>
          <div className="big"><span className="accent">No</span> loop mount.</div>
          <p>Filesystems are parsed in user-space. You don't need <code>losetup</code>, <code>kpartx</code>, or a Linux box that happens to support a 1989 SGI EFS volume.</p>
        </div>
        <div className="callout">
          <div className="ix">▌ 02</div>
          <div className="big"><span className="accent">No</span> root.</div>
          <p>Read commands are an ordinary file open. Write commands route through an in-memory overlay session — the source image is never modified unless you <code>commit</code>.</p>
        </div>
        <div className="callout">
          <div className="ix">▌ 03</div>
          <div className="big"><span className="accent">No</span> OS driver.</div>
          <p>HPFS on macOS. ODS-2 on Windows. JFS1 on a Linux container. Every supported filesystem works on every platform <code>readex</code> builds for.</p>
        </div>
      </div>
    </section>
  );
}

/* -------- pipeline -------- */

function Pipeline() {
  const [active, setActive] = useState("detect");
  const step = D.pipeline.find((s) => s.id === active);

  return (
    <section id="pipeline">
      <div className="section-eyebrow">
        <span className="num">§ 02</span><span>The pipeline</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>Every command, the same five steps.</h2>
        <p className="lead">
          Whether you're calling <code>inspect</code>, <code>mount</code> or <code>commit</code>,
          the request runs through the same staged pipeline. Click each step to see what happens.
        </p>
      </div>
      <div className="pipeline">
        {D.pipeline.map((s, i) => (
          <div
            key={s.id}
            className={classNames("pipe-step", s.id === active && "active")}
            onClick={() => setActive(s.id)}
          >
            <div className="pin"><span className="num">{i + 1}</span> STEP</div>
            <h3>{s.name}</h3>
            <div className="desc">{s.desc}</div>
            <div className="files"><span>{s.files}</span></div>
          </div>
        ))}
      </div>
      <div className="pipe-detail">
        <div className="left">
          <h3>{step.detail.title}</h3>
          <p>{step.detail.body}</p>
          <ul>{step.detail.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
        <div className="right">
          <h4>// Example</h4>
          <pre>{step.detail.code}</pre>
        </div>
      </div>
    </section>
  );
}

/* -------- filesystem matrix -------- */

function FilesystemMatrix() {
  const [active, setActive] = useState("fat");
  const fs = D.filesystems.find((f) => f.id === active);
  const caps = ["read", "write", "check", "fix", "undelete"];

  return (
    <section id="filesystems">
      <div className="section-eyebrow">
        <span className="num">§ 03</span><span>Supported filesystems</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>Eighteen drivers, one trait.</h2>
        <p className="lead">
          Every driver implements <code>FileSystemDriver</code> — the same detect / mount /
          read / write / check shape. Click a row to see capabilities, family, and what
          <code> readex </code>knows about it. Pre-DOS through present.
        </p>
      </div>
      <div className="fs-matrix">
        <div className="fs-list">
          {D.filesystems.map((f) => (
            <div
              key={f.id}
              className={classNames("fs-row", f.id === active && "active")}
              onClick={() => setActive(f.id)}
            >
              <span className="name">{f.name}</span>
              <span className="era">{f.era}</span>
              <span className="fs-caps">
                {caps.map((c) => (
                  <span key={c} className={classNames("cap-dot", f.caps[c] && "on")} title={c} />
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="fs-detail">
          <div className="hd">
            <h2>{fs.name}</h2>
            <span className="pill">{fs.family}</span>
          </div>
          <div className="sub">// origin: {fs.origin} · era: {fs.era}</div>
          <p className="blurb">{fs.blurb}</p>
          <div className="caps-grid">
            {caps.map((c) => (
              <div key={c} className={classNames("cap-cell", fs.caps[c] && "on")}>
                <div className="label">{c}</div>
                <div className="mark">{fs.caps[c] ? "●" : "○"}</div>
              </div>
            ))}
          </div>
          <dl className="meta">
            <div>
              <dt>Module</dt>
              <dd className="mono">src/fs/{fs.id}/</dd>
            </div>
            <div>
              <dt>Driver name</dt>
              <dd className="mono">{fs.id}</dd>
            </div>
            <div>
              <dt>Detect confidence</dt>
              <dd className="mono">None · Low · Medium · High</dd>
            </div>
            <div>
              <dt>Tested via</dt>
              <dd className="mono">filesystem_fixture_matrix.rs · e2e_cli_matrix.rs · fuzz/</dd>
            </div>
          </dl>
        </div>
      </div>
      <div style={{ marginTop: 18, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
        ● capability available · ○ not implemented · Compressed volumes: Stacker · DoubleSpace · DriveSpace transparently decompressed under FAT.
      </div>
    </section>
  );
}

/* -------- CLI command tabs -------- */

function CliPlayground() {
  const [tab, setTab] = useState("inspect");
  const c = D.commands.find((c) => c.id === tab);
  const tokenClass = {
    prompt: "term-prompt", cmd: "term-cmd", out: "term-out",
    dim: "term-dim", ok: "term-ok", warn: "term-warn", key: "term-key"
  };

  return (
    <section id="commands">
      <div className="section-eyebrow">
        <span className="num">§ 04</span><span>The CLI verbs</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>Eleven verbs. Same image, different intent.</h2>
        <p className="lead">
          Read verbs go straight to the mounted view. Mutating verbs route through the staged
          overlay layer. Mount projects the guest filesystem into your host. Check &amp; fix
          are the consistency-oracle layer. Tap a tab to see real output.
        </p>
      </div>
      <div className="term" style={{ minHeight: 460 }}>
        <div className="term-chrome">
          <span className="dot" /><span className="dot" /><span className="dot" />
          <span className="label">{c.cmd}</span>
          <span className="tabs">
            {D.commands.map((cm) => (
              <button key={cm.id} className={cm.id === tab ? "active" : ""} onClick={() => setTab(cm.id)}>
                {cm.id}
              </button>
            ))}
          </span>
        </div>
        <div style={{ padding: "12px 0 6px", color: "var(--termdim)", fontSize: 11.5, letterSpacing: "0.02em" }}>
          {c.desc}
        </div>
        <div className="term-body">
          {c.output.map((t, i) => {
            const [kind, txt] = t;
            if (kind === "nl") return <br key={i} />;
            return <span key={i} className={tokenClass[kind] || "term-out"}>{txt}</span>;
          })}
        </div>
      </div>
    </section>
  );
}

/* -------- transaction state machine -------- */

function TxnMachine() {
  const [stage, setStage] = useState(0);
  const stages = D.txnStages;
  const cur = stages[stage];

  return (
    <section id="txn">
      <div className="section-eyebrow">
        <span className="num">§ 05</span><span>Transactions &amp; the write path</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 28 }}>
        <h2>Every write goes through an overlay session.</h2>
        <p className="lead">
          Mutations don't touch the source image. They stage into an in-memory overlay tracked by
          an <code>OverlayBlockDevice</code>, persisted to a <code>.txn</code> session file with
          named checkpoints. Step the state machine →
        </p>
      </div>
      <div className="txn-states">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={classNames("txn-state", i === stage && "active", i < stage && "passed")}
            onClick={() => setStage(i)}
          >
            <div className="ix">STAGE 0{i + 1}</div>
            <div className="name">{s.name}</div>
          </div>
        ))}
      </div>
      <div className="txn-controls">
        <button onClick={() => setStage((s) => Math.max(0, s - 1))} disabled={stage === 0}>← back</button>
        <button
          className="primary"
          onClick={() => setStage((s) => Math.min(stages.length - 1, s + 1))}
          disabled={stage === stages.length - 1}
        >advance →</button>
        <button onClick={() => setStage(0)}>reset</button>
        <span style={{ marginLeft: "auto", fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ink-3)", alignSelf: "center" }}>
          // src/txn/ · OverlayBlockDevice + .txn session file
        </span>
      </div>

      <div className="txn-wrap" style={{ marginTop: 24 }}>
        <div>
          <div className="txn-shell">
            {cur.log.map((t, i) => {
              const [kind, txt] = t;
              if (kind === "nl") return <br key={i} />;
              const cls = ({ stamp: "stamp", text: "term-out", "ev-good": "ev-good", "ev-warn": "ev-warn", "ev-bad": "ev-bad" })[kind] || "term-out";
              return <span key={i} className={cls}>{txt}</span>;
            })}
            <span className="term-cursor" />
          </div>
        </div>
        <div className="txn-explain">
          <h3>// stage: <span className="stage-name">{cur.name}</span></h3>
          <p>{cur.blurb}</p>
          <ul>
            <li>Three commit modes: <code>export</code>, <code>in-place</code>, <code>replace</code>.</li>
            <li>Three-layer single-writer enforcement: image lock · session lock · replace-sentinel.</li>
            <li>POSIX fcntl-fd-close discipline: never re-open the locked path mid-session.</li>
            <li>Generation counter advances on every staged mutation; cache stays in lockstep.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -------- mount & projection -------- */

function MountSection() {
  return (
    <section id="mount">
      <div className="section-eyebrow">
        <span className="num">§ 06</span><span>Mount &amp; host projection</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>Project the guest into your host filesystem.</h2>
        <p className="lead">
          On Windows, <code>readex</code> binds against WinFSP. On Linux, FUSE 3. The guest
          volume appears as a normal drive — copy in or out with your usual tools, then
          <code> unmount</code> to release the daemon.
        </p>
      </div>
      <div className="platform-table">
        <div className="row head">
          <div>Platform</div><div>Support</div><div>Driver / interface</div>
        </div>
        <div className="row">
          <div className="platform">Windows · x86_64</div>
          <div>Full — inspect, browse, mutate, mount</div>
          <div className="driver">WinFSP via winfsp_wrs 0.4.1</div>
        </div>
        <div className="row">
          <div className="platform">Linux · x86_64</div>
          <div>Full — inspect, browse, mutate, mount</div>
          <div className="driver">FUSE 3 via fuser 0.15</div>
        </div>
        <div className="row">
          <div className="platform">macOS</div>
          <div>All commands except mount / unmount</div>
          <div className="driver">no FUSE backend (yet)</div>
        </div>
      </div>

      <div className="stack-diagram">
        <div className="lyr"><span>readex mount image.img /mnt/c</span><span className="role">CLI</span></div>
        <div className="stack-arrow">↓</div>
        <div className="lyr"><span>MountManager · auto-select drive letter · generation guard</span><span className="role">src/mount/</span></div>
        <div className="stack-arrow">↓</div>
        <div className="lyr hi"><span>projection::winfsp  |  projection::fuse</span><span className="role">callback layer</span></div>
        <div className="stack-arrow">↓</div>
        <div className="lyr"><span>WritableFileSystem  ·  MountedFileSystem</span><span className="role">src/fs/traits.rs</span></div>
        <div className="stack-arrow">↓</div>
        <div className="lyr"><span>OverlayBlockDevice  ·  FileBackedBlockDevice</span><span className="role">src/image · src/txn</span></div>
      </div>
    </section>
  );
}

/* -------- compressed volumes -------- */

function Compression() {
  return (
    <section id="compression">
      <div className="section-eyebrow">
        <span className="num">§ 07</span><span>Compressed volumes</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>FAT, but compressed on the fly.</h2>
        <p className="lead">
          Three vintage DOS compression schemes are transparent to the FAT driver — they slot in
          between the container and the filesystem, presenting a normal <code>BlockDevice</code>
          while compressing / decompressing per cluster.
        </p>
      </div>
      <div className="cvf-stack">
        <div className="layer">
          <div className="nm">Stacker</div>
          <div className="by">// Stac Electronics, 1990</div>
          <div className="file">STACVOL.DSK</div>
          <div className="codec">LZS compression · bitfat cluster allocation · SD-3 / SD-4 sub-formats. SD-3 trailer mismatch is now a hard error; SD-4 has an explicit 9-bit EOS marker.</div>
        </div>
        <div className="layer">
          <div className="nm">DoubleSpace</div>
          <div className="by">// Microsoft, MS-DOS 6.0</div>
          <div className="file">DBLSPACE.000</div>
          <div className="codec">JM1 compression · MDFAT cluster mapping. The JM encoder reserves offset 4414 to avoid collision with the 0x113F sync marker.</div>
        </div>
        <div className="layer">
          <div className="nm">DriveSpace</div>
          <div className="by">// Microsoft, MS-DOS 6.22+</div>
          <div className="file">DRVSPACE.000</div>
          <div className="codec">DS00 compression · same MDFAT cluster mapping as DoubleSpace. Both share the cluster-level compress / decompress pattern with Stacker.</div>
        </div>
      </div>
    </section>
  );
}

/* -------- testing tiers -------- */

const PHASES = [
  ["1", "Formatting",        "cargo fmt --all -- --check",                                 "always"],
  ["2", "Clippy",            "cargo clippy --workspace -- -D warnings",                    "always"],
  ["3", "Tests",             "cargo test --workspace --all-targets --no-fail-fast",        "always"],
  ["4", "Live mount",        "e2e_winfsp_live / e2e_fuser — needs --include-ignored",      "WinFSP or fusermount3"],
  ["5", "Real-world corpus", "e2e_real_corpus -- --test-threads=1",                        "--real-corpus PATH"],
  ["6", "WSL fsck oracle",   "e2e_wsl_fsck — fsck.fat / fsck.ext2 / fsck.ext4",             "wsl + at least one fsck"],
  ["7", "Stateful",          "MDDSKIMG_STATEFUL_CASES=5000 cargo test --test stateful",    "always"],
  ["8", "Fuzz campaign",     "fuzz-run-campaign.ps1 + cargo test fuzz_stress",             "skipped by --quick"],
  ["9", "cargo-mutants",     "cargo mutants --file 'src/fs/<driver>/**'",                  "--mutants <driver>"],
  ["10","Coverage",          "cargo +nightly llvm-cov --workspace --branch --json",        "instruments earlier phases"],
];

function Testing() {
  return (
    <section id="testing">
      <div className="section-eyebrow">
        <span className="num">§ 08</span><span>How it's tested</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 28 }}>
        <h2>Three tiers, one hard rule.</h2>
        <p className="lead">
          Inner-loop tests answer "did my change work" in seconds. The push gate keeps the workspace green.
          The pre-release orchestrator is the overnight, hours-long sweep — and anything that takes more
          than two minutes on one fixture is banished to it.
        </p>
      </div>

      <div className="tier">
        <div className="col">
          <h4>Tier 01</h4>
          <div className="name">Inner loop</div>
        </div>
        <div className="col">
          <div className="qn">"Did my change work?"</div>
          <code className="cmd">cargo test --lib</code>
          <code className="cmd">cargo test -- some::path</code>
        </div>
        <div className="col">
          <div className="budget"><span className="big">~ 1 min</span>seconds → minute</div>
        </div>
      </div>
      <div className="tier">
        <div className="col">
          <h4>Tier 02</h4>
          <div className="name">Push gate</div>
        </div>
        <div className="col">
          <div className="qn">"Is the workspace green?"</div>
          <code className="cmd">cargo test --workspace</code>
          <code className="cmd">cargo test --test e2e_cli_matrix</code>
        </div>
        <div className="col">
          <div className="budget"><span className="big">~7,100</span>tests · minutes</div>
        </div>
      </div>
      <div className="tier">
        <div className="col">
          <h4>Tier 03</h4>
          <div className="name">Pre-release</div>
        </div>
        <div className="col">
          <div className="qn">"Can I ship this to a stranger?"</div>
          <code className="cmd">cargo run --bin full-test</code>
          <code className="cmd">cargo run --bin full-test -- --real-corpus ~/dumps</code>
        </div>
        <div className="col">
          <div className="budget"><span className="big">overnight</span>10 phases, sequenced</div>
        </div>
      </div>

      <h3 style={{ marginTop: 40, fontSize: 16, fontFamily: "IBM Plex Mono, monospace", color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>// full-test phases, in order</h3>
      <div className="phases">
        {PHASES.map((p) => (
          <div key={p[0]} className="phase">
            <div className="n">{p[0].padStart(2, "0")}</div>
            <div className="body">
              <div className="name">{p[1]}</div>
              <div className="desc mono">{p[2]}</div>
            </div>
            <div className="req">{p[3]}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------- fuzzing -------- */

function Fuzzing() {
  const targets = D.fuzzTargets;
  const groups = {
    parse: { label: "parsers — superblock, layout, structural decode" },
    dir: { label: "directory decoders + indirect block readers" },
    mut: { label: "mutation sequences — random sequences of write verbs" },
    cmp: { label: "compression — encoder ↔ decoder round-trips" },
    other: { label: "other — check oracles, mount, recovery, manifest" }
  };
  const order = ["parse", "dir", "mut", "cmp", "other"];

  return (
    <section id="fuzz">
      <div className="section-eyebrow">
        <span className="num">§ 09</span><span>Fuzzing</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>69 coverage-guided targets.</h2>
        <p className="lead">
          Every parser, every directory decoder, every mutation verb has a <code>cargo-fuzz</code>
          target with a seed corpus. The campaign script runs smoke + overnight modes against
          AddressSanitizer; <code>tests/fuzz_stress.rs</code> is the stable-Rust mirror without
          the ASAN dependency.
        </p>
      </div>
      <div className="fuzz-wrap">
        <div>
          {order.map((g) => (
            <div key={g} style={{ marginBottom: 18 }}>
              <h4 style={{ marginBottom: 8, color: "var(--ink-3)" }}>{groups[g].label}</h4>
              <div className="fuzz-grid">
                {targets.filter((t) => t.g === g).map((t) => (
                  <div key={t.n} className={`fuzz-cell group-${t.g}`} title={t.n}>
                    {t.n.replace(/_/g, " ")}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="fuzz-aside">
          <h3>// the campaign</h3>
          <p>Coverage-guided fuzzing on Windows links against the ASAN runtime DLL. Helper scripts find it automatically.</p>
          <p style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11.5, background: "var(--paper)", padding: "10px 12px", border: "1px solid var(--rule)" }}>
            .\scripts\fuzz-check-all.ps1<br />
            .\scripts\fuzz-run-campaign.ps1 -Mode smoke<br />
            .\scripts\fuzz-run-campaign.ps1 -Mode campaign -CampaignHours 7
          </p>
          <p style={{ marginTop: 14 }}>Curated seeds live in <code>fuzz/corpus/&lt;target&gt;/</code>. Discovered corpus stays local and gitignored. Crash artifacts get triaged via <code>fuzz-triage.ps1</code>.</p>

          <h3 style={{ marginTop: 22 }}>// real-world findings</h3>
          <p>Two recent fuzz-discovered fixes that closed loops between the corpus and the codebase:</p>
          <ul>
            <li><b>C1</b> — CVF JM encoder sync-marker collision. <code>MAX_OFFSET</code> reduced 4415 → 4414 to dodge bit-identical match with <code>0x113F</code>.</li>
            <li><b>C2</b> — Stacker SD-3 XOR-trailer mismatch was a warning; now it's a hard <code>Err(Corruption)</code>.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -------- real-world corpus -------- */

function Corpus() {
  return (
    <section id="corpus">
      <div className="section-eyebrow">
        <span className="num">§ 10</span><span>Real-world corpus</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>Generated fixtures aren't enough.</h2>
        <p className="lead">
          A 64-image corpus of real-world disk dumps — Win98 floppies, NetBSD miniroots, VMS CDs,
          Acorn discs, Stac-compressed STACVOLs — runs as a separate test tier. Findings flow
          into <code>BACKLOG.md</code>, then into commits with HLDs in <code>wrk_docs/</code>,
          then back out as regression pins.
        </p>
      </div>
      <div className="backlog">
        <div className="head">
          <div>ID</div><div>Issue</div><div>Resolution</div><div>Status</div>
        </div>
        {D.corpusFindings.map((f) => (
          <div className="item" key={f.id}>
            <div className="id">{f.id}</div>
            <div className="issue">{f.issue}</div>
            <div className="fix">{f.fix}</div>
            <div className="status">{f.status}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------- install -------- */

function Install() {
  return (
    <section id="install">
      <div className="section-eyebrow">
        <span className="num">§ 11</span><span>Install &amp; community</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 28 }}>
        <h2>Three ways to get it.</h2>
        <p className="lead">
          Dual-licensed MIT / Apache-2.0. Contributions welcome — conventional commits,
          <code> cargo fmt</code>, <code>cargo clippy -D warnings</code>, <code>cargo test -q</code> before you PR.
        </p>
      </div>
      <div className="install">
        <div className="card">
          <h3>Windows · WinGet</h3>
          <div className="platform">One command</div>
          <pre>winget install 0x4D44.readex</pre>
          <div className="note">Pulls WinFSP as a dependency. Installs to <code>Program Files\0x4D44 Software\readex\</code> and adds it to PATH. Requires an elevated prompt because WinFSP installs a kernel driver.</div>
        </div>
        <div className="card">
          <h3>From source · all platforms</h3>
          <div className="platform">cargo install</div>
          <pre>cargo install --git \
  https://github.com/0x4D44/readex.git</pre>
          <div className="note">Requires Rust 1.87+ (edition 2024). On Linux, install <code>fusermount3</code> (setuid or root) for mount support.</div>
        </div>
        <div className="card">
          <h3>Build from checkout</h3>
          <div className="platform">For contributors</div>
          <pre>{`git clone …/readex.git
cd readex
cargo build --release
cargo test -q`}</pre>
          <div className="note">Test fixtures are generated by <code>examples/generate_phase1_fixtures.rs</code> and checksum-verified at build time by <code>build.rs</code>.</div>
        </div>
      </div>
    </section>
  );
}

/* -------- adding a fs (community) -------- */

function ContribFS() {
  const phases = [
    ["1", "Core driver",     "src/fs/<name>/mod.rs — implement FileSystemDriver, mounted, directory entry"],
    ["2", "Registration",    "src/fs/mod.rs (4 edits) + types.rs FileSystemFlavor variant + auto_select.rs sort name"],
    ["3", "Compiler errors", "Follow the exhaustive-match errors through CLI dispatch — 6 edits in src/cli/mod.rs"],
    ["4", "Inspection",      "src/inspect.rs — 11 touch points: enum, macro, match arms"],
    ["5", "CLI rendering",   "src/cli/inspect.rs — dispatch arms and render function"],
    ["6", "Test fixtures",   "Add to tests/, examples/, the fixture matrix and mount surface test"],
    ["7", "Fuzz targets",    "Optional but recommended — directory_decode + mutation_sequence + parse"]
  ];
  return (
    <section id="contrib">
      <div className="section-eyebrow">
        <span className="num">§ 12</span><span>How to add a filesystem</span><span className="rule" />
      </div>
      <div className="split-2" style={{ alignItems: "end", marginBottom: 24 }}>
        <h2>Seven phases, ~42 touch points.</h2>
        <p className="lead">
          The reference driver is XFS (<code>src/fs/xfs/mod.rs</code>). Add the module, register
          it, then let the compiler walk you through the rest — most remaining touch points
          surface as exhaustive-match errors after the <code>FileSystemFlavor</code> variant lands.
        </p>
      </div>
      <div className="phases">
        {phases.map((p) => (
          <div className="phase" key={p[0]}>
            <div className="n">{p[0].padStart(2, "0")}</div>
            <div className="body">
              <div className="name">{p[1]}</div>
              <div className="desc mono">{p[2]}</div>
            </div>
            <div className="req">{p[0] === "3" ? "compiler-enforced" : p[0] === "1" || p[0] === "6" || p[0] === "7" ? "manual discipline" : "partially enforced"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------- footer -------- */

function Foot() {
  return (
    <footer>
      <div>
        <h4>// project</h4>
        <ul>
          <li><a href="#what">What it does</a></li>
          <li><a href="#pipeline">Pipeline</a></li>
          <li><a href="#commands">CLI verbs</a></li>
          <li><a href="#txn">Transactions</a></li>
        </ul>
      </div>
      <div>
        <h4>// reference</h4>
        <ul>
          <li><a href="#filesystems">Filesystem matrix</a></li>
          <li><a href="#mount">Mount &amp; projection</a></li>
          <li><a href="#compression">Compressed volumes</a></li>
          <li><a href="#contrib">Adding a driver</a></li>
        </ul>
      </div>
      <div>
        <h4>// quality</h4>
        <ul>
          <li><a href="#testing">Three-tier testing</a></li>
          <li><a href="#fuzz">69 fuzz targets</a></li>
          <li><a href="#corpus">Real-world corpus</a></li>
        </ul>
      </div>
      <div>
        <h4>// license &amp; meta</h4>
        <ul>
          <li className="meta">v0.57.3 · edition 2024</li>
          <li className="meta">Rust ≥ 1.87</li>
          <li className="meta">MIT OR Apache-2.0</li>
          <li className="meta">Fork freely. Best-effort maintained.</li>
        </ul>
      </div>
    </footer>
  );
}

/* -------- app -------- */

function App() {
  return (
    <>
      <Masthead />
      <Hero />
      <What />
      <Pipeline />
      <FilesystemMatrix />
      <CliPlayground />
      <TxnMachine />
      <MountSection />
      <Compression />
      <Testing />
      <Fuzzing />
      <Corpus />
      <ContribFS />
      <Install />
      <Foot />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
