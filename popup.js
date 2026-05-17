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
const detailsScoreEl = document.getElementById('detailsScore');
const detailsBreakdownEl = document.getElementById('detailsBreakdown');
const progressValueEl = document.getElementById('progressValue');

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
      sessionStartTime = response.startTime;
      currentDailyGoalMs = response.dailyGoalMs || 8 * 3600000;
      currentDailyPauses = response.dailyPauses || {};
      
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
      if (JSON.stringify(currentDailyLogs) !== JSON.stringify(response.dailyLogs)) {
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
      
      let liveTime = currentDailyLogs[dateStr] || 0;
      if (dateStr === todayStr && isRunning && sessionStartTime) {
        liveTime += (Date.now() - sessionStartTime);
      }
      
      detailsDateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
      detailsTimeEl.textContent = formatTime(liveTime);
      
      const pauses = currentDailyPauses[dateStr] || { manual: 0, idle: 0 };
      const hours = liveTime / 3600000;
      if (hours === 0) {
        detailsScoreEl.textContent = '-';
        detailsBreakdownEl.textContent = 'No activity recorded.';
      } else {
        let baseScore = Math.min((hours / (currentDailyGoalMs / 3600000)) * 80, 80);
        let deductions = (pauses.manual * 2) + (pauses.idle * 5);
        let finalScore = Math.max(1, Math.round(baseScore + 20 - deductions));
        
        detailsScoreEl.textContent = finalScore;
        detailsBreakdownEl.innerHTML = `${hours.toFixed(1)}h worked &bull; ${pauses.manual} manual pauses &bull; ${pauses.idle} idle interruptions`;
      }
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

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Get start of the week (Sunday)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  Object.entries(currentDailyLogs).forEach(([dateStr, ms]) => {
    const logDate = new Date(dateStr);
    
    // Monthly total
    if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
      monthlyTotal += ms;
    }

    // Weekly total
    if (logDate >= startOfWeek && logDate <= now) {
      weeklyTotal += ms;
    }

    // For average
    totalLogs += ms;
    daysWithData++;
  });

  const formatShortTime = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    return `${hours}h ${minutes}m`;
  };

  document.getElementById('statWeekly').textContent = formatShortTime(weeklyTotal);
  document.getElementById('statMonthly').textContent = formatShortTime(monthlyTotal);
  document.getElementById('statAverage').textContent = daysWithData > 0 ? formatShortTime(totalLogs / daysWithData) : '0h 0m';
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

