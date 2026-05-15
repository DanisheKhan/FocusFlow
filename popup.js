function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

let isRunning = false;
let displayTime = 0;
let sessionStartTime = 0;
let animationFrameId = null;
let currentDailyLogs = {};
let calendarDate = new Date();

const displayEl = document.getElementById('display');
const msEl = document.querySelector('.milliseconds');
const startStopBtn = document.getElementById('startStopBtn');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const historyToggleBtn = document.getElementById('historyToggleBtn');
const historyPanel = document.getElementById('historyPanel');
const calendarGrid = document.getElementById('calendarGrid');
const currentMonthYearEl = document.getElementById('currentMonthYear');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const detailsDateEl = document.getElementById('detailsDate');
const detailsTimeEl = document.getElementById('detailsTime');

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
          renderCalendar();
        }
      }
      
      displayEl.textContent = formatTime(displayTime);
      msEl.textContent = formatMs(displayTime);
      
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
        animationFrameId = requestAnimationFrame(step);
      }
    });
  };
  animationFrameId = requestAnimationFrame(step);
}

// Calendar Logic
function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  currentMonthYearEl.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calendarDate);
  
  calendarGrid.innerHTML = '';
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const today = getTodayDate();
  
  // Empty slots for previous month days
  for (let i = 0; i < firstDay; i++) {
    const emptyDiv = document.createElement('div');
    emptyDiv.classList.add('calendar-day', 'empty');
    calendarGrid.appendChild(emptyDiv);
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dayDiv = document.createElement('div');
    dayDiv.classList.add('calendar-day');
    dayDiv.textContent = day;
    
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    // Check if day has data or is currently active
    const hasStoredData = currentDailyLogs[dateStr] > 0;
    const isActiveToday = (dateStr === today && isRunning);
    
    if (hasStoredData || isActiveToday) {
      dayDiv.classList.add('has-data');
    }
    
    if (dateStr === today) {
      dayDiv.classList.add('today');
    }
    
    dayDiv.addEventListener('click', () => {
      // Deselect others
      document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
      dayDiv.classList.add('selected');
      
      let timeMs = currentDailyLogs[dateStr] || 0;
      // If it's today and running, add the live session duration
      if (dateStr === today && isRunning && sessionStartTime) {
        timeMs += (Date.now() - sessionStartTime);
      }
      
      detailsDateEl.textContent = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      detailsTimeEl.textContent = formatTime(timeMs);
    });
    
    calendarGrid.appendChild(dayDiv);
  }
  
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
    renderCalendar();
  }
});


prevMonthBtn.addEventListener('click', () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  renderCalendar();
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

