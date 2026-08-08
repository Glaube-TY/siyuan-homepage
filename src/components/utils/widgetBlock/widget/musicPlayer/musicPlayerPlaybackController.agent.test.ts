import assert from "node:assert/strict";
import test from "node:test";
import {
  getActiveMusicPlayerPlaybackController,
  getMusicPlayerPlaybackRuntimeStatus,
  registerMusicPlayerPlaybackController,
  unregisterMusicPlayerPlaybackController,
  type MusicPlayerPlaybackController,
} from "./musicPlayerPlaybackController";

test("音乐播放控制器只暴露已注册的真实运行时", () => {
  let playing = false;
  const controller: MusicPlayerPlaybackController = {
    getStatus: () => ({ sourceMode: "subsonic", isPlaying: playing, currentTrack: null, currentTime: 0, duration: 0, volume: 0.5, queueCount: 2, endpointStatus: "local" }),
    playTrack: async () => { playing = true; },
    pause: () => { playing = false; },
    resume: () => { playing = true; },
    next: () => undefined,
    previous: () => undefined,
    seekTo: () => undefined,
    setVolume: () => undefined,
  };
  assert.equal(getMusicPlayerPlaybackRuntimeStatus(), null);
  registerMusicPlayerPlaybackController("host-1", controller);
  assert.equal(getActiveMusicPlayerPlaybackController(), controller);
  assert.equal(getMusicPlayerPlaybackRuntimeStatus()?.queueCount, 2);
  unregisterMusicPlayerPlaybackController("host-1");
  assert.equal(getMusicPlayerPlaybackRuntimeStatus(), null);
});
