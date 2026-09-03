/**
 * Metro resolves bundled media to an opaque asset id, but Expo's own types
 * only declare stylesheet modules — so importing a sound is a type error
 * without this.
 *
 * `number` is the honest type: what Metro hands back is a registry index, and
 * the audio and image APIs both accept it directly.
 */
declare module '*.wav' {
  const asset: number;
  export default asset;
}
