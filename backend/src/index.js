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

// ─────────────────────────────
// HEALTH CHECK
// ─────────────────────────────
app.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ message: "PostgreSQL conectado", date: result.rows[0] });
    } catch (error) {
        res.status(500).json({ message: "Error de conexión" });
    }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const result = await pool.query(
            `SELECT u.*, r.nombre AS rol_nombre
             FROM pinturas.usuarios u
             LEFT JOIN pinturas.roles r ON u.id_rol = r.id_rol
             WHERE u.correo = $1`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.json({ message: "Usuario no registrado" });
        }

        const usuario = result.rows[0];

        // Verificar contraseña con pgcrypto (bcrypt)
        const checkPass = await pool.query(
            `SELECT (contrasena = crypt($1, contrasena)) AS ok
             FROM pinturas.usuarios WHERE id_usuario = $2`,
            [password, usuario.id_usuario]
        );

        if (!checkPass.rows[0].ok) {
            return res.json({ message: "Contraseña incorrecta" });
        }

        if (usuario.estado !== "activo") {
            return res.json({ message: "Usuario inactivo o bloqueado" });
        }

        // Actualizar último login
        await pool.query(
            `UPDATE pinturas.usuarios SET ultimo_login = NOW() WHERE id_usuario = $1`,
            [usuario.id_usuario]
        );

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

// ─────────────────────────────
// ROLES
// ─────────────────────────────
app.get("/roles", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, COUNT(u.id_usuario) AS total_usuarios
             FROM pinturas.roles r
             LEFT JOIN pinturas.usuarios u ON u.id_rol = r.id_rol
             GROUP BY r.id_rol
             ORDER BY r.id_rol ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

app.post("/roles", async (req, res) => {
    try {
        const { nombre, descripcion, estado } = req.body;
        await pool.query(
            `INSERT INTO pinturas.roles (nombre, descripcion, estado) VALUES ($1, $2, $3)`,
            [nombre, descripcion, estado ?? "activo"]
        );
        res.json({ message: "Rol creado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al crear rol" });
    }
});

app.put("/roles/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, estado } = req.body;
        await pool.query(
            `UPDATE pinturas.roles SET nombre=$1, descripcion=$2, estado=$3 WHERE id_rol=$4`,
            [nombre, descripcion, estado, id]
        );
        res.json({ message: "Rol actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar rol" });
    }
});

app.delete("/roles/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const enUso = await pool.query(
            `SELECT COUNT(*) FROM pinturas.usuarios WHERE id_rol = $1`,
            [id]
        );

        if (parseInt(enUso.rows[0].count) > 0) {
            return res.status(400).json({
                message: "No se puede eliminar: hay usuarios con este rol"
            });
        }

        await pool.query(`DELETE FROM pinturas.roles WHERE id_rol = $1`, [id]);
        res.json({ message: "Rol eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar rol" });
    }
});

// ─────────────────────────────
// PERMISOS POR ROL
// ─────────────────────────────
app.get("/roles/:id/permisos", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT modulo, accion FROM pinturas.permisos_rol WHERE id_rol = $1`,
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener permisos" });
    }
});

app.post("/roles/:id/permisos", async (req, res) => {
    try {
        const { id } = req.params;
        const { permisos } = req.body; // [{ modulo: "ventas", accion: "ver" }, ...]

        await pool.query(`DELETE FROM pinturas.permisos_rol WHERE id_rol = $1`, [id]);

        for (const p of permisos) {
            await pool.query(
                `INSERT INTO pinturas.permisos_rol (id_rol, modulo, accion) VALUES ($1, $2, $3)
                 ON CONFLICT (id_rol, modulo, accion) DO NOTHING`,
                [id, p.modulo, p.accion]
            );
        }

        res.json({ message: "Permisos guardados correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al guardar permisos" });
    }
});

// ─────────────────────────────
// USUARIOS
// ─────────────────────────────
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
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
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
        if (error.code === "23505") {
            return res.status(400).json({ message: "El correo ya está registrado" });
        }
        res.status(500).json({ message: "Error al crear usuario" });
    }
});

app.put("/usuarios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, correo, id_rol, estado } = req.body;

        await pool.query(
            `UPDATE pinturas.usuarios
             SET nombre=$1, apellido=$2, correo=$3, id_rol=$4, estado=$5
             WHERE id_usuario=$6`,
            [nombre, apellido, correo, id_rol, estado, id]
        );

        res.json({ message: "Usuario actualizado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar usuario" });
    }
});

app.put("/usuarios/:id/password", async (req, res) => {
    try {
        const { id } = req.params;
        const { contrasena } = req.body;

        await pool.query(
            `UPDATE pinturas.usuarios
             SET contrasena = crypt($1, gen_salt('bf'))
             WHERE id_usuario = $2`,
            [contrasena, id]
        );

        res.json({ message: "Contraseña actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar contraseña" });
    }
});

app.delete("/usuarios/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(
            `DELETE FROM pinturas.usuarios WHERE id_usuario = $1`, [id]
        );
        res.json({ message: "Usuario eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar usuario" });
    }
});


// ─────────────────────────────
// CATEGORÍAS
// ─────────────────────────────

// GET todas las categorías con nombre del padre
app.get("/categorias", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, p.nombre AS nombre_padre
             FROM pinturas.categorias c
             LEFT JOIN pinturas.categorias p ON p.id_categoria = c.id_padre
             ORDER BY COALESCE(c.id_padre, c.id_categoria), c.id_categoria ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST crear categoría
app.post("/categorias", async (req, res) => {
    try {
        const { nombre, descripcion, id_padre, estado } = req.body;
        await pool.query(
            `INSERT INTO pinturas.categorias (nombre, descripcion, id_padre, estado)
             VALUES ($1, $2, $3, $4)`,
            [nombre, descripcion || null, id_padre || null, estado ?? "activo"]
        );
        res.json({ message: "Categoría creada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al crear categoría" });
    }
});

// PUT editar categoría
app.put("/categorias/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, id_padre, estado } = req.body;

        // Evitar que una categoría sea su propio padre
        if (parseInt(id_padre) === parseInt(id)) {
            return res.status(400).json({ message: "Una categoría no puede ser su propio padre" });
        }

        await pool.query(
            `UPDATE pinturas.categorias
             SET nombre=$1, descripcion=$2, id_padre=$3, estado=$4
             WHERE id_categoria=$5`,
            [nombre, descripcion || null, id_padre || null, estado, id]
        );
        res.json({ message: "Categoría actualizada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al actualizar categoría" });
    }
});

// DELETE eliminar categoría
app.delete("/categorias/:id", async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar si tiene subcategorías
        const hijos = await pool.query(
            `SELECT COUNT(*) FROM pinturas.categorias WHERE id_padre = $1`, [id]
        );
        if (parseInt(hijos.rows[0].count) > 0) {
            return res.status(400).json({
                message: "No se puede eliminar: tiene subcategorías asociadas"
            });
        }

        // Verificar si tiene productos asociados
        const productos = await pool.query(
            `SELECT COUNT(*) FROM pinturas.producto_categoria WHERE id_categoria = $1`, [id]
        );
        if (parseInt(productos.rows[0].count) > 0) {
            return res.status(400).json({
                message: "No se puede eliminar: tiene productos asociados"
            });
        }

        await pool.query(`DELETE FROM pinturas.categorias WHERE id_categoria = $1`, [id]);
        res.json({ message: "Categoría eliminada correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar categoría" });
    }
});


// ─────────────────────────────
// PRODUCTOS
// ─────────────────────────────

// GET todos los productos con marca, tipo y categorías
app.get("/productos", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*,
                    m.nombre AS marca_nombre,
                    t.nombre AS tipo_nombre,
                    ARRAY_AGG(DISTINCT c.nombre) FILTER (WHERE c.nombre IS NOT NULL) AS categorias
             FROM productos p
             LEFT JOIN marcas m          ON m.id_marca   = p.id_marca
             LEFT JOIN tipos_pintura t   ON t.id_tipo    = p.id_tipo
             LEFT JOIN producto_categoria pc ON pc.id_producto = p.id_producto
             LEFT JOIN categorias c      ON c.id_categoria = pc.id_categoria
             GROUP BY p.id_producto, m.nombre, t.nombre
             ORDER BY p.id_producto ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET marcas para el select
app.get("/marcas", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM marcas WHERE estado = 'activo' ORDER BY nombre ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// GET tipos de pintura para el select
app.get("/tipos-pintura", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM tipos_pintura ORDER BY nombre ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// POST crear producto
app.post("/productos", async (req, res) => {
    try {
        const {
            id_marca, id_tipo, nombre, descripcion, codigo_interno,
            precio_base, unidad_medida, es_mezcable, estado,
            imagen_url, fecha_caducidad, categorias
        } = req.body;

        const result = await pool.query(
            `INSERT INTO productos (id_marca, id_tipo, nombre, descripcion, codigo_interno,
             precio_base, unidad_medida, es_mezcable, estado, imagen_url, fecha_caducidad)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id_producto`,
            [id_marca, id_tipo, nombre, descripcion || null, codigo_interno || null,
             precio_base, unidad_medida ?? "litro", es_mezcable ?? false,
             estado ?? "activo", imagen_url || null, fecha_caducidad || null]
        );

        const id_producto = result.rows[0].id_producto;

        // Insertar categorías
        if (categorias && categorias.length > 0) {
            for (const id_cat of categorias) {
                await pool.query(
                    `INSERT INTO producto_categoria (id_producto, id_categoria)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [id_producto, id_cat]
                );
            }
        }

        res.json({ message: "Producto creado correctamente" });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ message: "El código interno ya existe" });
        }
        console.error(error);
        res.status(500).json({ message: "Error al crear producto" });
    }
});

// PUT editar producto
app.put("/productos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const {
            id_marca, id_tipo, nombre, descripcion, codigo_interno,
            precio_base, unidad_medida, es_mezcable, estado,
            imagen_url, fecha_caducidad, categorias
        } = req.body;

        await pool.query(
            `UPDATE productos SET
             id_marca=$1, id_tipo=$2, nombre=$3, descripcion=$4, codigo_interno=$5,
             precio_base=$6, unidad_medida=$7, es_mezcable=$8, estado=$9,
             imagen_url=$10, fecha_caducidad=$11
             WHERE id_producto=$12`,
            [id_marca, id_tipo, nombre, descripcion || null, codigo_interno || null,
             precio_base, unidad_medida, es_mezcable,
             estado, imagen_url || null, fecha_caducidad || null, id]
        );

        // Actualizar categorías
        await pool.query(`DELETE FROM producto_categoria WHERE id_producto = $1`, [id]);
        if (categorias && categorias.length > 0) {
            for (const id_cat of categorias) {
                await pool.query(
                    `INSERT INTO producto_categoria (id_producto, id_categoria)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [id, id_cat]
                );
            }
        }

        res.json({ message: "Producto actualizado correctamente" });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(400).json({ message: "El código interno ya existe" });
        }
        res.status(500).json({ message: "Error al actualizar producto" });
    }
});

// DELETE eliminar producto
app.delete("/productos/:id", async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(`DELETE FROM producto_categoria WHERE id_producto = $1`, [id]);
        await pool.query(`DELETE FROM productos WHERE id_producto = $1`, [id]);

        res.json({ message: "Producto eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ message: "Error al eliminar producto" });
    }
});
// ─────────────────────────────
// SERVER
// ─────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});


process.on('uncaughtException', (err) => {
    console.error('Error no capturado:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Promesa rechazada:', reason);
});