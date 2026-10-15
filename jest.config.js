// Plain TypeScript packages and the server run under node. Anything that
// renders React Native runs under the jest-expo preset.
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/{rules,quality}/src/**/*.test.ts'],
    },
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/src/**/*.test.ts'],
      // light-my-request (fastify.inject) pulls in cookie, which ships ESM only.
      transformIgnorePatterns: ['/node_modules/(?!cookie/)'],
    },
    {
      displayName: 'rn',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/packages/{ui,capture}/src/**/*.test.{ts,tsx}', '<rootDir>/apps/*/src/**/*.test.{ts,tsx}'],
    },
  ],
}
