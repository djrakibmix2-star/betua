const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
});

// কানেকশন টেস্ট
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log(`✅ TiDB Cloud Live Database Connected: ${process.env.DB_NAME}`);
        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed:');
        console.error('Code:', err.code);
        console.error('Error Message:', err.message);
    }
})();

module.exports = pool;