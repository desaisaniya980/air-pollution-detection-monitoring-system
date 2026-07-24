const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
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

  const outDir = path.join(__dirname, 'dataset');
  fs.mkdirSync(outDir, { recursive: true });

  const labelMap = {
    GOOD: 0,
    MODERATE: 1,
    POOR: 2
  };

  const jsonOutPath = path.join(outDir, 'tensor_dataset.json');
  const csvOutPath = path.join(outDir, 'tensor_dataset.csv');
  const labelMapPath = path.join(outDir, 'label_map.json');

  const pool = mysql.createPool(dbConfig);

  try {
    const [rows] = await pool.execute(
      `SELECT air_quality, temperature, humidity, status
       FROM sensor_data
       ORDER BY created_at ASC`
    );

    const X = [];
    const y = [];

    const csvLines = ['air_quality,temperature,humidity,label'];

    for (const r of rows) {
      const air_quality = Number(r.air_quality);
      const temperature = Number(r.temperature);
      const humidity = Number(r.humidity);
      const statusRaw = (r.status ?? '').toString().trim().toUpperCase();

      // Fallback: treat unknown status as POOR (2) to avoid dropping rows.
      // You can change this behavior later.
      const label = Object.prototype.hasOwnProperty.call(labelMap, statusRaw)
        ? labelMap[statusRaw]
        : labelMap.POOR;

      if (![air_quality, temperature, humidity].every(Number.isFinite)) continue;

      X.push([air_quality, temperature, humidity]);
      y.push(label);

      csvLines.push(`${air_quality},${temperature},${humidity},${label}`);
    }

    const payload = { X, y };

    fs.writeFileSync(jsonOutPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.writeFileSync(csvOutPath, csvLines.join('\n'), 'utf8');
    fs.writeFileSync(labelMapPath, JSON.stringify(labelMap, null, 2), 'utf8');

    console.log(`TensorFlow dataset exported successfully`);
    console.log(`Total rows exported: ${X.length}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exitCode = 1;
});

