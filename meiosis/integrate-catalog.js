#!/usr/bin/env node
/* Register this contribution in the existing Almanac, preserving unrelated text.
 * Default is read-only validation. --apply performs the two catalog insertions.
 * The existing repository data.js is trusted repository code, evaluated in a
 * minimal VM context for validation, not fetched or supplied by a page visitor. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = __dirname;
function readCatalog(source) { const context = { window: {} }; vm.runInNewContext(source, context, { timeout: 1000 }); if (!Array.isArray(context.window.ESSAYS) || !Array.isArray(context.window.COLLECTIONS))
    throw new Error('Expected ESSAYS and COLLECTIONS in catalog'); return context.window; }
function entry() { const meta = JSON.parse(fs.readFileSync(path.join(root, 'catalog-entry.json'), 'utf8')), stats = JSON.parse(fs.readFileSync(path.join(root, 'content-stats.json'), 'utf8')); return { ...meta, readingMin: stats.readingMin, words: stats.words }; }
function validate(source) { const c = readCatalog(source), items = c.ESSAYS.filter(e => e.slug === 'meiosis'); if (items.length !== 1)
    throw new Error('Expected exactly one meiosis entry'); const e = items[0]; if (e.url !== 'https://0x4d44.github.io/meiosis/' || e.illustration !== 'ill-dna')
    throw new Error('Incorrect URL or illustration'); if (!e.tags.includes('science'))
    throw new Error('Missing science tag'); const shelf = c.COLLECTIONS.find(s => s.id === 'science'); if (!shelf || shelf.slugs.filter(s => s === 'meiosis').length !== 1)
    throw new Error('Meiosis must appear once on the Science Bench'); return c; }
function integrate(source) {
    const before = readCatalog(source), already = before.ESSAYS.filter(e => e.slug === 'meiosis');
    if (already.length) {
        validate(source);
        return source;
    }
    const anchor = /window\.ESSAYS\s*=\s*\[/;
    if (!anchor.test(source))
        throw new Error('Cannot locate ESSAYS assignment');
    const object = JSON.stringify(entry(), null, 2).split('\n').map(line => '  ' + line).join('\n');
    let out = source.replace(anchor, m => m + '\n' + object + ',');
    const collections = out.indexOf('window.COLLECTIONS');
    if (collections < 0)
        throw new Error('Cannot locate COLLECTIONS');
    const section = out.slice(collections), match = /(?:"id"|id)\s*:\s*"science"/.exec(section);
    if (!match)
        throw new Error('Cannot locate Science Bench');
    const science = collections + match.index, slugs = out.indexOf('slugs', science), open = out.indexOf('[', slugs), close = out.indexOf(']', open);
    if (slugs < science || open < slugs || close < open)
        throw new Error('Cannot locate Science Bench slug list');
    const lastLine = out.lastIndexOf('\n', close);
    const pos = lastLine > open ? lastLine + 1 : open + 1;
    out = out.slice(0, pos) + (lastLine > open ? '      "meiosis",\n' : '"meiosis", ') + out.slice(pos);
    const after = validate(out);
    if (after.ESSAYS.length !== before.ESSAYS.length + 1)
        throw new Error('Unexpected catalog length change');
    for (const old of before.ESSAYS) {
        const fresh = after.ESSAYS.find(e => e.slug === old.slug);
        if (JSON.stringify(old) !== JSON.stringify(fresh))
            throw new Error('Unrelated catalog entry changed: ' + old.slug);
    }
    for (const old of before.COLLECTIONS) {
        const fresh = after.COLLECTIONS.find(e => e.id === old.id);
        if (old.id === 'science') {
            if (JSON.stringify(old.slugs) !== JSON.stringify(fresh.slugs.filter(s => s !== 'meiosis')))
                throw new Error('Existing science shelf order changed');
        }
        else if (JSON.stringify(old) !== JSON.stringify(fresh))
            throw new Error('Unrelated shelf changed: ' + old.id);
    }
    return out;
}
if (require.main === module) {
    try {
        const file = path.resolve(process.argv.find(a => a.startsWith('--catalog='))?.slice(10) || path.join(root, '..', 'data.js'));
        const input = fs.readFileSync(file, 'utf8');
        if (process.argv.includes('--apply')) {
            const out = integrate(input);
            if (out !== input)
                fs.writeFileSync(file, out);
            validate(out);
            console.log(out === input ? 'Already registered; no changes.' : 'Registered meiosis in ESSAYS and the Science Bench.');
        }
        else {
            validate(input);
            console.log('Catalog integration valid.');
        }
    }
    catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    }
}
module.exports = { integrate, validate, entry, readCatalog };
