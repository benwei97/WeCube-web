/* global module, process, require */
const appJson = require("./app.json");

const googleIosRedirectScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_REDIRECT_SCHEME;
const baseScheme = appJson.expo.scheme || "wecube";
const scheme = googleIosRedirectScheme
  ? [baseScheme, googleIosRedirectScheme]
  : baseScheme;

module.exports = {
  ...appJson.expo,
  scheme,
};
