// Plain TypeScript packages run under node. Packages that render React Native
// components get their own project with the jest-expo preset as they are added.
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/{rules,quality}/src/**/*.test.ts'],
    },
  ],
}
