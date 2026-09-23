declare module "*.wav" {
  const source: import("expo-audio").AudioSource;
  export default source;
}
