/** Reprodução de sons do soundboard no aplicativo (um som por vez). */
class SoundPlayer {
  private current: HTMLAudioElement | null = null;
  private volume = 1;

  play(url: string, volume = 1): void {
    this.stop();
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, volume * this.volume));
    audio.play().catch(() => undefined);
    this.current = audio;
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
      this.current = null;
    }
  }

  setMasterVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.current) this.current.volume = this.volume;
  }

  get playing(): boolean {
    return Boolean(this.current && !this.current.paused);
  }
}

export const soundPlayer = new SoundPlayer();
