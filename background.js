let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let dailyLogs = {};
function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

let lastRecordedDate = getTodayDate();
let reminderDisabledUntil = 0;
let wasAutoPaused = false;

// Initialize state from storage
let storageLoadedPromise = new Promise((resolve) => {
  chrome.storage.local.get(['startTime', 'elapsedTime', 'isRunning', 'dailyLogs', 'lastRecordedDate', 'reminderDisabledUntil', 'wasAutoPaused'], (result) => {
    startTime = result.startTime || 0;
    elapsedTime = result.elapsedTime || 0;
    isRunning = result.isRunning || false;
    dailyLogs = result.dailyLogs || {};
    lastRecordedDate = result.lastRecordedDate || getTodayDate();
    reminderDisabledUntil = result.reminderDisabledUntil || 0;
    wasAutoPaused = result.wasAutoPaused || false;

    checkMidnightReset();

    if (isRunning) {
      startBadgeUpdate();
    }
    resolve();
  });
});

function checkMidnightReset() {
  const today = getTodayDate();
  if (today !== lastRecordedDate) {
    // It's a new day! 
    if (isRunning) {
      // Split the current session: previous day part goes to logs
      const endOfPreviousDay = new Date();
      endOfPreviousDay.setHours(0, 0, 0, 0); // Midnight of TODAY
      
      const durationForOldDay = endOfPreviousDay.getTime() - startTime;
      
      if (durationForOldDay > 0) {
        recordWorkedTime(durationForOldDay, lastRecordedDate);
      }
      
      // Stop the timer, reset clock to zero for the new day
      isRunning = false;
      startTime = 0;
      elapsedTime = 0; 
      stopBadgeUpdate();
    } else {
      // Not running, just reset the counter for the new day
      elapsedTime = 0;
      startTime = 0;
    }
    
    lastRecordedDate = today;
    reminderDisabledUntil = 0;
    chrome.storage.local.set({ isRunning, elapsedTime, startTime, lastRecordedDate, reminderDisabledUntil });
    
    // Update badge immediately if running
    if (isRunning) {
      updateBadge();
    } else {
      chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
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
  const targetDate = date || getTodayDate();
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
  storageLoadedPromise.then(() => {
    checkMidnightReset();

    if (message.type === 'START') {
      wasAutoPaused = false;
      if (!isRunning) {
        isRunning = true;
        startTime = Date.now();
        chrome.storage.local.set({ isRunning, startTime, wasAutoPaused });
        startBadgeUpdate();
        chrome.notifications.clear('start-reminder');
      } else {
        chrome.storage.local.set({ wasAutoPaused });
      }
      sendResponse({ success: true });
    } else if (message.type === 'STOP') {
      wasAutoPaused = false;
      if (isRunning) {
        isRunning = false;
        const sessionDuration = Date.now() - startTime;
        elapsedTime += sessionDuration;
        recordWorkedTime(sessionDuration);
        chrome.storage.local.set({ isRunning, elapsedTime, wasAutoPaused });
        stopBadgeUpdate();
      } else {
        chrome.storage.local.set({ wasAutoPaused });
      }
      sendResponse({ success: true });
    } else if (message.type === 'GET_STATUS') {
      const currentElapsed = isRunning ? (Date.now() - startTime + elapsedTime) : elapsedTime;
      sendResponse({ isRunning, elapsedTime: currentElapsed, dailyLogs, startTime });
    } else if (message.type === 'RESET') {
      wasAutoPaused = false;
      isRunning = false;
      elapsedTime = 0;
      startTime = 0;
      chrome.storage.local.set({ isRunning, elapsedTime, startTime, wasAutoPaused });
      stopBadgeUpdate();
      sendResponse({ success: true });
    }
  });
  return true;
});

// --- Auto-Pause Logic ---
const IDLE_THRESHOLD = 900; // 15 minutes in seconds
chrome.idle.setDetectionInterval(IDLE_THRESHOLD);

chrome.idle.onStateChanged.addListener((newState) => {
  storageLoadedPromise.then(() => {
    if (newState === 'idle' || newState === 'locked') {
      if (isRunning) {
        isRunning = false;
        
        const now = Date.now();
        const sessionDurationSinceStart = now - startTime;
        
        let activeDuration;
        
        if (newState === 'idle') {
          // If it triggered 'idle', there was exactly 15 minutes of continuous inactivity.
          // We subtract the 15 minutes so the idle time isn't counted as work.
          const idleTimeMs = 900 * 1000;
          activeDuration = Math.max(0, sessionDurationSinceStart - idleTimeMs);
        } else {
          // If it triggered 'locked', the machine was locked or put to sleep.
          // This happens instantly (e.g. closing the lid), so we DO NOT subtract 15 minutes.
          activeDuration = sessionDurationSinceStart;
        }
        
        elapsedTime += activeDuration;
        recordWorkedTime(activeDuration);
        
        wasAutoPaused = true;
        chrome.storage.local.set({ isRunning, elapsedTime, wasAutoPaused });
        stopBadgeUpdate();

        chrome.notifications.create('auto-pause-notification', {
          type: 'basic',
          iconUrl: 'icons/logo.png',
          title: 'Focus Flow: Auto-Paused',
          message: newState === 'idle' 
            ? 'The stopwatch was paused after 15 minutes of inactivity.'
            : 'The stopwatch was paused because the system was locked.',
          priority: 1
        });

        // Update any open popups
        chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
      }
    } else if (newState === 'active') {
      checkMidnightReset();
      if (wasAutoPaused && !isRunning) {
        isRunning = true;
        startTime = Date.now();
        wasAutoPaused = false;
        chrome.storage.local.set({ isRunning, startTime, wasAutoPaused });
        startBadgeUpdate();

        chrome.notifications.create('auto-resume-notification', {
          type: 'basic',
          iconUrl: 'icons/logo.png',
          title: 'Focus Flow: Auto-Resumed',
          message: 'Welcome back! The stopwatch has been resumed.',
          priority: 1
        });

        // Update any open popups
        chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {});
      }
    }
  });
});


