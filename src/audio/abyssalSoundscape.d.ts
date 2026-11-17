export function createAbyssalSoundscape(
  context: AudioContext,
  position: () => Readonly<{ x: number; y: number; z: number }>,
): { tick: () => void; gain: AudioParam };
