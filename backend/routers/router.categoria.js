"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /categorias
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, p.nombre AS nombre_padre
             FROM categorias c
             LEFT JOIN categorias p ON p.id_categoria = c.id_padre
             ORDER BY COALESCE(c.id_padre, c.id_categoria), c.id_categoria ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /categorias
router.post("/", async (req, res) => {
    try {
        const { nombre, descripcion, id_padre, estado } = req.body;
        const result = await pool.query(
            `INSERT INTO categorias (nombre, descripcion, estado)
             VALUES ($1,$2,$3) RETURNING *`,
            [nombre, descripcion || null, estado ?? "activo"]
        );
        res.json({ message: "Categoría creada correctamente", categoria: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Error al crear categoría" });
    }
});

// PUT /categorias/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, estado } = req.body;
        await pool.query(
            `UPDATE categorias SET nombre=$1, descripcion=$2, estado=$3 WHERE id_categoria=$4`,
            [nombre, descripcion || null, estado, id]
        );
        res.json({ message: "Categoría actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar categoría" });
    }
});

// DELETE /categorias/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const productos = await pool.query(
            `SELECT COUNT(*) FROM productos WHERE id_categoria = $1`, [id]
        );
        if (parseInt(productos.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene productos asociados" });
        await pool.query(`DELETE FROM categorias WHERE id_categoria = $1`, [id]);
        res.json({ message: "Categoría eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar categoría" });
    }
});

module.exports = router;