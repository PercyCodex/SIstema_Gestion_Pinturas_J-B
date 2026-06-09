"use strict";

/**
 * router.js — SPA Router para Pinturas Universal J&B
 * Carga módulos dinámicamente inyectando solo el contenido de #dashboard-content.
 * La URL siempre permanece en /dashboard.
 */

// ─── Mapa de módulos ──────────────────────────────────────────────
const MODULE_FILES = {
    dashboard:         "dashboard.html",
    usuarios:          "usuarios.html",
    perfiles:          "perfiles.html",
    categorias:        "categoria.html",
    marcas:            "marcas.html",
    inventario:        "inventario.html",
    productos:         "productos.html",
    ventas:            "ventas.html",
    clientes:          "clientes.html",
    presentaciones:    "presentaciones.html",
    proveedores:       "proveedores.html",
    mezclas:           "mezclas.html",
    "gestion-tienda":  "gestion_tienda.html",
    cotizaciones:      "cotizaciones.html",
    configuraciones:   "configuraciones.html",
};

// Script JS asociado a cada módulo (los que tienen lógica propia)
const MODULE_SCRIPTS = {
    usuarios:          "usuarios.js",
    perfiles:          "perfiles.js",
    categorias:        "categoria.js",
    marcas:            "marcas.js",
    inventario:        "inventario.js",
    productos:         "productos.js",
    ventas:            "ventas.js",
    clientes:          "cliente.js",
    presentaciones:    "presentaciones.js",
    proveedores:       "proveedores.js",
    mezclas:           "mezclas.js",
};

// Títulos para el header
const MODULE_TITLES = {
    dashboard:         "Dashboard",
    usuarios:          "Usuarios",
    perfiles:          "Roles y Permisos",
    categorias:        "Categorías",
    marcas:            "Marcas",
    inventario:        "Inventario",
    productos:         "Productos",
    ventas:            "Ventas",
    clientes:          "Clientes",
    presentaciones:    "Presentaciones",
    proveedores:       "Proveedores",
    mezclas:           "Mezclas",
    "gestion-tienda":  "Gestión Tienda",
    cotizaciones:      "Cotizaciones",
    configuraciones:   "Configuraciones",
};

// ─── Estado ───────────────────────────────────────────────────────
let moduloActual = null;
let cargando     = false;

// ─── Función principal: cargar módulo ────────────────────────────
async function cargarModulo(nombre) {
    if (!nombre || cargando) return;
    if (!MODULE_FILES[nombre]) {
        console.warn(`[Router] Módulo desconocido: "${nombre}"`);
        return;
    }
    // No recargar el mismo módulo (salvo forzar)
    if (nombre === moduloActual) return;

    cargando = true;

    const contenedor = document.getElementById("app-content");
    if (!contenedor) {
        cargando = false;
        return;
    }

    // Mostrar spinner mientras carga
    contenedor.innerHTML = `
        <div style="
            display:flex;align-items:center;justify-content:center;
            height:320px;gap:14px;
            color:rgba(255,255,255,0.65);font-size:14px;font-family:inherit;">
            <div style="
                width:26px;height:26px;
                border:3px solid rgba(255,255,255,0.2);
                border-top-color:#fff;
                border-radius:50%;
                animation:_r_spin 0.7s linear infinite;"></div>
            Cargando módulo…
        </div>
        <style>@keyframes _r_spin{to{transform:rotate(360deg)}}</style>
    `;

    try {
        // 1. Obtener el HTML de la página del módulo
        const res = await fetch(`/pages/${MODULE_FILES[nombre]}?_t=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${MODULE_FILES[nombre]}`);

        const html = await res.text();

        // 2. Parsear y extraer solo el #dashboard-content
        const parser  = new DOMParser();
        const doc     = parser.parseFromString(html, "text/html");
        const section = doc.getElementById("dashboard-content");

        if (section) {
            contenedor.innerHTML = section.innerHTML;
        } else {
            // Fallback: inyectar todo el body si no hay #dashboard-content
            const body = doc.body;
            contenedor.innerHTML = body ? body.innerHTML : html;
        }

        // 3. Re-ejecutar scripts inline que vengan dentro del contenido extraído
        // (DOMParser no ejecuta <script>, necesitamos recrearlos)
        _reejecutarScriptsInline(contenedor);

        // 4. Cargar el script JS del módulo de forma dinámica
        await _cargarScriptModulo(nombre);

        // 5. Actualizar sidebar (ítem activo)
        _actualizarSidebarActivo(nombre);

        // 6. Actualizar título en el header
        const pageTitle = document.getElementById("page-title");
        if (pageTitle) pageTitle.textContent = MODULE_TITLES[nombre] || nombre;

        // 7. Inicializar el nombre de usuario en el sidebar
        // (sidebar.js lo hace por DOMContentLoaded, pero al inyectar nuevo HTML necesitamos repetirlo)
        _refrescarBienvenida();

        moduloActual = nombre;

    } catch (err) {
        console.error(`[Router] Error cargando módulo "${nombre}":`, err);
        contenedor.innerHTML = `
            <div style="
                display:flex;flex-direction:column;align-items:center;
                justify-content:center;height:320px;gap:16px;
                color:rgba(255,255,255,0.75);font-family:inherit;">
                <div style="font-size:44px">⚠️</div>
                <div style="font-size:18px;font-weight:700">
                    Error al cargar el módulo
                </div>
                <div style="font-size:13px;opacity:0.6;">${err.message}</div>
                <button onclick="cargarModulo('dashboard')" style="
                    margin-top:8px;padding:10px 28px;
                    background:#2563eb;color:#fff;
                    border:none;border-radius:8px;
                    cursor:pointer;font-weight:600;font-size:14px;
                    font-family:inherit;">
                    Volver al Dashboard
                </button>
            </div>
        `;
    } finally {
        cargando = false;
    }
}

// ─── Re-ejecutar scripts inline del contenido inyectado ──────────
function _reejecutarScriptsInline(contenedor) {
    const scripts = contenedor.querySelectorAll("script");
    scripts.forEach(oldScript => {
        // Solo scripts inline (sin src), los externos se cargan con _cargarScriptModulo
        if (oldScript.src) return;
        const newScript = document.createElement("script");
        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
    });
}

// ─── Cargar script JS del módulo dinámicamente ───────────────────
function _cargarScriptModulo(nombre) {
    return new Promise((resolve) => {
        const archivo = MODULE_SCRIPTS[nombre];
        if (!archivo) {
            resolve(); // El módulo no tiene script propio (ej: dashboard simple)
            return;
        }

        // Eliminar script anterior del mismo módulo para evitar duplicados
        const anterior = document.getElementById("_script_modulo_activo");
        if (anterior) anterior.remove();

        // Limpiar variables globales del módulo anterior para evitar colisiones
        _limpiarEstadoModuloAnterior();

        const script    = document.createElement("script");
        script.id       = "_script_modulo_activo";
        script.src      = `/scripts/${archivo}?_t=${Date.now()}`;
        script.onload   = () => resolve();
        script.onerror  = (e) => {
            console.warn(`[Router] No se pudo cargar script: ${archivo}`, e);
            resolve(); // No fallar el cargado del módulo por un script faltante
        };
        document.body.appendChild(script);
    });
}

// ─── Limpiar estado global de módulos anteriores ─────────────────
function _limpiarEstadoModuloAnterior() {
    // Limpiar timers de debounce que puedan quedar colgados
    // (Los módulos usan variables locales dentro de IIFE o con const/let,
    //  pero algunas exponen funciones globales que podemos limpiar)
    const funcionesModulos = [
        // Usuarios
        "filtrarUsuarios", "abrirModalCrear", "abrirModalEditar",
        "cerrarModal", "guardarUsuario", "confirmarEliminar",
        // Clientes
        "filtrarClientes", "guardarCliente",
        // Categorías
        "filtrarCategorias", "guardarCategoria",
        // Marcas
        "filtrarMarcas", "guardarMarca",
        // Inventario
        "filtrarStock", "debounceSearch",
        // Productos
        "filtrarProductos", "guardarProducto",
        // Ventas
        "filtrarVentas", "abrirModalNuevaVenta",
        // Presentaciones
        "filtrarPresentaciones", "guardarPresentacion",
        // Proveedores
        "filtrarProveedores", "guardarProveedor",
        // Mezclas
        "filtrarMezclas", "guardarMezcla",
        // Perfiles
        "filtrarRoles", "guardarPerfil",
    ];
    // No eliminamos las funciones globales porque el nuevo script las sobreescribirá.
    // Solo necesitamos asegurarnos de que no queden event listeners colgados,
    // lo cual se resuelve porque inyectamos HTML nuevo cada vez.
}

// ─── Actualizar ítem activo en el sidebar ────────────────────────
function _actualizarSidebarActivo(nombre) {
    document.querySelectorAll("#navegador [data-modulo]").forEach(el => {
        el.classList.toggle("nav-active", el.dataset.modulo === nombre);
    });
}

// ─── Refrescar nombre de bienvenida ──────────────────────────────
function _refrescarBienvenida() {
    // El sidebar principal de app.html tiene su propio #bienvenida
    // (ya lo maneja el DOMContentLoaded de app.html)
    // Solo necesitamos asegurarnos que no haya un segundo #bienvenida en el contenido inyectado
    const bienvenidas = document.querySelectorAll("#bienvenida");
    bienvenidas.forEach(el => {
        if (!el.textContent) {
            el.textContent = localStorage.getItem("nombreUsuario") || "";
        }
    });
}

// ─── Inicializar router: convertir links del sidebar en botones SPA ──
function _inicializarRouter() {
    const nav = document.getElementById("navegador");
    if (!nav) return;

    // Convertir <a href="/modulo"> → <a data-modulo="modulo"> (sin href)
    nav.querySelectorAll("a[href]").forEach(a => {
        const href = (a.getAttribute("href") || "").trim();

        // Extraer nombre de módulo de la ruta (ej: "/usuarios" → "usuarios")
        let modulo = href
            .replace(/^\//, "")           // quitar "/" inicial
            .replace(/\.html$/, "")        // quitar .html
            .replace(/^pages\//, "")       // quitar pages/
            .replace(/_/g, "-");           // normalizar guiones bajos

        // Casos especiales
        if (modulo === "categoria") modulo = "categorias";
        if (modulo === "gestion-tienda") modulo = "gestion-tienda";

        if (!MODULE_FILES[modulo]) return; // No es un módulo conocido

        a.setAttribute("data-modulo", modulo);
        a.removeAttribute("href");
        a.style.cursor = "pointer";
    });

    // Escuchar clics en el sidebar (delegación)
    nav.addEventListener("click", function (e) {
        const el = e.target.closest("[data-modulo]");
        if (!el) return;
        e.preventDefault();
        e.stopPropagation();
        cargarModulo(el.dataset.modulo);
    });
}

// ─── Exponer globalmente ──────────────────────────────────────────
window.cargarModulo    = cargarModulo;
window.moduloActual    = () => moduloActual;

// ─── Arrancar ────────────────────────────────────────────────────
function _arrancar() {
    _inicializarRouter();
    cargarModulo("dashboard");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _arrancar);
} else {
    _arrancar();
}