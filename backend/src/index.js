"use strict";

const express = require("express");
const cors    = require("cors");
require("dotenv").config({ path: "./config/.env" });

const pool    = require("./database/postgres");
const catalogo = require("./services/catalogoService");
const {
    esTipoCatalogoValido,
    esHerramienta,
    esProducto,
    normalizarTipoItem,
} = require("./constants/tipoItem");

// ─── Routers ──────────────────────────────────────────────────────
const routerUsuarios      = require("../routers/router.usuarios");
const routerClientes      = require("../routers/router.clientes");
const routerProveedores   = require("../routers/router.proveedores");
const routerProductos     = require("../routers/router.producto");
const routerMarcas        = require("../routers/router.marcas");
const routerCategorias    = require("../routers/router.categoria");
const routerPresentaciones= require("../routers/router.presentaciones");
const routerInventario    = require("../routers/router.inventario");
const routerVentas        = require("../routers/router.ventas");
const routerMezclas       = require("../routers/router.mesclas");
const routerHerramientas  = require("../routers/router.herramientas");
const routerPerfiles      = require("../routers/router.perfiles");

// ─── App ──────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const path = require("path");

// Sirve los archivos estáticos del frontend
app.use(express.static(path.join(__dirname, "../../frontend")));

// Ruta fija /dashboard
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "../../frontend/pages/dashboard.html"));
});

// Health check
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
            `SELECT u.*, p.nombre AS rol_nombre
             FROM usuarios u
             LEFT JOIN perfiles p ON u.id_perfil = p.id_perfil
             WHERE u.correo = $1`,
            [username]
        );

        if (result.rows.length === 0)
            return res.json({ message: "Usuario no registrado" });

        const usuario = result.rows[0];

        // Verifica password con pgcrypto (crypt)
        const checkPass = await pool.query(
            `SELECT (password_hash = crypt($1, password_hash)) AS ok
             FROM usuarios WHERE id_usuario = $2`,
            [password, usuario.id_usuario]
        );

        if (!checkPass.rows[0].ok)
            return res.json({ message: "Contraseña incorrecta" });

        if (usuario.estado !== "activo")
            return res.json({ message: "Usuario inactivo o bloqueado" });

        res.json({
            message: "Acceso concedido, " + usuario.nombre,
            user: usuario.nombre,
            rol: usuario.rol_nombre,
            id: usuario.id_usuario
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// ─── TIPOS PINTURA ────────────────────────────────────────────────
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

// ─── EMPLEADOS ────────────────────────────────────────────────────
app.get("/empleados", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT e.id_empleado,
                    u.nombre,
                    e.cargo,
                    u.nombre AS nombre_completo
             FROM empleados e
             JOIN usuarios u ON u.id_usuario = e.id_usuario
             WHERE e.estado = 'activo'
             ORDER BY u.nombre ASC`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error en el servidor" });
    }
});

// ─── CATÁLOGO UNIFICADO ───────────────────────────────────────────
app.get("/catalogo", async (req, res) => {
    try {
        res.json(await catalogo.listarCatalogo(pool));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al cargar catálogo" });
    }
});

app.post("/catalogo", async (req, res) => {
    try {
        const tipo = normalizarTipoItem(req.body.tipo_item);
        if (!esTipoCatalogoValido(tipo))
            return res.status(400).json({ message: "tipo_item debe ser 'producto' o 'herramienta'" });

        if (esHerramienta(tipo)) {
            if (!req.body.nombre?.trim())
                return res.status(400).json({ message: "El nombre es obligatorio" });
            const idCat = req.body.id_categoria || req.body.categorias?.[0];
            if (!idCat)
                return res.status(400).json({ message: "Selecciona una categoría de herramienta" });
            const catsRes = await pool.query(
                `SELECT id_categoria, id_padre, nombre, estado FROM categorias`
            );
            const out = await catalogo.crearHerramienta(pool, req.body, catsRes.rows);
            return res.json({ message: "Herramienta creada correctamente", ...out });
        }

        const { id_marca, id_tipo, nombre, precio_base } = req.body;
        if (!nombre?.trim())    return res.status(400).json({ message: "El nombre es obligatorio" });
        if (!id_marca)          return res.status(400).json({ message: "La marca es obligatoria para pinturas" });
        if (!id_tipo)           return res.status(400).json({ message: "El tipo de pintura es obligatorio" });
        if (precio_base == null || precio_base === "")
            return res.status(400).json({ message: "El precio base es obligatorio" });

        const out = await catalogo.crearProducto(pool, req.body);
        res.json({ message: "Producto creado correctamente", ...out });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message });
        if (error.code === "23505") return res.status(400).json({ message: "El código interno ya existe" });
        console.error(error);
        res.status(500).json({ message: "Error al crear ítem del catálogo" });
    }
});

app.put("/catalogo/:tipo_item/:id", async (req, res) => {
    try {
        const tipo = normalizarTipoItem(req.params.tipo_item);
        const id   = parseInt(req.params.id, 10);
        if (!esTipoCatalogoValido(tipo))
            return res.status(400).json({ message: "tipo_item inválido" });

        if (esHerramienta(tipo)) {
            if (!req.body.nombre?.trim())
                return res.status(400).json({ message: "El nombre es obligatorio" });
            const idCat = req.body.id_categoria || req.body.categorias?.[0];
            if (!idCat)
                return res.status(400).json({ message: "Selecciona una categoría de herramienta" });
            const catsRes = await pool.query(
                `SELECT id_categoria, id_padre, nombre, estado FROM categorias`
            );
            await catalogo.actualizarHerramienta(pool, id, req.body, catsRes.rows);
            return res.json({ message: "Herramienta actualizada correctamente" });
        }

        const { id_marca, id_tipo, nombre, precio_base } = req.body;
        if (!nombre?.trim())  return res.status(400).json({ message: "El nombre es obligatorio" });
        if (!id_marca)        return res.status(400).json({ message: "La marca es obligatoria" });
        if (!id_tipo)         return res.status(400).json({ message: "El tipo de pintura es obligatorio" });
        if (precio_base == null || precio_base === "")
            return res.status(400).json({ message: "El precio base es obligatorio" });

        await catalogo.actualizarProducto(pool, id, req.body);
        res.json({ message: "Producto actualizado correctamente" });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message });
        if (error.code === "23505") return res.status(400).json({ message: "El código interno ya existe" });
        console.error(error);
        res.status(500).json({ message: "Error al actualizar ítem del catálogo" });
    }
});

app.delete("/catalogo/:tipo_item/:id", async (req, res) => {
    try {
        const tipo = normalizarTipoItem(req.params.tipo_item);
        const id   = parseInt(req.params.id, 10);
        await catalogo.eliminarCatalogo(pool, tipo, id);
        res.json({ message: "Ítem eliminado correctamente" });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message });
        res.status(500).json({ message: "Error al eliminar ítem del catálogo" });
    }
});

// ─── CATÁLOGO PÚBLICO (web) ───────────────────────────────────────
app.get("/public/catalogo", async (req, res) => {
    try {
        const buscar    = (req.query.buscar || "").trim();
        const categoria = req.query.categoria || "";
        let q = `
            SELECT p.id_producto, p.nombre, p.descripcion,
                   p.codigo_barras, m.nombre AS marca,
                   MIN(pp.precio_venta) AS precio_desde,
                   SUM(pp.stock_actual)::int AS stock_total
            FROM productos p
            LEFT JOIN marcas m ON m.id_marca = p.id_marca
            LEFT JOIN producto_presentacion pp
                ON pp.id_producto = p.id_producto
            LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
            WHERE p.estado = 'activo'`;
        const vals = [];
        if (buscar) {
            vals.push(`%${buscar}%`);
            q += ` AND (p.nombre ILIKE $${vals.length} OR p.codigo_barras ILIKE $${vals.length})`;
        }
        if (categoria) {
            vals.push(categoria);
            q += ` AND c.id_categoria = $${vals.length}`;
        }
        q += ` GROUP BY p.id_producto, m.nombre ORDER BY p.nombre`;
        res.json((await pool.query(q, vals)).rows);
    } catch (error) {
        res.status(500).json({ message: "Error al cargar catálogo público" });
    }
});

// ─── Montaje de routers ───────────────────────────────────────────
app.use("/usuarios",       routerUsuarios);
app.use("/clientes",       routerClientes);
app.use("/proveedores",    routerProveedores);
app.use("/productos",      routerProductos);
app.use("/marcas",         routerMarcas);
app.use("/categorias",     routerCategorias);
app.use("/presentaciones", routerPresentaciones);
app.use("/inventario",     routerInventario);
app.use("/ventas",         routerVentas);
app.use("/mezclas",        routerMezclas);
app.use("/herramientas",   routerHerramientas);
app.use("/roles",          routerPerfiles);

// ─── Server ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor activo en puerto ${PORT}`));

process.on("uncaughtException",  err    => console.error("Error no capturado:", err));
process.on("unhandledRejection", reason => console.error("Promesa rechazada:", reason));