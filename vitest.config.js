import { defineConfig } from 'vitest/config';

// Two test projects:
//  - unit: fast, pure-function tests. No server, no network, no files.
//  - e2e:  boots the real Express server (tests/e2e/globalSetup.js) and
//          talks to it over HTTP, exactly like the client does.
//
// Run everything:   npm test
// Run one project:  npm run test:unit   /   npm run test:e2e
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.js'],
          globalSetup: ['tests/e2e/globalSetup.js'],
          // E2e tests wait on a real server — give them more room than
          // the 5s default before calling a test hung.
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
