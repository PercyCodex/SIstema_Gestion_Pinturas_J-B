"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /usuarios
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id_usuario, u.nombre, u.correo, u.usuario,
                    u.estado, u.fecha_creacion,
                    p.nombre AS rol, p.id_perfil AS id_rol
             FROM usuarios u
             LEFT JOIN perfiles p ON u.id_perfil = p.id_perfil
             ORDER BY u.id_usuario ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /usuarios
router.post("/", async (req, res) => {
    try {
        const { nombre, usuario, correo, contrasena, id_perfil, estado } = req.body;
        await pool.query(
            `INSERT INTO usuarios
             (nombre, usuario, correo, password_hash, id_perfil, estado)
             VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), $5, $6)`,
            [nombre, usuario, correo, contrasena, id_perfil, estado ?? "activo"]
        );
        res.json({ message: "Usuario creado correctamente" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El correo o usuario ya está registrado" });
        res.status(500).json({ message: "Error al crear usuario" });
    }
});

// PUT /usuarios/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, usuario, correo, id_perfil, estado } = req.body;
        await pool.query(
            `UPDATE usuarios
             SET nombre=$1, usuario=$2, correo=$3, id_perfil=$4, estado=$5
             WHERE id_usuario=$6`,
            [nombre, usuario, correo, id_perfil, estado, id]
        );
        res.json({ message: "Usuario actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar usuario" });
    }
});

// PUT /usuarios/:id/password
router.put("/:id/password", async (req, res) => {
    try {
        const { id } = req.params;
        const { contrasena } = req.body;
        await pool.query(
            `UPDATE usuarios
             SET password_hash = crypt($1, gen_salt('bf')) WHERE id_usuario = $2`,
            [contrasena, id]
        );
        res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar contraseña" });
    }
});

// DELETE /usuarios/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM usuarios WHERE id_usuario = $1`, [id]);
        res.json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar usuario" });
    }
});

module.exports = router;