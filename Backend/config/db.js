const mysql = require("mysql2/promise");

const isLocalDb =
  process.env.DB_HOST === "localhost" ||
  process.env.DB_HOST === "127.0.0.1" ||
  !process.env.DB_HOST;

const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
};

if (!isLocalDb) {
  poolConfig.ssl = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  };
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
