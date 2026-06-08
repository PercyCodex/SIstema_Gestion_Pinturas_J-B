"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /roles
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, COUNT(u.id_usuario) AS total_usuarios
             FROM perfiles p
             LEFT JOIN usuarios u ON u.id_perfil = p.id_perfil
             GROUP BY p.id_perfil ORDER BY p.id_perfil ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /roles
router.post("/", async (req, res) => {
    try {
        const { nombre, descripcion, estado } = req.body;
        await pool.query(
            `INSERT INTO perfiles (nombre, descripcion, estado) VALUES ($1, $2, $3)`,
            [nombre, descripcion, estado ?? "activo"]
        );
        res.json({ message: "Perfil creado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al crear perfil" });
    }
});

// PUT /roles/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, estado } = req.body;
        await pool.query(
            `UPDATE perfiles SET nombre=$1, descripcion=$2, estado=$3 WHERE id_perfil=$4`,
            [nombre, descripcion, estado, id]
        );
        res.json({ message: "Perfil actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar perfil" });
    }
});

// DELETE /roles/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(
            `SELECT COUNT(*) FROM usuarios WHERE id_perfil = $1`, [id]
        );
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: hay usuarios con este perfil" });
        await pool.query(`DELETE FROM perfiles WHERE id_perfil = $1`, [id]);
        res.json({ message: "Perfil eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar perfil" });
    }
});

module.exports = router;