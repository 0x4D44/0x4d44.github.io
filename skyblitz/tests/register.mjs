// Node loader registration so game modules (which import the bare specifier "three") run in node:test.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/*.test.mjs
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
