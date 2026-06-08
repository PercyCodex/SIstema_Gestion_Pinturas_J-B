"use strict";

const express = require("express");
const router  = express.Router();
const pool    = require("../src/database/postgres");

// GET /ventas
router.get("/", async (req, res) => {
    try {
        const { buscar, estado, metodo, desde, hasta } = req.query;
        const conds = []; const vals = []; let i = 1;

        if (buscar) {
            conds.push(`(v.nro_documento ILIKE $${i}
                OR CONCAT(c.nombre,' ',COALESCE(c.apellido,'')) ILIKE $${i}
                OR c.dni ILIKE $${i}
                OR u.nombre ILIKE $${i})`);
            vals.push(`%${buscar}%`); i++;
        }
        if (estado) { conds.push(`v.estado = $${i++}`); vals.push(estado); }
        if (metodo) { conds.push(`v.forma_pago = $${i++}`); vals.push(metodo); }
        if (desde)  { conds.push(`v.fecha::date >= $${i++}`); vals.push(desde); }
        if (hasta)  { conds.push(`v.fecha::date <= $${i++}`); vals.push(hasta); }

        const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

        const result = await pool.query(
            `SELECT v.id_venta, v.nro_documento, v.fecha,
                    v.subtotal, v.descuento, v.total, v.forma_pago,
                    v.estado, v.observacion,
                    v.monto_recibido, v.vuelto,
                    v.id_cliente,
                    CASE WHEN v.id_cliente IS NULL THEN 'Sin cliente'
                         ELSE TRIM(CONCAT(c.nombre,' ',COALESCE(c.apellido,''))) END AS cliente_nombre,
                    u.nombre AS vendedor, u.id_usuario
             FROM ventas v
             LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
             JOIN usuarios u ON u.id_usuario = v.id_usuario
             ${where}
             ORDER BY v.fecha DESC, v.id_venta DESC LIMIT 500`,
            vals
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al listar ventas" });
    }
});

// GET /ventas/catalogo/items
router.get("/catalogo/items", async (req, res) => {
    try {
        const buscar = (req.query.buscar || "").trim();
        const items  = [];

        let qProd = `
            SELECT pp.id_producto_presentacion AS id_ref,
                   pp.id_producto, pp.id_presentacion,
                   p.nombre AS producto, p.codigo_barras AS sku,
                   pr.nombre AS presentacion, pp.precio_venta,
                   pp.stock_actual, pp.stock_minimo,
                   m.nombre AS marca, 'producto' AS tipo_item
            FROM producto_presentacion pp
            JOIN productos p  ON p.id_producto = pp.id_producto
            JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN marcas m ON m.id_marca = p.id_marca
            WHERE p.estado = 'activo'`;
        const vProd = [];
        if (buscar) {
            qProd += ` AND (p.nombre ILIKE $1 OR p.codigo_barras ILIKE $1 OR pr.nombre ILIKE $1)`;
            vProd.push(`%${buscar}%`);
        }
        items.push(...(await pool.query(qProd, vProd)).rows);

        let qMez = `
            SELECT m.id_mezcla AS id_ref, NULL::int AS id_producto,
                   NULL::int AS id_presentacion,
                   COALESCE(m.nombre_mezcla, 'Mezcla') AS producto,
                   'mezcla' AS sku,
                   'Mezcla personalizada' AS presentacion,
                   m.precio_total AS precio_venta,
                   999 AS stock_actual, 0 AS stock_minimo,
                   NULL AS marca, 'mezcla' AS tipo_item
            FROM mezclas m
            WHERE 1=1`;
        const vMez = [];
        if (buscar) {
            qMez += ` AND (m.nombre_mezcla ILIKE $1)`;
            vMez.push(`%${buscar}%`);
        }
        items.push(...(await pool.query(qMez, vMez)).rows);

        res.json(items);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al cargar catálogo" });
    }
});

// GET /ventas/:id
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const venta = await pool.query(
            `SELECT v.*,
                    CASE WHEN v.id_cliente IS NULL THEN 'Sin cliente'
                         ELSE TRIM(CONCAT(c.nombre,' ',COALESCE(c.apellido,''))) END AS cliente_nombre,
                    c.dni AS cliente_doc,
                    u.nombre AS vendedor,
                    p.nombre AS rol_vendedor
             FROM ventas v
             LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
             JOIN usuarios u ON u.id_usuario = v.id_usuario
             LEFT JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE v.id_venta = $1`, [id]
        );
        if (!venta.rows.length) return res.status(404).json({ message: "Venta no encontrada" });

        const detalle = await pool.query(
            `SELECT dv.*,
                    COALESCE(p.nombre, mz.nombre_mezcla, 'Ítem') AS nombre_item,
                    COALESCE(pr.nombre, 'mezcla') AS presentacion_label
             FROM detalle_ventas dv
             LEFT JOIN producto_presentacion pp ON pp.id_producto_presentacion = dv.id_producto_presentacion
             LEFT JOIN productos p   ON p.id_producto    = pp.id_producto
             LEFT JOIN presentaciones pr ON pr.id_presentacion = pp.id_presentacion
             LEFT JOIN mezclas mz    ON mz.id_mezcla     = dv.id_mezcla
             WHERE dv.id_venta = $1`, [id]
        );

        res.json({ ...venta.rows[0], detalle: detalle.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener venta" });
    }
});

// POST /ventas
router.post("/", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const {
            id_cliente, id_usuario, id_serie,
            nro_documento, tipo_comprobante,
            subtotal, descuento, total,
            forma_pago, estado, observacion,
            monto_recibido, vuelto, detalle,
        } = req.body;

        if (!id_usuario || !detalle?.length)
            return res.status(400).json({ message: "Usuario y al menos un producto son obligatorios" });

        // Generar número de documento si no viene
        let numDoc = nro_documento;
        if (!numDoc && id_serie) {
            const serieRes = await client.query(
                `UPDATE series_comprobante
                 SET correlativo_actual = correlativo_actual + 1
                 WHERE id_serie = $1
                 RETURNING serie, correlativo_actual`,
                [id_serie]
            );
            if (serieRes.rows.length > 0) {
                const { serie, correlativo_actual } = serieRes.rows[0];
                numDoc = `${serie}-${String(correlativo_actual).padStart(8, "0")}`;
            }
        }
        if (!numDoc) numDoc = `NV-${Date.now()}`;

        const ins = await client.query(
            `INSERT INTO ventas
             (id_cliente, id_usuario, id_serie, nro_documento,
              subtotal, descuento, total, forma_pago, estado,
              observacion, monto_recibido, vuelto, fecha)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING *`,
            [id_cliente || null, id_usuario, id_serie || null, numDoc,
             subtotal || 0, descuento || 0, total || 0,
             forma_pago || "EFECTIVO", estado || "COMPLETADA",
             observacion || null,
             monto_recibido ? parseFloat(monto_recibido) : null,
             vuelto ? parseFloat(vuelto) : 0]
        );
        const id_venta = ins.rows[0].id_venta;

        for (const d of detalle) {
            const tipo = d.tipo_item || "producto";
            await client.query(
                `INSERT INTO detalle_ventas
                 (id_venta, id_producto_presentacion, id_mezcla,
                  cantidad, precio_unitario, subtotal)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [id_venta,
                 tipo === "producto" ? d.id_ref : null,
                 tipo === "mezcla"   ? d.id_ref : null,
                 d.cantidad,
                 d.precio_unitario,
                 d.cantidad * d.precio_unitario]
            );
            // El trigger trg_descuento_stock descuenta el stock automáticamente
        }

        await client.query("COMMIT");
        res.json({ message: "Venta registrada", venta: ins.rows[0] });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("ERROR VENTA:", error.message);
        res.status(500).json({ message: error.message || "Error al registrar venta" });
    } finally {
        client.release();
    }
});

// PUT /ventas/:id/anular
router.put("/:id/anular", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(
            `UPDATE ventas SET estado = 'ANULADA' WHERE id_venta = $1`, [id]
        );
        res.json({ message: "Venta anulada" });
    } catch (error) {
        res.status(500).json({ message: "Error al anular venta" });
    }
});

// GET /ventas/series/lista
router.get("/series/lista", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM series_comprobante ORDER BY tipo_comprobante, serie`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener series" });
    }
});

module.exports = router;