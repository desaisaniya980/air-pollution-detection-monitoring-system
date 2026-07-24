/* =============================================
   AIR POLLUTION MONITORING SYSTEM
   Frontend Client Script
   ============================================= */

const socket = io();

// Chart data buffers (max 30 points)
const MAX_POINTS = 30;
const chartData = {
  labels: [],
  aqi: [],
  temp: [],
  humidity: []
};

let aqiChart, tempChart, humChart;
let localStats = { min: { aqi: Infinity, temp: Infinity }, max: { aqi: -Infinity, temp: -Infinity }, sum: { aqi: 0, temp: 0, hum: 0 }, count: 0 };

// =============================================
// LOADING SCREEN
// =============================================
const loadingMessages = [
  'Initializing sensors...',
  'Connecting to database...',
  'Loading dashboard modules...',
  'Calibrating MQ135 sensor...',
  'Establishing socket connection...',
  'System ready!'
];

let loadingStep = 0;

function runLoadingSequence() {
  const bar = document.getElementById('loadingBar');
  const text = document.getElementById('loadingText');
  const total = loadingMessages.length;

  const interval = setInterval(() => {
    if (loadingStep < total) {
      bar.style.width = `${((loadingStep + 1) / total) * 100}%`;
      text.textContent = loadingMessages[loadingStep];
      loadingStep++;
    } else {
      clearInterval(interval);
      setTimeout(showApp, 400);
    }
  }, 400);
}

function showApp() {
  const loading = document.getElementById('loadingScreen');
  const app = document.getElementById('app');
  loading.classList.add('fade-out');
  app.classList.remove('hidden');
  setTimeout(() => loading.style.display = 'none', 800);
  initCharts();
  startClock();
  fetchInitialStats();
}

// =============================================
// CLOCK
// =============================================
function startClock() {
  const updateClock = () => {
    const now = new Date();
    const timeEl = document.getElementById('navTime');
    const dateEl = document.getElementById('navDate');

    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    timeEl.textContent = `${h}:${m}:${s}`;

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  };

  updateClock();
  setInterval(updateClock, 1000);
}

// =============================================
// CHART INITIALIZATION
// =============================================
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 500 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(0, 245, 255, 0.3)',
      borderWidth: 1,
      titleColor: '#00f5ff',
      bodyColor: '#94a3b8',
      padding: 10,
      titleFont: { family: 'Orbitron', size: 11 },
      bodyFont: { family: 'Share Tech Mono', size: 11 }
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      ticks: { color: '#475569', font: { family: 'Share Tech Mono', size: 9 }, maxRotation: 0, maxTicksLimit: 6 }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
      ticks: { color: '#475569', font: { family: 'Share Tech Mono', size: 9 }, padding: 8 }
    }
  }
};

function makeGradient(ctx, color1, color2) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);
  return gradient;
}

function initCharts() {
  const aqiCtx = document.getElementById('aqiChart').getContext('2d');
  const tempCtx = document.getElementById('tempChart').getContext('2d');
  const humCtx = document.getElementById('humChart').getContext('2d');

  const commonDataset = (label, data, color, gradientColor) => ({
    label,
    data,
    borderColor: color,
    borderWidth: 2,
    pointBackgroundColor: color,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0.4,
    fill: true,
    backgroundColor: makeGradient(aqiCtx, gradientColor, 'rgba(0,0,0,0)')
  });

  aqiChart = new Chart(aqiCtx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: 'AQI (MQ135)',
        data: chartData.aqi,
        borderColor: '#00f5ff',
        borderWidth: 2,
        pointBackgroundColor: '#00f5ff',
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
        backgroundColor: makeGradient(aqiCtx, 'rgba(0,245,255,0.25)', 'rgba(0,245,255,0)')
      }]
    },
    options: {
      ...JSON.parse(JSON.stringify(CHART_DEFAULTS)),
      scales: {
        ...JSON.parse(JSON.stringify(CHART_DEFAULTS.scales)),
        y: { ...JSON.parse(JSON.stringify(CHART_DEFAULTS.scales.y)), min: 0, max: 600,
          ticks: { color: '#475569', font: { family: 'Share Tech Mono', size: 9 }, padding: 8 }
        }
      }
    }
  });

  tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: 'Temperature (°C)',
        data: chartData.temp,
        borderColor: '#ff6b6b',
        borderWidth: 2,
        pointBackgroundColor: '#ff6b6b',
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
        backgroundColor: makeGradient(tempCtx, 'rgba(255,107,107,0.25)', 'rgba(255,107,107,0)')
      }]
    },
    options: {
      ...JSON.parse(JSON.stringify(CHART_DEFAULTS)),
      scales: {
        ...JSON.parse(JSON.stringify(CHART_DEFAULTS.scales)),
        y: { ...JSON.parse(JSON.stringify(CHART_DEFAULTS.scales.y)), min: 0, max: 60,
          ticks: { color: '#475569', font: { family: 'Share Tech Mono', size: 9 }, padding: 8 }
        }
      }
    }
  });

  humChart = new Chart(humCtx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [{
        label: 'Humidity (%)',
        data: chartData.humidity,
        borderColor: '#4dabf7',
        borderWidth: 2,
        pointBackgroundColor: '#4dabf7',
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
        backgroundColor: makeGradient(humCtx, 'rgba(77,171,247,0.25)', 'rgba(77,171,247,0)')
      }]
    },
    options: {
      ...JSON.parse(JSON.stringify(CHART_DEFAULTS)),
      scales: {
        ...JSON.parse(JSON.stringify(CHART_DEFAULTS.scales)),
        y: { ...JSON.parse(JSON.stringify(CHART_DEFAULTS.scales.y)), min: 0, max: 100,
          ticks: { color: '#475569', font: { family: 'Share Tech Mono', size: 9 }, padding: 8 }
        }
      }
    }
  });
}

function pushChartPoint(label, aqi, temp, hum) {
  chartData.labels.push(label);
  chartData.aqi.push(aqi);
  chartData.temp.push(temp);
  chartData.humidity.push(hum);

  if (chartData.labels.length > MAX_POINTS) {
    chartData.labels.shift();
    chartData.aqi.shift();
    chartData.temp.shift();
    chartData.humidity.shift();
  }

  if (aqiChart) aqiChart.update('none');
  if (tempChart) tempChart.update('none');
  if (humChart) humChart.update('none');
}

// =============================================
// CHART TABS
// =============================================
document.querySelectorAll('.chart-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const chartId = tab.dataset.chart;
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.chart-wrap').forEach(w => w.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`chart${chartId.charAt(0).toUpperCase() + chartId.slice(1)}`).classList.add('active');
  });
});

// =============================================
// AQI ARC METER
// =============================================
function updateArcMeter(value) {
  const arc = document.getElementById('arcFill');
  const maxVal = 600;
  const totalArcLength = 251;
  const ratio = Math.min(value / maxVal, 1);
  const filled = ratio * totalArcLength;
  arc.style.strokeDasharray = `${filled} ${totalArcLength}`;

  if (value < 200) arc.style.stroke = '#00ff99';
  else if (value <= 400) arc.style.stroke = '#ffd700';
  else arc.style.stroke = '#ff4d4d';
}

// =============================================
// UPDATE UI WITH SENSOR DATA
// =============================================
function updateDashboard(data) {
  const { mq135, temperature, humidity, status, timestamp, totalRecords, lastUpdateTime, dbConnected } = data;

  // AQI Card
  document.getElementById('aqiValue').textContent = mq135;
  updateArcMeter(mq135);

  const statusBadge = document.getElementById('aqiStatusBadge');
  const aqiStatusEl = document.getElementById('aqiStatus');
  statusBadge.className = 'aqi-status-badge';
  aqiStatusEl.textContent = status;
  if (status === 'MODERATE') statusBadge.classList.add('moderate');
  else if (status === 'POOR') statusBadge.classList.add('poor');

  // Scale highlights
  document.querySelectorAll('.scale-item').forEach(el => el.classList.remove('active'));
  if (status === 'GOOD') document.querySelector('.scale-item.good').classList.add('active');
  else if (status === 'MODERATE') document.querySelector('.scale-item.moderate').classList.add('active');
  else document.querySelector('.scale-item.poor').classList.add('active');

  // Temperature
  document.getElementById('tempValue').textContent = parseFloat(temperature).toFixed(1);
  updateThermometer(temperature);

  // Humidity
  document.getElementById('humValue').textContent = parseFloat(humidity).toFixed(1);
  document.getElementById('humPercent').textContent = `${Math.round(humidity)}%`;
  document.getElementById('humidityFill').style.width = `${Math.min(humidity, 100)}%`;

  // Local stats tracking
  localStats.sum.aqi += mq135;
  localStats.sum.temp += temperature;
  localStats.sum.hum += humidity;
  localStats.count++;
  if (mq135 < localStats.min.aqi) { localStats.min.aqi = mq135; }
  if (mq135 > localStats.max.aqi) { localStats.max.aqi = mq135; document.getElementById('peakAqi').textContent = mq135; }
  if (temperature < localStats.min.temp) { localStats.min.temp = temperature; document.getElementById('tempMin').textContent = temperature.toFixed(1); }
  if (temperature > localStats.max.temp) { localStats.max.temp = temperature; document.getElementById('tempMax').textContent = temperature.toFixed(1); }

  document.getElementById('avgAqi').textContent = Math.round(localStats.sum.aqi / localStats.count);
  document.getElementById('avgTemp').textContent = (localStats.sum.temp / localStats.count).toFixed(1) + '°C';
  document.getElementById('avgHum').textContent = (localStats.sum.hum / localStats.count).toFixed(1) + '%';
  document.getElementById('dataPoints').textContent = localStats.count;

  // LED Panel
  updateLEDPanel(status);

  // Pollution status text
  const statusVal = document.getElementById('currentStatusValue');
  statusVal.textContent = status;
  if (status === 'GOOD') statusVal.style.color = '#00ff99';
  else if (status === 'MODERATE') statusVal.style.color = '#ffd700';
  else statusVal.style.color = '#ff4d4d';

  // Alert
  updateAlert(status, mq135);

  // Chart
  const timeLabel = new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  pushChartPoint(timeLabel, mq135, temperature, humidity);

  // DB Status
  updateDBStatus(dbConnected, totalRecords, lastUpdateTime || timestamp);

  // ML Prediction
  updateMLPrediction(status, mq135, temperature, humidity, data.ml_prediction);
}


function updateThermometer(temp) {
  const fill = document.getElementById('thermoFill');
  const bulb = document.getElementById('thermoBulb');
  const ratio = Math.max(0, Math.min((temp - 0) / 60, 1));
  const maxH = 50;
  const h = ratio * maxH;
  const y = 55 - h;

  fill.setAttribute('height', h.toFixed(1));
  fill.setAttribute('y', y.toFixed(1));

  if (temp < 20) { fill.style.fill = '#4dabf7'; bulb.style.fill = '#4dabf7'; }
  else if (temp < 35) { fill.style.fill = '#ff6b6b'; bulb.style.fill = '#ff4444'; }
  else { fill.style.fill = '#ff4d4d'; bulb.style.fill = '#cc0000'; }
}

function updateLEDPanel(status) {
  const leds = { GOOD: 'ledGood', MODERATE: 'ledModerate', POOR: 'ledPoor' };
  const lights = { GOOD: 'led-green', MODERATE: 'led-yellow', POOR: 'led-red' };

  Object.entries(leds).forEach(([s, id]) => {
    const item = document.getElementById(id);
    const light = item.querySelector('.led-light');
    item.classList.remove('active');
    light.classList.remove('active');
  });

  const activeItem = document.getElementById(leds[status]);
  if (activeItem) {
    activeItem.classList.add('active');
    activeItem.querySelector('.led-light').classList.add('active');
  }
}

function updateAlert(status, mq135) {
  const alertContent = document.getElementById('alertContent');
  const alertIcon = document.getElementById('alertIcon');
  const alertTitle = document.getElementById('alertTitle');
  const alertMessage = document.getElementById('alertMessage');
  const alertBadge = document.getElementById('alertBadge');

  alertContent.className = 'alert-content';

  const configs = {
    GOOD: {
      icon: '✓',
      title: 'Air Quality Safe',
      message: `Current AQI level ${mq135} is within safe limits. Air quality is excellent. Normal ventilation is adequate.`,
      badge: 'SAFE',
      badgeColor: '#00ff99',
      iconColor: '#00ff99'
    },
    MODERATE: {
      icon: '⚠',
      title: 'Moderate Pollution Detected',
      message: `Current AQI level ${mq135} indicates moderate pollution. Sensitive groups should consider reducing prolonged outdoor exertion.`,
      badge: 'WARNING',
      badgeColor: '#ffd700',
      iconColor: '#ffd700',
      cls: 'alert-moderate'
    },
    POOR: {
      icon: '✕',
      title: 'Dangerous Pollution Level',
      message: `ALERT: AQI level ${mq135} exceeds safe threshold! Everyone should avoid outdoor activities. Use air purifiers and keep windows closed.`,
      badge: 'DANGER',
      badgeColor: '#ff4d4d',
      iconColor: '#ff4d4d',
      cls: 'alert-poor'
    }
  };

  const cfg = configs[status] || configs.GOOD;
  if (cfg.cls) alertContent.classList.add(cfg.cls);
  alertIcon.textContent = cfg.icon;
  alertIcon.style.color = cfg.iconColor;
  alertTitle.textContent = cfg.title;
  alertTitle.style.color = cfg.iconColor;
  alertMessage.textContent = cfg.message;
  alertBadge.textContent = cfg.badge;
  alertBadge.style.color = cfg.badgeColor;
  alertBadge.style.borderColor = cfg.badgeColor + '66';

  addAlertHistory(status, cfg.title);
}

const alertHistoryArr = [];
function addAlertHistory(status, title) {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  const color = status === 'GOOD' ? '#00ff99' : status === 'MODERATE' ? '#ffd700' : '#ff4d4d';

  if (alertHistoryArr.length === 0 || alertHistoryArr[0].status !== status) {
    alertHistoryArr.unshift({ status, title, time: now, color });
    if (alertHistoryArr.length > 5) alertHistoryArr.pop();

    const histEl = document.getElementById('alertHistory');
    histEl.innerHTML = alertHistoryArr.map(item =>
      `<div class="alert-history-item">
        <span class="alert-history-dot" style="background:${item.color}"></span>
        <span>${item.time} - ${item.title}</span>
      </div>`
    ).join('');
  }
}

function updateDBStatus(connected, totalRecords, lastUpdate) {
  const dot = document.getElementById('dbStatusDot');
  const val = document.getElementById('dbStatusValue');
  const totalEl = document.getElementById('dbTotalRecords');
  const lastEl = document.getElementById('dbLastUpdate');

  if (connected) {
    dot.className = 'db-status-dot connected';
    val.className = 'db-status-value connected';
    val.textContent = 'Connected';
  } else {
    dot.className = 'db-status-dot';
    val.className = 'db-status-value';
    val.textContent = 'Connecting...';
  }

  if (totalRecords !== undefined) totalEl.textContent = totalRecords.toLocaleString();
  if (lastUpdate) {
    const d = new Date(lastUpdate);
    lastEl.textContent = d.toLocaleTimeString('en-US', { hour12: false });
  }

  // Activity log
  const log = document.getElementById('activityLog');
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.textContent = `${now} - Record inserted`;
  log.prepend(item);
  while (log.children.length > 5) log.removeChild(log.lastChild);
}

// =============================================
// ML PREDICTION (RULE-BASED PLACEHOLDER)
// =============================================
function updateMLPrediction(status, mq135, temperature, humidity, mlPrediction) {

  const prediction = (mlPrediction && String(mlPrediction).trim()) ? String(mlPrediction).trim() : 'Unavailable';

  const mlStatus = document.getElementById('mlStatus');
  if (mlStatus) mlStatus.textContent = prediction;

  // Keep existing recommendation UI, but drive it from ML prediction
  const recommendation = document.getElementById('mlRecommendation');
  const recs = {
    GOOD: 'Air quality is within safe limits. All outdoor activities are suitable.',
    MODERATE: 'Air quality is acceptable. Sensitive groups should reduce outdoor activity.',
    POOR: 'High pollution detected. Avoid outdoor activities and use masks.',
    'Unavailable': 'ML prediction unavailable. Showing sensor-based status instead.'
  };

  const key = recs[prediction] ? prediction : status;
  const text = recs[key] || recs.GOOD;
  if (recommendation) recommendation.textContent = text;
}


// =============================================
// SOCKET EVENTS
// =============================================
socket.on('connect', () => {
  console.log('Connected to server via Socket.io');
  updateNavStatus('online', 'Live Arduino Data');
});

socket.on('disconnect', () => {
  updateNavStatus('offline', 'Disconnected');
});

socket.on('sensorData', (data) => {
  updateDashboard(data);
  if (data.dbConnected) updateNavStatus('online', 'Live Arduino Data');
});

socket.on('serialStatus', (data) => {
  if (data.simulation) {
    updateNavStatus('simulating', 'Simulation Mode');
  } else if (data.connected) {
    updateNavStatus('online', `Arduino @ ${data.port}`);
  } else {
    updateNavStatus('simulating', 'Simulation Mode');
  }
});

socket.on('dbStatus', (data) => {
  updateDBStatus(data.connected, data.totalRecords, data.lastUpdateTime);
});

function updateNavStatus(state, text) {
  const dot = document.getElementById('statusDot');
  const textEl = document.getElementById('statusText');
  dot.className = `status-dot ${state}`;
  textEl.textContent = text;
}

// =============================================
// FETCH INITIAL STATS FROM API
// =============================================
async function fetchInitialStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    if (stats && stats.avg) {
      document.getElementById('avgAqi').textContent = stats.avg.air_quality;
      document.getElementById('avgTemp').textContent = stats.avg.temperature + '°C';
      document.getElementById('avgHum').textContent = stats.avg.humidity + '%';
      document.getElementById('peakAqi').textContent = stats.max.air_quality;
      document.getElementById('dataPoints').textContent = stats.count;
    }
  } catch (e) {
    console.warn('Could not fetch initial stats');
  }

  try {
    const res = await fetch('/api/history?limit=30');
    const history = await res.json();
    if (Array.isArray(history) && history.length > 0) {
      const recent = [...history].reverse();
      recent.forEach(record => {
        const label = new Date(record.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        pushChartPoint(label, record.air_quality, record.temperature, record.humidity);
      });
    }
  } catch (e) {
    console.warn('Could not fetch history');
  }
}

// =============================================
// START
// =============================================
window.addEventListener('load', () => {
  runLoadingSequence();
});
