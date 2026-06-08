"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /proveedores
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*
             FROM proveedores p
             ORDER BY p.razon_social ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET /proveedores/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const proveedor = await pool.query(
            `SELECT * FROM proveedores WHERE id_proveedor = $1`, [id]
        );
        if (proveedor.rows.length === 0)
            return res.status(404).json({ message: "Proveedor no encontrado" });
        res.json(proveedor.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /proveedores
router.post("/", async (req, res) => {
    try {
        const { razon_social, ruc, telefono, direccion, correo } = req.body;
        if (!razon_social?.trim())
            return res.status(400).json({ message: "La razón social es obligatoria" });
        const result = await pool.query(
            `INSERT INTO proveedores (razon_social, ruc, telefono, direccion, correo)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [razon_social.trim(), ruc || null, telefono || null,
             direccion || null, correo || null]
        );
        res.json({ message: "Proveedor creado correctamente", proveedor: result.rows[0] });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El RUC ya está registrado" });
        res.status(500).json({ message: "Error al crear proveedor" });
    }
});

// PUT /proveedores/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { razon_social, ruc, telefono, direccion, correo } = req.body;
        if (!razon_social?.trim())
            return res.status(400).json({ message: "La razón social es obligatoria" });
        await pool.query(
            `UPDATE proveedores SET
             razon_social=$1, ruc=$2, telefono=$3, direccion=$4, correo=$5
             WHERE id_proveedor=$6`,
            [razon_social.trim(), ruc || null, telefono || null,
             direccion || null, correo || null, id]
        );
        res.json({ message: "Proveedor actualizado correctamente" });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El RUC ya está registrado" });
        res.status(500).json({ message: "Error al actualizar proveedor" });
    }
});

// DELETE /proveedores/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const compras = await pool.query(
            `SELECT COUNT(*) FROM compras WHERE id_proveedor = $1`, [id]
        );
        if (parseInt(compras.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene compras registradas" });
        await pool.query(`DELETE FROM proveedores WHERE id_proveedor = $1`, [id]);
        res.json({ message: "Proveedor eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar proveedor" });
    }
});

module.exports = router;