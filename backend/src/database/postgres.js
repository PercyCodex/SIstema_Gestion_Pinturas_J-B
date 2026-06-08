"use strict";

const { Pool } = require("pg");
const path     = require("path");

require("dotenv").config({
    path: path.join(__dirname, "../../../config/.env")
});

const pool = new Pool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     parseInt(process.env.DB_PORT, 10),

    max:              10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.connect((err, client, release) => {
    if (err) {
        console.error("❌ Error conectando a PostgreSQL:", err.message);
        return;
    }
    client.query("SELECT NOW()", (queryErr, result) => {
        release();
        if (queryErr) {
            console.error("❌ Error en query de prueba:", queryErr.message);
            return;
        }
        console.log("✅ PostgreSQL conectado:", result.rows[0].now);
    });
});

pool.on("error", (err) => {
    console.error("❌ Error inesperado en el pool de PostgreSQL:", err.message);
});

module.exports = pool;