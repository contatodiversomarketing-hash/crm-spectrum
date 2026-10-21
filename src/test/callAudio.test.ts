import { describe, expect, it, vi } from "vitest";
import { prepareCallAudio } from "@/lib/callAudio";

function setup(output = true) {
  return {
    unsetInputDevice: vi.fn().mockResolvedValue(undefined),
    setAudioConstraints: vi.fn().mockResolvedValue(undefined),
    setInputDevice: vi.fn().mockResolvedValue(undefined),
    isOutputSelectionSupported: output,
    speakerDevices: { set: vi.fn().mockResolvedValue(undefined) },
  };
}
describe("call audio", () => {
  it("releases the previous stream before acquiring the default microphone", async () => {
    const audio = setup();
    await prepareCallAudio(audio);
    expect(audio.unsetInputDevice.mock.invocationCallOrder[0]).toBeLessThan(audio.setInputDevice.mock.invocationCallOrder[0]);
    expect(audio.setInputDevice).toHaveBeenCalledWith("default");
    expect(audio.speakerDevices.set).toHaveBeenCalledWith("default");
  });
  it("does not suppress microphone failures", async () => {
    const audio = setup();
    audio.setInputDevice.mockRejectedValue(new Error("Microphone unavailable"));
    await expect(prepareCallAudio(audio)).rejects.toThrow("Microphone unavailable");
    expect(audio.speakerDevices.set).not.toHaveBeenCalled();
  });
  it("does not attempt unsupported speaker selection", async () => {
    const audio = setup(false);
    await prepareCallAudio(audio);
    expect(audio.speakerDevices.set).not.toHaveBeenCalled();
  });
});