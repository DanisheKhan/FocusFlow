let isRunning = false;
let displayTime = 0;
let animationFrameId = null;

const displayEl = document.getElementById('display');
const msEl = document.querySelector('.milliseconds');
const startStopBtn = document.getElementById('startStopBtn');
const resetBtn = document.getElementById('resetBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');

function formatTime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));

  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');

  return `${h}:${m}:${s}`;
}

function formatMs(ms) {
  const milliseconds = Math.floor((ms % 1000) / 10);
  return `.${milliseconds.toString().padStart(2, '0')}`;
}

function updateUI() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response) {
      isRunning = response.isRunning;
      displayTime = response.elapsedTime;
      
      displayEl.textContent = formatTime(displayTime);
      msEl.textContent = formatMs(displayTime);
      
      if (isRunning) {
        startStopBtn.textContent = 'Stop';
        statusText.textContent = 'Running';
        statusDot.classList.add('active');
        if (!animationFrameId) {
          startAnimation();
        }
      } else {
        startStopBtn.textContent = 'Start';
        statusText.textContent = displayTime > 0 ? 'Paused' : 'Inactive';
        statusDot.classList.remove('active');
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    }
  });
}

function startAnimation() {
  const step = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response && response.isRunning) {
        displayEl.textContent = formatTime(response.elapsedTime);
        msEl.textContent = formatMs(response.elapsedTime);
        animationFrameId = requestAnimationFrame(step);
      }
    });
  };
  animationFrameId = requestAnimationFrame(step);
}

startStopBtn.addEventListener('click', () => {
  if (isRunning) {
    chrome.runtime.sendMessage({ type: 'STOP' }, updateUI);
  } else {
    chrome.runtime.sendMessage({ type: 'START' }, updateUI);
  }
});

resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET' }, updateUI);
});

// Initial load
updateUI();

// Sync every second
setInterval(updateUI, 1000);
