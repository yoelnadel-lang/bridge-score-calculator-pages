-- סכימת מסד נתונים לאפליקציית זימון התורים.
-- ייבוא: להריץ קובץ זה פעם אחת דרך phpMyAdmin (או mysql CLI) על מסד ריק.
-- אם מייבאים דרך ה-CLI, יש לוודא קידוד UTF-8: mysql --default-character-set=utf8mb4 ...

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  business_name VARCHAR(100) NOT NULL DEFAULT 'ליאת',
  whatsapp_number VARCHAR(20) NOT NULL DEFAULT '',
  admin_username VARCHAR(50) NOT NULL,
  admin_password_hash VARCHAR(255) NOT NULL,
  slot_interval_minutes INT NOT NULL DEFAULT 30,
  work_hours JSON NOT NULL,
  CONSTRAINT single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  duration_minutes INT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NULL,
  service_name VARCHAR(100) NOT NULL,
  duration_minutes INT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  appt_date DATE NOT NULL,
  appt_time TIME NOT NULL,
  client_name VARCHAR(150) NOT NULL,
  client_phone VARCHAR(30) NOT NULL,
  note TEXT NULL,
  status ENUM('pending','confirmed','cancelled','done') NOT NULL DEFAULT 'pending',
  payment_status ENUM('unpaid','pending','paid') NOT NULL DEFAULT 'unpaid',
  payment_amount DECIMAL(10,2) NULL,
  payment_low_profile_id VARCHAR(100) NULL,
  invoice_number VARCHAR(100) NULL,
  invoice_url VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_date_time (appt_date, appt_time),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- שורת הגדרות ראשונית. יש להחליף את הסיסמה בפועל דרך מסך ההתקנה (setup.php) ולא כאן.
INSERT IGNORE INTO settings (id, business_name, whatsapp_number, admin_username, admin_password_hash, slot_interval_minutes, work_hours)
VALUES (
  1, 'ליאת', '', 'admin', '',
  30,
  JSON_OBJECT(
    '0', JSON_OBJECT('open', TRUE,  'start', '09:00', 'end', '18:00'),
    '1', JSON_OBJECT('open', TRUE,  'start', '09:00', 'end', '18:00'),
    '2', JSON_OBJECT('open', TRUE,  'start', '09:00', 'end', '18:00'),
    '3', JSON_OBJECT('open', TRUE,  'start', '09:00', 'end', '18:00'),
    '4', JSON_OBJECT('open', TRUE,  'start', '09:00', 'end', '18:00'),
    '5', JSON_OBJECT('open', TRUE,  'start', '09:00', 'end', '13:00'),
    '6', JSON_OBJECT('open', FALSE, 'start', '09:00', 'end', '18:00')
  )
);

INSERT IGNORE INTO services (id, name, duration_minutes, price, active)
VALUES (1, 'טיפול פנים', 60, 150.00, 1);
