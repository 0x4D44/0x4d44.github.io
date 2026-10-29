// Node loader registration so game modules (which import the bare specifier "three") run in node:test.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/*.test.mjs
import { register } from "node:module";
import "./tools/lowprio.mjs";                       // every test process runs below-normal (see lowprio.mjs)
register("./hooks.mjs", import.meta.url);
