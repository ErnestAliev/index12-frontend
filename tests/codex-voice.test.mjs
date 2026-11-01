import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodexVoiceConnection } from '../src/utils/codexVoice.js';
function fixture() {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class Peer {
    constructor() { this.iceGatheringState = 'complete'; this.channel = { close() {} }; }
    createDataChannel() { return this.channel; }
    addTrack() {} createOffer() { return { type: 'offer', sdp: 'v=0' }; }
    setLocalDescription(value) { this.localDescription = value; }
    setRemoteDescription(value) { this.remoteDescription = value; }
    close() { this.closed = true; }
  }
  class AudioElement { play() { return Promise.resolve(); } pause() { this.paused = true; } }
  const requests = [], states = [], captions = [];
  const client = new CodexVoiceConnection({ media: { getUserMedia: async () => stream }, Peer, AudioElement,
    api: async (path, body) => { requests.push({ path, body }); return { session: { id: 'session' }, sdp: 'v=0 answer' }; },
    onState: value => states.push(value), onCaption: (...value) => captions.push(value),
  });
  return { client, track, stream, requests, states, captions };
}
test('live voice negotiates WebRTC independently of dictation and releases the microphone on stop', async () => {
  const f = fixture(); await f.client.start('chat', 'session');
  assert.deepEqual(f.requests, [{ path: '/chats/chat/voice', body: { requestId: 'session', sdp: 'v=0' } }]);
  assert.equal(f.client.peer.remoteDescription.type, 'answer');
  f.client.mute(true); assert.equal(f.track.enabled, false);
  f.client.mute(false); assert.equal(f.track.enabled, true);
  f.client.stop(); assert.equal(f.track.stopped, true); assert.equal(f.client.peer.closed, true);
});
test('closing during microphone permission cannot leave a late stream recording', async () => {
  const f = fixture(); let grant;
  f.client.media.getUserMedia = () => new Promise(resolve => { grant = resolve; });
  const started = f.client.start('chat', 'session');
  f.client.stop(); grant(f.stream);
  await assert.rejects(started, e => e.name === 'AbortError');
  assert.equal(f.track.stopped, true); assert.equal(f.requests.length, 0);
});
test('realtime speech events update live status and captions without submitting client-side commands', async () => {
  const f = fixture(); await f.client.start('chat', 'session');
  const event = data => f.client.channel.onmessage({ data: JSON.stringify(data) });
  event({ type: 'output_audio_buffer.started' });
  event({ type: 'response.output_audio_transcript.delta', delta: 'Ответ' });
  event({ type: 'input_audio_buffer.speech_started' });
  assert.deepEqual(f.states, ['connecting', 'speaking', 'listening']);
  assert.deepEqual(f.captions, [['assistant-delta', 'Ответ'], ['user', '']]);
  assert.equal(f.requests.length, 1);
  f.client.stop();
});
