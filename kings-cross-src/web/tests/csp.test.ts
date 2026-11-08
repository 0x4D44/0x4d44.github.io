import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('page CSP denies arbitrary scripts frames and forms while allowing app assets and loopback dev sockets',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const policy=/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(policy,'CSP meta precedes all resources');
  const rules=new Map(policy.split(';').map(r=>{const [key,...values]=r.trim().split(/\s+/);return [key,values];}));
  assert.deepEqual(rules.get('default-src'),["'none'"]);assert.deepEqual(rules.get('script-src'),["'self'"]);
  for(const key of ['base-uri','object-src','form-action'])assert.deepEqual(rules.get(key),["'none'"]);
  assert.deepEqual(rules.get('worker-src'),["'self'",'blob:']);
  assert.deepEqual(rules.get('img-src'),["'self'",'data:','blob:']);
  assert.deepEqual(rules.get('connect-src'),["'self'",'ws://127.0.0.1:*','ws://localhost:*']);
  assert.ok(!policy.includes('ws://[::1]:*'),'IPv6 wildcard socket source is invalid in CSP');
  assert.ok(!policy.includes('unsafe-eval'));assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<style>'));
});
