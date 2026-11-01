// Audio uses WebRTC directly. Only signaling and status cross the INDEX12 API.
export class CodexVoiceConnection {
  constructor({ api, onState = () => {}, onCaption = () => {}, onError = () => {}, onPlaybackBlocked = () => {}, media = navigator.mediaDevices, Peer = window.RTCPeerConnection, AudioElement = window.Audio }) {
    Object.assign(this, { api, onState, onCaption, onError, onPlaybackBlocked, media, Peer, AudioElement });
    this.closed = false;
  }
  async start(chatId, requestId) {
    this.id = requestId; this.chatId = chatId;
    this.onState('connecting');
    this.stream = await this.media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.closed) { this.release(); throw new DOMException('Aborted', 'AbortError'); }
    this.peer = new this.Peer();
    this.audio = new this.AudioElement(); this.audio.autoplay = true;
    this.audio.setAttribute?.('playsinline', '');
    this.peer.ontrack = event => {
      this.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      this.play().catch(() => {});
    };
    this.peer.onconnectionstatechange = () => {
      if (this.closed) return;
      const state = this.peer.connectionState;
      if (state === 'failed' || state === 'closed') this.onError(new Error('Прервалась голосовая связь. Подключитесь снова.'));
      if (state === 'connected') { clearTimeout(this.disconnectedTimer); this.onState('listening'); }
      if (state === 'disconnected') this.disconnectedTimer = setTimeout(() => { if (!this.closed && this.peer.connectionState === 'disconnected') this.onError(new Error('Потеряна голосовая связь.')); }, 5000);
    };
    for (const track of this.stream.getTracks()) this.peer.addTrack(track, this.stream);
    this.channel = this.peer.createDataChannel('oai-events');
    this.channel.onmessage = ({ data }) => {
      if (this.closed) return;
      let event; try { event = JSON.parse(data); } catch { return; }
      if (event.type === 'input_audio_buffer.speech_started') { this.onState('listening'); this.onCaption('user', ''); }
      if (event.type === 'output_audio_buffer.started') this.onState('speaking');
      if (['output_audio_buffer.stopped', 'output_audio_buffer.cleared'].includes(event.type)) this.onState('listening');
      if (event.type === 'conversation.item.input_audio_transcription.completed') this.onCaption('user', event.transcript || '');
      if (['response.output_audio_transcript.delta', 'response.audio_transcript.delta'].includes(event.type)) this.onCaption('assistant-delta', event.delta || '');
      if (['response.output_audio_transcript.done', 'response.audio_transcript.done'].includes(event.type)) this.onCaption('assistant', event.transcript || '');
    };
    this.channel.onclose = () => { if (!this.closed) this.onError(new Error('Голосовой канал завершился.')); };
    await this.peer.setLocalDescription(await this.peer.createOffer());
    await this.iceReady();
    if (this.closed) throw new DOMException('Aborted', 'AbortError');
    const result = await this.api(`/chats/${encodeURIComponent(chatId)}/voice`, { requestId, sdp: this.peer.localDescription.sdp });
    if (this.closed) throw new DOMException('Aborted', 'AbortError');
    await this.peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
    return result;
  }
  iceReady() {
    if (this.peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.peer?.removeEventListener('icegatheringstatechange', changed); this.rejectIce = null; };
      const changed = () => { if (this.peer?.iceGatheringState === 'complete') { cleanup(); resolve(); } };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Не удалось установить голосовое соединение.')); }, 10000);
      this.rejectIce = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
      this.peer.addEventListener('icegatheringstatechange', changed); changed();
    });
  }
  async play() {
    try { await this.audio?.play(); this.onPlaybackBlocked(false); }
    catch { this.onPlaybackBlocked(true); }
  }
  mute(value) { for (const track of this.stream?.getAudioTracks() || []) track.enabled = !value; }
  release() {
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.channel?.close(); this.peer?.close();
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
  }
  stop() {
    this.closed = true; clearTimeout(this.disconnectedTimer); this.rejectIce?.(); this.release();
  }
}
