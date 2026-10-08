import { Mp3Encoder } from "@breezystack/lamejs";

/** Converte qualquer gravação do navegador em MP3 mono (formato aceito pelo WhatsApp). */
export async function converterParaMp3(blob: Blob): Promise<Blob> {
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(buf);
  ctx.close();
  const alvo = 22050;
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * alvo), alvo);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const pcm = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const enc = new Mp3Encoder(1, alvo, 64);
  const partes: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const d = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (d.length) partes.push(new Uint8Array(d));
  }
  const fim = enc.flush();
  if (fim.length) partes.push(new Uint8Array(fim));
  return new Blob(partes as BlobPart[], { type: "audio/mpeg" });
}
