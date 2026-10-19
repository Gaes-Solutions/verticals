// Expo SDK 53 configura el monorepo pnpm y sus rutas de resolución.
// Conserva los defaults; no sobrescribas watchFolders ni el resolver.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
