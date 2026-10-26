(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- 1. seccomp stacked-filter resolver ---------- */
  var ACTIONS = [
    { n: "KILL_PROCESS", d: "kill the whole process (SIGSYS)" },
    { n: "KILL_THREAD", d: "kill the calling thread" },
    { n: "TRAP", d: "deliver a catchable SIGSYS" },
    { n: "ERRNO (EPERM)", d: "fail the call with an errno" },
    { n: "USER_NOTIF", d: "ask a supervisor process" },
    { n: "TRACE", d: "notify a ptrace tracer" },
    { n: "LOG", d: "allow, but log it" },
    { n: "ALLOW", d: "run the syscall" }
  ];
  (function () {
    var a = $("sc-a"), b = $("sc-b"), out = $("sc-out");
    if (!a) return;
    ACTIONS.forEach(function (x, i) {
      a.add(new Option(x.n, i)); b.add(new Option(x.n, i));
    });
    a.value = 7; b.value = 3;
    function run() {
      var ia = +a.value, ib = +b.value, w = Math.min(ia, ib);
      var who = ia === ib ? "both filters agree" : (ia < ib ? "the runtime filter wins" : "the application filter wins");
      var note = w === 7 ? " Both filters allow it, so the call proceeds." :
        " The stricter verdict is applied: an ALLOW from the other filter cannot undo it.";
      out.innerHTML = "<span class=\"verdict " + (w === 7 ? "ok" : "bad") + "\">Kernel applies " + ACTIONS[w].n + "</span> (" + who + "): " + ACTIONS[w].d + "." + note;
      out.className = "out " + (w === 7 ? "ok" : "bad");
    }
    a.onchange = b.onchange = run; run();
  })();

  /* ---------- 2. Landlock playground ---------- */
  (function () {
    var preset = $("ll-preset"), l2 = $("ll-l2"), op = $("ll-op"), pathSel = $("ll-path"), rulesEl = $("ll-rules"), out = $("ll-out");
    if (!preset) return;
    var PATHS = ["/usr/bin/python3", "/usr/lib", "/etc/passwd", "/etc/shadow", "/home/user/.ssh/id_ed25519",
      "/srv/app/config.yaml", "/var/log/app/app.log", "/tmp/scratch/out.txt", "/tmp/other.txt", "/proc/1/environ"];
    var PRESETS = {
      ro: [["/usr", "RX"], ["/etc", "R"], ["/tmp/scratch", "RWC"]],
      web: [["/usr", "RX"], ["/etc", "R"], ["/srv/app", "R"], ["/var/log/app", "WC"]],
      open: [["/", "RWC"]]
    };
    var LAYER2 = [["/usr", "RX"]];
    var RIGHT = { R: "read", W: "write", X: "execute", C: "create/delete" };
    PATHS.forEach(function (p) { pathSel.add(new Option(p, p)); });
    pathSel.value = "/home/user/.ssh/id_ed25519";
    function under(rule, p) { return rule === "/" || p === rule || p.indexOf(rule + "/") === 0; }
    function layerAllows(rules, p, r) {
      for (var i = 0; i < rules.length; i++) {
        if (under(rules[i][0], p) && rules[i][1].indexOf(r) >= 0) return rules[i][0];
      }
      return null;
    }
    function fmt(rules, n) {
      return rules.map(function (x) {
        return "layer " + n + ": allow " + x[1].split("").map(function (c) { return RIGHT[c]; }).join(", ") + " beneath " + esc(x[0]);
      }).join("\n");
    }
    function run() {
      var layers = [PRESETS[preset.value]];
      if (l2.checked) layers.push(LAYER2);
      rulesEl.innerHTML = layers.map(function (l, i) { return "<div>" + fmt(l, i + 1).split("\n").join("</div><div>") + "</div>"; }).join("") +
        "<div>(all rights are handled: anything not granted is denied)</div>";
      var p = pathSel.value, r = op.value, why = [];
      for (var i = 0; i < layers.length; i++) {
        var g = layerAllows(layers[i], p, r);
        if (!g) {
          out.className = "out bad";
          out.innerHTML = "<span class=\"verdict bad\">DENIED (EACCES)</span> " + RIGHT[r] + " " + esc(p) + ": layer " + (i + 1) + " has no rule granting " + RIGHT[r] + " on this path or any parent directory.";
          return;
        }
        why.push("layer " + (i + 1) + " allows via " + esc(g));
      }
      out.className = "out ok";
      out.innerHTML = "<span class=\"verdict ok\">ALLOWED BY LANDLOCK</span> " + RIGHT[r] + " " + esc(p) + ": " + why.join("; ") + (layers.length > 1 ? " (stacked layers must all agree)." : ".") +
        "<br><strong>Landlock only narrows access.</strong> Ordinary file permissions still apply, so the real call can still fail (for example a root-only file read by a normal user).";
    }
    preset.onchange = l2.onchange = op.onchange = pathSel.onchange = run; run();
  })();

  /* ---------- 3. fork bomb ---------- */
  (function () {
    var mode = $("fk-mode"), lim = $("fk-lim"), other = $("fk-other"), bars = $("fk-bars"), out = $("fk-out");
    if (!mode) return;
    var ROUNDS = 16;
    function run() {
      var m = mode.value, L = Math.min(65536, Math.max(1, +lim.value || 1)), O = Math.max(0, +other.value || 0);
      $("fk-lim-wrap").style.display = m === "none" || m === "seccomp" ? "none" : "";
      $("fk-other-wrap").style.display = m === "nproc" ? "" : "none";
      var cap = Infinity;
      if (m === "pids") cap = L;
      if (m === "nproc") cap = Math.max(1, L - O);
      if (m === "seccomp") cap = 1;
      var n = 1, rows = [], hit = -1;
      rows.push(n);
      for (var r = 1; r <= ROUNDS; r++) {
        var want = n * 2;
        if (want > cap) { if (hit < 0) hit = r; want = cap; }
        n = want; rows.push(n);
      }
      var max = Math.pow(2, ROUNDS), html = "";
      rows.forEach(function (v, i) {
        var w = Math.max(1, Math.log2(v + 1) / Math.log2(max + 1) * 100);
        html += "<div class=\"bar\"><span>round " + i + "</span><span class=\"track\"><div class=\"fill" + (v > 1000 ? " hot" : "") + "\" style=\"width:" + w.toFixed(1) + "%\"></div></span><span class=\"v\">" + v.toLocaleString() + "</span></div>";
      });
      bars.innerHTML = "<div class=\"cap\" style=\"margin:0 0 8px\">bar length is logarithmic</div>" + html;
      var msg;
      if (m === "none") msg = "<span class=\"verdict bad\">" + n.toLocaleString() + " processes after " + ROUNDS + " rounds</span>, and doubling. The process table, memory and scheduler are exhausted and the host stops responding.";
      else if (m === "seccomp") msg = "<span class=\"verdict ok\">1 process.</span> <code>fork</code> returns -1 (EPERM). Threads are still allowed, so a multi-threaded program works; a fork bomb never starts.";
      else if ((m === "pids" || m === "nproc") && hit < 0) msg = "<span class=\"verdict ok\">Limit not hit</span> within " + ROUNDS + " rounds: the bomb reached " + n.toLocaleString() + " processes and the limit is " + cap.toLocaleString() + ". Lower the limit to see it bite.";
      else if (m === "pids") msg = "<span class=\"verdict ok\">Capped at " + n + (n === 1 ? " task" : " tasks") + "</span> from round " + hit + ". <code>fork</code> fails with EAGAIN inside the cgroup; the host and other cgroups are untouched. Threads count toward the cap, and the workload can still fork up to the limit.";
      else if (O >= L) msg = "<span class=\"verdict bad\">The UID is already at its limit (" + O + " of " + L + ").</span> The sandbox cannot fork, but neither can any other process of that UID: collateral damage. RLIMIT_NPROC is per real UID, not per sandbox.";
      else msg = "<span class=\"verdict bad\">Capped at " + n + "</span>, but only because the UID's total is bounded at " + L + ". The bomb has used up all " + (L - O) + " remaining slots, so <em>every other process of that UID</em> now fails to fork too. Root and CAP_SYS_RESOURCE would not be limited at all.";
      out.className = "out " + (m === "seccomp" || m === "pids" ? "ok" : "bad");
      if (+lim.value > 65536 || +lim.value < 1) msg += " <em>(The limit box accepts 1 to 65,536; your value was adjusted to " + L.toLocaleString() + ".)</em>";
      out.innerHTML = msg;
    }
    mode.onchange = lim.oninput = other.oninput = run; run();
  })();

  /* ---------- 4. docker command builder ---------- */
  (function () {
    var box = $("dk-flags"), out = $("dk-out");
    if (!box) return;
    var F = [
      ["user", "--user 65532:65532", true, "No root inside: a process that escapes the container is an unprivileged UID on the host."],
      ["ro", "--read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m", true, "Immutable root: an attacker cannot drop tools or persist; scratch space is small and non-executable."],
      ["cap", "--cap-drop=ALL", true, "Empties the capability set. Removes raw sockets, chown tricks and the whole CAP_SYS_ADMIN family."],
      ["nnp", "--security-opt=no-new-privileges", true, "Sets no_new_privs: setuid binaries and file capabilities inside cannot elevate."],
      ["sec", "--security-opt seccomp=./profile.json", true, "Your own recorded allowlist instead of the generic default (which is already better than unconfined)."],
      ["pids", "--pids-limit=64", true, "pids.max: a fork bomb stops at 64 tasks."],
      ["mem", "--memory=256m --memory-swap=256m", true, "memory.max with no swap: an allocation bomb is OOM-killed inside the container."],
      ["cpu", "--cpus=0.5", true, "cpu.max quota: a spinning workload cannot starve neighbours."],
      ["ulim", "--ulimit nofile=256:256 --ulimit core=0", true, "Bounded descriptors; no core dumps leaking memory."],
      ["net", "--network=none", true, "Empty network namespace: only a loopback interface, which reaches nothing outside the container, so it cannot send data out over the network or reach other hosts. Use a default-deny policy if it needs the network."],
      ["ipc", "--ipc=none", true, "No shared-memory or IPC with the host."],
      ["gv", "--runtime=runsc", false, "gVisor: syscalls are handled by a user-space kernel, so the host kernel is no longer directly exposed (requires gVisor installed)."]
    ];
    F.forEach(function (f) {
      var l = document.createElement("label");
      l.innerHTML = "<input type=\"checkbox\" id=\"dk-" + f[0] + "\"" + (f[2] ? " checked" : "") + "><span><code>" + esc(f[1]) + "</code></span>";
      box.appendChild(l);
    });
    function run() {
      var on = F.filter(function (f) { return $("dk-" + f[0]).checked; });
      var off = F.filter(function (f) { return !$("dk-" + f[0]).checked; });
      var cmd = "docker run --rm" + on.map(function (f) { return " \\\n  " + f[1]; }).join("") + " \\\n  registry.example/app@sha256:…";
      out.className = "out" + (off.length === 0 ? " ok" : "");
      out.innerHTML = "<pre style=\"margin:0 0 10px\"><code>" + esc(cmd) + "</code></pre>" +
        "<b>" + on.length + " of " + F.length + " controls on.</b><ul style=\"margin:8px 0 0\">" +
        on.map(function (f) { return "<li>" + esc(f[3]) + "</li>"; }).join("") + "</ul>" +
        (off.length ? "<p style=\"margin:10px 0 0\"><b>Off:</b> " + off.map(function (f) { return "<code>" + esc(f[1].split(" ")[0]) + "</code>"; }).join(" ") + "</p>" : "");
    }
    box.addEventListener("change", run); run();
  })();

  /* ---------- 5. audit checklist ---------- */
  (function () {
    var root = $("au-groups");
    if (!root) return;
    var G = [
      ["Code and supply chain", [
        ["Untrusted parsing is done in memory-safe code or in a separate sandboxed process", 3],
        ["Dependencies pinned and lockfile reviewed; advisories audited in CI (cargo audit/deny/vet or equivalent)", 2],
        ["Image is minimal: static or distroless, no shell, no package manager, pinned by digest", 2]]],
      ["Privilege", [
        ["Runs as a non-root UID", 3], ["All capabilities dropped; any added ones are justified", 3],
        ["no_new_privs set (allowPrivilegeEscalation: false)", 3],
        ["Runtime and container root are unprivileged on the host (rootless or user namespaces)", 2]]],
      ["Syscalls", [
        ["A seccomp allowlist is applied (not unconfined; ideally recorded for this workload)", 4],
        ["io_uring, bpf, userfaultfd, mount family, unshare/setns and module loading are denied", 2],
        ["Profile re-recorded and tested after runtime or dependency upgrades", 1]]],
      ["Filesystem", [
        ["Root filesystem read-only; writable scratch is size-limited and, where the platform allows, noexec,nosuid,nodev", 3],
        ["Landlock, AppArmor or SELinux confines file access", 3],
        ["No docker.sock, host / /proc /sys /etc mounts, raw devices or host namespaces", 4]]],
      ["Resources", [
        ["Memory limit with swap disabled", 2], ["pids limit set (fork bombs contained)", 3],
        ["CPU quota set", 1], ["Disk and inode limits (quota or sized tmpfs)", 1],
        ["rlimits for NOFILE and CORE=0", 1]]],
      ["Network", [
        ["No network, or default-deny ingress and egress policy", 3],
        ["Service-account tokens and cloud metadata not reachable unless needed", 2]]],
      ["Boundary and host", [
        ["Code you do not trust runs behind gVisor or a microVM (Kata, Firecracker), not a plain shared-kernel container (mark n/a for your own trusted services)", 4],
        ["Host kernel is patched and supported", 1],
        ["Unprivileged BPF is off (kernel.unprivileged_bpf_disabled=1 or 2)", 1],
        ["kernel.kptr_restrict and kernel.yama.ptrace_scope are set", 1],
        ["Unused kernel features disabled (io_uring, unprivileged user namespaces, modules)", 2],
        ["Runtime detection or enforcement in place (Falco, Tetragon, audit logs)", 1]]]
    ];
    var KEY = "hardening.audit.v4", state = {};
    try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }
    G.forEach(function (g, gi) {
      var h = document.createElement("h4"); h.textContent = g[0]; root.appendChild(h);
      var d = document.createElement("div"); d.className = "chk"; root.appendChild(d);
      g[1].forEach(function (it, ii) {
        var id = gi + "-" + ii, st = state[id] || {}, row = document.createElement("div");
        row.className = "item";
        row.innerHTML = "<label><input type=\"checkbox\" class=\"yes\" data-w=\"" + it[1] + "\" data-k=\"" + id + "\"" + (st.c ? " checked" : "") + "><span>" + esc(it[0]) + "</span></label>" +
          "<label class=\"na-l\"><input type=\"checkbox\" class=\"na\" data-k=\"" + id + "\"" + (st.n ? " checked" : "") + "> n/a</label>";
        d.appendChild(row);
      });
    });
    function calc() {
      var s = 0, total = 0, skipped = 0; state = {};
      [].forEach.call(root.querySelectorAll("input.yes"), function (c) {
        var k = c.dataset.k, w = +c.dataset.w, na = root.querySelector("input.na[data-k=\"" + k + "\"]").checked;
        c.disabled = na;
        if (c.checked || na) state[k] = { c: c.checked ? 1 : 0, n: na ? 1 : 0 };
        if (na) { skipped += w; return; }
        total += w; if (c.checked) s += w;
      });
      var pct = total ? Math.round(s / total * 100) : 0;
      $("au-score").textContent = pct + "%";
      $("au-meter").style.width = pct + "%";
      var ex = $("au-excl"); if (ex) ex.textContent = skipped ? "Left out as n/a: " + skipped + " of " + (total + skipped) + " points. Your score is out of " + total + "." : "";
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
    }
    root.addEventListener("change", calc);
    $("au-reset").onclick = function () { [].forEach.call(root.querySelectorAll("input"), function (c) { c.checked = false; }); calc(); };
    calc();
  })();
})();
