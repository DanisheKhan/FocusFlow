function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

let isRunning = false;
let displayTime = 0;
let sessionStartTime = 0;
let animationFrameId = null;
let currentDailyLogs = {};
let currentDailyPauses = {};
let currentDailyGoalMs = 8 * 60 * 60 * 1000;
let currentTimeOfDayBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
let currentLongestSessionMs = 0;
let currentStartTimesSum = 0;
let currentStartTimesCount = 0;
let currentDailyBreaks = {};
let currentLastPauseTimestamp = 0;

const displayEl = document.getElementById('display');
const msEl = document.querySelector('.milliseconds');
const startStopBtn = document.getElementById('startStopBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const historyToggleBtn = document.getElementById('historyToggleBtn');
const historyPanel = document.getElementById('historyPanel');
const heatmapGrid = document.getElementById('heatmapGrid');
const detailsDateEl = document.getElementById('detailsDate');
const detailsTimeEl = document.getElementById('detailsTime');
const dayGoalVal = document.getElementById('dayGoalVal');
const dayGoalBar = document.getElementById('dayGoalBar');
const dayManualVal = document.getElementById('dayManualVal');
const dayIdleVal = document.getElementById('dayIdleVal');
const progressValueEl = document.getElementById('progressValue');

const dayRatioBox = document.getElementById('dayRatioBox');
const dayRatioVal = document.getElementById('dayRatioVal');
const dayRatioWorkBar = document.getElementById('dayRatioWorkBar');
const dayRatioBreakBar = document.getElementById('dayRatioBreakBar');
const dayWorkHrs = document.getElementById('dayWorkHrs');
const dayBreakHrs = document.getElementById('dayBreakHrs');

const bestDayBadge = document.getElementById('bestDayBadge');
const worstDayBadge = document.getElementById('worstDayBadge');
const avgStartTimeEl = document.getElementById('avgStartTime');
const longestSessionTimeEl = document.getElementById('longestSessionTime');
const barMorning = document.getElementById('barMorning');
const barAfternoon = document.getElementById('barAfternoon');
const barEvening = document.getElementById('barEvening');
const barNight = document.getElementById('barNight');
const dailyGoalInput = document.getElementById('dailyGoalInput');
const currentTimeEl = document.getElementById('currentTime');

// Google Sheets Sync Elements
const syncStatusEl = document.getElementById('syncStatus');
const sheetsUrlInput = document.getElementById('sheetsUrlInput');
const saveConnectBtn = document.getElementById('saveConnectBtn');
const syncNowBtn = document.getElementById('syncNowBtn');
const autoSyncCheckbox = document.getElementById('autoSyncCheckbox');
const guideToggleBtn = document.getElementById('guideToggleBtn');
const guideContent = document.getElementById('guideContent');
const copyScriptBtn = document.getElementById('copyScriptBtn');
const configToggleBtn = document.getElementById('configToggleBtn');
const sheetsConfigPanel = document.getElementById('sheetsConfigPanel');

dailyGoalInput.addEventListener('change', (e) => {
  const val = parseFloat(e.target.value);
  if (val > 0) {
    chrome.runtime.sendMessage({ type: 'UPDATE_GOAL', dailyGoalMs: val * 3600000 }, updateUI);
  }
});

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

function formatShortTime(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

let selectedDateStr = getTodayDate(); // Default to today

function updateSelectedDateDetails() {
  if (!selectedDateStr) return;
  
  // Parse dateStr safely
  const parts = selectedDateStr.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const todayStr = getTodayDate();
  
  let liveTime = currentDailyLogs[selectedDateStr] || 0;
  let breakMs = currentDailyBreaks[selectedDateStr] || 0;
  
  if (selectedDateStr === todayStr) {
    if (isRunning && sessionStartTime) {
      liveTime += (Date.now() - sessionStartTime);
    }
    if (!isRunning && currentLastPauseTimestamp > 0 && liveTime < currentDailyGoalMs) {
      let liveBreak = Date.now() - currentLastPauseTimestamp;
      const MAX_BREAK_MS = 2 * 60 * 60 * 1000;
      if (liveBreak > MAX_BREAK_MS) {
        liveBreak = MAX_BREAK_MS;
      }
      breakMs += liveBreak;
    }
  }
  
  detailsDateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  detailsTimeEl.textContent = formatTime(liveTime);
  
  const pauses = currentDailyPauses[selectedDateStr] || { manual: 0, idle: 0 };
  
  if (liveTime === 0 && breakMs === 0) {
    dayGoalVal.textContent = '-';
    dayGoalBar.style.width = '0%';
    dayManualVal.textContent = '-';
    dayIdleVal.textContent = '-';
    
    dayRatioVal.textContent = '-';
    dayRatioWorkBar.style.width = '0%';
    dayRatioBreakBar.style.width = '0%';
    dayWorkHrs.textContent = '-';
    dayBreakHrs.textContent = '-';
  } else {
    // Goal Progress
    if (liveTime > 0) {
      const goalRatio = Math.min(Math.round((liveTime / currentDailyGoalMs) * 100), 100);
      const goalHours = (currentDailyGoalMs / 3600000).toFixed(1);
      const workedHours = (liveTime / 3600000).toFixed(1);
      
      dayGoalVal.textContent = `${workedHours}h / ${goalHours}h (${goalRatio}%)`;
      dayGoalBar.style.width = `${goalRatio}%`;
    } else {
      dayGoalVal.textContent = '-';
      dayGoalBar.style.width = '0%';
    }
    
    dayManualVal.textContent = pauses.manual.toString();
    dayIdleVal.textContent = pauses.idle.toString();
    
    // Work vs Break Ratio
    const total = liveTime + breakMs;
    if (total > 0) {
      const workPct = Math.round((liveTime / total) * 100);
      const breakPct = 100 - workPct;
      
      dayRatioVal.textContent = `${workPct}% Work / ${breakPct}% Break`;
      dayRatioWorkBar.style.width = `${workPct}%`;
      dayRatioBreakBar.style.width = `${breakPct}%`;
      dayWorkHrs.textContent = formatShortTime(liveTime);
      dayBreakHrs.textContent = formatShortTime(breakMs);
    } else {
      dayRatioVal.textContent = '-';
      dayRatioWorkBar.style.width = '0%';
      dayRatioBreakBar.style.width = '0%';
      dayWorkHrs.textContent = '-';
      dayBreakHrs.textContent = '-';
    }
  }
}

function updateUI() {
  if (currentTimeEl) {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    currentTimeEl.textContent = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response) {
      isRunning = response.isRunning;
      displayTime = response.elapsedTime;
      sessionStartTime = response.startTime;
      currentDailyGoalMs = response.dailyGoalMs || 8 * 3600000;
      currentDailyPauses = response.dailyPauses || {};
      currentTimeOfDayBuckets = response.timeOfDayBuckets || { morning: 0, afternoon: 0, evening: 0, night: 0 };
      currentLongestSessionMs = response.longestSessionMs || 0;
      currentStartTimesSum = response.startTimesSum || 0;
      currentStartTimesCount = response.startTimesCount || 0;
      currentDailyBreaks = response.dailyBreaks || {};
      currentLastPauseTimestamp = response.lastPauseTimestamp || 0;
      
      if (document.activeElement !== dailyGoalInput) {
        dailyGoalInput.value = (currentDailyGoalMs / 3600000).toFixed(1);
      }
      
      // Update body state for global animations
      if (isRunning) {
        document.body.classList.add('isRunning');
        startStopBtn.textContent = 'Stop';
        startStopBtn.classList.remove('primary');
        startStopBtn.classList.add('stop');
      } else {
        document.body.classList.remove('isRunning');
        startStopBtn.textContent = 'Start';
        startStopBtn.classList.remove('stop');
        startStopBtn.classList.add('primary');
      }

      // Only update daily logs if they changed to avoid flickering
      const logsChanged = JSON.stringify(currentDailyLogs) !== JSON.stringify(response.dailyLogs);
      if (logsChanged) {
        currentDailyLogs = response.dailyLogs || {};
        if (!historyPanel.classList.contains('hidden')) {
          renderHeatmap();
        }
      }
      
      displayEl.textContent = formatTime(displayTime);
      msEl.textContent = formatMs(displayTime);
      
      const progressRatio = Math.min(displayTime / currentDailyGoalMs, 1);
      if (progressValueEl) {
        progressValueEl.style.strokeDashoffset = 691 - (progressRatio * 691);
      }
      
      if (isRunning) {
        statusText.textContent = 'Running';
        if (!animationFrameId) {
          startAnimation();
        }
      } else {
        statusText.textContent = displayTime > 0 ? 'Paused' : 'Inactive';
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }

      // Update Google Sheets Sync status
      if (syncStatusEl && sheetsUrlInput && saveConnectBtn && syncNowBtn && autoSyncCheckbox) {
        const savedUrl = response.googleSheetsUrl || '';
        const syncStatus = response.googleSheetsSyncStatus || 'disconnected';
        const autoSync = response.googleSheetsAutoSync || false;
        const lastSync = response.googleSheetsLastSyncTime || 0;
        
        if (document.activeElement !== sheetsUrlInput) {
          sheetsUrlInput.value = savedUrl;
        }
        
        autoSyncCheckbox.checked = autoSync;
        
        syncStatusEl.className = 'sync-status';
        
        if (syncStatus === 'connected') {
          syncStatusEl.classList.add('connected');
          
          let lastTimeStr = 'Never';
          if (lastSync > 0) {
            const diff = Date.now() - lastSync;
            const mins = Math.floor(diff / 60000);
            if (mins < 1) lastTimeStr = 'Just now';
            else if (mins < 60) lastTimeStr = `${mins}m ago`;
            else {
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) lastTimeStr = `${hrs}h ago`;
              else lastTimeStr = new Date(lastSync).toLocaleDateString();
            }
          }
          syncStatusEl.textContent = `Connected (Synced: ${lastTimeStr})`;
          syncNowBtn.disabled = false;
          saveConnectBtn.textContent = sheetsUrlInput.value.trim() === '' ? 'Save' : 'Disconnect';
        } else if (syncStatus === 'connecting') {
          syncStatusEl.classList.add('connecting');
          syncStatusEl.textContent = 'Connecting...';
          syncNowBtn.disabled = true;
          saveConnectBtn.textContent = 'Connecting...';
        } else if (syncStatus === 'failed') {
          syncStatusEl.classList.add('failed');
          syncStatusEl.textContent = 'Failed';
          syncNowBtn.disabled = !savedUrl;
          saveConnectBtn.textContent = sheetsUrlInput.value.trim() === '' ? 'Save' : 'Reconnect';
        } else {
          syncStatusEl.classList.add('disconnected');
          syncStatusEl.textContent = 'Not Connected';
          syncNowBtn.disabled = true;
          saveConnectBtn.textContent = 'Save & Sync';
        }
      }

      // Live update selected day details if open
      if (!historyPanel.classList.contains('hidden')) {
        updateSelectedDateDetails();
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
        const progressRatio = Math.min(response.elapsedTime / currentDailyGoalMs, 1);
        if (progressValueEl) {
          progressValueEl.style.strokeDashoffset = 691 - (progressRatio * 691);
        }
        animationFrameId = requestAnimationFrame(step);
      }
    });
  };
  animationFrameId = requestAnimationFrame(step);
}

// Heatmap Logic
function renderHeatmap() {
  heatmapGrid.innerHTML = '';
  const todayDate = new Date();
  const startDate = new Date();
  startDate.setDate(todayDate.getDate() - 364);
  
  const todayStr = getTodayDate();
  
  for (let i = 0; i < startDate.getDay(); i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.visibility = 'hidden';
    heatmapGrid.appendChild(emptyDiv);
  }
  
  for (let i = 0; i <= 364; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    
    const cell = document.createElement('div');
    cell.classList.add('heatmap-cell');
    
    let timeMs = currentDailyLogs[dateStr] || 0;
    if (dateStr === todayStr && isRunning && sessionStartTime) {
      timeMs += (Date.now() - sessionStartTime);
    }
    
    if (timeMs > 0) {
      const hours = timeMs / 3600000;
      if (hours < 2) cell.classList.add('heatmap-level-1');
      else if (hours < 5) cell.classList.add('heatmap-level-2');
      else if (hours < 8) cell.classList.add('heatmap-level-3');
      else cell.classList.add('heatmap-level-4');
    }
    
    if (dateStr === todayStr) {
      cell.classList.add('today');
      // pre-select today
      setTimeout(() => cell.click(), 10);
    }
    
    cell.addEventListener('click', () => {
      document.querySelectorAll('.heatmap-cell').forEach(el => el.classList.remove('selected'));
      cell.classList.add('selected');
      selectedDateStr = dateStr;
      updateSelectedDateDetails();
    });
    
    heatmapGrid.appendChild(cell);
  }
  
  // scroll to right
  const wrapper = document.querySelector('.heatmap-wrapper');
  if (wrapper) wrapper.scrollLeft = wrapper.scrollWidth;
  
  updateStatistics();
}

function updateStatistics() {
  const now = new Date();
  const todayStr = getTodayDate();
  
  let weeklyTotal = 0;
  let monthlyTotal = 0;
  let totalLogs = 0;
  let daysWithData = 0;
  
  let bestDayMs = 0;
  let worstDayMs = Infinity;

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  Object.entries(currentDailyLogs).forEach(([dateStr, ms]) => {
    const logDate = new Date(dateStr);
    
    if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
      monthlyTotal += ms;
    }

    if (logDate >= startOfWeek && logDate <= now) {
      weeklyTotal += ms;
      if (ms > bestDayMs) bestDayMs = ms;
      if (ms > 0 && ms < worstDayMs) worstDayMs = ms;
    }

    totalLogs += ms;
    daysWithData++;
  });



  document.getElementById('statWeekly').textContent = formatShortTime(weeklyTotal);
  document.getElementById('statMonthly').textContent = formatShortTime(monthlyTotal);
  document.getElementById('statAverage').textContent = daysWithData > 0 ? formatShortTime(totalLogs / daysWithData) : '0h 0m';
  
  bestDayBadge.textContent = bestDayMs > 0 ? formatShortTime(bestDayMs) : '-';
  worstDayBadge.textContent = (worstDayMs < Infinity && worstDayMs > 0) ? formatShortTime(worstDayMs) : '-';
  
  if (currentStartTimesCount > 0) {
    const avgMins = currentStartTimesSum / currentStartTimesCount;
    const h = Math.floor(avgMins / 60);
    const m = Math.floor(avgMins % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    avgStartTimeEl.textContent = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  } else {
    avgStartTimeEl.textContent = '-';
  }
  
  longestSessionTimeEl.textContent = currentLongestSessionMs > 0 ? formatShortTime(currentLongestSessionMs) : '-';
  
  const maxBucket = Math.max(
    currentTimeOfDayBuckets.morning, 
    currentTimeOfDayBuckets.afternoon, 
    currentTimeOfDayBuckets.evening, 
    currentTimeOfDayBuckets.night, 
    1
  );
  
  barMorning.style.height = `${(currentTimeOfDayBuckets.morning / maxBucket) * 100}%`;
  barAfternoon.style.height = `${(currentTimeOfDayBuckets.afternoon / maxBucket) * 100}%`;
  barEvening.style.height = `${(currentTimeOfDayBuckets.evening / maxBucket) * 100}%`;
  barNight.style.height = `${(currentTimeOfDayBuckets.night / maxBucket) * 100}%`;
}

historyToggleBtn.addEventListener('click', () => {
  const isHidden = historyPanel.classList.toggle('hidden');
  document.body.classList.toggle('history-open', !isHidden);
  historyToggleBtn.textContent = isHidden ? 'View History' : 'Hide History';
  if (!isHidden) {
    renderHeatmap();
  }
});

startStopBtn.addEventListener('click', () => {
  if (isRunning) {
    chrome.runtime.sendMessage({ type: 'STOP' }, updateUI);
  } else {
    chrome.runtime.sendMessage({ type: 'START' }, updateUI);
  }
});

// Google Sheets Sync Listeners
if (saveConnectBtn && sheetsUrlInput && syncStatusEl && syncNowBtn && autoSyncCheckbox && guideToggleBtn && guideContent && copyScriptBtn) {
  if (configToggleBtn && sheetsConfigPanel) {
    configToggleBtn.addEventListener('click', () => {
      const isHidden = sheetsConfigPanel.classList.toggle('hidden');
      configToggleBtn.classList.toggle('active', !isHidden);
    });
  }

  saveConnectBtn.addEventListener('click', () => {
    const url = sheetsUrlInput.value.trim();
    
    if (saveConnectBtn.textContent === 'Disconnect') {
      sheetsUrlInput.value = '';
      chrome.runtime.sendMessage({ type: 'DISCONNECT_SHEETS' }, updateUI);
      return;
    }
    
    if (!url) {
      chrome.runtime.sendMessage({ type: 'DISCONNECT_SHEETS' }, updateUI);
      return;
    }
    
    syncStatusEl.textContent = 'Connecting...';
    syncStatusEl.className = 'sync-status connecting';
    saveConnectBtn.textContent = 'Connecting...';
    saveConnectBtn.disabled = true;
    syncNowBtn.disabled = true;
    
    chrome.runtime.sendMessage({ type: 'TEST_CONNECT', url: url }, (response) => {
      saveConnectBtn.disabled = false;
      if (response && response.success) {
        alert('Connected successfully! Google Sheet has been populated with your current data.');
      } else {
        alert('Connection failed: ' + (response ? response.error : 'Unknown error'));
      }
      updateUI();
    });
  });

  syncNowBtn.addEventListener('click', () => {
    syncNowBtn.disabled = true;
    const oldText = syncNowBtn.textContent;
    syncNowBtn.textContent = 'Syncing...';
    
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = oldText;
      if (response && response.success) {
        alert('Sync complete! ' + response.count + ' rows updated.');
      } else {
        alert('Sync failed: ' + (response ? response.error : 'Unknown error'));
      }
      updateUI();
    });
  });

  autoSyncCheckbox.addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ type: 'UPDATE_AUTO_SYNC', autoSync: e.target.checked }, updateUI);
  });

  guideToggleBtn.addEventListener('click', () => {
    const isOpen = guideContent.classList.toggle('hidden');
    guideToggleBtn.classList.toggle('open', !isOpen);
    guideToggleBtn.textContent = isOpen ? 'Show Setup Guide' : 'Hide Setup Guide';
  });

  copyScriptBtn.addEventListener('click', () => {
    const scriptCode = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Create header row if the sheet is completely empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Date", "Work Hours", "Break Hours", "Manual Pauses", "Idle Pauses", "Work %", "Last Updated"]);
      sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    }
    
    // Helper function to standardise any date format to YYYY-MM-DD cleanly
    function parseDateString(str) {
      if (!str) return "";
      str = String(str).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
      }
      var m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        var month = ("0" + m[1]).slice(-2);
        var day = ("0" + m[2]).slice(-2);
        return m[3] + "-" + month + "-" + day;
      }
      try {
        var d = new Date(str);
        if (!isNaN(d.getTime())) {
          var year = d.getFullYear();
          var month = ("0" + (d.getMonth() + 1)).slice(-2);
          var day = ("0" + d.getDate()).slice(-2);
          return year + "-" + month + "-" + day;
        }
      } catch (e) {}
      return str;
    }
    
    // Build a map of existing dates using displayed string values (bypasses JVM timezone-shifting)
    var dateRowMap = {};
    if (sheet.getLastRow() > 1) {
      var existingData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getDisplayValues();
      for (var r = 0; r < existingData.length; r++) {
        var rawDateVal = existingData[r][0];
        if (rawDateVal) {
          var parsedKey = parseDateString(rawDateVal);
          if (parsedKey) {
            dateRowMap[parsedKey] = r + 2; // Rows are 1-indexed, data starts at row 2
          }
        }
      }
    }
    
    var logs = data.dailyLogs || {};
    var breaks = data.dailyBreaks || {};
    var pauses = data.dailyPauses || {};
    
    var dates = Object.keys(logs).concat(Object.keys(breaks)).concat(Object.keys(pauses));
    dates = Array.from(new Set(dates)).sort();
    
    if (dates.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: 0, message: "No data to sync." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var nowStr = new Date().toLocaleString();
    var updatedCount = 0;
    
    for (var i = 0; i < dates.length; i++) {
      var dateStr = dates[i];
      var workMs = logs[dateStr] || 0;
      var breakMs = breaks[dateStr] || 0;
      var pauseData = pauses[dateStr] || { manual: 0, idle: 0 };
      
      var workHours = Number((workMs / 3600000).toFixed(2));
      var breakHours = Number((breakMs / 3600000).toFixed(2));
      var manual = pauseData.manual || 0;
      var idle = pauseData.idle || 0;
      
      var totalHours = workHours + breakHours;
      var workPct = totalHours > 0 ? Math.round((workHours / totalHours) * 100) : 0;
      
      var rowValues = [
        dateStr,
        workHours,
        breakHours,
        manual,
        idle,
        workPct + "%",
        nowStr
      ];
      
      if (dateRowMap[dateStr]) {
        // Update existing row
        var targetRow = dateRowMap[dateStr];
        sheet.getRange(targetRow, 1, 1, 7).setValues([rowValues]);
      } else {
        // Append new row
        sheet.appendRow(rowValues);
        dateRowMap[dateStr] = sheet.getLastRow();
      }
      updatedCount++;
    }
    
    // Sort rows by Date (Column A) ascending to keep everything perfectly chronological
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).sort({column: 1, ascending: true});
      sheet.autoResizeColumns(1, 7);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, count: updatedCount }))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

    navigator.clipboard.writeText(scriptCode).then(() => {
      copyScriptBtn.textContent = 'Copied Code!';
      copyScriptBtn.classList.add('success');
      setTimeout(() => {
        copyScriptBtn.textContent = 'Copy Apps Script Code';
        copyScriptBtn.classList.remove('success');
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('Could not auto-copy. Please select and copy code manually.');
    });
  });
}

const resetBtn = document.getElementById('resetBtn');
resetBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to reset today\'s time? This will not affect your history.')) {
    chrome.runtime.sendMessage({ type: 'RESET' }, updateUI);
  }
});

// Initial load
updateUI();

// Sync every second
setInterval(updateUI, 1000);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATED') {
    updateUI();
  }
});

