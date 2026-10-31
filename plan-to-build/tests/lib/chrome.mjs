// Finds the Chrome (or Chromium) binary the browser tests drive over CDP.
//   CHROME_PATH=<file>   wins. A wrong CHROME_PATH is an error, not a reason to look elsewhere.
//   otherwise the standard Windows, macOS and Linux install paths (and, on Linux, the PATH).
// No browser found is a FAILURE (a guard that silently skips is a guard that is silently off); PTB_ALLOW_NO_CHROME=1 skips on purpose.
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

const env = process.env;

function candidates() {
  const c = [];
  if (process.platform === "win32") {
    const bases = [env["PROGRAMFILES"], env["PROGRAMFILES(X86)"], env["LOCALAPPDATA"], "C:\\Program Files", "C:\\Program Files (x86)"].filter(Boolean);
    for (const b of bases) c.push(join(b, "Google", "Chrome", "Application", "chrome.exe"));
    for (const b of bases) c.push(join(b, "Chromium", "Application", "chrome.exe"));
  } else if (process.platform === "darwin") {
    for (const b of ["/Applications", join(homedir(), "Applications")]) {
      c.push(join(b, "Google Chrome.app", "Contents", "MacOS", "Google Chrome"), join(b, "Chromium.app", "Contents", "MacOS", "Chromium"));
    }
  } else {
    c.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
      "/snap/bin/chromium", "/opt/google/chrome/chrome", "/usr/local/bin/chrome");
    for (const dir of (env.PATH || "").split(delimiter).filter(Boolean)) {
      for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) c.push(join(dir, n));
    }
  }
  return c;
}

// -> { path, tried, why }   path is null when nothing was found; why says so in a sentence
export function chromeLookup() {
  if (env.CHROME_PATH) {
    return existsSync(env.CHROME_PATH)
      ? { path: env.CHROME_PATH, tried: [env.CHROME_PATH], why: "from CHROME_PATH" }
      : { path: null, tried: [env.CHROME_PATH], why: `CHROME_PATH is set to ${env.CHROME_PATH}, which does not exist` };
  }
  const tried = candidates();
  const path = tried.find((p) => existsSync(p)) || null;
  return { path, tried, why: path ? "standard install path" : "no Chrome or Chromium in the standard install paths" };
}

export function chromePath() {
  const r = chromeLookup();
  if (!r.path) throw new Error(`${r.why} (set CHROME_PATH=<chrome binary>; tried ${r.tried.slice(0, 6).join(", ")}${r.tried.length > 6 ? ", ..." : ""})`);
  return r.path;
}

export const allowNoChrome = () => env.PTB_ALLOW_NO_CHROME === "1";

// GPU flags. The page's 3D (three.js, WebGL2) was verified on headless Chrome with ANGLE/D3D11 on Windows; elsewhere the default backend is used
// (PTB_CHROME_ARGS="--flag --flag" adds flags, e.g. --use-angle=swiftshader on a box without a GPU).
export function gpuArgs() {
  const base = process.platform === "win32" ? ["--use-angle=d3d11", "--ignore-gpu-blocklist"] : ["--ignore-gpu-blocklist"];
  return [...base, ...(env.PTB_CHROME_ARGS ? env.PTB_CHROME_ARGS.split(/\s+/).filter(Boolean) : [])];
}
