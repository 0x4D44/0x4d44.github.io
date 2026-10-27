/* Past-paper practice: the SQL runner. Loads sql.js (SQLite as WebAssembly, vendor/) on first use and gives the
   auto-marker HCP.sqlRun(schema, sql, check) -> { cols, rows } | { error }. Every call gets a fresh in-memory
   database built from the part's own schema, so a student's DELETE or DROP can never damage anything.
   With `check`, sql is run first (an UPDATE, INSERT or DELETE) and the result of the check query is returned. */
(function () {
  "use strict";
  const HCP = (window.HCP = window.HCP || {});
  const HS = (window.HCP_SQL = window.HCP_SQL || {});
  HS.make = function (SQL) {
    return function (schema, sql, check) {
      let res;
      const db = new SQL.Database();
      try {
        db.exec(schema);
        const rs = db.exec(sql);
        const r = check ? db.exec(check) : rs;
        const last = r[r.length - 1];
        res = last ? { cols: last.columns, rows: last.values } : { cols: [], rows: [] };
      } catch (e) {
        res = { error: String(e.message || e).replace(/^Error: /, "") };
      } finally { db.close(); }
      return res;
    };
  };
  let loading = null;
  HS.ready = function () {
    if (HCP.sqlRun) return Promise.resolve();
    if (loading) return loading;
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), 20000));
    const load = new Promise((res, rej) => {
      if (window.initSqlJs) return res();
      const sc = document.createElement("script");
      sc.src = "vendor/sql-wasm.js";
      sc.onerror = () => rej(new Error("script not found"));
      sc.onload = () => res();
      document.head.append(sc);
    }).then(() => fetch("vendor/sql-wasm.wasm")).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("HTTP " + r.status))))
      .then((bin) => window.initSqlJs({ wasmBinary: bin }))
      .then((SQL) => { HCP.sqlRun = HS.make(SQL); });
    loading = Promise.race([load, timeout]).catch((e) => { loading = null; throw e; });
    return loading;
  };
})();
