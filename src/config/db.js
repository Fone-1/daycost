const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('./env');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');

        // --- PERFORMANCE: Enable WAL Mode ---
        db.run('PRAGMA journal_mode = WAL');

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

            // Safe Migrations
            db.run("ALTER TABLE records ADD COLUMN status TEXT DEFAULT 'active'", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN end_date TEXT", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN resale_price REAL DEFAULT 0", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN parent_id INTEGER DEFAULT NULL", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN is_deleted INTEGER DEFAULT 0", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN deleted_at DATETIME DEFAULT NULL", (err) => { });

            // User role migration
            db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => { });
            // Tags migration
            db.run("ALTER TABLE records ADD COLUMN tags TEXT DEFAULT ''", (err) => { });
            // Depreciation migration
            db.run("ALTER TABLE records ADD COLUMN depreciation_method TEXT DEFAULT 'straight_line'", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN expected_lifespan INTEGER DEFAULT 1095", (err) => { });
            db.run("ALTER TABLE records ADD COLUMN expected_salvage REAL DEFAULT 0", (err) => { });

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
                digits INTEGER DEFAULT 30,
                group_name TEXT DEFAULT '默认分组',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);
            // TOTP group migration
            db.run("ALTER TABLE totp_entries ADD COLUMN group_name TEXT DEFAULT '默认分组'", (err) => { });
        });
    }
});

// --- BACKGROUND TASK: Auto-purge Recycle Bin entries older than 30 days ---
setInterval(() => {
    console.log('Running background auto-purge task...');
    db.run(`DELETE FROM records WHERE is_deleted = 1 AND deleted_at < datetime('now', '-30 days')`, (err) => {
        if (err) console.error('Background auto-purge failed', err);
        else console.log('Background auto-purge completed.');
    });
}, 3600000); // Once every hour

module.exports = db;
