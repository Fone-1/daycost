const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./env');

const db = new sqlite3.Database(DB_PATH, (_err) => {
    if (_err) {
        console.error('Error opening database', _err.message);
    } else {
        console.log('Connected to SQLite database.');

        // --- PERFORMANCE: Enable WAL Mode ---
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA foreign_keys = ON');

        // Initialize tables
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                item_name TEXT,
                price REAL NOT NULL,
                purchase_date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);

            // Safe Migrations - ignore "duplicate column name" errors (idempotent)
            const safeMigration = (sql) => {
                db.run(sql, (err) => {
                    if (err && !err.message.includes('duplicate column name')) {
                        console.error('Migration error:', err.message);
                    }
                });
            };

            safeMigration("ALTER TABLE records ADD COLUMN status TEXT DEFAULT 'active'");
            safeMigration("ALTER TABLE records ADD COLUMN end_date TEXT");
            safeMigration("ALTER TABLE records ADD COLUMN resale_price REAL DEFAULT 0");
            safeMigration("ALTER TABLE records ADD COLUMN parent_id INTEGER DEFAULT NULL");
            safeMigration("ALTER TABLE records ADD COLUMN is_deleted INTEGER DEFAULT 0");
            safeMigration("ALTER TABLE records ADD COLUMN deleted_at DATETIME DEFAULT NULL");

            // User role migration
            safeMigration("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
            safeMigration("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0");
            // Profile migrations
            safeMigration("ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ''");
            safeMigration("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''");
            safeMigration("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''");
            safeMigration("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
            // Tags migration
            safeMigration("ALTER TABLE records ADD COLUMN tags TEXT DEFAULT ''");
            // Depreciation migration
            safeMigration("ALTER TABLE records ADD COLUMN depreciation_method TEXT DEFAULT 'straight_line'");
            safeMigration("ALTER TABLE records ADD COLUMN expected_lifespan INTEGER DEFAULT 1095");
            safeMigration("ALTER TABLE records ADD COLUMN expected_salvage REAL DEFAULT 0");

            // --- PERFORMANCE: Create SQL View for Computed Columns ---
            db.run(`CREATE VIEW IF NOT EXISTS v_records_computed AS
SELECT
    *,
    CASE
        WHEN status != 'active' AND end_date IS NOT NULL THEN end_date
        ELSE date('now', 'localtime')
    END as computed_end_date,

    CAST(
        MAX(0,
            julianday(
                CASE
                    WHEN status != 'active' AND end_date IS NOT NULL THEN end_date
                    ELSE date('now', 'localtime')
                END
            ) - julianday(date(purchase_date))
        )
    AS INTEGER) + 1 as _days,

    CASE
        WHEN status = 'sold' THEN MAX(0, price - IFNULL(resale_price, 0))
        ELSE price
    END as _finalCost,

    (
        CASE
            WHEN status = 'sold' THEN MAX(0, price - IFNULL(resale_price, 0))
            ELSE price
        END
    ) * 1.0 /
    (
        CAST(
            MAX(0,
                julianday(
                    CASE
                        WHEN status != 'active' AND end_date IS NOT NULL THEN end_date
                        ELSE date('now', 'localtime')
                    END
                ) - julianday(date(purchase_date))
            )
        AS INTEGER) + 1
    ) as _dailyCost,

    CASE
        WHEN status = 'sold' THEN IFNULL(resale_price, 0)
        WHEN status = 'broken' THEN 0
        ELSE
            CASE
                WHEN IFNULL(depreciation_method, 'straight_line') = 'straight_line' THEN
                    MAX(IFNULL(expected_salvage, 0),
                        price - (
                            (price - IFNULL(expected_salvage, 0)) / CAST(IFNULL(expected_lifespan, 1095) AS REAL) *
                            (CAST(MAX(0, julianday(date('now', 'localtime')) - julianday(date(purchase_date))) AS INTEGER) + 1)
                        )
                    )
                WHEN IFNULL(depreciation_method, 'straight_line') = 'double_declining' THEN
                    MAX(IFNULL(expected_salvage, 0),
                        price * pow(1.0 - (2.0 / CAST(IFNULL(expected_lifespan, 1095) AS REAL)),
                        (CAST(MAX(0, julianday(date('now', 'localtime')) - julianday(date(purchase_date))) AS INTEGER) + 1))
                    )
                ELSE price
            END
    END as _currentValue
FROM records;`);

            // --- PERFORMANCE: Create Indexes ---
            db.run("CREATE INDEX IF NOT EXISTS idx_records_user_list ON records(user_id, is_deleted, created_at)");
            db.run("CREATE INDEX IF NOT EXISTS idx_records_parent ON records(parent_id)");

            // TOTP entries table
            db.run(`CREATE TABLE IF NOT EXISTS totp_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                secret_enc TEXT NOT NULL,
                iv TEXT NOT NULL,
                auth_tag TEXT NOT NULL,
                issuer TEXT DEFAULT '',
                digits INTEGER DEFAULT 6,
                period INTEGER DEFAULT 30,
                group_name TEXT DEFAULT '默认分组',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);
            // TOTP group migration
            safeMigration("ALTER TABLE totp_entries ADD COLUMN group_name TEXT DEFAULT '默认分组'");
            safeMigration("ALTER TABLE totp_entries ADD COLUMN period INTEGER DEFAULT 30");
            db.run(`UPDATE totp_entries
                SET
                    period = CASE
                        WHEN IFNULL(period, 30) BETWEEN 10 AND 300 THEN IFNULL(period, 30)
                        WHEN IFNULL(digits, 6) BETWEEN 10 AND 300 THEN digits
                        ELSE 30
                    END,
                    digits = CASE
                        WHEN IFNULL(digits, 6) BETWEEN 6 AND 8 THEN digits
                        ELSE 6
                    END`);

            // Admin: disable account migration
            safeMigration("ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0");

            // Admin: audit logs table
            db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                username TEXT,
                action TEXT NOT NULL,
                detail TEXT DEFAULT '',
                ip TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            db.run("CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC)");
        });
    }
});

// --- BACKGROUND TASK: Auto-purge Recycle Bin entries older than 30 days ---
setInterval(() => {
    console.log('Running background auto-purge task...');
    db.run(`DELETE FROM records WHERE is_deleted = 1 AND deleted_at < datetime('now', '-30 days')`, (_err) => {
        if (_err) console.error('Background auto-purge failed', _err);
        else console.log('Background auto-purge completed.');
    });
}, 3600000); // Once every hour

// --- BACKGROUND TASK: Auto-purge Audit Logs older than 90 days ---
setInterval(() => {
    db.run(`DELETE FROM audit_logs WHERE created_at < datetime('now', '-90 days')`, (_err) => {
        if (_err) console.error('Audit log cleanup failed', _err);
    });
}, 3600000);

module.exports = db;
