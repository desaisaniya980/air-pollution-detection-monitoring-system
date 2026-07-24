
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');



const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let totalRecords = 0;
let lastUpdateTime = null;
let dbConnected = false;

const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'air_pollution',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

let pool = null;

async function ensureDatabaseSetup() {
  // Executes the MySQL section from database/schema.sql to create DB/table if missing.
  // Robust parsing is required because the file may include CRLF and SQL comments.
  const fs = require('fs');
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');

  // Read schema with UTF-8 and normalize Windows CRLF -> LF
  const raw = fs.readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n');

  // Keep only MySQL portion.
  // Supabase/PostgreSQL section is wrapped in comments, but we ignore it explicitly.
  const mysqlStartMarker = '-- For MySQL deployment (original requirement):';
  const supabaseStartMarker = '/*\n-- ============================================\n-- Supabase / PostgreSQL version (ACTIVE):';

  const startIdx = raw.indexOf(mysqlStartMarker);
  const regionStart = startIdx >= 0 ? raw.slice(startIdx) : raw;

  const supabaseIdx = regionStart.indexOf(supabaseStartMarker);
  const mysqlRegion = supabaseIdx >= 0 ? regionStart.slice(0, supabaseIdx) : regionStart;

  // Remove SQL comments robustly:
  // 1) block comments /* ... */
  // 2) line comments -- ... (to end-of-line)
  const withoutBlockComments = mysqlRegion.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/(^|\n)\s*--.*$/gm, '$1');

  // Split into individual SQL queries using ';'
  const stmts = withoutLineComments
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  // Connect without selecting DB first, so we can create it.
  const rootConfig = { ...dbConfig, database: undefined };
  const rootPool = mysql.createPool(rootConfig);

  try {
    const dbName = dbConfig.database;

    // Execute CREATE DATABASE first
    for (const stmt of stmts) {
      if (stmt.toUpperCase().startsWith('CREATE DATABASE')) {
        await rootPool.query(stmt);
        break;
      }
    }

    // Select DB once
    await rootPool.query(`USE ${dbName}`);

    // Execute CREATE TABLE statement(s) (ignore CREATE DATABASE)
    for (const stmt of stmts) {
      const upper = stmt.toUpperCase();
      if (upper.startsWith('CREATE DATABASE')) continue;
      if (upper.startsWith('USE ')) continue;
      await rootPool.query(stmt);
    }

  } finally {
    await rootPool.end();
  }
}

async function connectDatabase() {
  try {
    await ensureDatabaseSetup();

    // Verify we can select the database before making a full pool
    const testConn = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });
    await testConn.query('SELECT 1');
    await testConn.end();

    pool = mysql.createPool(dbConfig);

    dbConnected = true;
    console.log('MySQL Connected Successfully');
  } catch (err) {
    dbConnected = false;
    console.error('MySQL connection failed:', err.message);

    // Cleanup any partial pool
    try {
      if (pool) await pool.end();
    } catch (_) {}
    pool = null;

    // Attempt reconnect after a delay
    setTimeout(() => {
      connectDatabase();
    }, 5000);
  }
}

async function checkDatabaseConnection() {
  await connectDatabase();
}

process.on('unhandledRejection', (err) => {
  console.error('UnhandledRejection:', err);
});


async function insertSensorData(data) {
  try {
    if (!pool || !dbConnected) {
      totalRecords++;
      lastUpdateTime = new Date().toISOString();
      return;
    }

    await pool.execute(
      `INSERT INTO sensor_data (air_quality, temperature, humidity, status) VALUES (?, ?, ?, ?)` ,
      [data.mq135, data.temperature, data.humidity, data.status]
    );

    totalRecords++;
    lastUpdateTime = new Date().toISOString();
  } catch (err) {
    dbConnected = false;
    console.error('MySQL insert failed:', err.message);
    totalRecords++;
    lastUpdateTime = new Date().toISOString();
    // trigger reconnect
    connectDatabase();
  }
}



function determinePollutionStatus(mq135) {
  if (mq135 < 200) return 'GOOD';
  if (mq135 <= 400) return 'MODERATE';
  return 'POOR';
}

function parseSensorLine(line) {
  const trimmed = line.trim();
  const parts = trimmed.split(',');
  if (parts.length < 3) return null;

  const mq135 = parseInt(parts[0]);
  const temperature = parseFloat(parts[1]);
  const humidity = parseFloat(parts[2]);

  if (isNaN(mq135) || isNaN(temperature) || isNaN(humidity)) return null;

  const status = parts[3] ? parts[3].trim().toUpperCase() : determinePollutionStatus(mq135);
  return { mq135, temperature, humidity, status };
}

function sanitizeMLPrediction(pred) {
  const normalized = String(pred || '').trim().toUpperCase();
  if (normalized === 'GOOD' || normalized === 'MODERATE' || normalized === 'POOR') return normalized;
  return null;
}

function predictML({ mq135, temperature, humidity }) {
  return new Promise((resolve) => {
    // If python execution fails, requirement says fallback to "Unavailable".
    const fallback = 'Unavailable';

    const cmd = `python predict.py ${Number(mq135)} ${Number(temperature)} ${Number(humidity)}`;
    exec(cmd, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve(fallback);
      }

      const out = sanitizeMLPrediction(stdout);
      if (!out) return resolve(fallback);
      return resolve(out);
    });
  });
}

async function augmentWithMLPrediction(data) {
  try {
    const ml_prediction = await predictML(data);
    return { ...data, ml_prediction };
  } catch (_) {
    return { ...data, ml_prediction: 'Unavailable' };
  }
}

function broadcastSensorData(data) {
  const payload = {
    mq135: data.mq135,
    temperature: data.temperature,
    humidity: data.humidity,
    status: data.status,
    ml_prediction: data.ml_prediction || 'Unavailable',
    timestamp: new Date().toISOString(),
    totalRecords,
    lastUpdateTime: lastUpdateTime || new Date().toISOString(),
    dbConnected
  };
  io.emit('sensorData', payload);
}


// Try to initialize serial port; fall back to simulation if unavailable
let serialConnected = false;

function initSerialPort() {
  try {
    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');

    const SERIAL_PORT = process.env.SERIAL_PORT || 'COM5';
    const BAUD_RATE = parseInt(process.env.BAUD_RATE) || 9600;

    const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    port.on('open', () => {
      serialConnected = true;
      console.log(`Serial port ${SERIAL_PORT} opened at ${BAUD_RATE} baud`);
      io.emit('serialStatus', { connected: true, port: SERIAL_PORT });
    });

    port.on('error', (err) => {
      console.error('Serial port error:', err.message);
      io.emit('serialStatus', { connected: false, error: err.message });
      startSimulation();
    });

    parser.on('data', async (line) => {
      const data = parseSensorLine(line);
      if (!data) return;
      console.log('Received:', data);
      await insertSensorData(data);

      // ADD ML prediction (do not change existing Arduino/MySQL/socket logic)
      const dataWithML = await augmentWithMLPrediction(data);
      broadcastSensorData(dataWithML);
    });


  } catch (err) {
    console.log('SerialPort not available, starting simulation mode...');
    startSimulation();
  }
}

let simulationInterval = null;
let simMq135 = 180;
let simTemp = 28;
let simHumidity = 55;
let simDirection = 1;

function startSimulation() {
  if (simulationInterval) return;
  console.log('Running in SIMULATION mode (no Arduino connected)');
  io.emit('serialStatus', { connected: false, simulation: true });

  simulationInterval = setInterval(async () => {
    simMq135 += (Math.random() * 30 - 15) * simDirection;
    simTemp += (Math.random() * 1 - 0.5);
    simHumidity += (Math.random() * 2 - 1);

    if (simMq135 > 500) simDirection = -1;
    if (simMq135 < 50) simDirection = 1;

    simMq135 = Math.max(50, Math.min(520, Math.round(simMq135)));
    simTemp = Math.max(15, Math.min(45, parseFloat(simTemp.toFixed(1))))
    ;
    simHumidity = Math.max(20, Math.min(95, parseFloat(simHumidity.toFixed(1))))
    ;

    const data = {
      mq135: simMq135,
      temperature: simTemp,
      humidity: simHumidity,
      status: determinePollutionStatus(simMq135)
    };

    await insertSensorData(data);

    // ADD ML prediction for simulation as well
    const dataWithML = await augmentWithMLPrediction(data);
    broadcastSensorData(dataWithML);

  }, 3000);
}

// REST API endpoints
app.get('/api/status', async (req, res) => {
  res.json({ dbConnected, totalRecords, lastUpdateTime, serialConnected });
});

app.get('/api/history', async (req, res) => {
  try {
    if (!pool || !dbConnected) return res.json([]);

    console.log('history req.query.limit=', req.query && req.query.limit, 'dbConnected=', dbConnected);


    // Normalize LIMIT to a safe integer (and avoid passing non-numbers to MySQL)
    const rawLimit = req.query.limit;
    const parsedLimit = Number(rawLimit);

    const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 50;
    const safeLimit = Math.max(1, Math.min(limit, 200));

    // IMPORTANT: use pool.query (string interpolation) to avoid LIMIT binding issues.
    // If safeLimit somehow becomes NaN, we still guard by defaulting to 50.
    const finalLimit = Number.isFinite(safeLimit) ? safeLimit : 50;

    console.log('history finalLimit=', finalLimit);

    console.log('history query SQL=', `SELECT id, air_quality, temperature, humidity, status, created_at FROM sensor_data ORDER BY created_at DESC LIMIT ${finalLimit}`);

    // Execute via pool.execute with fully inlined SQL (no placeholders)
    const [rows] = await pool.execute(
      `SELECT id, air_quality, temperature, humidity, status, created_at
       FROM sensor_data
       ORDER BY created_at DESC
       LIMIT ${finalLimit}`
    );

    res.json(rows);
  } catch (err) {
    console.error('History query failed:', {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState,
      // include the LIMIT we attempted so we can verify it was a number
      limit: req.query && req.query.limit
    });
    res.json([]);
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    if (!pool || !dbConnected) return res.json({ avg: null, max: null, min: null, count: 0 });

    const [rows] = await pool.execute(
      `SELECT
          AVG(air_quality) AS avg,
          MAX(air_quality) AS max,
          MIN(air_quality) AS min,
          COUNT(*) AS count
       FROM sensor_data`
    );

    const row = rows && rows[0] ? rows[0] : {};
    res.json({
      avg: row.avg,
      max: row.max,
      min: row.min,
      count: row.count
    });
  } catch (err) {
    console.error('Stats query failed:', err.message);
    res.json({ avg: null, max: null, min: null, count: 0 });
  }
});



// Socket.io connection
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);

  socket.emit('dbStatus', { connected: dbConnected, totalRecords, lastUpdateTime });

  // Send last known reading on connect (Supabase removed, so nothing to load)


  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  console.log(`\n========================================`);
  console.log(`  Air Pollution Monitoring System`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`========================================\n`);
  await checkDatabaseConnection();
  initSerialPort();
});

