"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /inventario/resumen
router.get("/resumen", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*)                                                              AS total_productos,
                COUNT(*) FILTER (WHERE pp.stock_actual = 0)                          AS sin_stock,
                COUNT(*) FILTER (WHERE pp.stock_actual > 0
                    AND pp.stock_actual <= pp.stock_minimo)                           AS stock_bajo,
                COUNT(*) FILTER (WHERE pp.stock_actual > pp.stock_minimo)             AS stock_ok,
                COALESCE(SUM(pp.stock_actual * pp.precio_compra), 0)                  AS valor_total_costo,
                COALESCE(SUM(pp.stock_actual * pp.precio_venta), 0)                   AS valor_total_venta
            FROM producto_presentacion pp
        `);
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener resumen de inventario" });
    }
});

// GET /inventario/alertas
router.get("/alertas", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pp.id_producto_presentacion, p.nombre AS producto,
                   pr.nombre AS presentacion,
                   m.nombre AS marca, pp.stock_actual, pp.stock_minimo,
                   (pp.stock_minimo - pp.stock_actual) AS faltantes,
                   CASE WHEN pp.stock_actual = 0 THEN 'critico'
                        WHEN pp.stock_actual <= pp.stock_minimo THEN 'bajo'
                        ELSE 'ok' END AS semaforo
            FROM producto_presentacion pp
            JOIN productos      p  ON p.id_producto      = pp.id_producto
            JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN marcas    m  ON m.id_marca         = p.id_marca
            WHERE pp.stock_actual <= pp.stock_minimo
            ORDER BY pp.stock_actual ASC LIMIT 20
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener alertas" });
    }
});

// GET /inventario/stock
router.get("/stock", async (req, res) => {
    try {
        const { marca, categoria, semaforo, buscar } = req.query;
        const hayFiltro = marca || categoria || semaforo || buscar;
        if (!hayFiltro) return res.json([]);

        let condiciones = [];
        let params = [];
        let idx = 1;
        if (marca)     { condiciones.push(`p.id_marca = $${idx++}`); params.push(parseInt(marca)); }
        if (categoria) { condiciones.push(`p.id_categoria = $${idx++}`); params.push(parseInt(categoria)); }
        if (semaforo === "critico") condiciones.push(`pp.stock_actual = 0`);
        else if (semaforo === "bajo") condiciones.push(`pp.stock_actual > 0 AND pp.stock_actual <= pp.stock_minimo`);
        else if (semaforo === "ok") condiciones.push(`pp.stock_actual > pp.stock_minimo`);
        if (buscar) {
            condiciones.push(`(p.nombre ILIKE $${idx} OR m.nombre ILIKE $${idx} OR pr.nombre ILIKE $${idx})`);
            params.push(`%${buscar}%`);
            idx++;
        }
        const where = condiciones.length ? "WHERE " + condiciones.join(" AND ") : "";

        const result = await pool.query(`
            SELECT pp.id_producto_presentacion, pp.id_producto,
                   p.nombre AS producto, p.codigo_barras AS sku,
                   pr.nombre AS presentacion, pr.cantidad AS volumen_cantidad,
                   pr.unidad_medida, m.nombre AS marca,
                   pp.stock_actual, pp.stock_minimo,
                   pp.precio_venta, pp.precio_compra AS precio_costo,
                   CASE WHEN pp.stock_actual = 0 THEN 'critico'
                        WHEN pp.stock_actual <= pp.stock_minimo THEN 'bajo'
                        ELSE 'ok' END AS semaforo
            FROM producto_presentacion pp
            JOIN productos      p  ON p.id_producto      = pp.id_producto
            JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN marcas    m  ON m.id_marca         = p.id_marca
            ${where}
            ORDER BY CASE WHEN pp.stock_actual = 0 THEN 0
                          WHEN pp.stock_actual <= pp.stock_minimo THEN 1
                          ELSE 2 END, p.nombre ASC
        `, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener stock" });
    }
});

// GET /inventario/movimientos
router.get("/movimientos", async (req, res) => {
    try {
        const { desde, hasta, tipo, id_producto_presentacion, id_usuario, page = 1, limit = 50 } = req.query;
        let condiciones = [];
        let params = [];
        let idx = 1;
        if (desde) { condiciones.push(`mi.fecha >= $${idx++}`); params.push(desde); }
        if (hasta) { condiciones.push(`mi.fecha < $${idx++}::date + interval '1 day'`); params.push(hasta); }
        if (tipo)  { condiciones.push(`mi.tipo_movimiento = $${idx++}`); params.push(tipo); }
        if (id_producto_presentacion) { condiciones.push(`mi.id_producto_presentacion = $${idx++}`); params.push(parseInt(id_producto_presentacion)); }
        if (id_usuario) { condiciones.push(`mi.id_usuario = $${idx++}`); params.push(parseInt(id_usuario)); }

        const where = condiciones.length ? "WHERE " + condiciones.join(" AND ") : "";
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM movimientos_inventario mi ${where}`, params
        );
        const total = parseInt(countRes.rows[0].count);

        const result = await pool.query(`
            SELECT mi.id_movimiento, mi.tipo_movimiento AS tipo,
                   mi.cantidad, mi.observacion, mi.fecha,
                   p.nombre AS producto, p.codigo_barras AS sku,
                   pr.nombre AS presentacion, m.nombre AS marca,
                   u.nombre AS hecho_por, u.id_usuario
            FROM movimientos_inventario mi
            JOIN producto_presentacion pp ON pp.id_producto_presentacion = mi.id_producto_presentacion
            JOIN productos             p  ON p.id_producto      = pp.id_producto
            JOIN presentaciones        pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN marcas           m  ON m.id_marca         = p.id_marca
            JOIN usuarios              u  ON u.id_usuario       = mi.id_usuario
            ${where}
            ORDER BY mi.fecha DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `, [...params, parseInt(limit), offset]);

        res.json({
            total, page: parseInt(page), limit: parseInt(limit),
            paginas: Math.ceil(total / parseInt(limit)), datos: result.rows
        });
    } catch (error) {
        res.status(500).json({ message: "Error al obtener movimientos" });
    }
});

// GET /inventario/presentaciones
router.get("/presentaciones", async (req, res) => {
    try {
        const { buscar } = req.query;
        let condiciones = [];
        let params = [];
        if (buscar) {
            condiciones.push(`(p.nombre ILIKE $1 OR pr.nombre ILIKE $1 OR m.nombre ILIKE $1)`);
            params.push(`%${buscar}%`);
        }
        const where = condiciones.length ? "WHERE " + condiciones.join(" AND ") : "";
        const result = await pool.query(`
            SELECT pp.id_producto_presentacion, pp.stock_actual, pp.stock_minimo,
                   p.nombre AS producto, p.codigo_barras AS sku,
                   pr.nombre AS presentacion, m.nombre AS marca
            FROM producto_presentacion pp
            JOIN productos      p  ON p.id_producto      = pp.id_producto
            JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN marcas    m  ON m.id_marca         = p.id_marca
            ${where}
            ORDER BY p.nombre ASC, pr.nombre ASC LIMIT 30
        `, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener presentaciones" });
    }
});

// POST /inventario/movimiento (ajuste manual de stock)
router.post("/movimiento", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id_producto_presentacion, tipo, cantidad, observacion, id_usuario } = req.body;

        if (!id_producto_presentacion) throw { status: 400, message: "Debes seleccionar un producto." };
        if (!tipo)         throw { status: 400, message: "El tipo de movimiento es obligatorio." };
        if (!id_usuario)   throw { status: 400, message: "No se pudo identificar el usuario." };

        const tiposValidos = ["ENTRADA", "SALIDA", "MEZCLA"];
        if (!tiposValidos.includes(tipo.toUpperCase()))
            throw { status: 400, message: "Tipo inválido. Use: ENTRADA, SALIDA, MEZCLA" };
        if (!cantidad || parseInt(cantidad) <= 0)
            throw { status: 400, message: "La cantidad debe ser mayor a 0." };

        const stockRes = await client.query(
            `SELECT stock_actual FROM producto_presentacion WHERE id_producto_presentacion = $1 FOR UPDATE`,
            [id_producto_presentacion]
        );
        if (stockRes.rows.length === 0) throw { status: 404, message: "Producto no encontrado." };

        const stock_antes = parseInt(stockRes.rows[0].stock_actual);
        const cant = parseInt(cantidad);
        let stock_despues;

        if (tipo.toUpperCase() === "ENTRADA") {
            stock_despues = stock_antes + cant;
        } else {
            stock_despues = stock_antes - cant;
            if (stock_despues < 0)
                throw { status: 400, message: `Stock insuficiente. Stock actual: ${stock_antes}` };
        }

        await client.query(
            `UPDATE producto_presentacion SET stock_actual = $1 WHERE id_producto_presentacion = $2`,
            [stock_despues, id_producto_presentacion]
        );

        await client.query(
            `INSERT INTO movimientos_inventario
             (id_producto_presentacion, id_usuario, tipo_movimiento, cantidad, observacion)
             VALUES ($1,$2,$3,$4,$5)`,
            [id_producto_presentacion, id_usuario, tipo.toUpperCase(), cant, observacion || null]
        );

        await client.query("COMMIT");
        res.json({ message: "Movimiento registrado correctamente", stock_antes, stock_despues });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.status) return res.status(error.status).json({ message: error.message });
        res.status(500).json({ message: "Error interno al registrar movimiento" });
    } finally {
        client.release();
    }
});

// PUT /inventario/precios/:id
router.put("/precios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { precio_compra, precio_venta } = req.body;

        if (isNaN(parseFloat(precio_compra)) || parseFloat(precio_compra) < 0)
            return res.status(400).json({ message: "Precio de costo inválido" });
        if (isNaN(parseFloat(precio_venta)) || parseFloat(precio_venta) < 0)
            return res.status(400).json({ message: "Precio de venta inválido" });

        await pool.query(
            `UPDATE producto_presentacion
             SET precio_compra=$1, precio_venta=$2 WHERE id_producto_presentacion=$3`,
            [parseFloat(precio_compra), parseFloat(precio_venta), id]
        );
        res.json({ message: "Precios actualizados correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar precios" });
    }
});

module.exports = router;