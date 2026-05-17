# Focus Flow ⏳

Focus Flow is a premium, minimalist Chrome extension designed to help you track your work time effortlessly. Featuring a sleek glassmorphism UI, intelligent auto-pause capabilities, and a comprehensive daily work tracker, Focus Flow ensures every minute of your productivity is accounted for without requiring constant micromanagement.

## ✨ Features

- **Beautiful Minimalist UI**: A premium dark-mode, glassmorphism interface featuring smooth micro-animations.
- **Continuous Background Tracking**: Built on Manifest V3, the stopwatch runs reliably in the background, updating a live badge on the extension icon.
- **Daily Goal Progress Ring**: Set your sights on a daily target. A sleek, animated circular progress ring wraps your timer, filling up as you approach your goal.
- **Focus Score**: Get intelligent feedback on your work sessions. Your daily Focus Score is calculated based on hours worked and penalizes manual pauses and idle interruptions, valuing quality of focus, not just quantity.
- **Productivity Heatmap**: View a stunning GitHub-style full-year heatmap of your activity. Darker green cells immediately indicate your most productive days.
- **Smart Auto-Pause & Auto-Resume**: 
  - Detects if you step away from your computer for 15 minutes and automatically pauses your timer.
  - Pauses instantly if you lock your machine or put it to sleep.
  - Automatically resumes tracking exactly where you left off when you wake up your laptop.
- **Weekly Report Notifications**: Every Sunday evening, receive a summary notification detailing your total hours and daily average for the week.
- **Midnight Rollover**: Automatically resets the timer for the new day at midnight, logging your late-night sessions seamlessly to the correct dates.

## 🚀 Installation

Because this extension is meant for your personal use, you can easily install it as an "Unpacked Extension" directly in Google Chrome.

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top right corner.
4. Click on **Load unpacked** in the top left corner.
5. Select the `StopwatchExtension` folder containing the extension files.
6. The Focus Flow icon will now appear in your browser's toolbar. Pin it for quick access!

## 🛠️ Built With

- **HTML5 & CSS3**: Custom-tailored vanilla CSS for zero-dependency, ultra-fast UI rendering.
- **Vanilla JavaScript**: Pure JS handling all logic.
- **Chrome Extension APIs**: Utilizes `chrome.storage`, `chrome.alarms`, `chrome.idle`, and `chrome.notifications` to build a seamless experience.

## 📝 Usage

- **Start/Stop**: Click the primary button to toggle the stopwatch. 
- **View History**: Click the "View History" button at the bottom to slide open your calendar and statistics.
- **Auto-Pause**: You don't need to do anything! If you walk away, the tracker takes care of pausing for you.

---
*Designed for seamless focus.*
