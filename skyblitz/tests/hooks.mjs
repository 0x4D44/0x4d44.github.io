// Resolve hook mirroring the browser importmap: "three" and "three/addons/*" map to skyblitz/vendor.
import { pathToFileURL } from "node:url";
import path from "node:path";

const vendor = path.resolve(import.meta.dirname, "..", "vendor");

export async function resolve(specifier, context, next) {
  if (specifier === "three") return { url: pathToFileURL(path.join(vendor, "three.module.min.js")).href, shortCircuit: true };
  if (specifier.startsWith("three/addons/")) {
    return { url: pathToFileURL(path.join(vendor, "addons", specifier.slice("three/addons/".length))).href, shortCircuit: true };
  }
  return next(specifier, context);
}
