export interface CallAudio {
  unsetInputDevice: () => Promise<void>;
  setAudioConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
  setInputDevice: (id: string) => Promise<void>;
  isOutputSelectionSupported: boolean;
  speakerDevices: { set: (id: string) => Promise<void> };
}

/** Reacquire instead of reusing an input stream left behind by a previous call. */
export async function prepareCallAudio(audio: CallAudio) {
  await audio.unsetInputDevice();
  await audio.setAudioConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  await audio.setInputDevice("default");
  if (audio.isOutputSelectionSupported) await audio.speakerDevices.set("default");
}