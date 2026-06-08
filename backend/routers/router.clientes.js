"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /clientes/buscar?q=...
router.get("/buscar", async (req, res) => {
    try {
        const q = (req.query.q || "").trim();
        if (!q) return res.json([]);
        const result = await pool.query(
            `SELECT id_cliente, nombre, apellido, dni, telefono, estado
             FROM clientes
             WHERE (dni ILIKE $1 OR nombre ILIKE $1 OR apellido ILIKE $1
                    OR CONCAT(nombre,' ',COALESCE(apellido,'')) ILIKE $1)
             ORDER BY nombre LIMIT 15`,
            [`%${q}%`]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al buscar cliente" });
    }
});

// GET /clientes
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id_cliente, nombre, apellido, dni,
                    telefono, direccion, fecha_registro
             FROM clientes ORDER BY id_cliente ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET /clientes/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT * FROM clientes WHERE id_cliente = $1`, [id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Cliente no encontrado" });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /clientes
router.post("/", async (req, res) => {
    try {
        const { nombre, apellido, dni, telefono, direccion } = req.body;
        if (!nombre) return res.status(400).json({ message: "El nombre es obligatorio" });
        await pool.query(
            `INSERT INTO clientes (nombre, apellido, dni, telefono, direccion)
             VALUES ($1,$2,$3,$4,$5)`,
            [nombre, apellido || null, dni || null,
             telefono || null, direccion || null]
        );
        res.json({ message: "Cliente creado correctamente" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El DNI ya está registrado" });
        res.status(500).json({ message: "Error al crear cliente" });
    }
});

// PUT /clientes/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, dni, telefono, direccion } = req.body;
        await pool.query(
            `UPDATE clientes SET
             nombre=$1, apellido=$2, dni=$3,
             telefono=$4, direccion=$5
             WHERE id_cliente=$6`,
            [nombre, apellido || null, dni || null,
             telefono || null, direccion || null, id]
        );
        res.json({ message: "Cliente actualizado correctamente" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El DNI ya está registrado" });
        res.status(500).json({ message: "Error al actualizar cliente" });
    }
});

// DELETE /clientes/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const ventas = await pool.query(
            `SELECT COUNT(*) FROM ventas WHERE id_cliente = $1`, [id]
        );
        if (parseInt(ventas.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: el cliente tiene ventas registradas" });
        const mezclas = await pool.query(
            `SELECT COUNT(*) FROM mezclas WHERE id_cliente = $1`, [id]
        );
        if (parseInt(mezclas.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: el cliente tiene mezclas registradas" });
        await pool.query(`DELETE FROM clientes WHERE id_cliente = $1`, [id]);
        res.json({ message: "Cliente eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar cliente" });
    }
});

module.exports = router;