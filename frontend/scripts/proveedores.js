"use strict";

// ─── Estado global ────────────────────────────────────────────────────────────
const db = {
    proveedores:    [],
    editandoId:     null,
    eliminandoId:   null,
    eliminandoNombre: null,
    viendo:         null,   // objeto completo del proveedor en detalle
};

const API            = "http://localhost:3000";
const rolActual      = localStorage.getItem("rolUsuario");
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

// ─── Inicialización ───────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    iniciarPagina();
});

async function iniciarPagina() {
    mostrarSpinner(true);
    try {
        const [resProveedores, resCiudades] = await Promise.all([
            fetch(`${API}/proveedores`),
            fetch(`${API}/proveedores-ciudades`),
        ]);

        if (!resProveedores.ok) throw new Error("Error al cargar proveedores");

        db.proveedores = await resProveedores.json();
        const ciudades = await resCiudades.json();

        llenarFiltroCiudad(ciudades);
        actualizarStats();
        mostrarMensajeInicial();
        actualizarContador(0);

    } catch (err) {
        mostrarError(`No se pudieron cargar los proveedores: ${err.message}`);
    } finally {
        mostrarSpinner(false);
    }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function actualizarStats() {
    const total       = db.proveedores.length;
    const activos     = db.proveedores.filter(p => p.estado === "activo").length;
    const conProd     = db.proveedores.filter(p => parseInt(p.total_productos) > 0).length;
    const ciudades    = new Set(db.proveedores.map(p => p.ciudad).filter(Boolean)).size;

    setText("statTotal",       total);
    setText("statActivos",     activos);
    setText("statConProductos", conProd);
    setText("statCiudades",    ciudades);
}

// ─── Llenar filtro ciudad ─────────────────────────────────────────────────────
function llenarFiltroCiudad(ciudades) {
    const sel = document.getElementById("filtroCiudad");
    sel.innerHTML = `<option value="">Todas las ciudades</option>`;
    ciudades.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
    });
}

// ─── Mensaje inicial ──────────────────────────────────────────────────────────
function mostrarMensajeInicial() {
    document.getElementById("cuerpoProveedores").innerHTML = `
        <tr>
            <td colspan="7" class="tabla-vacia">
                <span class="vacia-icono">🔍</span>
                <span class="vacia-texto">Busca o filtra para ver los proveedores</span>
            </td>
        </tr>`;
}

// ─── Render tabla ─────────────────────────────────────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoProveedores");
    tbody.innerHTML = "";

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="tabla-vacia">
                    <span class="vacia-icono">🏢</span>
                    <span class="vacia-texto">No se encontraron proveedores</span>
                    <span class="vacia-sub">Intenta con otros filtros</span>
                </td>
            </tr>`;
        return;
    }

    lista.forEach((p, idx) => {
        const tr = document.createElement("tr");
        tr.style.animationDelay = `${idx * 0.04}s`;
        tr.dataset.id = p.id_proveedor;

        const iniciales  = obtenerIniciales(p.razon_social);
        const color      = colorAvatar(p.id_proveedor);
        const totalProd  = parseInt(p.total_productos)    || 0;
        const totalHerr  = parseInt(p.total_herramientas) || 0;

        const estadoHtml = p.estado === "activo"
            ? `<span class="badge badge-activo">Activo</span>`
            : `<span class="badge badge-inactivo">Inactivo</span>`;

        const suministrosHtml = (totalProd === 0 && totalHerr === 0)
            ? `<span class="badge-sum badge-sum-none">Sin registros</span>`
            : `
                ${totalProd  > 0 ? `<span class="badge-sum badge-sum-prod">📦 ${totalProd} prod.</span>`  : ""}
                ${totalHerr  > 0 ? `<span class="badge-sum badge-sum-herr">🔧 ${totalHerr} herr.</span>` : ""}
            `;

        const acciones = puedeGestionar
            ? `<button class="btn-accion btn-ver"      onclick="verProveedor(${p.id_proveedor})">Ver</button>
               <button class="btn-accion btn-editar"   onclick="abrirModalEditar(${p.id_proveedor})">Editar</button>
               <button class="btn-accion btn-eliminar" onclick="abrirModalEliminar(${p.id_proveedor}, '${escapar(p.razon_social)}')">Eliminar</button>`
            : `<button class="btn-accion btn-ver"      onclick="verProveedor(${p.id_proveedor})">Ver</button>
               <button class="btn-accion btn-editar"   disabled>Editar</button>
               <button class="btn-accion btn-eliminar" disabled>Eliminar</button>`;

        tr.innerHTML = `
            <td class="td-empresa">
                <div class="empresa-wrap">
                    <div class="empresa-avatar" style="background:${color}">${iniciales}</div>
                    <div class="empresa-info">
                        <span class="empresa-razon">${p.razon_social}</span>
                        ${p.nombre_comercial ? `<span class="empresa-comercial">${p.nombre_comercial}</span>` : ""}
                        <span class="empresa-ruc">${codigoProveedor(p.id_proveedor)} · RUC: ${p.ruc}</span>
                    </div>
                </div>
            </td>
            <td>
                <div class="contacto-wrap">
                    ${p.contacto_nombre ? `<span class="contacto-nombre">${p.contacto_nombre}</span>` : '<span class="td-vacio" style="color:#bbb">—</span>'}
                    ${p.telefono        ? `<span class="contacto-tel">📞 ${p.telefono}</span>`       : ""}
                    ${p.correo          ? `<a  href="mailto:${p.correo}" class="contacto-correo">✉ ${p.correo}</a>` : ""}
                </div>
            </td>
            <td>
                <div class="ubicacion-wrap">
                    <span class="ubicacion-ciudad">${p.ciudad || '<span style="color:#bbb">—</span>'}</span>
                    <span class="ubicacion-pais">${p.pais || ""}</span>
                </div>
            </td>
            <td>
                <div class="suministros-wrap">${suministrosHtml}</div>
            </td>
            <td>${estadoHtml}</td>
            <td class="td-fecha">${formatFecha(p.fecha_registro)}</td>
            <td class="td-acciones">${acciones}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ─── Filtro ───────────────────────────────────────────────────────────────────
function filtrarProveedores() {
    const texto  = (document.getElementById("buscarProveedor")?.value || "").trim();
    const estado = document.getElementById("filtroEstado")?.value    || "";
    const ciudad = document.getElementById("filtroCiudad")?.value    || "";

    if (!texto && !estado && !ciudad) {
        mostrarMensajeInicial();
        actualizarContador(0);
        return;
    }

    const filtrados = db.proveedores.filter(p => {
        const haystack = [
            p.razon_social, p.nombre_comercial, p.ruc,
            p.contacto_nombre, p.telefono, p.correo, p.ciudad
        ].filter(Boolean).join(" ").toLowerCase();

        const okTexto  = !texto   || haystack.includes(texto.toLowerCase());
        const okEstado = !estado  || p.estado === estado;
        const okCiudad = !ciudad  || p.ciudad === ciudad;

        return okTexto && okEstado && okCiudad;
    });

    renderTabla(filtrados);
    actualizarContador(filtrados.length);
}

function codigoProveedor(id) {
    return `PROV-${String(id).padStart(4, "0")}`;
}

function siguienteCodigoProveedor() {
    if (!db.proveedores.length) return "PROV-0001";
    const maxId = Math.max(...db.proveedores.map(p => p.id_proveedor));
    return codigoProveedor(maxId + 1);
}

// ─── Modal Crear ──────────────────────────────────────────────────────────────
function abrirModalCrear() {
    if (!puedeGestionar) { mostrarToast("Sin permiso para crear proveedores", "error"); return; }
    db.editandoId = null;
    document.getElementById("tituloModal").textContent = "Nuevo Proveedor";
    document.querySelector(".modal-header-sub").textContent = "Complete los datos del proveedor";
    limpiarFormulario();
    document.getElementById("inCodigo").value = siguienteCodigoProveedor();
    scrollModalProveedor();
    abrirModal("modalProveedor");
}

// ─── Modal Editar ─────────────────────────────────────────────────────────────
function abrirModalEditar(id) {
    const p = db.proveedores.find(x => x.id_proveedor === id);
    if (!p) return;

    db.editandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Proveedor";
    document.querySelector(".modal-header-sub").textContent = `Modificando: ${p.razon_social}`;

    document.getElementById("inCodigo").value         = codigoProveedor(p.id_proveedor);
    document.getElementById("inRuc").value            = p.ruc             || "";
    document.getElementById("inRazonSocial").value    = p.razon_social    || "";
    document.getElementById("inNombreComercial").value = p.nombre_comercial || "";
    document.getElementById("inContactoNombre").value = p.contacto_nombre || "";
    document.getElementById("inTelefono").value       = p.telefono        || "";
    document.getElementById("inCorreo").value         = p.correo          || "";
    document.getElementById("inDireccion").value      = p.direccion       || "";
    document.getElementById("inCiudad").value         = p.ciudad          || "";
    document.getElementById("inPais").value           = p.pais            || "Perú";
    document.getElementById("inNotas").value          = p.notas           || "";
    document.getElementById("inEstado").value         = p.estado          || "activo";

    limpiarErrorModal();
    scrollModalProveedor();
    abrirModal("modalProveedor");
}

function scrollModalProveedor() {
    const body = document.querySelector("#modalProveedor .modal-body-scroll");
    if (body) body.scrollTop = 0;
}

// ─── Editar desde modal Ver ───────────────────────────────────────────────────
function editarDesdeVer() {
    if (!db.viendo) return;
    cerrarModal("modalVer");
    abrirModalEditar(db.viendo.id_proveedor);
}

function cerrarModalForm() { cerrarModal("modalProveedor"); }

// ─── Guardar ──────────────────────────────────────────────────────────────────
async function guardarProveedor() {
    const ruc         = document.getElementById("inRuc").value.trim();
    const razonSocial = document.getElementById("inRazonSocial").value.trim();

    if (!ruc)         { mostrarErrorModal("El RUC es obligatorio.");          return; }
    if (!razonSocial) { mostrarErrorModal("La razón social es obligatoria."); return; }

    limpiarErrorModal();
    document.getElementById("btnGuardar").disabled    = true;
    document.getElementById("btnGuardar").textContent = "Guardando…";

    const body = {
        ruc,
        razon_social:     razonSocial,
        nombre_comercial: document.getElementById("inNombreComercial").value.trim() || null,
        contacto_nombre:  document.getElementById("inContactoNombre").value.trim()  || null,
        telefono:         document.getElementById("inTelefono").value.trim()         || null,
        correo:           document.getElementById("inCorreo").value.trim()           || null,
        direccion:        document.getElementById("inDireccion").value.trim()        || null,
        ciudad:           document.getElementById("inCiudad").value.trim()           || null,
        pais:             document.getElementById("inPais").value.trim()             || "Perú",
        notas:            document.getElementById("inNotas").value.trim()            || null,
        estado:           document.getElementById("inEstado").value,
    };

    try {
        const esEdicion = db.editandoId !== null;
        const url    = esEdicion ? `${API}/proveedores/${db.editandoId}` : `${API}/proveedores`;
        const method = esEdicion ? "PUT" : "POST";

        const res  = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { mostrarErrorModal(data.message || "Error al guardar"); return; }

        // Refrescar lista completa desde el servidor
        const resAll = await fetch(`${API}/proveedores`);
        db.proveedores = await resAll.json();

        // Refrescar ciudades
        const resCiudades = await fetch(`${API}/proveedores-ciudades`);
        llenarFiltroCiudad(await resCiudades.json());

        actualizarStats();
        cerrarModal("modalProveedor");
        filtrarProveedores();
        mostrarToast(esEdicion ? "Proveedor actualizado" : "Proveedor creado", "success");

    } catch (err) {
        mostrarErrorModal("Error de conexión con el servidor.");
    } finally {
        document.getElementById("btnGuardar").disabled    = false;
        document.getElementById("btnGuardar").textContent = "Guardar";
    }
}

// ─── Modal Ver Detalle ────────────────────────────────────────────────────────
async function verProveedor(id) {
    try {
        const res  = await fetch(`${API}/proveedores/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        db.viendo  = data;

        // Header
        const iniciales = obtenerIniciales(data.razon_social);
        const color     = colorAvatar(data.id_proveedor);
        document.getElementById("verHeaderProveedor").innerHTML = `
            <div class="ver-avatar" style="background:${color}">${iniciales}</div>
            <div class="ver-header-info">
                <span class="ver-razon">${data.razon_social}</span>
                ${data.nombre_comercial ? `<span class="ver-comercial">${data.nombre_comercial}</span>` : ""}
                <span class="ver-ruc">RUC: ${data.ruc}</span>
            </div>
        `;

        // Info general
        const campos = [
            { label: "RUC",             valor: data.ruc },
            { label: "Estado",          valor: data.estado === "activo" ? "✅ Activo" : "❌ Inactivo" },
            { label: "Contacto",        valor: data.contacto_nombre },
            { label: "Teléfono",        valor: data.telefono },
            { label: "Correo",          valor: data.correo },
            { label: "Ciudad",          valor: data.ciudad },
            { label: "País",            valor: data.pais },
            { label: "Fecha Registro",  valor: formatFechaLarga(data.fecha_registro) },
            { label: "Dirección",       valor: data.direccion, full: true },
            { label: "Notas",           valor: data.notas,     full: true },
        ];

        document.getElementById("verContenido").innerHTML = campos.map(f => `
            <div class="ver-campo ${f.full ? "ver-campo-full" : ""}">
                <span class="ver-label">${f.label}</span>
                <span class="ver-valor ${!f.valor ? "sin-dato" : ""}">${f.valor || "Sin datos"}</span>
            </div>
        `).join("");

        // Tabla productos
        const prods = data.productos || [];
        document.getElementById("verProductos").innerHTML = prods.length === 0
            ? `<div class="empty-suministros">📦 Este proveedor no tiene productos registrados aún.</div>`
            : `<table class="mini-tabla">
                <thead><tr>
                    <th>Producto</th><th>Marca</th><th>Código</th>
                    <th>Precio Costo</th><th>Entrega (días)</th><th>Estado</th>
                </tr></thead>
                <tbody>
                    ${prods.map(p => `
                        <tr>
                            <td>${p.producto_nombre}</td>
                            <td>${p.marca_nombre || "—"}</td>
                            <td style="font-family:monospace;font-size:12px">${p.codigo_interno || "—"}</td>
                            <td>S/ ${parseFloat(p.precio_costo).toFixed(2)}</td>
                            <td>${p.tiempo_entrega_dias ?? "—"} días</td>
                            <td><span class="badge ${p.estado === "activo" ? "badge-activo" : "badge-inactivo"}">${p.estado}</span></td>
                        </tr>
                    `).join("")}
                </tbody>
              </table>`;

        // Tabla herramientas
        const herrs = data.herramientas || [];
        document.getElementById("verHerramientas").innerHTML = herrs.length === 0
            ? `<div class="empty-suministros">🔧 Este proveedor no tiene herramientas registradas aún.</div>`
            : `<table class="mini-tabla">
                <thead><tr>
                    <th>Herramienta</th><th>Código</th>
                    <th>Precio Costo</th><th>Entrega (días)</th><th>Estado</th>
                </tr></thead>
                <tbody>
                    ${herrs.map(h => `
                        <tr>
                            <td>${h.herramienta_nombre}</td>
                            <td style="font-family:monospace;font-size:12px">${h.codigo_interno || "—"}</td>
                            <td>S/ ${parseFloat(h.precio_costo).toFixed(2)}</td>
                            <td>${h.tiempo_entrega_dias ?? "—"} días</td>
                            <td><span class="badge ${h.estado === "activo" ? "badge-activo" : "badge-inactivo"}">${h.estado}</span></td>
                        </tr>
                    `).join("")}
                </tbody>
              </table>`;

        // Resetear tab activo
        document.querySelectorAll(".ver-tab").forEach(t => t.classList.remove("activo"));
        document.querySelectorAll(".ver-tab-content").forEach(c => c.classList.remove("activo"));
        document.querySelector(".ver-tab").classList.add("activo");
        document.getElementById("tabInfo").classList.add("activo");

        abrirModal("modalVer");

    } catch (err) {
        mostrarToast("Error al cargar detalle del proveedor", "error");
    }
}

function cerrarModalVer() {
    cerrarModal("modalVer");
    db.viendo = null;
}

// ─── Cambiar tab en modal Ver ─────────────────────────────────────────────────
function cambiarTab(btnEl, tabId) {
    document.querySelectorAll(".ver-tab").forEach(t => t.classList.remove("activo"));
    document.querySelectorAll(".ver-tab-content").forEach(c => c.classList.remove("activo"));
    btnEl.classList.add("activo");
    document.getElementById(tabId).classList.add("activo");
}

// ─── Modal Eliminar ───────────────────────────────────────────────────────────
function abrirModalEliminar(id, nombre) {
    db.eliminandoId     = id;
    db.eliminandoNombre = nombre;
    document.getElementById("nombreEliminar").textContent = `"${nombre}"`;
    abrirModal("modalEliminar");
}

function cerrarModalEliminar() { cerrarModal("modalEliminar"); }

async function confirmarEliminar() {
    document.getElementById("btnConfirmarEliminar").disabled    = true;
    document.getElementById("btnConfirmarEliminar").textContent = "Eliminando…";

    try {
        const res  = await fetch(`${API}/proveedores/${db.eliminandoId}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) {
            cerrarModal("modalEliminar");
            mostrarToast(data.message || "No se pudo eliminar", "error");
            return;
        }

        db.proveedores = db.proveedores.filter(x => x.id_proveedor !== db.eliminandoId);

        // Refrescar ciudades
        const resCiudades = await fetch(`${API}/proveedores-ciudades`);
        llenarFiltroCiudad(await resCiudades.json());

        actualizarStats();
        cerrarModal("modalEliminar");
        filtrarProveedores();
        mostrarToast("Proveedor eliminado", "success");

    } catch (err) {
        mostrarToast("Error de conexión", "error");
    } finally {
        document.getElementById("btnConfirmarEliminar").disabled    = false;
        document.getElementById("btnConfirmarEliminar").textContent = "Sí, eliminar";
    }
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────
function abrirModal(id)  { const el = document.getElementById(id); if (el) el.style.display = "flex"; }
function cerrarModal(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

function limpiarFormulario() {
    ["inRuc","inRazonSocial","inNombreComercial","inContactoNombre",
     "inTelefono","inCorreo","inDireccion","inCiudad","inNotas"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("inPais").value   = "Perú";
    document.getElementById("inEstado").value = "activo";
    limpiarErrorModal();
}

function mostrarErrorModal(msg) {
    const el = document.getElementById("modalError");
    if (el) el.textContent = msg;
}

function limpiarErrorModal() {
    const el = document.getElementById("modalError");
    if (el) el.textContent = "";
}

function actualizarContador(n) {
    const el = document.getElementById("totalProveedores");
    if (el) el.textContent = n > 0 ? `${n} proveedor${n !== 1 ? "es" : ""}` : "";
}

function mostrarSpinner(v) {
    const el = document.getElementById("spinnerCarga");
    if (el) el.style.display = v ? "flex" : "none";
}

function mostrarError(msg) {
    const el = document.getElementById("errorGeneral");
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function mostrarToast(mensaje, tipo = "success") {
    let t = document.getElementById("toast-global");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast-global";
        Object.assign(t.style, {
            position: "fixed", bottom: "28px", right: "28px", zIndex: "9999",
            padding: "12px 22px", borderRadius: "10px", fontSize: "14px",
            fontWeight: "600", fontFamily: "inherit", maxWidth: "340px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
            pointerEvents: "none",
        });
        document.body.appendChild(t);
    }
    t.textContent = mensaje;
    t.style.background = tipo === "success" ? "#16a34a" : "#dc2626";
    t.style.color = "#fff"; t.style.opacity = "1"; t.style.transform = "translateY(0)";
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(10px)"; }, 3200);
}

// ─── Helpers visuales ─────────────────────────────────────────────────────────
function obtenerIniciales(nombre) {
    if (!nombre) return "?";
    const palabras = nombre.trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

// Colores de avatar determinísticos según id
const COLORES_AVATAR = [
    "#2563eb", "#7c3aed", "#0891b2", "#059669",
    "#d97706", "#dc2626", "#db2777", "#65a30d",
    "#0284c7", "#9333ea", "#0d9488", "#b45309",
];
function colorAvatar(id) {
    return COLORES_AVATAR[id % COLORES_AVATAR.length];
}

function escapar(str) {
    return (str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function formatFecha(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", {
        day: "2-digit", month: "2-digit", year: "numeric"
    });
}

function formatFechaLarga(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-PE", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

// ─── Cerrar modales al hacer clic fuera ───────────────────────────────────────
document.addEventListener("click", e => {
    if (e.target.id === "modalProveedor") cerrarModal("modalProveedor");
    if (e.target.id === "modalVer")       cerrarModal("modalVer");
    if (e.target.id === "modalEliminar")  cerrarModal("modalEliminar");
});