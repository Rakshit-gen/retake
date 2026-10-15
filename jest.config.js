// Plain TypeScript packages run under node. Packages that render React Native
// components get their own project with the jest-expo preset as they are added.
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
  ],
}
