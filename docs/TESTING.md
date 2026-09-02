# Testing Guide

How tests work in CrossMigrate, and how to write good ones. Everything runs on
[Vitest](https://vitest.dev) from the repo root.

## Running tests

```bash
npm test            # everything (unit + e2e)
npm run test:unit   # just the fast pure-function tests
npm run test:e2e    # boots the real server, tests over HTTP
npm run test:watch  # unit tests re-run on every file save — keep this open while coding
```

## Layout

```
tests/
  unit/   one file per module under test, named after it (deduplicate.test.js)
  e2e/    one file per feature/route, named *.e2e.test.js
vitest.config.js    defines the two projects; e2e gets a longer timeout
                    and a globalSetup that boots server/index.js
```

- **Unit tests** import a function directly and call it. No server, no network,
  no files, no mocks if you can help it. They should stay fast enough that
  running all of them feels free.
- **E2E tests** talk to the real Express server over HTTP, the same way the
  client does. `tests/e2e/globalSetup.js` starts `server/index.js` on a free
  port once for the whole run and kills it afterwards; tests read the base URL
  with `inject('baseUrl')`.

## Which kind of test do I write?

Ask: *where would this break?*

- Logic that transforms data (a function in `server/engine/`) → **unit test**.
  Cheapest to write, fastest to run, easiest to debug when it fails.
- Wiring between pieces (routes, request parsing, streaming, headers,
  the pipeline executor calling nodes in order) → **e2e test**.
- Default ratio: many unit tests, a few e2e tests. One happy-path e2e test per
  route plus one failure-path test covers a lot; push the edge cases down into
  unit tests where they're cheap.

## Anatomy of a good test

Every test is three steps — arrange, act, assert:

```js
it('keeps the first occurrence by default', () => {
  const rows = [{ email: 'a@x.com' }, { email: 'a@x.com' }]; // arrange
  const out = deduplicate(rows, { fields: ['email'] });      // act
  expect(out).toHaveLength(1);                               // assert
});
```

Rules of thumb:

1. **Name the behavior, not the function.** `it('throws on a cycle instead of
   looping forever')` tells a future reader what's guaranteed. `it('works')`
   tells them nothing — and when it fails, the name is the error message.
2. **One behavior per test.** Multiple `expect`s are fine when they describe
   one outcome; two unrelated scenarios in one `it` is not. Small tests fail
   with small, obvious diffs.
3. **Test through the public interface.** Assert on what comes out, not on how
   the function got there. Tests that peek at internals break every refactor
   even when behavior is still correct.
4. **Inline the fixture data.** A reader should understand the test without
   opening another file. Three hand-written rows beat a 500-row sample file.
   Extract a helper only when the setup noise drowns out the point
   (see `node()`/`edge()` in `topologicalSort.test.js`).
5. **Cover the edges that matter:** empty input, one item, duplicates, nulls
   and missing fields, and the documented error paths. If a comment in the
   source explains a subtle guard (like the NUL separator in `deduplicate.js`),
   that guard deserves its own test — it's the first thing a refactor deletes.
6. **When you fix a bug, write the failing test first.** It proves the bug,
   proves the fix, and pins the behavior forever. This is the highest-value
   test you'll ever write.
7. **Don't test the framework or the obvious.** `expect(2 + 2).toBe(4)`-style
   tests, or checking that Express parses JSON, add run time and no safety.

## Adding a new test

- **Unit:** create `tests/unit/<module>.test.js`, import the function with a
  relative path (`../../server/engine/...`), write `describe`/`it` blocks.
  That's it — Vitest picks up anything matching `tests/unit/**/*.test.js`.
- **E2e:** create `tests/e2e/<feature>.e2e.test.js`, get the server URL with
  `const baseUrl = inject('baseUrl')`, and use plain `fetch`. The server is
  already running — never start your own inside a test.

## Debugging a failure

```bash
npx vitest run tests/unit/deduplicate.test.js   # run one file
npx vitest run -t "keeps the first"             # run tests matching a name
```

Add `.only` to an `it`/`describe` to isolate it locally — but never commit
`.only`, it silently skips everything else.
