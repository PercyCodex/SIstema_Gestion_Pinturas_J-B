const { TIPO_ITEM, esHerramienta, esProducto, normalizarTipoItem } = require("../constants/tipoItem");

async function listarCatalogo(pool) {
    const productosRes = await pool.query(
        `SELECT p.id_producto AS id_ref,
                'producto'::text AS tipo_item,
                p.*,
                m.nombre AS marca_nombre,
                t.nombre AS tipo_nombre,
                c.nombre AS categoria_nombre,
                CASE WHEN c.nombre IS NOT NULL THEN ARRAY[c.nombre] ELSE ARRAY[]::text[] END AS categorias,
                (SELECT COUNT(*)::int FROM producto_presentacion pp
                 WHERE pp.id_producto = p.id_producto) AS total_presentaciones
         FROM productos p
         LEFT JOIN marcas m ON m.id_marca = p.id_marca
         LEFT JOIN tipos_pintura t ON t.id_tipo = p.id_tipo
         LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
         ORDER BY p.nombre ASC`
    );

    return productosRes.rows.map((r) => ({
        ...r,
        id_herramienta: null,
    }));
}

async function crearProducto(pool, body) {
    const {
        id_marca, id_tipo, id_categoria, id_color,
        id_usuario, nombre, descripcion, imagen_url,
        codigo_barras, estado, presentaciones,
    } = body;

    const result = await pool.query(
        `INSERT INTO productos
         (id_categoria, id_marca, id_tipo, id_color,
          nombre, descripcion, imagen_url, codigo_barras, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
            id_categoria, id_marca, id_tipo, id_color || null,
            nombre, descripcion || null, imagen_url || null,
            codigo_barras || null, estado ?? "activo",
        ]
    );

    const id_producto = result.rows[0].id_producto;

    if (presentaciones?.length > 0) {
        for (const pres of presentaciones) {
            await pool.query(
                `INSERT INTO producto_presentacion
                 (id_producto, id_presentacion, precio_venta, precio_compra, stock_actual, stock_minimo)
                 VALUES ($1, $2, $3, $4, 0, 5)
                 ON CONFLICT (id_producto, id_presentacion) DO NOTHING`,
                [
                    id_producto,
                    pres.id_presentacion,
                    parseFloat(pres.precio_venta) || 0,
                    parseFloat(pres.precio_compra) || 0,
                ]
            );
        }
    }

    return { tipo_item: TIPO_ITEM.PRODUCTO, id_ref: id_producto, row: result.rows[0] };
}

async function crearHerramienta(pool, body, todasCategorias = []) {
    // En la nueva BD no hay tabla herramientas, se maneja como producto
    const err = new Error("Herramientas no disponibles. Usa productos con categoría herramienta.");
    err.status = 400;
    throw err;
}

async function actualizarProducto(pool, id, body) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const {
            id_marca, id_tipo, id_categoria, id_color,
            nombre, descripcion, imagen_url, codigo_barras, estado,
        } = body;

        await client.query(
            `UPDATE productos SET
             id_categoria=$1, id_marca=$2, id_tipo=$3, id_color=$4,
             nombre=$5, descripcion=$6, imagen_url=$7,
             codigo_barras=$8, estado=$9
             WHERE id_producto=$10`,
            [
                id_categoria, id_marca, id_tipo, id_color || null,
                nombre, descripcion || null, imagen_url || null,
                codigo_barras || null, estado, id,
            ]
        );

        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        client.release();
    }
}

async function actualizarHerramienta(pool, id, body, todasCategorias = []) {
    const err = new Error("Herramientas no disponibles en esta versión.");
    err.status = 400;
    throw err;
}

async function eliminarCatalogo(pool, tipo_item, id) {
    const tipo = normalizarTipoItem(tipo_item);
    if (esProducto(tipo)) {
        await pool.query(`DELETE FROM producto_presentacion WHERE id_producto = $1`, [id]);
        await pool.query(`DELETE FROM productos WHERE id_producto = $1`, [id]);
        return;
    }
    const err = new Error("tipo_item inválido");
    err.status = 400;
    throw err;
}

module.exports = {
    listarCatalogo,
    crearProducto,
    crearHerramienta,
    actualizarProducto,
    actualizarHerramienta,
    eliminarCatalogo,
};