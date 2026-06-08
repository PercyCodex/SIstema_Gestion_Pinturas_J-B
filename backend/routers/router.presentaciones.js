"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /presentaciones
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, COUNT(pp.id_producto_presentacion) AS total_productos
             FROM presentaciones p
             LEFT JOIN producto_presentacion pp ON pp.id_presentacion = p.id_presentacion
             GROUP BY p.id_presentacion
             ORDER BY p.id_presentacion ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET /presentaciones/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT * FROM presentaciones WHERE id_presentacion = $1`, [id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ message: "Presentación no encontrada" });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /presentaciones
router.post("/", async (req, res) => {
    try {
        const { nombre, cantidad, unidad_medida, imagen_url } = req.body;
        if (!cantidad || cantidad <= 0)
            return res.status(400).json({ message: "La cantidad debe ser mayor a 0" });
        const nombreFinal = nombre || `${cantidad} ${unidad_medida}`;
        const result = await pool.query(
            `INSERT INTO presentaciones (nombre, cantidad, unidad_medida, imagen_url)
             VALUES ($1,$2,$3,$4) RETURNING *`,
            [nombreFinal, parseFloat(cantidad), unidad_medida, imagen_url || null]
        );
        res.json({ message: "Presentación creada correctamente", presentacion: result.rows[0] });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "Ya existe una presentación con esa cantidad y unidad" });
        res.status(500).json({ message: "Error al crear presentación" });
    }
});

// PUT /presentaciones/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, cantidad, unidad_medida, imagen_url } = req.body;
        if (!cantidad || cantidad <= 0)
            return res.status(400).json({ message: "La cantidad debe ser mayor a 0" });
        const nombreFinal = nombre || `${cantidad} ${unidad_medida}`;
        await pool.query(
            `UPDATE presentaciones SET nombre=$1, cantidad=$2, unidad_medida=$3, imagen_url=$4
             WHERE id_presentacion=$5`,
            [nombreFinal, parseFloat(cantidad), unidad_medida, imagen_url || null, id]
        );
        res.json({ message: "Presentación actualizada correctamente" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "Ya existe una presentación con esa cantidad y unidad" });
        res.status(500).json({ message: "Error al actualizar presentación" });
    }
});

// DELETE /presentaciones/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(
            `SELECT COUNT(*) FROM producto_presentacion WHERE id_presentacion = $1`, [id]
        );
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene productos asociados" });
        await pool.query(`DELETE FROM presentaciones WHERE id_presentacion = $1`, [id]);
        res.json({ message: "Presentación eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar presentación" });
    }
});

module.exports = router;