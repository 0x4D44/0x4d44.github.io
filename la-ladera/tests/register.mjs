// Preload for every Node-side test and probe (`node --import ./la-ladera/tests/register.mjs ...`): the module hooks that resolve the
// browser importmap names, and LOW PRIORITY for the whole process tree (see nice.mjs) so tests never slow down the person at the desk.
import './nice.mjs';
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
