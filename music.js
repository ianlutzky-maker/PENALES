'use strict';

// Original terrace-style chants, arranged for square-wave lead and triangle bass.
const tracks = [
  {
    tempo: 126, bass: [48, 48, 53, 55],
    lead: [67, 67, 69, 67, 64, 64, 67, null, 65, 65, 67, 65, 62, 62, 60, null,
      67, 67, 72, 72, 69, 69, 67, null, 65, 67, 69, 67, 64, 62, 60, null]
  },
  {
    tempo: 112, bass: [45, 45, 50, 52],
    lead: [64, null, 64, 67, 69, null, 69, null, 67, 64, 62, null, 64, null, 64, null,
      65, 65, 69, 72, 71, null, 69, null, 68, 68, 71, 68, 64, null, 57, null]
  },
  {
    tempo: 144, bass: [50, 55, 57, 50],
    lead: [62, 66, 69, null, 69, 71, 69, null, 67, 67, 71, null, 74, 71, 67, null,
      69, 69, 73, null, 76, 73, 69, null, 74, 74, 71, 69, 66, 64, 62, null]
  }
];

const music = document.querySelector('#music');
let audio;
let channel;
let timer;
let selectionVersion = 0;

function note(output, midi, start, length, type, volume) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  envelope.gain.setValueAtTime(.001, start);
  envelope.gain.linearRampToValueAtTime(volume, start + .009);
  envelope.gain.exponentialRampToValueAtTime(.001, start + length);
  oscillator.connect(envelope).connect(output);
  oscillator.start(start);
  oscillator.stop(start + length);
}

music.addEventListener('change', async () => {
  const version = ++selectionVersion;
  clearInterval(timer);
  channel?.disconnect();
  channel = null;
  if (music.value === '') return;
  try {
    audio ??= new AudioContext();
    await audio.resume();
  } catch {
    if (version === selectionVersion) music.value = '';
    return;
  }
  if (version !== selectionVersion) return;

  channel = audio.createGain();
  channel.gain.value = .17;
  channel.connect(audio.destination);
  const track = tracks[Number(music.value)];
  const stepLength = 30 / track.tempo;
  let step = 0;
  let time = audio.currentTime + .035;

  function schedule() {
    time = Math.max(time, audio.currentTime);
    while (time < audio.currentTime + .16) {
      const lead = track.lead[step];
      const bass = track.bass[Math.floor(step / 8)];
      if (lead !== null) note(channel, lead, time, stepLength * .83, 'square', .28);
      if (step % 2 === 0) note(channel, bass + (step % 4 === 0 ? 0 : 7), time, stepLength * 1.35, 'triangle', .5);
      if (step % 4 === 2) note(channel, 37, time, .052, 'sawtooth', .2);
      step = (step + 1) % track.lead.length;
      time += stepLength;
    }
  }

  schedule();
  timer = setInterval(schedule, 50);
});
