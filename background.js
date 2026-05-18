let timerInterval = null;
let startTime = 0;
let elapsedTime = 0;
let isRunning = false;
let dailyLogs = {};
let dailyPauses = {};
let dailyGoalMs = 8 * 60 * 60 * 1000;
let lastWeeklyReportDate = '';

// New Features State
let longestSessionMs = 0;
let overworkNotifiedForCurrentSession = false;
let startTimesSum = 0;
let startTimesCount = 0;
let hasStartedToday = false;
let timeOfDayBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
let lastPauseTimestamp = 0;

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

let lastRecordedDate = getTodayDate();
let reminderDisabledUntil = 0;
let wasAutoPaused = false;

// Initialize state from storage
let storageLoadedPromise = new Promise((resolve) => {
  chrome.storage.local.get([
    'startTime', 'elapsedTime', 'isRunning', 'dailyLogs', 'lastRecordedDate', 'reminderDisabledUntil', 'wasAutoPaused', 'dailyPauses', 'dailyGoalMs', 'lastWeeklyReportDate',
    'longestSessionMs', 'startTimesSum', 'startTimesCount', 'hasStartedToday', 'timeOfDayBuckets', 'lastPauseTimestamp'
  ], (result) => {
    startTime = result.startTime || 0;
    elapsedTime = result.elapsedTime || 0;
    isRunning = result.isRunning || false;
    dailyLogs = result.dailyLogs || {};
    lastRecordedDate = result.lastRecordedDate || getTodayDate();
    reminderDisabledUntil = result.reminderDisabledUntil || 0;
    wasAutoPaused = result.wasAutoPaused || false;
    dailyPauses = result.dailyPauses || {};
    dailyGoalMs = result.dailyGoalMs || 8 * 60 * 60 * 1000;
    lastWeeklyReportDate = result.lastWeeklyReportDate || '';
    
    longestSessionMs = result.longestSessionMs || 0;
    startTimesSum = result.startTimesSum || 0;
    startTimesCount = result.startTimesCount || 0;
    hasStartedToday = result.hasStartedToday || false;
    timeOfDayBuckets = result.timeOfDayBuckets || { morning: 0, afternoon: 0, evening: 0, night: 0 };
    lastPauseTimestamp = result.lastPauseTimestamp || 0;

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
    if (isRunning) {
      const endOfPreviousDay = new Date();
      endOfPreviousDay.setHours(0, 0, 0, 0); 
      
      const durationForOldDay = endOfPreviousDay.getTime() - startTime;
      
      if (durationForOldDay > 0) {
        recordWorkedTime(durationForOldDay, lastRecordedDate);
        checkLongestSession(durationForOldDay + elapsedTime);
        recordTimeOfDayBuckets(startTime, endOfPreviousDay.getTime());
      }
      
      startTime = endOfPreviousDay.getTime();
      elapsedTime = 0; 
      hasStartedToday = true;
    } else {
      elapsedTime = 0;
      startTime = 0;
      hasStartedToday = false;
      lastPauseTimestamp = 0;
    }
    
    lastRecordedDate = today;
    reminderDisabledUntil = 0;
    chrome.storage.local.set({ isRunning, elapsedTime, startTime, lastRecordedDate, reminderDisabledUntil, hasStartedToday, lastPauseTimestamp });
    
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
    checkWeeklyReport();
  }
});

function checkWeeklyReport() {
  const now = new Date();
  if (now.getDay() === 0 && now.getHours() >= 18) { // Sunday 6 PM or later
    const todayStr = getTodayDate();
    if (lastWeeklyReportDate !== todayStr) {
      sendWeeklyReport();
      lastWeeklyReportDate = todayStr;
      chrome.storage.local.set({ lastWeeklyReportDate });
    }
  }
}

function sendWeeklyReport() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  let totalMs = 0;
  let bestDayMs = 0;
  let daysWithData = 0;
  
  Object.entries(dailyLogs).forEach(([dateStr, ms]) => {
    const logDate = new Date(dateStr);
    if (logDate >= startOfWeek && logDate <= now) {
      totalMs += ms;
      if (ms > bestDayMs) bestDayMs = ms;
      if (ms > 0) daysWithData++;
    }
  });
  
  const hours = (totalMs / (1000 * 60 * 60)).toFixed(1);
  const avg = daysWithData > 0 ? (totalMs / daysWithData / (1000 * 60 * 60)).toFixed(1) : 0;
  
  chrome.notifications.create('weekly-report', {
    type: 'basic',
    iconUrl: 'icons/logo.png',
    title: 'Focus Flow: Weekly Report',
    message: `You worked ${hours}h this week! Avg: ${avg}h/day. Keep it up!`,
    priority: 1
  });
}

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

  if (currentElapsed > 4 * 60 * 60 * 1000 && !overworkNotifiedForCurrentSession) {
    chrome.notifications.create('overwork-alert', {
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: 'Focus Flow: Overwork Alert',
      message: 'You have been at it for 4+ hours straight. Consider taking a short break!',
      priority: 1
    });
    overworkNotifiedForCurrentSession = true;
  }
}

function recordWorkedTime(ms, date = null) {
  const targetDate = date || getTodayDate();
  dailyLogs[targetDate] = (dailyLogs[targetDate] || 0) + ms;
  chrome.storage.local.set({ dailyLogs });
}

function checkLongestSession(ms) {
  if (ms > longestSessionMs) {
    longestSessionMs = ms;
    chrome.storage.local.set({ longestSessionMs });
  }
}

function recordTimeOfDayBuckets(start, end) {
  const midPoint = new Date((start + end) / 2);
  const hour = midPoint.getHours();
  let bucket = 'night';
  if (hour >= 6 && hour < 12) bucket = 'morning';
  else if (hour >= 12 && hour < 17) bucket = 'afternoon';
  else if (hour >= 17 && hour < 22) bucket = 'evening';
  
  timeOfDayBuckets[bucket] += (end - start);
  chrome.storage.local.set({ timeOfDayBuckets });
}

function recordPause(type, date = null) {
  const targetDate = date || getTodayDate();
  if (!dailyPauses[targetDate]) dailyPauses[targetDate] = { manual: 0, idle: 0 };
  dailyPauses[targetDate][type] = (dailyPauses[targetDate][type] || 0) + 1;
  chrome.storage.local.set({ dailyPauses });
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

function formatMinutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function showReminder() {
  const now = Date.now();
  if (now < reminderDisabledUntil) return;
  if (isRunning) return;

  if (startTimesCount > 0) {
    const avgMinutes = startTimesSum / startTimesCount;
    const currentDate = new Date();
    const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
    
    if (currentMinutes < avgMinutes) {
      return; 
    }
  }

  if (now - lastReminderTime > REMINDER_COOLDOWN) {
    const avgText = startTimesCount > 0 ? ` (Usually you start around ${formatMinutesToTime(startTimesSum / startTimesCount)})` : '';
    chrome.notifications.create('start-reminder', {
      type: 'basic',
      iconUrl: 'icons/logo.png',
      title: 'Focus Flow',
      message: `Time to start your tracker?${avgText}`,
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

function doStartTimer() {
  wasAutoPaused = false;
  if (!isRunning) {
    isRunning = true;
    startTime = Date.now();
    overworkNotifiedForCurrentSession = false;
    
    const isFirstStartOfDay = !hasStartedToday;
    
    if (!hasStartedToday) {
      hasStartedToday = true;
      const now = new Date();
      startTimesSum += (now.getHours() * 60 + now.getMinutes());
      startTimesCount += 1;
      chrome.storage.local.set({ hasStartedToday, startTimesSum, startTimesCount });
    }
    
    lastPauseTimestamp = 0;
    
    chrome.storage.local.set({ isRunning, startTime, wasAutoPaused, lastPauseTimestamp });
    startBadgeUpdate();
    chrome.notifications.clear('start-reminder');
  } else {
    chrome.storage.local.set({ wasAutoPaused });
  }
}

function doStopTimer(isManual) {
  wasAutoPaused = false;
  if (isRunning) {
    isRunning = false;
    const now = Date.now();
    const sessionDuration = now - startTime;
    elapsedTime += sessionDuration;
    recordWorkedTime(sessionDuration);
    checkLongestSession(elapsedTime);
    recordTimeOfDayBuckets(startTime, now);
    
    if (isManual) recordPause('manual');
    
    lastPauseTimestamp = now;
    chrome.storage.local.set({ isRunning, elapsedTime, wasAutoPaused, lastPauseTimestamp });
    stopBadgeUpdate();
  } else {
    chrome.storage.local.set({ wasAutoPaused });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  storageLoadedPromise.then(() => {
    checkMidnightReset();

    if (message.type === 'START') {
      doStartTimer();
      sendResponse({ success: true });
    } else if (message.type === 'STOP') {
      doStopTimer(true);
      sendResponse({ success: true });
    } else if (message.type === 'GET_STATUS') {
      const currentElapsed = isRunning ? (Date.now() - startTime + elapsedTime) : elapsedTime;
      sendResponse({ 
        isRunning, elapsedTime: currentElapsed, dailyLogs, dailyPauses, 
        dailyGoalMs, startTime, longestSessionMs, startTimesSum, startTimesCount,
        timeOfDayBuckets
      });
    } else if (message.type === 'UPDATE_GOAL') {
      dailyGoalMs = message.dailyGoalMs;
      chrome.storage.local.set({ dailyGoalMs });
      sendResponse({ success: true });
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

// Shortcut to open popup is handled automatically by Chrome via _execute_action in manifest.json

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
          const idleTimeMs = 900 * 1000;
          activeDuration = Math.max(0, sessionDurationSinceStart - idleTimeMs);
        } else {
          activeDuration = sessionDurationSinceStart;
        }
        
        elapsedTime += activeDuration;
        recordWorkedTime(activeDuration);
        checkLongestSession(elapsedTime);
        recordTimeOfDayBuckets(startTime, startTime + activeDuration);
        recordPause('idle');
        
        wasAutoPaused = true;
        lastPauseTimestamp = Date.now();
        chrome.storage.local.set({ isRunning, elapsedTime, wasAutoPaused, lastPauseTimestamp });
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
        overworkNotifiedForCurrentSession = false;
        
        lastPauseTimestamp = 0;
        
        chrome.storage.local.set({ isRunning, startTime, wasAutoPaused, lastPauseTimestamp });
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


