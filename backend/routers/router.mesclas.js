"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /mezclas
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT m.*,
                    CONCAT(c.nombre,' ',COALESCE(c.apellido,'')) AS cliente_nombre,
                    c.telefono AS cliente_tel,
                    u.nombre AS empleado_nombre
             FROM mezclas m
             JOIN clientes  c ON c.id_cliente  = m.id_cliente
             JOIN usuarios  u ON u.id_usuario  = m.id_usuario
             ORDER BY m.fecha DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET /mezclas/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const mezcla = await pool.query(
            `SELECT m.*,
                    CONCAT(c.nombre,' ',COALESCE(c.apellido,'')) AS cliente_nombre,
                    c.telefono AS cliente_tel,
                    u.nombre AS empleado_nombre
             FROM mezclas m
             JOIN clientes  c ON c.id_cliente  = m.id_cliente
             JOIN usuarios  u ON u.id_usuario  = m.id_usuario
             WHERE m.id_mezcla = $1`, [id]
        );
        if (mezcla.rows.length === 0)
            return res.status(404).json({ message: "Mezcla no encontrada" });

        const detalle = await pool.query(
            `SELECT dm.*, p.nombre AS producto_nombre, pr.nombre AS presentacion_nombre
             FROM detalle_mezclas dm
             JOIN producto_presentacion pp ON pp.id_producto_presentacion = dm.id_producto_presentacion
             JOIN productos p ON p.id_producto = pp.id_producto
             JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
             WHERE dm.id_mezcla = $1`, [id]
        );
        res.json({ ...mezcla.rows[0], detalle: detalle.rows });
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /mezclas
router.post("/", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id_cliente, id_usuario, nombre_mezcla, color_resultado,
                precio_total, detalle } = req.body;

        const result = await client.query(
            `INSERT INTO mezclas
             (id_cliente, id_usuario, nombre_mezcla, color_resultado, precio_total)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [id_cliente, id_usuario, nombre_mezcla || null,
             color_resultado || "Sin definir", precio_total || 0]
        );
        const id_mezcla = result.rows[0].id_mezcla;

        if (detalle?.length > 0) {
            for (const d of detalle) {
                await client.query(
                    `INSERT INTO detalle_mezclas
                     (id_mezcla, id_producto_presentacion, cantidad, unidad)
                     VALUES ($1,$2,$3,$4)`,
                    [id_mezcla, d.id_producto_presentacion,
                     d.cantidad, d.unidad || "ml"]
                );
            }
        }

        await client.query("COMMIT");
        res.json({ message: "Mezcla registrada correctamente", mezcla: result.rows[0] });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        res.status(500).json({ message: "Error al crear mezcla" });
    } finally {
        client.release();
    }
});

// PUT /mezclas/:id
router.put("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const { id_cliente, id_usuario, nombre_mezcla, color_resultado,
                precio_total, detalle } = req.body;

        await client.query(
            `UPDATE mezclas SET
             id_cliente=$1, id_usuario=$2, nombre_mezcla=$3,
             color_resultado=$4, precio_total=$5
             WHERE id_mezcla=$6`,
            [id_cliente, id_usuario, nombre_mezcla || null,
             color_resultado || "Sin definir", precio_total || 0, id]
        );

        await client.query(`DELETE FROM detalle_mezclas WHERE id_mezcla = $1`, [id]);
        if (detalle?.length > 0) {
            for (const d of detalle) {
                await client.query(
                    `INSERT INTO detalle_mezclas
                     (id_mezcla, id_producto_presentacion, cantidad, unidad)
                     VALUES ($1,$2,$3,$4)`,
                    [id, d.id_producto_presentacion,
                     d.cantidad, d.unidad || "ml"]
                );
            }
        }

        await client.query("COMMIT");
        res.json({ message: "Mezcla actualizada correctamente" });
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ message: "Error al actualizar mezcla" });
    } finally {
        client.release();
    }
});

// DELETE /mezclas/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM detalle_mezclas WHERE id_mezcla = $1`, [id]);
        await pool.query(`DELETE FROM mezclas WHERE id_mezcla = $1`, [id]);
        res.json({ message: "Mezcla eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar mezcla" });
    }
});

module.exports = router;