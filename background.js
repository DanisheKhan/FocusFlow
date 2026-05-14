let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let dailyLogs = {};
let lastRecordedDate = new Date().toLocaleDateString('en-CA');

// Initialize state from storage
chrome.storage.local.get(['startTime', 'elapsedTime', 'isRunning', 'dailyLogs', 'lastRecordedDate', 'reminderDisabledUntil'], (result) => {
  startTime = result.startTime || 0;
  elapsedTime = result.elapsedTime || 0;
  isRunning = result.isRunning || false;
  dailyLogs = result.dailyLogs || {};
  lastRecordedDate = result.lastRecordedDate || new Date().toLocaleDateString('en-CA');
  reminderDisabledUntil = result.reminderDisabledUntil || 0;

  checkMidnightReset();

  if (isRunning) {
    startBadgeUpdate();
  }
});

function checkMidnightReset() {
  const today = new Date().toLocaleDateString('en-CA');
  if (today !== lastRecordedDate) {
    // It's a new day! 
    if (isRunning) {
      // Split the current session: previous day part goes to logs
      const sessionStartDate = new Date(startTime).toLocaleDateString('en-CA');
      if (sessionStartDate !== today) {
        const endOfPreviousDay = new Date(sessionStartDate);
        endOfPreviousDay.setHours(23, 59, 59, 999);
        const durationForOldDay = endOfPreviousDay.getTime() - startTime;
        
        // Record the portion belonging to the old day
        recordWorkedTime(durationForOldDay, sessionStartDate);
        
        // Reset for the new day
        startTime = new Date().setHours(0, 0, 0, 0);
        elapsedTime = 0; // Clear accumulated time from yesterday
      }
    } else {
      // Not running, just reset the counter for the new day
      elapsedTime = 0;
      startTime = 0;
    }
    
    lastRecordedDate = today;
    reminderDisabledUntil = 0;
    chrome.storage.local.set({ elapsedTime, startTime, lastRecordedDate, reminderDisabledUntil });
    
    // Update badge immediately if running
    if (isRunning) {
      updateBadge();
    }
  }
}

// Add an alarm to ensure midnight reset happens even if background is idle
chrome.alarms.create('daily-reset-check', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-reset-check') {
    checkMidnightReset();
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
  chrome.action.setTitle({ title: `Focus Flow: ${fullTime}` });

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
  checkMidnightReset();

  if (!isRunning) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'Focus Flow' });
    return;
  }

  const now = Date.now();
  const currentElapsed = now - startTime + elapsedTime;
  const formatted = formatTime(currentElapsed);
  
  chrome.action.setBadgeText({ text: formatted });
  chrome.action.setBadgeBackgroundColor({ color: '#1e293b' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
}

function recordWorkedTime(ms, date = null) {
  const targetDate = date || new Date().toLocaleDateString('en-CA');
  dailyLogs[targetDate] = (dailyLogs[targetDate] || 0) + ms;
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
let reminderDisabledUntil = 0;
const REMINDER_COOLDOWN = 60 * 60 * 1000; // 1 hour

function showReminder() {
  const now = Date.now();
  if (now < reminderDisabledUntil) return;

  if (!isRunning && (now - lastReminderTime > REMINDER_COOLDOWN)) {
    chrome.notifications.create('start-reminder', {
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: 'Focus Flow',
      message: 'Don\'t forget to start your tracker to stay in the flow!',
      buttons: [{ title: 'Mute for Today' }],
      priority: 1
    });
    lastReminderTime = now;
  }
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'start-reminder' && buttonIndex === 0) {
    // Mute until end of today
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    reminderDisabledUntil = endOfToday.getTime();
    chrome.storage.local.set({ reminderDisabledUntil });
    chrome.notifications.clear(notificationId);
  }
});

chrome.tabs.onCreated.addListener(() => {
  showReminder();
});

chrome.runtime.onStartup.addListener(() => {
  showReminder();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  checkMidnightReset();

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
  } else if (message.type === 'GET_STATUS') {
    const currentElapsed = isRunning ? (Date.now() - startTime + elapsedTime) : elapsedTime;
    sendResponse({ isRunning, elapsedTime: currentElapsed, dailyLogs, startTime });
  } else if (message.type === 'GET_LOGS') {
    sendResponse({ dailyLogs });
  }
  return true;
});

