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
      // jest-expo resolves these two to their ESM builds, which jest can't load.
      moduleNameMapper: {
        '^immer$': '<rootDir>/node_modules/immer/dist/cjs/index.js',
        '^react-redux$': '<rootDir>/node_modules/react-redux/dist/cjs/index.js',
      },
      testMatch: ['<rootDir>/packages/{ui,capture}/src/**/*.test.{ts,tsx}', '<rootDir>/apps/*/src/**/*.test.{ts,tsx}'],
    },
  ],
}
