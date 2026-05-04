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
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  
  const s = seconds.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  
  // Update the extension tooltip with full time
  const fullTime = `${hours.toString().padStart(2, '0')}:${m}:${s}`;
  chrome.action.setTitle({ title: `Stopwatch: ${fullTime}` });

  // If under 10 minutes, show full M:SS on badge
  if (totalMinutes < 10) {
    return `${totalMinutes}:${s}`;
  }
  
  // Alternating cycle every second
  if (seconds % 2 === 0) {
    if (hours > 0) {
      return `${hours}:${minutes}`; // e.g. 1h12
    }
    return `${totalMinutes}m`; // e.g. 72m
  } else {
    return `${s}s`; // e.g. 34s
  }
}

function updateBadge() {
  if (!isRunning) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Sleek Stopwatch' });
    return;
  }

  const currentElapsed = Date.now() - startTime + elapsedTime;
  const formatted = formatTime(currentElapsed);
  
  chrome.action.setBadgeText({ text: formatted });
  chrome.action.setBadgeBackgroundColor({ color: '#1e293b' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
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
