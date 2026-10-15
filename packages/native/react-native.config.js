// Android only. The JD this project targets is Android-first and there is no
// Swift implementation, so iOS autolinking is switched off.
module.exports = {
  dependency: {
    platforms: {
      ios: null,
      android: {},
    },
  },
}
