const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: "./config/.env" });
const pool = require("./database/postgres");

pool.query("SELECT 1").then(() => {
    console.log("✅ Conectado a PostgreSQL");
}).catch((err) => {
    console.error("❌ Error conectando a PostgreSQL:", err.message);
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ message: "PostgreSQL conectado", date: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Error de conexión" });
    }
});

// ─── LOGIN ────────────────────────────────────────────────────────
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            `SELECT u.*, r.nombre AS rol_nombre
             FROM pinturas.usuarios u
             LEFT JOIN pinturas.roles r ON u.id_rol = r.id_rol
             WHERE u.correo = $1`, [username]
        );
        if (result.rows.length === 0) return res.json({ message: "Usuario no registrado" });
        const usuario = result.rows[0];
        const checkPass = await pool.query(
            `SELECT (contrasena = crypt($1, contrasena)) AS ok
             FROM pinturas.usuarios WHERE id_usuario = $2`,
            [password, usuario.id_usuario]
        );
        if (!checkPass.rows[0].ok) return res.json({ message: "Contraseña incorrecta" });
        if (usuario.estado !== "activo") return res.json({ message: "Usuario inactivo o bloqueado" });
        await pool.query(`UPDATE pinturas.usuarios SET ultimo_login = NOW() WHERE id_usuario = $1`, [usuario.id_usuario]);
        res.json({
            message: "Acceso concedido, " + usuario.nombre,
            user: usuario.nombre + " " + usuario.apellido,
            rol: usuario.rol_nombre,
            id: usuario.id_usuario
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// ─── ROLES ────────────────────────────────────────────────────────
app.get("/roles", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, COUNT(u.id_usuario) AS total_usuarios
             FROM pinturas.roles r
             LEFT JOIN pinturas.usuarios u ON u.id_rol = r.id_rol
             GROUP BY r.id_rol ORDER BY r.id_rol ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/roles", async (req, res) => {
    try {
        const { nombre, descripcion, estado } = req.body;
        await pool.query(`INSERT INTO pinturas.roles (nombre, descripcion, estado) VALUES ($1, $2, $3)`,
            [nombre, descripcion, estado ?? "activo"]);
        res.json({ message: "Rol creado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al crear rol" }); }
});

app.put("/roles/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, estado } = req.body;
        await pool.query(`UPDATE pinturas.roles SET nombre=$1, descripcion=$2, estado=$3 WHERE id_rol=$4`,
            [nombre, descripcion, estado, id]);
        res.json({ message: "Rol actualizado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar rol" }); }
});

app.delete("/roles/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(`SELECT COUNT(*) FROM pinturas.usuarios WHERE id_rol = $1`, [id]);
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: hay usuarios con este rol" });
        await pool.query(`DELETE FROM pinturas.roles WHERE id_rol = $1`, [id]);
        res.json({ message: "Rol eliminado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar rol" }); }
});

app.get("/roles/:id/permisos", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT modulo, accion FROM pinturas.permisos_rol WHERE id_rol = $1`, [id]);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error al obtener permisos" }); }
});

app.post("/roles/:id/permisos", async (req, res) => {
    try {
        const { id } = req.params;
        const { permisos } = req.body;
        await pool.query(`DELETE FROM pinturas.permisos_rol WHERE id_rol = $1`, [id]);
        for (const p of permisos) {
            await pool.query(`INSERT INTO pinturas.permisos_rol (id_rol, modulo, accion) VALUES ($1, $2, $3) ON CONFLICT (id_rol, modulo, accion) DO NOTHING`, [id, p.modulo, p.accion]);
        }
        res.json({ message: "Permisos guardados correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al guardar permisos" }); }
});

// ─── USUARIOS ─────────────────────────────────────────────────────
app.get("/usuarios", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id_usuario, u.nombre, u.apellido, u.correo,
                    u.estado, u.ultimo_login, u.fecha_creacion,
                    r.nombre AS rol, r.id_rol
             FROM pinturas.usuarios u
             LEFT JOIN pinturas.roles r ON u.id_rol = r.id_rol
             ORDER BY u.id_usuario ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/usuarios", async (req, res) => {
    try {
        const { nombre, apellido, correo, contrasena, id_rol, estado } = req.body;
        await pool.query(
            `INSERT INTO pinturas.usuarios (nombre, apellido, correo, contrasena, id_rol, estado)
             VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), $5, $6)`,
            [nombre, apellido, correo, contrasena, id_rol, estado ?? "activo"]
        );
        res.json({ message: "Usuario creado correctamente" });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El correo ya está registrado" });
        res.status(500).json({ message: "Error al crear usuario" });
    }
});

app.put("/usuarios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, correo, id_rol, estado } = req.body;
        await pool.query(
            `UPDATE pinturas.usuarios SET nombre=$1, apellido=$2, correo=$3, id_rol=$4, estado=$5 WHERE id_usuario=$6`,
            [nombre, apellido, correo, id_rol, estado, id]
        );
        res.json({ message: "Usuario actualizado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar usuario" }); }
});

app.put("/usuarios/:id/password", async (req, res) => {
    try {
        const { id } = req.params;
        const { contrasena } = req.body;
        await pool.query(`UPDATE pinturas.usuarios SET contrasena = crypt($1, gen_salt('bf')) WHERE id_usuario = $2`, [contrasena, id]);
        res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar contraseña" }); }
});

app.delete("/usuarios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM pinturas.usuarios WHERE id_usuario = $1`, [id]);
        res.json({ message: "Usuario eliminado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar usuario" }); }
});

// ─── CATEGORÍAS ───────────────────────────────────────────────────
app.get("/categorias", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, p.nombre AS nombre_padre
             FROM pinturas.categorias c
             LEFT JOIN pinturas.categorias p ON p.id_categoria = c.id_padre
             ORDER BY COALESCE(c.id_padre, c.id_categoria), c.id_categoria ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/categorias", async (req, res) => {
    try {
        const { nombre, descripcion, id_padre, estado } = req.body;
        const result = await pool.query(
            `INSERT INTO pinturas.categorias (nombre, descripcion, id_padre, estado) VALUES ($1, $2, $3, $4) RETURNING *`,
            [nombre, descripcion || null, id_padre || null, estado ?? "activo"]
        );
        res.json({ message: "Categoría creada correctamente", categoria: result.rows[0] });
    } catch (error) { res.status(500).json({ message: "Error al crear categoría" }); }
});

app.put("/categorias/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, id_padre, estado } = req.body;
        if (parseInt(id_padre) === parseInt(id))
            return res.status(400).json({ message: "Una categoría no puede ser su propio padre" });
        await pool.query(
            `UPDATE pinturas.categorias SET nombre=$1, descripcion=$2, id_padre=$3, estado=$4 WHERE id_categoria=$5`,
            [nombre, descripcion || null, id_padre || null, estado, id]
        );
        res.json({ message: "Categoría actualizada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar categoría" }); }
});

app.delete("/categorias/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const hijos = await pool.query(`SELECT COUNT(*) FROM pinturas.categorias WHERE id_padre = $1`, [id]);
        if (parseInt(hijos.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene subcategorías asociadas" });
        const productos = await pool.query(`SELECT COUNT(*) FROM pinturas.producto_categoria WHERE id_categoria = $1`, [id]);
        if (parseInt(productos.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene productos asociados" });
        await pool.query(`DELETE FROM pinturas.categorias WHERE id_categoria = $1`, [id]);
        res.json({ message: "Categoría eliminada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar categoría" }); }
});

// ─── MARCAS ───────────────────────────────────────────────────────
app.get("/marcas", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM pinturas.marcas WHERE estado = 'activo' ORDER BY nombre ASC`);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.get("/marcas/todas", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT m.*, COUNT(p.id_producto) AS total_productos
             FROM pinturas.marcas m
             LEFT JOIN pinturas.productos p ON p.id_marca = m.id_marca
             GROUP BY m.id_marca ORDER BY m.nombre ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/marcas", async (req, res) => {
    try {
        const { nombre, descripcion, pais_origen, estado } = req.body;
        const result = await pool.query(
            `INSERT INTO pinturas.marcas (nombre, descripcion, pais_origen, estado) VALUES ($1, $2, $3, $4) RETURNING *`,
            [nombre, descripcion || null, pais_origen || null, estado ?? "activo"]
        );
        res.json({ message: "Marca creada correctamente", marca: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El nombre de marca ya existe" });
        res.status(500).json({ message: "Error al crear marca" });
    }
});

app.put("/marcas/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, pais_origen, estado } = req.body;
        await pool.query(
            `UPDATE pinturas.marcas SET nombre=$1, descripcion=$2, pais_origen=$3, estado=$4 WHERE id_marca=$5`,
            [nombre, descripcion || null, pais_origen || null, estado, id]
        );
        res.json({ message: "Marca actualizada correctamente" });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El nombre de marca ya existe" });
        res.status(500).json({ message: "Error al actualizar marca" });
    }
});

app.delete("/marcas/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(`SELECT COUNT(*) FROM pinturas.productos WHERE id_marca = $1`, [id]);
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene productos asociados" });
        await pool.query(`DELETE FROM pinturas.marcas WHERE id_marca = $1`, [id]);
        res.json({ message: "Marca eliminada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar marca" }); }
});

// ─── TIPOS PINTURA ────────────────────────────────────────────────
app.get("/tipos-pintura", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM pinturas.tipos_pintura ORDER BY nombre ASC`);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

// ─── PRODUCTOS ────────────────────────────────────────────────────
app.get("/productos", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*,
                    m.nombre AS marca_nombre,
                    t.nombre AS tipo_nombre,
                    CONCAT(u.nombre, ' ', u.apellido) AS registrado_por,
                    ARRAY_AGG(DISTINCT c.nombre) FILTER (WHERE c.nombre IS NOT NULL) AS categorias
             FROM pinturas.productos p
             LEFT JOIN pinturas.marcas m ON m.id_marca = p.id_marca
             LEFT JOIN pinturas.tipos_pintura t ON t.id_tipo = p.id_tipo
             LEFT JOIN pinturas.usuarios u ON u.id_usuario = p.id_usuario
             LEFT JOIN pinturas.producto_categoria pc ON pc.id_producto = p.id_producto
             LEFT JOIN pinturas.categorias c ON c.id_categoria = pc.id_categoria
             GROUP BY p.id_producto, m.nombre, t.nombre, u.nombre, u.apellido
             ORDER BY p.id_producto ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST crear producto — auto-genera código y crea filas en inventario si vienen presentaciones
app.post("/productos", async (req, res) => {
    try {
        const {
            id_marca, id_tipo, id_usuario, nombre, descripcion,
            codigo_interno, precio_base, unidad_medida,
            es_mezcable, estado, categorias
        } = req.body;

        // Auto-generar código si viene vacío
        let codigoFinal = codigo_interno?.trim() || null;
        if (!codigoFinal) {
            const contadorRes = await pool.query(`SELECT COUNT(*) FROM pinturas.productos`);
            const num = parseInt(contadorRes.rows[0].count) + 1;
            const prefijo = unidad_medida === "galon" ? "GAL" : unidad_medida === "kg" ? "KG" : "PROD";
            codigoFinal = `${prefijo}-${String(num).padStart(5, "0")}`;
            const existe = await pool.query(`SELECT 1 FROM pinturas.productos WHERE codigo_interno = $1`, [codigoFinal]);
            if (existe.rows.length > 0) codigoFinal = `${prefijo}-${Date.now()}`;
        }

        const result = await pool.query(
            `INSERT INTO pinturas.productos
             (id_marca, id_tipo, id_usuario, nombre, descripcion, codigo_interno,
             precio_base, unidad_medida, es_mezcable, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [id_marca, id_tipo, id_usuario || null, nombre, descripcion || null,
             codigoFinal, precio_base, unidad_medida ?? "litro",
             es_mezcable ?? false, estado ?? "activo"]
        );

        const id_producto = result.rows[0].id_producto;

        // Insertar categorías
        if (categorias && categorias.length > 0) {
            for (const id_cat of categorias) {
                await pool.query(
                    `INSERT INTO pinturas.producto_categoria (id_producto, id_categoria) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [id_producto, id_cat]
                );
            }
        }

        // ── NUEVO: Auto-crear filas en presentacion_producto ──────────────
        // El frontend puede enviar: presentaciones: [{ id_presentacion, precio_costo }]
        if (req.body.presentaciones && req.body.presentaciones.length > 0) {
            for (const pres of req.body.presentaciones) {
                await pool.query(
                    `INSERT INTO pinturas.presentacion_producto
                     (id_producto, id_presentacion, precio_venta, precio_costo, stock_actual, stock_minimo, estado)
                     VALUES ($1, $2, $3, $4, 0, 5, 'activo')
                     ON CONFLICT (id_producto, id_presentacion) DO NOTHING`,
                    [
                        id_producto,
                        pres.id_presentacion,
                        parseFloat(precio_base) || 0,
                        parseFloat(pres.precio_costo) || 0
                    ]
                );
            }
        }

        res.json({ message: "Producto creado correctamente", producto: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El código interno ya existe" });
        console.error(error);
        res.status(500).json({ message: "Error al crear producto" });
    }
});

// PUT editar producto — sincroniza precio_base y estado hacia presentacion_producto
app.put("/productos/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const {
            id_marca, id_tipo, nombre, descripcion, codigo_interno,
            precio_base, unidad_medida, es_mezcable, estado, categorias
        } = req.body;

        await client.query(
            `UPDATE pinturas.productos SET
             id_marca=$1, id_tipo=$2, nombre=$3, descripcion=$4,
             codigo_interno=$5, precio_base=$6, unidad_medida=$7,
             es_mezcable=$8, estado=$9
             WHERE id_producto=$10`,
            [id_marca, id_tipo, nombre, descripcion || null,
             codigo_interno || null, precio_base, unidad_medida,
             es_mezcable, estado, id]
        );

        // Actualizar categorías
        await client.query(`DELETE FROM pinturas.producto_categoria WHERE id_producto = $1`, [id]);
        if (categorias && categorias.length > 0) {
            for (const id_cat of categorias) {
                await client.query(
                    `INSERT INTO pinturas.producto_categoria (id_producto, id_categoria) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [id, id_cat]
                );
            }
        }

        // ── NUEVO: Sincronizar precio_base y estado hacia presentacion_producto ──
        try {
            await client.query(
                `UPDATE pinturas.presentacion_producto
                 SET
                     precio_venta = CASE
                         WHEN $1::numeric > 0 THEN $1::numeric
                         ELSE precio_venta
                     END,
                     estado = CASE
                         WHEN $2 IN ('inactivo','descontinuado') THEN 'inactivo'
                         WHEN $2 = 'activo' THEN 'activo'
                         ELSE estado
                     END
                 WHERE id_producto = $3`,
                [parseFloat(precio_base) || 0, estado, id]
            );
        } catch (syncErr) {
            // No cancela la operación principal — la sincronización es best-effort
            console.warn("⚠️  sync presentacion_producto parcial:", syncErr.message);
        }

        await client.query("COMMIT");
        res.json({ message: "Producto actualizado correctamente" });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") return res.status(400).json({ message: "El código interno ya existe" });
        res.status(500).json({ message: "Error al actualizar producto" });
    } finally {
        client.release();
    }
});

// PUT actualizar precio_base del producto (llamado desde inventario al sincronizar manualmente)
app.put("/productos/:id/precio", async (req, res) => {
    try {
        const { id } = req.params;
        const { precio_base } = req.body;
        if (isNaN(parseFloat(precio_base)) || parseFloat(precio_base) < 0)
            return res.status(400).json({ message: "Precio inválido" });
        await pool.query(`UPDATE pinturas.productos SET precio_base = $1 WHERE id_producto = $2`, [precio_base, id]);
        res.json({ message: "Precio base del producto actualizado" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar precio" }); }
});

// GET presentaciones asignadas a un producto (para el modal de edición)
app.get("/productos/:id/presentaciones", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT pp.id_pres_prod, pp.id_presentacion, pp.precio_venta, pp.precio_costo,
                    pp.stock_actual, pp.stock_minimo, pp.estado,
                    pr.nombre AS nombre_presentacion
             FROM pinturas.presentacion_producto pp
             JOIN pinturas.presentaciones pr ON pr.id_presentacion = pp.id_presentacion
             WHERE pp.id_producto = $1
             ORDER BY pr.orden_display ASC`,
            [id]
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error al obtener presentaciones del producto" }); }
});

app.delete("/productos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM pinturas.producto_categoria WHERE id_producto = $1`, [id]);
        await pool.query(`DELETE FROM pinturas.productos WHERE id_producto = $1`, [id]);
        res.json({ message: "Producto eliminado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar producto" }); }
});

// ─── HERRAMIENTAS ─────────────────────────────────────────────────
app.get("/herramientas", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT h.*, c.nombre AS categoria_nombre
             FROM pinturas.herramientas h
             LEFT JOIN pinturas.categorias c ON c.id_categoria = h.id_categoria
             ORDER BY h.id_herramienta ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/herramientas", async (req, res) => {
    try {
        const { id_categoria, nombre, descripcion, codigo_interno,
                precio_venta, precio_costo, stock_actual, stock_minimo,
                unidad, estado } = req.body;

        let codigoFinal = codigo_interno?.trim() || null;
        if (!codigoFinal) {
            const contRes = await pool.query(`SELECT COUNT(*) FROM pinturas.herramientas`);
            const num = parseInt(contRes.rows[0].count) + 1;
            codigoFinal = `HERR-${String(num).padStart(5, "0")}`;
            const existe = await pool.query(`SELECT 1 FROM pinturas.herramientas WHERE codigo_interno = $1`, [codigoFinal]);
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
        if (error.code === "23505") return res.status(400).json({ message: "El código ya existe" });
        console.error(error);
        res.status(500).json({ message: "Error al crear herramienta" });
    }
});

app.put("/herramientas/:id", async (req, res) => {
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
    } catch (error) { res.status(500).json({ message: "Error al actualizar herramienta" }); }
});

app.delete("/herramientas/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(`SELECT COUNT(*) FROM pinturas.movimiento_inventario WHERE id_herramienta = $1`, [id]);
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene movimientos registrados" });
        await pool.query(`DELETE FROM pinturas.herramientas WHERE id_herramienta = $1`, [id]);
        res.json({ message: "Herramienta eliminada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar herramienta" }); }
});

// ─── STOCK DE HERRAMIENTAS — movimiento con registro ──────────────
app.put("/herramientas/:id/stock", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const { stock_actual, motivo, notas, id_usuario } = req.body;

        if (!id_usuario) throw { status: 400, message: "No se identificó el usuario." };
        if (stock_actual === undefined || stock_actual < 0)
            throw { status: 400, message: "Stock inválido." };

        const stockRes = await client.query(
            `SELECT stock_actual FROM pinturas.herramientas WHERE id_herramienta = $1 FOR UPDATE`,
            [id]
        );
        if (stockRes.rows.length === 0) throw { status: 404, message: "Herramienta no encontrada." };

        const stock_antes = parseInt(stockRes.rows[0].stock_actual);
        const stock_despues = parseInt(stock_actual);

        await client.query(
            `UPDATE pinturas.herramientas SET stock_actual = $1 WHERE id_herramienta = $2`,
            [stock_despues, id]
        );

        const tipo = stock_despues > stock_antes ? "entrada" :
                     stock_despues < stock_antes ? "merma"   : "ajuste";
        const cantidad = Math.abs(stock_despues - stock_antes);

        await client.query(
            `INSERT INTO pinturas.movimiento_inventario
             (id_herramienta, id_usuario, tipo, cantidad, stock_antes, stock_despues, motivo, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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

// ─── SINCRONIZACIÓN PRODUCTO → INVENTARIO ────────────────────────
// Endpoint auxiliar que puede llamarse manualmente si se necesita
app.put("/sync/producto/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const { precio_base, estado } = req.body;

        if (precio_base !== undefined) {
            await client.query(
                `UPDATE pinturas.presentacion_producto
                 SET precio_venta = $1
                 WHERE id_producto = $2 AND estado = 'activo'`,
                [parseFloat(precio_base), id]
            );
        }

        if (estado === "inactivo" || estado === "descontinuado") {
            await client.query(
                `UPDATE pinturas.presentacion_producto SET estado = 'inactivo' WHERE id_producto = $1`,
                [id]
            );
        } else if (estado === "activo") {
            await client.query(
                `UPDATE pinturas.presentacion_producto SET estado = 'activo' WHERE id_producto = $1`,
                [id]
            );
        }

        await client.query("COMMIT");
        res.json({ message: "Sincronización completada" });
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ message: "Error en sincronización" });
    } finally {
        client.release();
    }
});

// ─── INVENTARIO/STOCK v2 — sin filtro obligatorio, paginado ──────
app.get("/inventario/stock/v2", async (req, res) => {
    try {
        const { marca, categoria, semaforo, buscar, tipo_item, page = 1, limit = 60 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        if (tipo_item === "herramienta") {
            let hCond = ["h.estado = 'activo'"];
            let hParams = [];
            let hIdx = 1;

            if (buscar) {
                hCond.push(`(h.nombre ILIKE $${hIdx} OR h.codigo_interno ILIKE $${hIdx} OR c.nombre ILIKE $${hIdx})`);
                hParams.push(`%${buscar}%`);
                hIdx++;
            }
            if (semaforo === "critico") hCond.push(`h.stock_actual = 0`);
            else if (semaforo === "bajo") hCond.push(`h.stock_actual > 0 AND h.stock_actual <= h.stock_minimo`);
            else if (semaforo === "ok") hCond.push(`h.stock_actual > h.stock_minimo`);

            const hWhere = "WHERE " + hCond.join(" AND ");
            const hResult = await pool.query(`
                SELECT
                    NULL::int AS id_pres_prod,
                    h.id_herramienta,
                    h.nombre AS producto,
                    h.codigo_interno AS sku,
                    'Herramienta' AS presentacion,
                    NULL::numeric AS volumen_cantidad,
                    h.unidad AS unidad_medida,
                    c.nombre AS marca,
                    h.stock_actual,
                    h.stock_minimo,
                    h.precio_venta,
                    h.precio_costo,
                    CASE WHEN h.stock_actual = 0 THEN 'critico'
                         WHEN h.stock_actual <= h.stock_minimo THEN 'bajo'
                         ELSE 'ok' END AS semaforo,
                    'herramienta' AS tipo_item,
                    h.fecha_registro AS fecha_registro
                FROM pinturas.herramientas h
                LEFT JOIN pinturas.categorias c ON c.id_categoria = h.id_categoria
                ${hWhere}
                ORDER BY h.nombre ASC
                LIMIT $${hIdx++} OFFSET $${hIdx++}
            `, [...hParams, parseInt(limit), offset]);
            return res.json({ datos: hResult.rows, total: hResult.rows.length });
        }

        let condiciones = ["pp.estado = 'activo'"];
        let params = [];
        let idx = 1;

        if (marca)     { condiciones.push(`p.id_marca = $${idx++}`); params.push(parseInt(marca)); }
        if (categoria) {
            condiciones.push(`EXISTS (SELECT 1 FROM pinturas.producto_categoria pc2 WHERE pc2.id_producto = p.id_producto AND pc2.id_categoria = $${idx++})`);
            params.push(parseInt(categoria));
        }
        if (semaforo === "critico") condiciones.push(`pp.stock_actual = 0`);
        else if (semaforo === "bajo") condiciones.push(`pp.stock_actual > 0 AND pp.stock_actual <= pp.stock_minimo`);
        else if (semaforo === "ok") condiciones.push(`pp.stock_actual > pp.stock_minimo`);
        if (buscar) {
            condiciones.push(`(p.nombre ILIKE $${idx} OR p.codigo_interno ILIKE $${idx} OR m.nombre ILIKE $${idx} OR pr.nombre ILIKE $${idx})`);
            params.push(`%${buscar}%`);
            idx++;
        }

        const where = "WHERE " + condiciones.join(" AND ");

        const countRes = await pool.query(`
            SELECT COUNT(*) FROM pinturas.presentacion_producto pp
            JOIN pinturas.productos      p  ON p.id_producto      = pp.id_producto
            JOIN pinturas.presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN pinturas.marcas    m  ON m.id_marca         = p.id_marca
            ${where}
        `, params);

        const result = await pool.query(`
            SELECT pp.id_pres_prod, pp.id_producto, NULL AS id_herramienta,
                   p.nombre AS producto, p.codigo_interno AS sku,
                   pr.nombre AS presentacion, pr.volumen_cantidad, pr.unidad_medida,
                   m.nombre AS marca,
                   pp.stock_actual, pp.stock_minimo, pp.precio_venta, pp.precio_costo,
                   pp.fecha_registro,
                   CASE WHEN pp.stock_actual = 0 THEN 'critico'
                        WHEN pp.stock_actual <= pp.stock_minimo THEN 'bajo'
                        ELSE 'ok' END AS semaforo,
                   'pintura' AS tipo_item,
                   ARRAY_AGG(DISTINCT cat.nombre) FILTER (WHERE cat.nombre IS NOT NULL) AS categorias
            FROM pinturas.presentacion_producto pp
            JOIN pinturas.productos      p  ON p.id_producto      = pp.id_producto
            JOIN pinturas.presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN pinturas.marcas    m  ON m.id_marca         = p.id_marca
            LEFT JOIN pinturas.producto_categoria pc ON pc.id_producto = p.id_producto
            LEFT JOIN pinturas.categorias cat ON cat.id_categoria = pc.id_categoria
            ${where}
            GROUP BY pp.id_pres_prod, pp.id_producto, p.nombre, p.codigo_interno,
                     pr.nombre, pr.volumen_cantidad, pr.unidad_medida, m.nombre,
                     pp.stock_actual, pp.stock_minimo, pp.precio_venta, pp.precio_costo, pp.fecha_registro
            ORDER BY CASE WHEN pp.stock_actual = 0 THEN 0
                          WHEN pp.stock_actual <= pp.stock_minimo THEN 1
                          ELSE 2 END, p.nombre ASC
            LIMIT $${idx++} OFFSET $${idx++}
        `, [...params, parseInt(limit), offset]);

        res.json({
            datos: result.rows,
            total: parseInt(countRes.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit),
            paginas: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener stock" });
    }
});

// ─── RESUMEN INVENTARIO v2 ────────────────────────────────────────
app.get("/inventario/resumen/v2", async (req, res) => {
    try {
        const [pinturas, herramientas] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)                                                            AS total_pinturas,
                    COUNT(*) FILTER (WHERE pp.stock_actual = 0)                        AS sin_stock,
                    COUNT(*) FILTER (WHERE pp.stock_actual > 0 AND pp.stock_actual <= pp.stock_minimo) AS stock_bajo,
                    COUNT(*) FILTER (WHERE pp.stock_actual > pp.stock_minimo)           AS stock_ok,
                    COALESCE(SUM(pp.stock_actual * pp.precio_costo), 0)                 AS valor_costo,
                    COALESCE(SUM(pp.stock_actual * pp.precio_venta), 0)                 AS valor_venta
                FROM pinturas.presentacion_producto pp WHERE pp.estado = 'activo'
            `),
            pool.query(`
                SELECT
                    COUNT(*)                                                            AS total_herramientas,
                    COUNT(*) FILTER (WHERE h.stock_actual = 0)                         AS sin_stock_h,
                    COALESCE(SUM(h.stock_actual * h.precio_costo), 0)                  AS valor_costo_h
                FROM pinturas.herramientas h WHERE h.estado = 'activo'
            `)
        ]);

        const p = pinturas.rows[0];
        const h = herramientas.rows[0];

        res.json({
            total_productos:    parseInt(p.total_pinturas) + parseInt(h.total_herramientas),
            total_pinturas:     parseInt(p.total_pinturas),
            total_herramientas: parseInt(h.total_herramientas),
            sin_stock:          parseInt(p.sin_stock) + parseInt(h.sin_stock_h),
            stock_bajo:         parseInt(p.stock_bajo),
            stock_ok:           parseInt(p.stock_ok),
            valor_costo:        parseFloat(p.valor_costo) + parseFloat(h.valor_costo_h),
            valor_venta:        parseFloat(p.valor_venta)
        });
    } catch (error) {
        res.status(500).json({ message: "Error al obtener resumen" });
    }
});

// ─── PRESENTACIONES ───────────────────────────────────────────────
app.get("/presentaciones", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, COUNT(pp.id_pres_prod) AS total_productos
             FROM pinturas.presentaciones p
             LEFT JOIN pinturas.presentacion_producto pp ON pp.id_presentacion = p.id_presentacion
             GROUP BY p.id_presentacion
             ORDER BY p.orden_display ASC, p.id_presentacion ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

app.get("/presentaciones/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT * FROM pinturas.presentaciones WHERE id_presentacion = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Presentación no encontrada" });
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/presentaciones", async (req, res) => {
    try {
        const { volumen_cantidad, unidad_medida, descripcion, imagen_url, es_visible_web, orden_display, estado } = req.body;
        if (!volumen_cantidad || volumen_cantidad <= 0)
            return res.status(400).json({ message: "La cantidad debe ser mayor a 0" });
        const labels = { litro: "L", galon: "Gal", kg: "Kg", ml: "ml", unidad: "Und" };
        const nombre = `${volumen_cantidad} ${labels[unidad_medida] || unidad_medida}`;
        const result = await pool.query(
            `INSERT INTO pinturas.presentaciones
             (nombre, volumen_cantidad, unidad_medida, descripcion, imagen_url, es_visible_web, orden_display, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [nombre, parseFloat(volumen_cantidad), unidad_medida, descripcion || null,
             imagen_url || null, es_visible_web !== undefined ? es_visible_web : true,
             orden_display || 99, estado || "activo"]
        );
        res.json({ message: "Presentación creada correctamente", presentacion: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "Ya existe una presentación con ese nombre" });
        console.error(error);
        res.status(500).json({ message: "Error al crear presentación" });
    }
});

app.put("/presentaciones/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { volumen_cantidad, unidad_medida, descripcion, imagen_url, es_visible_web, orden_display, estado } = req.body;
        if (!volumen_cantidad || volumen_cantidad <= 0)
            return res.status(400).json({ message: "La cantidad debe ser mayor a 0" });
        const labels = { litro: "L", galon: "Gal", kg: "Kg", ml: "ml", unidad: "Und" };
        const nombre = `${volumen_cantidad} ${labels[unidad_medida] || unidad_medida}`;
        await pool.query(
            `UPDATE pinturas.presentaciones
             SET nombre=$1, volumen_cantidad=$2, unidad_medida=$3, descripcion=$4,
                 imagen_url=$5, es_visible_web=$6, orden_display=$7, estado=$8
             WHERE id_presentacion=$9`,
            [nombre, parseFloat(volumen_cantidad), unidad_medida, descripcion || null,
             imagen_url || null, es_visible_web !== undefined ? es_visible_web : true,
             orden_display || 99, estado || "activo", id]
        );
        res.json({ message: "Presentación actualizada correctamente" });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "Ya existe una presentación con ese nombre" });
        res.status(500).json({ message: "Error al actualizar presentación" });
    }
});

app.delete("/presentaciones/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const enUso = await pool.query(`SELECT COUNT(*) FROM pinturas.presentacion_producto WHERE id_presentacion = $1`, [id]);
        if (parseInt(enUso.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene productos asociados" });
        await pool.query(`DELETE FROM pinturas.presentaciones WHERE id_presentacion = $1`, [id]);
        res.json({ message: "Presentación eliminada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar presentación" }); }
});

// ─── CLIENTES ─────────────────────────────────────────────────────
app.get("/clientes", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id_cliente, nombre, apellido, dni_ruc, tipo_cliente,
                    telefono, correo, direccion, notas, estado, fecha_registro
             FROM pinturas.clientes ORDER BY id_cliente ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.get("/clientes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`SELECT * FROM pinturas.clientes WHERE id_cliente = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Cliente no encontrado" });
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/clientes", async (req, res) => {
    try {
        const { nombre, apellido, dni_ruc, tipo_cliente, telefono, correo, direccion, notas, estado } = req.body;
        if (!nombre) return res.status(400).json({ message: "El nombre es obligatorio" });
        await pool.query(
            `INSERT INTO pinturas.clientes (nombre, apellido, dni_ruc, tipo_cliente, telefono, correo, direccion, notas, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [nombre, apellido || null, dni_ruc || null, tipo_cliente ?? "natural",
             telefono || null, correo || null, direccion || null, notas || null, estado ?? "activo"]
        );
        res.json({ message: "Cliente creado correctamente" });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El DNI/RUC ya está registrado" });
        res.status(500).json({ message: "Error al crear cliente" });
    }
});

app.put("/clientes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, dni_ruc, tipo_cliente, telefono, correo, direccion, notas, estado } = req.body;
        await pool.query(
            `UPDATE pinturas.clientes SET nombre=$1, apellido=$2, dni_ruc=$3, tipo_cliente=$4,
             telefono=$5, correo=$6, direccion=$7, notas=$8, estado=$9 WHERE id_cliente=$10`,
            [nombre, apellido || null, dni_ruc || null, tipo_cliente,
             telefono || null, correo || null, direccion || null, notas || null, estado, id]
        );
        res.json({ message: "Cliente actualizado correctamente" });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El DNI/RUC ya está registrado" });
        res.status(500).json({ message: "Error al actualizar cliente" });
    }
});

app.delete("/clientes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const ventas = await pool.query(`SELECT COUNT(*) FROM pinturas.ventas WHERE id_cliente = $1`, [id]);
        if (parseInt(ventas.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: el cliente tiene ventas registradas" });
        const mezclas = await pool.query(`SELECT COUNT(*) FROM pinturas.mezclas WHERE id_cliente = $1`, [id]);
        if (parseInt(mezclas.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: el cliente tiene mezclas registradas" });
        await pool.query(`DELETE FROM pinturas.clientes WHERE id_cliente = $1`, [id]);
        res.json({ message: "Cliente eliminado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar cliente" }); }
});

// ─── PROVEEDORES ──────────────────────────────────────────────────
app.get("/proveedores", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*,
                COUNT(DISTINCT pp.id_producto)    AS total_productos,
                COUNT(DISTINCT ph.id_herramienta) AS total_herramientas
             FROM pinturas.proveedores p
             LEFT JOIN pinturas.proveedor_producto    pp ON pp.id_proveedor = p.id_proveedor
             LEFT JOIN pinturas.proveedor_herramienta ph ON ph.id_proveedor = p.id_proveedor
             GROUP BY p.id_proveedor ORDER BY p.fecha_registro DESC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.get("/proveedores/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const proveedor = await pool.query(`SELECT * FROM pinturas.proveedores WHERE id_proveedor = $1`, [id]);
        if (proveedor.rows.length === 0) return res.status(404).json({ message: "Proveedor no encontrado" });
        const productos = await pool.query(
            `SELECT pp.precio_costo, pp.tiempo_entrega_dias, pp.cantidad_minima, pp.estado,
                    p.nombre AS producto_nombre, p.codigo_interno, m.nombre AS marca_nombre
             FROM pinturas.proveedor_producto pp
             JOIN pinturas.productos p ON p.id_producto = pp.id_producto
             LEFT JOIN pinturas.marcas m ON m.id_marca = p.id_marca
             WHERE pp.id_proveedor = $1 ORDER BY p.nombre ASC`, [id]
        );
        const herramientas = await pool.query(
            `SELECT ph.precio_costo, ph.tiempo_entrega_dias, ph.estado,
                    h.nombre AS herramienta_nombre, h.codigo_interno
             FROM pinturas.proveedor_herramienta ph
             JOIN pinturas.herramientas h ON h.id_herramienta = ph.id_herramienta
             WHERE ph.id_proveedor = $1 ORDER BY h.nombre ASC`, [id]
        );
        res.json({ ...proveedor.rows[0], productos: productos.rows, herramientas: herramientas.rows });
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/proveedores", async (req, res) => {
    try {
        const { ruc, razon_social, nombre_comercial, contacto_nombre, telefono, correo, direccion, ciudad, pais, notas, estado } = req.body;
        if (!ruc?.trim()) return res.status(400).json({ message: "El RUC es obligatorio" });
        if (!razon_social?.trim()) return res.status(400).json({ message: "La razón social es obligatoria" });
        const result = await pool.query(
            `INSERT INTO pinturas.proveedores
             (ruc, razon_social, nombre_comercial, contacto_nombre, telefono, correo, direccion, ciudad, pais, notas, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [ruc.trim(), razon_social.trim(), nombre_comercial || null, contacto_nombre || null,
             telefono || null, correo || null, direccion || null, ciudad || null, pais || "Perú", notas || null, estado || "activo"]
        );
        res.json({ message: "Proveedor creado correctamente", proveedor: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El RUC ya está registrado" });
        res.status(500).json({ message: "Error al crear proveedor" });
    }
});

app.put("/proveedores/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { ruc, razon_social, nombre_comercial, contacto_nombre, telefono, correo, direccion, ciudad, pais, notas, estado } = req.body;
        if (!ruc?.trim()) return res.status(400).json({ message: "El RUC es obligatorio" });
        if (!razon_social?.trim()) return res.status(400).json({ message: "La razón social es obligatoria" });
        await pool.query(
            `UPDATE pinturas.proveedores SET ruc=$1, razon_social=$2, nombre_comercial=$3, contacto_nombre=$4,
             telefono=$5, correo=$6, direccion=$7, ciudad=$8, pais=$9, notas=$10, estado=$11
             WHERE id_proveedor=$12`,
            [ruc.trim(), razon_social.trim(), nombre_comercial || null, contacto_nombre || null,
             telefono || null, correo || null, direccion || null, ciudad || null, pais || "Perú", notas || null, estado || "activo", id]
        );
        res.json({ message: "Proveedor actualizado correctamente" });
    } catch (error) {
        if (error.code === "23505") return res.status(400).json({ message: "El RUC ya está registrado" });
        res.status(500).json({ message: "Error al actualizar proveedor" });
    }
});

app.delete("/proveedores/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const ordenes = await pool.query(`SELECT COUNT(*) FROM pinturas.ordenes_compra WHERE id_proveedor = $1`, [id]);
        if (parseInt(ordenes.rows[0].count) > 0)
            return res.status(400).json({ message: "No se puede eliminar: tiene órdenes de compra registradas" });
        await pool.query(`DELETE FROM pinturas.proveedor_producto    WHERE id_proveedor = $1`, [id]);
        await pool.query(`DELETE FROM pinturas.proveedor_herramienta WHERE id_proveedor = $1`, [id]);
        await pool.query(`DELETE FROM pinturas.proveedores           WHERE id_proveedor = $1`, [id]);
        res.json({ message: "Proveedor eliminado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar proveedor" }); }
});

app.get("/proveedores-ciudades", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT DISTINCT ciudad FROM pinturas.proveedores
             WHERE ciudad IS NOT NULL AND ciudad != '' ORDER BY ciudad ASC`
        );
        res.json(result.rows.map(r => r.ciudad));
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/proveedores/:id/productos", async (req, res) => {
    try {
        const { id } = req.params;
        const { id_producto, precio_costo, tiempo_entrega_dias, cantidad_minima } = req.body;
        await pool.query(
            `INSERT INTO pinturas.proveedor_producto (id_proveedor, id_producto, precio_costo, tiempo_entrega_dias, cantidad_minima, estado)
             VALUES ($1, $2, $3, $4, $5, 'activo')
             ON CONFLICT (id_proveedor, id_producto) DO UPDATE SET precio_costo=$3, tiempo_entrega_dias=$4, cantidad_minima=$5`,
            [id, id_producto, precio_costo || 0, tiempo_entrega_dias || 0, cantidad_minima || 1]
        );
        res.json({ message: "Producto vinculado correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al vincular producto" }); }
});

app.delete("/proveedores/:id/productos/:id_producto", async (req, res) => {
    try {
        const { id, id_producto } = req.params;
        await pool.query(`DELETE FROM pinturas.proveedor_producto WHERE id_proveedor=$1 AND id_producto=$2`, [id, id_producto]);
        res.json({ message: "Producto desvinculado" });
    } catch (error) { res.status(500).json({ message: "Error al desvincular" }); }
});

// ─── MEZCLAS ──────────────────────────────────────────────────────
app.get("/mezclas", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT m.*,
                    CONCAT(c.nombre, ' ', COALESCE(c.apellido,'')) AS cliente_nombre,
                    c.telefono AS cliente_tel,
                    CONCAT(e.nombres, ' ', e.apellidos) AS empleado_nombre
             FROM pinturas.mezclas m
             JOIN pinturas.clientes  c ON c.id_cliente  = m.id_cliente
             JOIN pinturas.empleados e ON e.id_empleado = m.id_empleado
             ORDER BY m.fecha_solicitud DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

app.get("/mezclas/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const mezcla = await pool.query(
            `SELECT m.*,
                    CONCAT(c.nombre, ' ', COALESCE(c.apellido,'')) AS cliente_nombre,
                    c.telefono AS cliente_tel,
                    CONCAT(e.nombres, ' ', e.apellidos) AS empleado_nombre
             FROM pinturas.mezclas m
             JOIN pinturas.clientes  c ON c.id_cliente  = m.id_cliente
             JOIN pinturas.empleados e ON e.id_empleado = m.id_empleado
             WHERE m.id_mezcla = $1`, [id]
        );
        if (mezcla.rows.length === 0) return res.status(404).json({ message: "Mezcla no encontrada" });
        const detalle = await pool.query(
            `SELECT dm.*, p.nombre AS producto_nombre, p.codigo_interno
             FROM pinturas.detalle_mezcla dm
             JOIN pinturas.productos p ON p.id_producto = dm.id_producto
             WHERE dm.id_mezcla = $1`, [id]
        );
        res.json({ ...mezcla.rows[0], detalle: detalle.rows });
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

app.post("/mezclas", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id_cliente, id_empleado, nombre_mezcla, descripcion,
                precio_mezcla, tiempo_preparacion_min, detalle } = req.body;

        const f = new Date();
        const anio = f.getFullYear();
        const mes  = String(f.getMonth() + 1).padStart(2, "0");
        const cntRes = await client.query(`SELECT COUNT(*) FROM pinturas.mezclas`);
        const num = parseInt(cntRes.rows[0].count) + 1;
        const codigo_mezcla = `MEZ-${anio}${mes}-${String(num).padStart(4, "0")}`;

        const result = await client.query(
            `INSERT INTO pinturas.mezclas
             (id_cliente, id_empleado, codigo_mezcla, nombre_mezcla, descripcion,
              precio_mezcla, tiempo_preparacion_min, estado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente') RETURNING *`,
            [id_cliente, id_empleado, codigo_mezcla, nombre_mezcla || null,
             descripcion || null, precio_mezcla || 0, tiempo_preparacion_min || 0]
        );

        const id_mezcla = result.rows[0].id_mezcla;

        if (detalle && detalle.length > 0) {
            for (const d of detalle) {
                await client.query(
                    `INSERT INTO pinturas.detalle_mezcla (id_mezcla, id_producto, cantidad_usada, unidad, observacion)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [id_mezcla, d.id_producto, d.cantidad_usada, d.unidad || "ml", d.observacion || null]
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

app.put("/mezclas/:id/estado", async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, fecha_entrega } = req.body;
        const estadosValidos = ["pendiente", "en_proceso", "lista", "entregada", "cancelada"];
        if (!estadosValidos.includes(estado))
            return res.status(400).json({ message: "Estado inválido" });
        await pool.query(
            `UPDATE pinturas.mezclas SET estado=$1, fecha_entrega=$2 WHERE id_mezcla=$3`,
            [estado, fecha_entrega || null, id]
        );
        res.json({ message: "Estado de mezcla actualizado" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar mezcla" }); }
});

app.put("/mezclas/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const { id_cliente, id_empleado, nombre_mezcla, descripcion,
                precio_mezcla, tiempo_preparacion_min, estado, detalle } = req.body;

        await client.query(
            `UPDATE pinturas.mezclas SET id_cliente=$1, id_empleado=$2, nombre_mezcla=$3,
             descripcion=$4, precio_mezcla=$5, tiempo_preparacion_min=$6, estado=$7
             WHERE id_mezcla=$8`,
            [id_cliente, id_empleado, nombre_mezcla || null, descripcion || null,
             precio_mezcla || 0, tiempo_preparacion_min || 0, estado || "pendiente", id]
        );

        await client.query(`DELETE FROM pinturas.detalle_mezcla WHERE id_mezcla = $1`, [id]);
        if (detalle && detalle.length > 0) {
            for (const d of detalle) {
                await client.query(
                    `INSERT INTO pinturas.detalle_mezcla (id_mezcla, id_producto, cantidad_usada, unidad, observacion)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [id, d.id_producto, d.cantidad_usada, d.unidad || "ml", d.observacion || null]
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

app.delete("/mezclas/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM pinturas.detalle_mezcla WHERE id_mezcla = $1`, [id]);
        await pool.query(`DELETE FROM pinturas.mezclas WHERE id_mezcla = $1`, [id]);
        res.json({ message: "Mezcla eliminada correctamente" });
    } catch (error) { res.status(500).json({ message: "Error al eliminar mezcla" }); }
});

app.get("/empleados", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT e.id_empleado, e.nombres, e.apellidos, e.cargo,
                    CONCAT(e.nombres, ' ', e.apellidos) AS nombre_completo
             FROM pinturas.empleados e
             WHERE e.estado = 'activo' ORDER BY e.nombres ASC`
        );
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error en el servidor" }); }
});

// ─── INVENTARIO ───────────────────────────────────────────────────
app.get("/inventario/resumen", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*)                                                      AS total_productos,
                COUNT(*) FILTER (WHERE pp.stock_actual = 0)                   AS sin_stock,
                COUNT(*) FILTER (WHERE pp.stock_actual > 0 AND pp.stock_actual <= pp.stock_minimo) AS stock_bajo,
                COUNT(*) FILTER (WHERE pp.stock_actual > pp.stock_minimo)     AS stock_ok,
                COALESCE(SUM(pp.stock_actual * pp.precio_costo), 0)           AS valor_total_costo,
                COALESCE(SUM(pp.stock_actual * pp.precio_venta), 0)           AS valor_total_venta
            FROM pinturas.presentacion_producto pp WHERE pp.estado = 'activo'
        `);
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ message: "Error al obtener resumen de inventario" }); }
});

app.get("/inventario/alertas", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pp.id_pres_prod, p.nombre AS producto, pr.nombre AS presentacion,
                   m.nombre AS marca, pp.stock_actual, pp.stock_minimo,
                   (pp.stock_minimo - pp.stock_actual) AS faltantes,
                   CASE WHEN pp.stock_actual = 0 THEN 'critico'
                        WHEN pp.stock_actual <= pp.stock_minimo THEN 'bajo'
                        ELSE 'ok' END AS semaforo
            FROM pinturas.presentacion_producto pp
            JOIN pinturas.productos      p  ON p.id_producto      = pp.id_producto
            JOIN pinturas.presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN pinturas.marcas    m  ON m.id_marca         = p.id_marca
            WHERE pp.estado = 'activo' AND pp.stock_actual <= pp.stock_minimo
            ORDER BY pp.stock_actual ASC LIMIT 20
        `);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error al obtener alertas" }); }
});

app.get("/inventario/stock", async (req, res) => {
    try {
        const { marca, categoria, semaforo, buscar, tipo_item } = req.query;

        const hayFiltro = marca || categoria || semaforo || buscar || tipo_item;
        if (!hayFiltro) return res.json([]);

        let condiciones = ["pp.estado = 'activo'"];
        let params = [];
        let idx = 1;

        if (tipo_item === "herramienta") {
            let hCond = ["h.estado = 'activo'"];
            let hParams = [];
            let hIdx = 1;

            if (buscar) {
                hCond.push(`(h.nombre ILIKE $${hIdx} OR h.codigo_interno ILIKE $${hIdx} OR c.nombre ILIKE $${hIdx})`);
                hParams.push(`%${buscar}%`);
                hIdx++;
            }
            if (semaforo === "critico") hCond.push(`h.stock_actual = 0`);
            else if (semaforo === "bajo") hCond.push(`h.stock_actual > 0 AND h.stock_actual <= h.stock_minimo`);
            else if (semaforo === "ok") hCond.push(`h.stock_actual > h.stock_minimo`);

            const hWhere = "WHERE " + hCond.join(" AND ");
            const hResult = await pool.query(`
                SELECT
                    NULL::int AS id_pres_prod,
                    h.id_herramienta,
                    h.nombre AS producto,
                    h.codigo_interno AS sku,
                    'Herramienta' AS presentacion,
                    h.unidad AS unidad_medida,
                    c.nombre AS marca,
                    h.stock_actual,
                    h.stock_minimo,
                    h.precio_venta,
                    h.precio_costo,
                    CASE WHEN h.stock_actual = 0 THEN 'critico'
                         WHEN h.stock_actual <= h.stock_minimo THEN 'bajo'
                         ELSE 'ok' END AS semaforo,
                    'herramienta' AS tipo_item,
                    NOW() AS fecha_registro
                FROM pinturas.herramientas h
                LEFT JOIN pinturas.categorias c ON c.id_categoria = h.id_categoria
                ${hWhere}
                ORDER BY h.nombre ASC
            `, hParams);
            return res.json(hResult.rows);
        }

        if (marca) { condiciones.push(`p.id_marca = $${idx++}`); params.push(parseInt(marca)); }
        if (categoria) {
            condiciones.push(`EXISTS (SELECT 1 FROM pinturas.producto_categoria pc2 WHERE pc2.id_producto = p.id_producto AND pc2.id_categoria = $${idx++})`);
            params.push(parseInt(categoria));
        }
        if (semaforo === "critico") condiciones.push(`pp.stock_actual = 0`);
        else if (semaforo === "bajo") condiciones.push(`pp.stock_actual > 0 AND pp.stock_actual <= pp.stock_minimo`);
        else if (semaforo === "ok") condiciones.push(`pp.stock_actual > pp.stock_minimo`);
        if (buscar) {
            condiciones.push(`(p.nombre ILIKE $${idx} OR p.codigo_interno ILIKE $${idx} OR m.nombre ILIKE $${idx} OR pr.nombre ILIKE $${idx})`);
            params.push(`%${buscar}%`);
            idx++;
        }

        const where = "WHERE " + condiciones.join(" AND ");
        const result = await pool.query(`
            SELECT pp.id_pres_prod, pp.id_producto, NULL AS id_herramienta,
                   p.nombre AS producto, p.codigo_interno AS sku,
                   pr.nombre AS presentacion, pr.volumen_cantidad, pr.unidad_medida,
                   m.nombre AS marca,
                   pp.stock_actual, pp.stock_minimo, pp.precio_venta, pp.precio_costo,
                   pp.fecha_registro,
                   CASE WHEN pp.stock_actual = 0 THEN 'critico'
                        WHEN pp.stock_actual <= pp.stock_minimo THEN 'bajo'
                        ELSE 'ok' END AS semaforo,
                   'pintura' AS tipo_item,
                   ARRAY_AGG(DISTINCT c.nombre) FILTER (WHERE c.nombre IS NOT NULL) AS categorias
            FROM pinturas.presentacion_producto pp
            JOIN pinturas.productos      p  ON p.id_producto      = pp.id_producto
            JOIN pinturas.presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN pinturas.marcas    m  ON m.id_marca         = p.id_marca
            LEFT JOIN pinturas.producto_categoria pc ON pc.id_producto = p.id_producto
            LEFT JOIN pinturas.categorias c ON c.id_categoria     = pc.id_categoria
            ${where}
            GROUP BY pp.id_pres_prod, pp.id_producto, p.nombre, p.codigo_interno,
                     pr.nombre, pr.volumen_cantidad, pr.unidad_medida, m.nombre,
                     pp.stock_actual, pp.stock_minimo, pp.precio_venta, pp.precio_costo, pp.fecha_registro
            ORDER BY CASE WHEN pp.stock_actual = 0 THEN 0 WHEN pp.stock_actual <= pp.stock_minimo THEN 1 ELSE 2 END, p.nombre ASC
        `, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al obtener stock" });
    }
});

// ── ACTUALIZAR PRECIOS en presentacion_producto — con sync_producto opcional ──
app.put("/inventario/precios/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id } = req.params;
        const { precio_costo, precio_venta, sync_producto } = req.body;

        if (isNaN(parseFloat(precio_costo)) || parseFloat(precio_costo) < 0)
            throw { status: 400, message: "Precio de costo inválido" };
        if (isNaN(parseFloat(precio_venta)) || parseFloat(precio_venta) < 0)
            throw { status: 400, message: "Precio de venta inválido" };

        await client.query(
            `UPDATE pinturas.presentacion_producto
             SET precio_costo=$1, precio_venta=$2
             WHERE id_pres_prod=$3`,
            [parseFloat(precio_costo), parseFloat(precio_venta), id]
        );

        // ── NUEVO: si sync_producto=true, actualizar también productos.precio_base ──
        if (sync_producto) {
            await client.query(
                `UPDATE pinturas.productos p
                 SET precio_base = $1
                 FROM pinturas.presentacion_producto pp
                 WHERE pp.id_pres_prod = $2 AND p.id_producto = pp.id_producto`,
                [parseFloat(precio_venta), id]
            );
        }

        await client.query("COMMIT");
        res.json({ message: "Precios actualizados en inventario" });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        if (error.status) return res.status(error.status).json({ message: error.message });
        res.status(500).json({ message: "Error al actualizar precios" });
    } finally {
        client.release();
    }
});

// ── ACTUALIZAR PRECIOS de HERRAMIENTA ────────────────────────────
app.put("/inventario/precios-herramienta/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { precio_costo, precio_venta } = req.body;
        await pool.query(
            `UPDATE pinturas.herramientas SET precio_costo=$1, precio_venta=$2 WHERE id_herramienta=$3`,
            [parseFloat(precio_costo), parseFloat(precio_venta), id]
        );
        res.json({ message: "Precios de herramienta actualizados" });
    } catch (error) { res.status(500).json({ message: "Error al actualizar precios de herramienta" }); }
});

app.get("/inventario/movimientos", async (req, res) => {
    try {
        const { desde, hasta, tipo, id_pres_prod, id_usuario, page = 1, limit = 50 } = req.query;

        let condiciones = ["mi.id_pres_prod IS NOT NULL"];
        let params = [];
        let idx = 1;

        if (desde) { condiciones.push(`mi.fecha >= $${idx++}`); params.push(desde); }
        if (hasta) { condiciones.push(`mi.fecha < $${idx++}::date + interval '1 day'`); params.push(hasta); }
        if (tipo)  { condiciones.push(`mi.tipo = $${idx++}`); params.push(tipo); }
        if (id_pres_prod) { condiciones.push(`mi.id_pres_prod = $${idx++}`); params.push(parseInt(id_pres_prod)); }
        if (id_usuario)   { condiciones.push(`mi.id_usuario = $${idx++}`); params.push(parseInt(id_usuario)); }

        const where = "WHERE " + condiciones.join(" AND ");
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const countRes = await pool.query(`SELECT COUNT(*) FROM pinturas.movimiento_inventario mi ${where}`, params);
        const total = parseInt(countRes.rows[0].count);

        const result = await pool.query(`
            SELECT mi.id_movimiento, mi.tipo, mi.cantidad, mi.stock_antes, mi.stock_despues,
                   mi.motivo, mi.notas, mi.fecha, mi.id_venta, mi.id_orden_compra,
                   p.nombre AS producto, p.codigo_interno AS sku, pr.nombre AS presentacion,
                   m.nombre AS marca, CONCAT(u.nombre, ' ', u.apellido) AS hecho_por, u.id_usuario
            FROM pinturas.movimiento_inventario mi
            JOIN pinturas.presentacion_producto pp ON pp.id_pres_prod    = mi.id_pres_prod
            JOIN pinturas.productos             p  ON p.id_producto      = pp.id_producto
            JOIN pinturas.presentaciones        pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN pinturas.marcas           m  ON m.id_marca         = p.id_marca
            JOIN pinturas.usuarios              u  ON u.id_usuario       = mi.id_usuario
            ${where}
            ORDER BY mi.fecha DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `, [...params, parseInt(limit), offset]);

        res.json({ total, page: parseInt(page), limit: parseInt(limit), paginas: Math.ceil(total / parseInt(limit)), datos: result.rows });
    } catch (error) { res.status(500).json({ message: "Error al obtener movimientos" }); }
});

app.post("/inventario/movimiento", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { id_pres_prod, tipo, cantidad, ajuste_cantidad, motivo, notas, id_usuario } = req.body;

        if (!id_pres_prod) throw { status: 400, message: "Debes seleccionar un producto." };
        if (!tipo)         throw { status: 400, message: "El tipo de movimiento es obligatorio." };
        if (!motivo?.trim()) throw { status: 400, message: "El motivo es obligatorio." };
        if (!id_usuario)   throw { status: 400, message: "No se pudo identificar el usuario." };

        const tiposValidos = ["entrada", "ajuste", "merma", "devolucion"];
        if (!tiposValidos.includes(tipo)) throw { status: 400, message: `Tipo inválido.` };
        if (tipo !== "ajuste" && (!cantidad || parseInt(cantidad) <= 0))
            throw { status: 400, message: "La cantidad debe ser mayor a 0." };
        if (tipo === "ajuste" && ajuste_cantidad === undefined)
            throw { status: 400, message: "Para ajuste debes indicar ajuste_cantidad." };

        const stockRes = await client.query(
            `SELECT stock_actual FROM pinturas.presentacion_producto WHERE id_pres_prod = $1 FOR UPDATE`,
            [id_pres_prod]
        );
        if (stockRes.rows.length === 0) throw { status: 404, message: "Producto no encontrado." };

        const stock_antes = parseInt(stockRes.rows[0].stock_actual);
        const cant = parseInt(cantidad) || 0;
        const ajuste = parseInt(ajuste_cantidad) || 0;
        let stock_despues, cant_registrar;

        switch (tipo) {
            case "entrada":
            case "devolucion": stock_despues = stock_antes + cant; cant_registrar = cant; break;
            case "merma":
                stock_despues = stock_antes - cant;
                if (stock_despues < 0) throw { status: 400, message: `Stock insuficiente. Stock actual: ${stock_antes}` };
                cant_registrar = cant;
                break;
            case "ajuste":
                stock_despues = stock_antes + ajuste;
                if (stock_despues < 0) throw { status: 400, message: `Ajuste inválido: resultaría en stock negativo.` };
                cant_registrar = Math.abs(ajuste);
                break;
        }

        const movRes = await client.query(
            `INSERT INTO pinturas.movimiento_inventario
             (id_pres_prod, id_usuario, tipo, cantidad, stock_antes, stock_despues, motivo, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [id_pres_prod, id_usuario, tipo, cant_registrar, stock_antes, stock_despues, motivo.trim(), notas?.trim() || null]
        );

        await client.query("COMMIT");
        res.json({ message: "Movimiento registrado correctamente", movimiento: movRes.rows[0], stock_antes, stock_despues });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        if (error.status) return res.status(error.status).json({ message: error.message });
        res.status(500).json({ message: "Error interno al registrar movimiento" });
    } finally {
        client.release();
    }
});

app.get("/inventario/usuarios", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT u.id_usuario, CONCAT(u.nombre, ' ', u.apellido) AS nombre_completo
            FROM pinturas.movimiento_inventario mi
            JOIN pinturas.usuarios u ON u.id_usuario = mi.id_usuario
            ORDER BY nombre_completo ASC
        `);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error al obtener usuarios" }); }
});

app.get("/inventario/presentaciones", async (req, res) => {
    try {
        const { buscar } = req.query;
        let condiciones = ["pp.estado = 'activo'"];
        let params = [];
        if (buscar) {
            condiciones.push(`(p.nombre ILIKE $1 OR pr.nombre ILIKE $1 OR m.nombre ILIKE $1 OR p.codigo_interno ILIKE $1)`);
            params.push(`%${buscar}%`);
        }
        const where = "WHERE " + condiciones.join(" AND ");
        const result = await pool.query(`
            SELECT pp.id_pres_prod, pp.stock_actual, pp.stock_minimo,
                    p.nombre AS producto, p.codigo_interno AS sku, pr.nombre AS presentacion, m.nombre AS marca
            FROM pinturas.presentacion_producto pp
            JOIN pinturas.productos      p  ON p.id_producto      = pp.id_producto
            JOIN pinturas.presentaciones pr ON pr.id_presentacion = pp.id_presentacion
            LEFT JOIN pinturas.marcas    m  ON m.id_marca         = p.id_marca
            ${where}
            ORDER BY p.nombre ASC, pr.nombre ASC LIMIT 30
        `, params);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ message: "Error al obtener presentaciones" }); }
});

// ─── SERVER ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Servidor activo en puerto ${PORT}`); });

process.on("uncaughtException",   (err)    => { console.error("Error no capturado:", err); });
process.on("unhandledRejection",  (reason) => { console.error("Promesa rechazada:", reason); });