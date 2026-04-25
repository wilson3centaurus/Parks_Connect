CREATE DATABASE IF NOT EXISTS zimparks_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zimparks_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  surname VARCHAR(100) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  role ENUM('admin','ranger','tourism_officer','analyst','public') NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  otp_code CHAR(6) NOT NULL,
  purpose ENUM('register','forgot_password') NOT NULL,
  expires_at DATETIME NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_lookup (email, purpose, otp_code, is_used, expires_at)
);

CREATE TABLE IF NOT EXISTS parks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(150) NOT NULL,
  region VARCHAR(100) NOT NULL,
  size_hectares DECIMAL(12,2) NOT NULL,
  capacity INT NOT NULL,
  current_visitors INT NOT NULL DEFAULT 0,
  status ENUM('open','closed','restricted') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wildlife_sightings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  species_name VARCHAR(150) NOT NULL,
  common_name VARCHAR(150) NOT NULL,
  category ENUM('mammal','bird','reptile','amphibian','fish','insect','plant') NOT NULL,
  count INT NOT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  recorded_by INT NOT NULL,
  sighting_date DATETIME NOT NULL,
  notes TEXT,
  photo VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wildlife_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  CONSTRAINT fk_wildlife_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_wildlife_park_date (park_id, sighting_date)
);

CREATE TABLE IF NOT EXISTS environmental_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  reading_type ENUM('temperature','rainfall','humidity','water_level','drought_index','air_quality') NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  recorded_by INT NOT NULL,
  reading_date DATETIME NOT NULL,
  status ENUM('normal','warning','critical') NOT NULL DEFAULT 'normal',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_environment_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  CONSTRAINT fk_environment_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_environment_park_date (park_id, reading_date),
  INDEX idx_environment_type_date (reading_type, reading_date)
);

CREATE TABLE IF NOT EXISTS tourist_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  visitor_name VARCHAR(150) NOT NULL,
  visitor_email VARCHAR(191) NOT NULL,
  visitor_phone VARCHAR(30) DEFAULT NULL,
  channel ENUM('web','sms','mobile_app') NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category ENUM('facilities','wildlife','staff','safety','general') NOT NULL,
  message TEXT NOT NULL,
  status ENUM('pending','reviewed','resolved') NOT NULL DEFAULT 'pending',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  INDEX idx_feedback_park_status (park_id, status),
  INDEX idx_feedback_rating (rating)
);

CREATE TABLE IF NOT EXISTS infrastructure (
  id INT AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  type ENUM('road','fence','gate','building','water_point','communications','vehicle') NOT NULL,
  status ENUM('operational','needs_maintenance','failed') NOT NULL,
  last_inspected DATE DEFAULT NULL,
  reported_by INT NOT NULL,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_infrastructure_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  CONSTRAINT fk_infrastructure_user FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_infrastructure_park_status (park_id, status)
);

CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  type ENUM('drought','infrastructure_failure','security_incident','capacity_threshold','wildlife_emergency','weather') NOT NULL,
  severity ENUM('low','medium','high','critical') NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  triggered_by ENUM('system','manual') NOT NULL,
  status ENUM('active','acknowledged','resolved') NOT NULL DEFAULT 'active',
  created_by INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  CONSTRAINT fk_alert_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_alert_park_status (park_id, status),
  INDEX idx_alert_type_severity (type, severity)
);

CREATE TABLE IF NOT EXISTS alert_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alert_id INT NOT NULL,
  user_id INT NOT NULL,
  notified_via ENUM('email','sms','in_app') NOT NULL,
  notified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alert_recipient_alert FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_recipient_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_alert_recipient (alert_id, user_id, notified_via)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  module VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  ip_address VARCHAR(100) DEFAULT NULL,
  user_agent TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_action_date (action, created_at),
  INDEX idx_activity_module_date (module, created_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('alert','feedback','system','report') NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  link VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notification_user_read (user_id, is_read, created_at)
);

CREATE TABLE IF NOT EXISTS user_parks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  park_id INT NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_parks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_parks_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_user_park (user_id, park_id)
);

CREATE TABLE IF NOT EXISTS park_visitor_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  park_id INT NOT NULL,
  visitors INT NOT NULL,
  logged_by INT NOT NULL,
  log_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_visitor_log_park FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
  CONSTRAINT fk_visitor_log_user FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_visitor_log_park_date (park_id, log_date)
);

CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR(128) PRIMARY KEY,
  sess MEDIUMTEXT NOT NULL,
  expires DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_expires (expires)
);
