"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /marcas
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM marcas WHERE estado = 'activo' ORDER BY nombre ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET /marcas/todas
router.get("/todas", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT m.*, COUNT(p.id_producto) AS total_productos
             FROM marcas m
             LEFT JOIN productos p ON p.id_marca = m.id_marca
             GROUP BY m.id_marca ORDER BY m.nombre ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /marcas
router.post("/", async (req, res) => {
    try {
        const { nombre, descripcion, estado } = req.body;
        const result = await pool.query(
            `INSERT INTO marcas (nombre, descripcion, estado)
             VALUES ($1,$2,$3) RETURNING *`,
            [nombre, descripcion || null, estado ?? "activo"]
        );
        res.json({ message: "Marca creada correctamente", marca: result.rows[0] });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El nombre de marca ya existe" });
        res.status(500).json({ message: "Error al crear marca" });
    }
});

// PUT /marcas/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, estado } = req.body;
        await pool.query(
            `UPDATE marcas SET nombre=$1, descripcion=$2, estado=$3 WHERE id_marca=$4`,
            [nombre, descripcion || null, estado, id]
        );
        res.json({ message: "Marca actualizada correctamente" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El nombre de marca ya existe" });
        res.status(500).json({ message: "Error al actualizar marca" });
    }
});

// DELETE /marcas/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(
            `SELECT COUNT(*) FROM productos WHERE id_marca = $1`, [id]
        );
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene productos asociados" });
        await pool.query(`DELETE FROM marcas WHERE id_marca = $1`, [id]);
        res.json({ message: "Marca eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar marca" });
    }
});

module.exports = router;