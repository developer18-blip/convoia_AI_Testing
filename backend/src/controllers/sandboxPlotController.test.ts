import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'node:stream';
import { servePlot } from './sandboxPlotController.js';
import { signPlotToken, plotStoragePath } from '../services/sandboxService.js';

// ── Minimal Express req/res stubs ──────────────────────────────────
//
// servePlot is a tiny handler — it only needs req.query.token,
// req.params.plotId, and res.status/setHeader/json/pipe. A real
// Express harness is overkill here.

interface StubResponse {
  statusCode: number;
  body?: any;
  headers: Record<string, string>;
  piped?: boolean;
  status(code: number): StubResponse;
  json(payload: any): StubResponse;
  setHeader(key: string, value: string): void;
  headersSent: boolean;
  // pipe is called by fs.createReadStream(...).pipe(res)
  on(event: string, _cb: (...args: any[]) => void): StubResponse;
  // The handler calls .pipe(res) on the read stream — so res needs to
  // *be* a writable. We tag it instead and assert via the file path
  // existing pattern.
  write(): boolean;
  end(): void;
}

function makeRes(): StubResponse {
  const headers: Record<string, string> = {};
  // Use a real PassThrough so fs.createReadStream(...).pipe(res) works
  // — the handler needs an actual writable stream, not a plain object.
  // We layer Express-style status/json/setHeader/headers onto it.
  const stream: any = new PassThrough();
  stream.statusCode = 200;
  stream.headers = headers;
  stream.body = undefined;
  stream.headersSent = false;
  stream.status = function (code: number) { this.statusCode = code; return this; };
  stream.json = function (payload: any) { this.body = payload; this.headersSent = true; return this; };
  stream.setHeader = function (k: string, v: string) { headers[k] = v; };
  return stream as StubResponse;
}

// Realistic plot setup: write a tiny PNG to disk at the expected path,
// sign the token, then drive servePlot against it.
const TEST_USER = 'plot-test-user';
const TEST_PLOT_ID = 'plot-test-uuid-aaa';
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

before(() => {
  const target = plotStoragePath(TEST_USER, TEST_PLOT_ID);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, PNG_BYTES);
});

after(() => {
  const target = plotStoragePath(TEST_USER, TEST_PLOT_ID);
  try { fs.unlinkSync(target); } catch { /* already gone */ }
});

describe('sandboxPlotController — servePlot', () => {

  it('valid token + matching plotId → 200 and Content-Type image/png', () => {
    const req: any = {
      query: { token: signPlotToken(TEST_PLOT_ID, TEST_USER) },
      params: { plotId: TEST_PLOT_ID },
    };
    const res = makeRes();
    servePlot(req, res as any);
    // The handler streams via fs.createReadStream(...).pipe(res). It
    // doesn't call res.status() on success. The pre-pipe contract:
    // headers set + statusCode unchanged from default 200.
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'image/png');
    assert.match(res.headers['Cache-Control'] || '', /max-age=604800/);
  });

  it('missing token → 401', () => {
    const req: any = { query: {}, params: { plotId: TEST_PLOT_ID } };
    const res = makeRes();
    servePlot(req, res as any);
    assert.equal(res.statusCode, 401);
    assert.match(res.body?.error || '', /Missing plot token/);
  });

  it('valid token but DIFFERENT plotId in URL → 403 (anti-swap)', () => {
    const req: any = {
      query: { token: signPlotToken(TEST_PLOT_ID, TEST_USER) },
      params: { plotId: 'some-other-plot-id' },
    };
    const res = makeRes();
    servePlot(req, res as any);
    assert.equal(res.statusCode, 403);
    assert.match(res.body?.error || '', /does not match/);
  });

  it('valid token but file does not exist on disk → 404', () => {
    const ghostPlotId = 'plot-uuid-not-on-disk';
    const req: any = {
      query: { token: signPlotToken(ghostPlotId, TEST_USER) },
      params: { plotId: ghostPlotId },
    };
    const res = makeRes();
    servePlot(req, res as any);
    assert.equal(res.statusCode, 404);
    assert.match(res.body?.error || '', /expired or no longer available/);
  });

  it('garbage / unverifiable token → 401', () => {
    const req: any = {
      query: { token: 'not.a.real.jwt' },
      params: { plotId: TEST_PLOT_ID },
    };
    const res = makeRes();
    servePlot(req, res as any);
    assert.equal(res.statusCode, 401);
    assert.match(res.body?.error || '', /Invalid or expired/);
  });
});
