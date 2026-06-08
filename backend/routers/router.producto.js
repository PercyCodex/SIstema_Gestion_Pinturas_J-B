"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /productos
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*,
                    m.nombre AS marca_nombre,
                    t.nombre AS tipo_nombre,
                    c.nombre AS categoria_nombre
             FROM productos p
             LEFT JOIN marcas m        ON m.id_marca    = p.id_marca
             LEFT JOIN tipos_pintura t ON t.id_tipo     = p.id_tipo
             LEFT JOIN categorias c    ON c.id_categoria = p.id_categoria
             ORDER BY p.id_producto ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET /productos/:id/presentaciones
router.get("/:id/presentaciones", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT pp.id_producto_presentacion, pp.id_presentacion,
                    pp.precio_venta, pp.precio_compra,
                    pp.stock_actual, pp.stock_minimo,
                    pr.nombre AS nombre_presentacion,
                    pr.cantidad, pr.unidad_medida
             FROM producto_presentacion pp
             JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
             WHERE pp.id_producto = $1
             ORDER BY pr.cantidad ASC`,
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener presentaciones del producto" });
    }
});

// POST /productos
router.post("/", async (req, res) => {
    try {
        const {
            id_marca, id_tipo, id_categoria, id_color,
            nombre, descripcion, imagen_url, codigo_barras,
            estado, presentaciones
        } = req.body;

        const result = await pool.query(
            `INSERT INTO productos
             (id_categoria, id_marca, id_tipo, id_color, nombre, descripcion,
              imagen_url, codigo_barras, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [id_categoria, id_marca, id_tipo, id_color || null,
             nombre, descripcion || null, imagen_url || null,
             codigo_barras || null, estado ?? "activo"]
        );

        const id_producto = result.rows[0].id_producto;

        if (presentaciones?.length > 0) {
            for (const pres of presentaciones) {
                await pool.query(
                    `INSERT INTO producto_presentacion
                     (id_producto, id_presentacion, precio_venta, precio_compra, stock_actual, stock_minimo)
                     VALUES ($1, $2, $3, $4, 0, 5)
                     ON CONFLICT (id_producto, id_presentacion) DO NOTHING`,
                    [id_producto, pres.id_presentacion,
                     parseFloat(pres.precio_venta) || 0,
                     parseFloat(pres.precio_compra) || 0]
                );
            }
        }

        res.json({ message: "Producto creado correctamente", producto: result.rows[0] });
    } catch (error) {
        if (error.code === "23505")
            return res.status(400).json({ message: "El producto ya existe" });
        console.error(error);
        res.status(500).json({ message: "Error al crear producto" });
    }
});

// PUT /productos/:id
router.put("/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const {
            id_marca, id_tipo, id_categoria, id_color,
            nombre, descripcion, imagen_url, codigo_barras, estado
        } = req.body;

        await client.query(
            `UPDATE productos SET
             id_categoria=$1, id_marca=$2, id_tipo=$3, id_color=$4,
             nombre=$5, descripcion=$6, imagen_url=$7,
             codigo_barras=$8, estado=$9
             WHERE id_producto=$10`,
            [id_categoria, id_marca, id_tipo, id_color || null,
             nombre, descripcion || null, imagen_url || null,
             codigo_barras || null, estado, id]
        );

        await client.query("COMMIT");
        res.json({ message: "Producto actualizado correctamente" });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505")
            return res.status(400).json({ message: "El producto ya existe" });
        res.status(500).json({ message: "Error al actualizar producto" });
    } finally {
        client.release();
    }
});

// DELETE /productos/:id
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM producto_presentacion WHERE id_producto = $1`, [id]);
        await pool.query(`DELETE FROM productos WHERE id_producto = $1`, [id]);
        res.json({ message: "Producto eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar producto" });
    }
});

module.exports = router;