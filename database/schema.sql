 ============================================
-- Air Pollution Detection & Monitoring System
-- Database Schema Reference (MySQL equivalent)
-- NOTE: This project uses Supabase (PostgreSQL)
-- The migration was applied via Supabase MCP.
-- ============================================

-- For MySQL deployment (original requirement):
CREATE DATABASE IF NOT EXISTS air_pollution;
USE air_pollution;

CREATE TABLE IF NOT EXISTS sensor_data (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  air_quality INT             NOT NULL DEFAULT 0 COMMENT 'MQ135 sensor value',
  temperature DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT 'DHT11 temperature in Celsius',
  humidity    DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT 'DHT11 humidity percentage',
  status      VARCHAR(20)    NOT NULL DEFAULT 'GOOD' COMMENT 'GOOD / MODERATE / POOR',
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*
-- ============================================
-- Supabase / PostgreSQL version (ACTIVE):
-- ============================================

/*
CREATE TABLE IF NOT EXISTS sensor_data (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  air_quality INTEGER       NOT NULL DEFAULT 0,
  temperature NUMERIC(5,2)  NOT NULL DEFAULT 0,
  humidity    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  status      TEXT          NOT NULL DEFAULT 'GOOD',
  created_at  TIMESTAMPTZ   DEFAULT now()
);

ALTER TABLE sensor_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to sensor data"
  ON sensor_data FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated insert for sensor data"
  ON sensor_data FOR INSERT TO anon WITH CHECK (true);
*/

-- ============================================
-- Sample Data for Testing
-- ============================================
/*
INSERT INTO sensor_data (air_quality, temperature, humidity, status) VALUES
  (150, 27.5, 58.0, 'GOOD'),
  (180, 28.0, 60.2, 'GOOD'),
  (220, 29.1, 62.5, 'MODERATE'),
  (310, 30.0, 65.0, 'MODERATE'),
  (450, 31.2, 68.3, 'POOR'),
  (380, 30.5, 64.1, 'MODERATE'),
  (190, 28.8, 59.7, 'GOOD');
*/  