let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let dailyLogs = {};

// Initialize state from storage
chrome.storage.local.get(['startTime', 'elapsedTime', 'isRunning', 'dailyLogs'], (result) => {
  startTime = result.startTime || 0;
  elapsedTime = result.elapsedTime || 0;
  isRunning = result.isRunning || false;
  dailyLogs = result.dailyLogs || {};

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
  
  const fullTime = `${hours.toString().padStart(2, '0')}:${m}:${s}`;
  chrome.action.setTitle({ title: `Stopwatch: ${fullTime}` });

  if (totalMinutes < 10) {
    return `${totalMinutes}:${s}`;
  }
  
  if (seconds % 2 === 0) {
    if (hours > 0) {
      return `${hours}:${minutes}`;
    }
    return `${totalMinutes}m`;
  } else {
    return `${s}s`;
  }
}

function updateBadge() {
  if (!isRunning) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Sleek Stopwatch' });
    return;
  }

  const now = Date.now();
  const currentElapsed = now - startTime + elapsedTime;
  const formatted = formatTime(currentElapsed);
  
  chrome.action.setBadgeText({ text: formatted });
  chrome.action.setBadgeBackgroundColor({ color: '#1e293b' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });

  // Periodically update daily logs while running (every minute)
  // This helps ensure data isn't lost if the day changes while running
  if (Math.floor(currentElapsed / 1000) % 60 === 0) {
    syncDailyTime();
  }
}

function syncDailyTime() {
  if (!isRunning) return;
  
  const now = Date.now();
  const today = new Date().toLocaleDateString('en-CA');
  const sessionStartTime = startTime;
  const sessionStartDate = new Date(sessionStartTime).toLocaleDateString('en-CA');

  if (today !== sessionStartDate) {
    // Day has changed while running!
    // 1. Record time for the previous day(s) up to midnight
    const endOfPreviousDay = new Date(sessionStartDate);
    endOfPreviousDay.setHours(23, 59, 59, 999);
    
    const durationForOldDay = endOfPreviousDay.getTime() - sessionStartTime;
    recordWorkedTime(durationForOldDay);
    
    // 2. Update startTime to start of today to track the rest
    startTime = new Date().setHours(0, 0, 0, 0);
    chrome.storage.local.set({ startTime });
  }
}


// Revised approach: track daily time on STOP and via periodic check
function recordWorkedTime(ms) {
  const today = new Date().toLocaleDateString('en-CA');
  dailyLogs[today] = (dailyLogs[today] || 0) + ms;
  chrome.storage.local.set({ dailyLogs });
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

let lastReminderTime = 0;
const REMINDER_COOLDOWN = 60 * 60 * 1000; // 1 hour

function showReminder() {
  const now = Date.now();
  if (!isRunning && (now - lastReminderTime > REMINDER_COOLDOWN)) {
    chrome.notifications.create('start-reminder', {
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: 'Stopwatch Inactive',
      message: 'Don\'t forget to start your stopwatch to track your progress!',
      priority: 1
    });
    lastReminderTime = now;
  }
}

// Remind when a new tab is created (user starts "using" the browser)
chrome.tabs.onCreated.addListener(() => {
  showReminder();
});

// Remind when the browser starts
chrome.runtime.onStartup.addListener(() => {
  showReminder();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START') {
    if (!isRunning) {
      isRunning = true;
      startTime = Date.now();
      chrome.storage.local.set({ isRunning, startTime });
      startBadgeUpdate();
      chrome.notifications.clear('start-reminder');
    }
  } else if (message.type === 'STOP') {
    if (isRunning) {
      isRunning = false;
      const sessionDuration = Date.now() - startTime;
      elapsedTime += sessionDuration;
      recordWorkedTime(sessionDuration);
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
    sendResponse({ isRunning, elapsedTime: currentElapsed, dailyLogs });
  } else if (message.type === 'GET_LOGS') {
    sendResponse({ dailyLogs });
  }
  return true;
});


