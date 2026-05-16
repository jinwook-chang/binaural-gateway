const FIXED_GATEWAY_BEAT = 7.5;
const INTERNAL_TONE_LEVEL = 0.18;
const DRIFT_DEPTH_HZ = 8;
const DRIFT_SPEED = 0.14;
const beatPresets = new Map([
  ["4", "Deep Theta"],
  ["6", "Theta Drift"],
  ["7.5", "Gateway Calm"],
  ["8", "Low Alpha"],
  ["10", "Alpha Focus"],
  ["12", "Bright Focus"],
]);

const els = {
  intro: document.querySelector("#intro"),
  console: document.querySelector("#console"),
  enter: document.querySelector("#enter"),
  toggle: document.querySelector("#toggle"),
  beatPreset: document.querySelector("#beatPreset"),
  beat: document.querySelector("#beat"),
  carrier: document.querySelector("#carrier"),
  volume: document.querySelector("#volume"),
  drift: document.querySelector("#drift"),
  presetOut: document.querySelector("#presetOut"),
  beatOut: document.querySelector("#beatOut"),
  carrierOut: document.querySelector("#carrierOut"),
  volumeOut: document.querySelector("#volumeOut"),
  driftOut: document.querySelector("#driftOut"),
  leftHz: document.querySelector("#leftHz"),
  rightHz: document.querySelector("#rightHz"),
  deltaHz: document.querySelector("#deltaHz"),
  leftMeter: document.querySelector("#leftMeter"),
  rightMeter: document.querySelector("#rightMeter"),
};

let audioContext;
let engine;
let playing = false;
let animationId;

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hashNoise(index) {
  const x = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

function smoothNoise(t) {
  const i = Math.floor(t);
  const f = t - i;
  const a = hashNoise(i);
  const b = hashNoise(i + 1);
  return a + (b - a) * fade(f);
}

function getParams() {
  const beat = Number(els.beat.value);
  const carrier = Number(els.carrier.value);
  const drift = els.drift.checked;
  const driftValue = drift && audioContext ? smoothNoise(audioContext.currentTime * DRIFT_SPEED) * DRIFT_DEPTH_HZ : 0;
  const activeCarrier = carrier + driftValue;
  return {
    beat,
    carrier,
    activeCarrier,
    leftFreq: activeCarrier - beat / 2,
    rightFreq: activeCarrier + beat / 2,
    volume: Number(els.volume.value) / 100,
    drift,
  };
}

function hz(value) {
  return `${value.toFixed(2).replace(/\.?0+$/, "")} Hz`;
}

function updateLabels() {
  const params = getParams();
  const presetKey = String(params.beat);
  const presetName = beatPresets.get(presetKey) || "Custom";
  els.beatPreset.value = beatPresets.has(presetKey) ? presetKey : "custom";
  els.presetOut.value = presetName;
  els.beatOut.value = hz(params.beat);
  els.carrierOut.value = hz(params.carrier);
  els.volumeOut.value = `${els.volume.value}%`;
  els.driftOut.value = params.drift ? "ON" : "OFF";
  els.leftHz.textContent = hz(params.leftFreq);
  els.rightHz.textContent = hz(params.rightFreq);
  els.deltaHz.textContent = hz(params.beat);
}

function createEngine() {
  const context = new AudioContext();
  const leftOsc = context.createOscillator();
  const rightOsc = context.createOscillator();
  const leftGain = context.createGain();
  const rightGain = context.createGain();
  const merger = context.createChannelMerger(2);
  const params = getParams();

  leftOsc.type = "sine";
  rightOsc.type = "sine";
  leftOsc.frequency.setValueAtTime(params.leftFreq, context.currentTime);
  rightOsc.frequency.setValueAtTime(params.rightFreq, context.currentTime);
  leftGain.gain.setValueAtTime(0, context.currentTime);
  rightGain.gain.setValueAtTime(0, context.currentTime);

  leftOsc.connect(leftGain);
  rightOsc.connect(rightGain);
  leftGain.connect(merger, 0, 0);
  rightGain.connect(merger, 0, 1);
  merger.connect(context.destination);
  leftOsc.start();
  rightOsc.start();

  const state = {
    context,
    leftOsc,
    rightOsc,
    leftGain,
    rightGain,
    leftRms: 0,
    rightRms: 0,
  };
  applyEngineParams(state);
  return state;
}

function applyEngineParams(state) {
  if (!state) {
    return;
  }

  const params = getParams();
  const now = state.context.currentTime;
  const gain = INTERNAL_TONE_LEVEL * params.volume;
  state.leftOsc.frequency.setTargetAtTime(params.leftFreq, now, 0.05);
  state.rightOsc.frequency.setTargetAtTime(params.rightFreq, now, 0.05);
  state.leftGain.gain.setTargetAtTime(gain, now, 0.04);
  state.rightGain.gain.setTargetAtTime(gain, now, 0.04);
  state.leftRms = gain * 0.707;
  state.rightRms = gain * 0.707;
}

async function startAudio() {
  if (!audioContext) {
    engine = createEngine();
    audioContext = engine.context;
  }
  await audioContext.resume();
  playing = true;
  els.toggle.textContent = "PAUSE";
  els.toggle.classList.remove("paused");
  els.toggle.setAttribute("aria-label", "Pause");
}

async function toggleAudio() {
  if (!audioContext) {
    await startAudio();
    return;
  }

  if (playing) {
    await audioContext.suspend();
    playing = false;
    els.toggle.textContent = "PLAY";
    els.toggle.classList.add("paused");
    els.toggle.setAttribute("aria-label", "Play");
  } else {
    await startAudio();
  }
}

async function enterConsole() {
  els.intro.hidden = true;
  els.console.hidden = false;
  await startAudio();
}

function animate() {
  if (engine && playing) {
    updateLabels();
    applyEngineParams(engine);
    const leftScale = Math.max(0.08, Math.min(1, engine.leftRms * 46));
    const rightScale = Math.max(0.08, Math.min(1, engine.rightRms * 46));
    els.leftMeter.style.transform = `scaleX(${leftScale})`;
    els.rightMeter.style.transform = `scaleX(${rightScale})`;
    els.leftMeter.style.opacity = String(Math.max(0.35, leftScale));
    els.rightMeter.style.opacity = String(Math.max(0.35, rightScale));
  } else {
    els.leftMeter.style.transform = "scaleX(0.1)";
    els.rightMeter.style.transform = "scaleX(0.1)";
    els.leftMeter.style.opacity = "0.35";
    els.rightMeter.style.opacity = "0.35";
  }
  animationId = requestAnimationFrame(animate);
}

els.enter.addEventListener("click", enterConsole);
els.toggle.addEventListener("click", toggleAudio);
els.beatPreset.addEventListener("change", () => {
  if (els.beatPreset.value !== "custom") {
    els.beat.value = els.beatPreset.value;
    updateLabels();
  }
});

[els.beat, els.carrier, els.volume, els.drift].forEach((input) => {
  input.addEventListener("input", () => {
    updateLabels();
    applyEngineParams(engine);
  });
  input.addEventListener("change", () => {
    updateLabels();
    applyEngineParams(engine);
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !els.intro.hidden) {
    enterConsole();
  }
});

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationId);
  if (audioContext) {
    if (engine) {
      engine.leftOsc.stop();
      engine.rightOsc.stop();
    }
    audioContext.close();
  }
});

els.beat.value = String(FIXED_GATEWAY_BEAT);
updateLabels();
animate();
