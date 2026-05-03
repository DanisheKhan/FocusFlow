let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;

// Initialize state from storage
chrome.storage.local.get(['startTime', 'elapsedTime', 'isRunning'], (result) => {
  startTime = result.startTime || 0;
  elapsedTime = result.elapsedTime || 0;
  isRunning = result.isRunning || false;

  if (isRunning) {
    startBadgeUpdate();
  }
});

function formatTime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateBadge() {
  if (!isRunning) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const currentElapsed = Date.now() - startTime + elapsedTime;
  const formatted = formatTime(currentElapsed);
  
  // Badge text is limited, we might only show minutes/seconds
  // Let's show "MM:SS" and hope for the best, or truncate
  chrome.action.setBadgeText({ text: formatted.substring(0, 4) });
  chrome.action.setBadgeBackgroundColor({ color: '#1e293b' });
}

function startBadgeUpdate() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateBadge, 1000);
  updateBadge();
}

function stopBadgeUpdate() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  chrome.action.setBadgeText({ text: '' });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START') {
    if (!isRunning) {
      isRunning = true;
      startTime = Date.now();
      chrome.storage.local.set({ isRunning, startTime });
      startBadgeUpdate();
    }
  } else if (message.type === 'STOP') {
    if (isRunning) {
      isRunning = false;
      elapsedTime += Date.now() - startTime;
      chrome.storage.local.set({ isRunning, elapsedTime });
      stopBadgeUpdate();
    }
  } else if (message.type === 'RESET') {
    isRunning = false;
    startTime = 0;
    elapsedTime = 0;
    chrome.storage.local.set({ isRunning, startTime, elapsedTime });
    stopBadgeUpdate();
  } else if (message.type === 'GET_STATUS') {
    const currentElapsed = isRunning ? (Date.now() - startTime + elapsedTime) : elapsedTime;
    sendResponse({ isRunning, elapsedTime: currentElapsed });
  }
});
