"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /herramientas
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT h.*, c.nombre AS categoria_nombre
             FROM pinturas.herramientas h
             LEFT JOIN pinturas.categorias c ON c.id_categoria = h.id_categoria
             ORDER BY h.id_herramienta ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST /herramientas
router.post("/", async (req, res) => {
    try {
        const { id_categoria, nombre, descripcion, codigo_interno,
                precio_venta, precio_costo, stock_actual, stock_minimo,
                unidad, estado } = req.body;

        let codigoFinal = codigo_interno?.trim() || null;
        if (!codigoFinal) {
            const contRes = await pool.query(`SELECT COUNT(*) FROM pinturas.herramientas`);
            const num = parseInt(contRes.rows[0].count) + 1;
            codigoFinal = `HERR-${String(num).padStart(5, "0")}`;
            const existe = await pool.query(
                `SELECT 1 FROM pinturas.herramientas WHERE codigo_interno = $1`, [codigoFinal]
            );
            if (existe.rows.length > 0) codigoFinal = `HERR-${Date.now()}`;
        }

        const result = await pool.query(
            `INSERT INTO pinturas.herramientas
             (id_categoria, nombre, descripcion, codigo_interno, precio_venta, precio_costo,
              stock_actual, stock_minimo, unidad, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [id_categoria, nombre, descripcion || null, codigoFinal,
             precio_venta || 0, precio_costo || 0,
             stock_actual || 0, stock_minimo || 2,
             unidad || "unidad", estado || "activo"]
        );
        res.json({ message: "Herramienta creada correctamente", herramienta: result.rows[0] });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El código ya existe" });
        res.status(500).json({ message: "Error al crear herramienta" });
    }
});

// PUT /herramientas/:id
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { id_categoria, nombre, descripcion, codigo_interno,
                precio_venta, precio_costo, stock_minimo, unidad, estado } = req.body;
        await pool.query(
            `UPDATE pinturas.herramientas SET
             id_categoria=$1, nombre=$2, descripcion=$3, codigo_interno=$4,
             precio_venta=$5, precio_costo=$6, stock_minimo=$7, unidad=$8, estado=$9
             WHERE id_herramienta=$10`,
            [id_categoria, nombre, descripcion || null, codigo_interno || null,
             precio_venta, precio_costo, stock_minimo || 2, unidad, estado, id]
        );
        res.json({ message: "Herramienta actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar herramienta" });
    }
});

// PUT /herramientas/:id/stock
router.put("/:id/stock", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const { stock_actual, motivo, notas, id_usuario } = req.body;

        if (!id_usuario)   throw { status: 400, message: "No se identificó el usuario." };
        if (stock_actual === undefined || stock_actual < 0)
            throw { status: 400, message: "Stock inválido." };

        const stockRes = await client.query(
            `SELECT stock_actual FROM pinturas.herramientas WHERE id_herramienta = $1 FOR UPDATE`,
            [id]
        );
        if (stockRes.rows.length === 0) throw { status: 404, message: "Herramienta no encontrada." };

        const stock_antes   = parseInt(stockRes.rows[0].stock_actual);
        const stock_despues = parseInt(stock_actual);

        await client.query(
            `UPDATE pinturas.herramientas SET stock_actual = $1 WHERE id_herramienta = $2`,
            [stock_despues, id]
        );

        const tipo     = stock_despues > stock_antes ? "entrada" :
                         stock_despues < stock_antes ? "merma"   : "ajuste";
        const cantidad = Math.abs(stock_despues - stock_antes);

        await client.query(
            `INSERT INTO pinturas.movimiento_inventario
             (id_herramienta, id_usuario, tipo, cantidad, stock_antes, stock_despues, motivo, notas)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, id_usuario, tipo, cantidad || 0, stock_antes, stock_despues,
             motivo || "Movimiento manual", notas || null]
        );

        await client.query("COMMIT");
        res.json({ message: "Stock actualizado", stock_antes, stock_despues });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.status) return res.status(error.status).json({ message: error.message });
        res.status(500).json({ message: "Error al actualizar stock de herramienta" });
    } finally {
        client.release();
    }
});

// DELETE /herramientas/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(
            `SELECT COUNT(*) FROM pinturas.movimiento_inventario WHERE id_herramienta = $1`, [id]
        );
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene movimientos registrados" });
        await pool.query(`DELETE FROM pinturas.herramientas WHERE id_herramienta = $1`, [id]);
        res.json({ message: "Herramienta eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar herramienta" });
    }
});

module.exports = router;