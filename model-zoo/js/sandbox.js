/* Sandbox helpers for running untrusted, model-written HTML programs.
 * The iframe has no allow-same-origin, so the program gets an opaque origin;
 * the injected CSP additionally blocks every network request. */
(function (root) {
  "use strict";

  var CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src data:; font-src data:; media-src data:";
  var META = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">';

  function extractHtml(text) {
    try {
      if (typeof text !== "string" || !text.trim()) return null;
      var s = text;
      // Prefer the largest fenced block that looks like HTML.
      var re = /```[a-zA-Z0-9]*[ \t]*\r?\n([\s\S]*?)```/g, m, best = null;
      while ((m = re.exec(s))) {
        var body = m[1];
        if (/<!doctype|<html|<script|<button/i.test(body) && (!best || body.length > best.length)) best = body;
      }
      if (best) s = best;
      else {
        // Unterminated fence: drop the opening line.
        var open = /```[a-zA-Z0-9]*[ \t]*\r?\n([\s\S]*)$/.exec(s);
        if (open) s = open[1];
      }
      var start = s.search(/<!doctype/i);
      if (start < 0) start = s.search(/<html[\s>]/i);
      if (start >= 0) {
        var rest = s.slice(start);
        var endRe = /<\/html\s*>/ig, e, last = -1;
        while ((e = endRe.exec(rest))) last = e.index + e[0].length;
        return (last > 0 ? rest.slice(0, last) : rest).trim();
      }
      if (/<script[\s>]/i.test(s) || /<button[\s>]/i.test(s)) {
        var first = s.search(/<(script|button|div|style|h1|p|main|section|body)[\s>]/i);
        return (first > 0 ? s.slice(first) : s).replace(/```\s*$/, "").trim();
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  function injectCsp(html) {
    var h = String(html);
    var head = /<head(\s[^>]*)?>/i.exec(h);
    if (head) return h.slice(0, head.index + head[0].length) + META + h.slice(head.index + head[0].length);
    var htmlTag = /<html(\s[^>]*)?>/i.exec(h);
    if (htmlTag) return h.slice(0, htmlTag.index + htmlTag[0].length) + "<head>" + META + "</head>" + h.slice(htmlTag.index + htmlTag[0].length);
    var dt = /^\s*<!doctype[^>]*>/i.exec(h);
    if (dt) return h.slice(0, dt[0].length) + "<head>" + META + "</head>" + h.slice(dt[0].length);
    return "<!DOCTYPE html><html><head>" + META + '<meta charset="utf-8"></head><body>' + h + "</body></html>";
  }

  function mountProgram(container, html, opts) {
    opts = opts || {};
    var f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("loading", "lazy");
    f.setAttribute("title", opts.title || "Model-written program (sandboxed)");
    f.style.width = "100%";
    f.style.height = typeof opts.height === "number" ? opts.height + "px" : (opts.height || "360px");
    f.style.border = "0";
    f.srcdoc = injectCsp(html);
    container.appendChild(f);
    return f;
  }

  if (root) root.Sandbox = { extractHtml: extractHtml, mountProgram: mountProgram };
  if (typeof module !== "undefined") module.exports = { extractHtml: extractHtml, injectCsp: injectCsp };
})(typeof window !== "undefined" ? window : null);
