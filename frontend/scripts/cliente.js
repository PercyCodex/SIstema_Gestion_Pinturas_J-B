"use strict";

// ============================================================
// clientes.js — Módulo Clientes
// Base de datos: pinturas.clientes
// API: GET|POST|PUT|DELETE /clientes
// ============================================================

const API = "http://localhost:3000";

// ─── Estado del módulo ────────────────────────────────────────
const clientesState = {
    todos:           [],   // todos los clientes en memoria
    filtrados:       [],   // resultado del filtro actual
    paginaActual:    1,
    limitePorPagina: 12,
    totalPaginas:    1,
    editandoId:      null,
    eliminandoId:    null,
};

// ─── Auth header ──────────────────────────────────────────────
function authHeaders() {
    const token = localStorage.getItem("token");
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

// ─── Alerta global ────────────────────────────────────────────
function showAlert(tipo, mensaje) {
    let t = document.getElementById("toast-global");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast-global";
        Object.assign(t.style, {
            position: "fixed", bottom: "26px", right: "26px", zIndex: "9999",
            padding: "12px 22px", borderRadius: "10px", fontSize: "14px",
            fontWeight: "600", maxWidth: "380px",
            boxShadow: "0 6px 24px rgba(0,0,0,.22)",
            transition: "opacity .3s ease, transform .3s ease",
            pointerEvents: "none",
        });
        document.body.appendChild(t);
    }
    const colores = { success: "#16a34a", error: "#dc2626", warning: "#d97706" };
    t.textContent      = mensaje;
    t.style.background = colores[tipo] || "#334155";
    t.style.color      = "#fff";
    t.style.opacity    = "1";
    t.style.transform  = "translateY(0)";
    clearTimeout(t._t);
    t._t = setTimeout(() => {
        t.style.opacity   = "0";
        t.style.transform = "translateY(10px)";
    }, 3800);
}

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", cargarClientes);

async function cargarClientes() {
    mostrarSpinnerClientes(true);
    try {
        const res = await fetch(`${API}/clientes`, { headers: authHeaders() });
        if (!res.ok) throw new Error("Error al obtener clientes");
        clientesState.todos = await res.json();
        mostrarMensajeInicialClientes();
        actualizarContadorClientes(0);
    } catch (err) {
        console.error(err);
        const tbody = document.getElementById("tabla-clientes-body");
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="tabla-vacia">❌ Error al cargar clientes</td></tr>`;
        showAlert("error", "No se pudieron cargar los clientes");
    } finally {
        mostrarSpinnerClientes(false);
    }
}

// ─── Mensaje inicial ──────────────────────────────────────────
function mostrarMensajeInicialClientes() {
    const tbody = document.getElementById("tabla-clientes-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="tabla-vacia">
        <span class="vacia-icono">🔍</span>
        <span>Busca o filtra para ver los clientes</span>
    </td></tr>`;
    actualizarContadorClientes(0);
}

// ─── Filtro en tiempo real ────────────────────────────────────
function filtrarClientes() {
    const texto  = (document.getElementById("buscar-clientes")?.value || "").trim().toLowerCase();
    const estado = document.getElementById("filtroEstadoCliente")?.value || "";
    const tipo   = document.getElementById("filtroTipoCliente")?.value  || "";

    const hayFiltro = texto || estado || tipo;
    if (!hayFiltro) { mostrarMensajeInicialClientes(); return; }

    clientesState.filtrados = clientesState.todos.filter(c => {
        const haystack = `${c.nombre} ${c.apellido || ""} ${c.dni_ruc || ""} ${c.telefono || ""} ${c.correo || ""}`.toLowerCase();
        return (!texto  || haystack.includes(texto))
            && (!estado || c.estado       === estado)
            && (!tipo   || c.tipo_cliente === tipo);
    });

    clientesState.paginaActual = 1;
    clientesState.totalPaginas = Math.ceil(clientesState.filtrados.length / clientesState.limitePorPagina) || 1;
    renderTablaClientes();
    actualizarContadorClientes(clientesState.filtrados.length);
}

// ─── Render tabla ─────────────────────────────────────────────
function renderTablaClientes() {
    const tbody = document.getElementById("tabla-clientes-body");
    if (!tbody) return;

    actualizarPaginacionClientes(clientesState.filtrados.length);

    const inicio  = (clientesState.paginaActual - 1) * clientesState.limitePorPagina;
    const pagina  = clientesState.filtrados.slice(inicio, inicio + clientesState.limitePorPagina);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="tabla-vacia">
            <span class="vacia-icono">👤</span>
            <span>No se encontraron clientes</span>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = pagina.map(c => {
        const nombreCompleto = `${c.nombre} ${c.apellido || ""}`.trim();
        const tipoBadge = c.tipo_cliente === "empresa"
            ? `<span class="tipo-empresa">Empresa</span>`
            : `<span class="tipo-comun">Común</span>`;
        const estadoBadge = c.estado === "activo"
            ? `<span class="badge badge-activo">Activo</span>`
            : `<span class="badge badge-inactivo">Inactivo</span>`;

        return `<tr>
            <td class="td-nombre">${nombreCompleto}</td>
            <td>${c.dni_ruc || "—"}</td>
            <td>${tipoBadge}</td>
            <td>${c.telefono || "—"}</td>
            <td>${c.correo   || "—"}</td>
            <td title="${esc(c.direccion || "")}" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${c.direccion || "—"}
            </td>
            <td>${estadoBadge}</td>
            <td>${formatFechaCliente(c.fecha_registro)}</td>
            <td class="td-acciones">
                <button class="btn-ver"            onclick="verDetalleCliente(${c.id_cliente})">👁</button>
                <button class="btn-editar"         onclick="abrirModalEditarCliente(${c.id_cliente})">✏️</button>
                <button class="btn-eliminar-tabla" onclick="abrirModalEliminarCliente(${c.id_cliente})">🗑</button>
            </td>
        </tr>`;
    }).join("");
}

// ─── Paginación ───────────────────────────────────────────────
function actualizarPaginacionClientes(total) {
    clientesState.totalPaginas = Math.ceil(total / clientesState.limitePorPagina) || 1;
    const el = document.getElementById("infoPaginaClientes");
    if (el) el.textContent = `Página ${clientesState.paginaActual} / ${clientesState.totalPaginas} · ${total} registros`;
    const prev = document.getElementById("btnPrevClientes");
    const next = document.getElementById("btnNextClientes");
    if (prev) prev.disabled = clientesState.paginaActual <= 1;
    if (next) next.disabled = clientesState.paginaActual >= clientesState.totalPaginas;
}

function cambiarPaginaClientes(delta) {
    clientesState.paginaActual = Math.max(1, Math.min(
        clientesState.paginaActual + delta, clientesState.totalPaginas
    ));
    renderTablaClientes();
}

function actualizarContadorClientes(n) {
    const el = document.getElementById("totalClientes");
    if (el) el.textContent = n > 0 ? `${n} registro${n !== 1 ? "s" : ""}` : "";
}

// ═══════════════════════════════════════════════════════════════
// MODAL CREAR / EDITAR
// ═══════════════════════════════════════════════════════════════
function abrirModalCrearCliente() {
    clientesState.editandoId = null;
    document.getElementById("tituloModalCliente").textContent = "Nuevo Cliente";
    limpiarFormCliente();
    abrirModalCliente("modalCliente");
}

function abrirModalEditarCliente(id) {
    const c = clientesState.todos.find(x => x.id_cliente === id);
    if (!c) return;

    clientesState.editandoId = id;
    document.getElementById("tituloModalCliente").textContent = "Editar Cliente";
    limpiarFormCliente();

    document.getElementById("inNombreCliente").value    = c.nombre;
    document.getElementById("inApellidoCliente").value  = c.apellido  || "";
    document.getElementById("inDniCliente").value       = c.dni_ruc   || "";
    document.getElementById("inTelefonoCliente").value  = c.telefono  || "";
    document.getElementById("inCorreoCliente").value    = c.correo    || "";
    document.getElementById("inDireccionCliente").value = c.direccion || "";
    document.getElementById("inNotasCliente").value     = c.notas     || "";
    document.getElementById("inEstadoCliente").value    = c.estado    || "activo";

    const selTipo = document.getElementById("inTipoCliente");
    if (selTipo && selTipo.tagName === "SELECT")
        selTipo.value = c.tipo_cliente === "empresa" ? "empresa" : "comun";

    abrirModalCliente("modalCliente");
}

// ─── Guardar ──────────────────────────────────────────────────
async function guardarCliente() {
    const nombre = document.getElementById("inNombreCliente").value.trim();
    if (!nombre) { mostrarErrorCliente("El nombre es obligatorio."); return; }

    // Validar DNI/RUC si se ingresó
    const dniRuc = document.getElementById("inDniCliente").value.trim();
    if (dniRuc && !/^[0-9]{8,11}$/.test(dniRuc)) {
        mostrarErrorCliente("DNI debe tener 8 dígitos o RUC 11 dígitos."); return;
    }

    const telefono = document.getElementById("inTelefonoCliente").value.trim();
    if (telefono && !/^[0-9]{9}$/.test(telefono)) {
        mostrarErrorCliente("El teléfono debe tener 9 dígitos."); return;
    }

    limpiarErrorCliente();
    const btn = document.getElementById("btn-guardar-clientes");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }

    const inTipo = document.getElementById("inTipoCliente");
    const tipoCliente = (inTipo && inTipo.tagName === "SELECT" && !inTipo.disabled)
        ? inTipo.value : "comun";

    const payload = {
        nombre,
        apellido:     document.getElementById("inApellidoCliente").value.trim()  || null,
        dni_ruc:      dniRuc || null,
        tipo_cliente: tipoCliente,
        telefono:     telefono || null,
        correo:       document.getElementById("inCorreoCliente").value.trim()     || null,
        direccion:    document.getElementById("inDireccionCliente").value.trim()  || null,
        notas:        document.getElementById("inNotasCliente").value.trim()      || null,
        estado:       document.getElementById("inEstadoCliente").value,
    };

    try {
        const esEdicion = clientesState.editandoId !== null;
        const url    = esEdicion ? `${API}/clientes/${clientesState.editandoId}` : `${API}/clientes`;
        const method = esEdicion ? "PUT" : "POST";

        const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
        const data = await res.json();

        if (!res.ok) { mostrarErrorCliente(data.message || "Error al guardar"); return; }

        // Refrescar lista completa
        const resAll = await fetch(`${API}/clientes`, { headers: authHeaders() });
        clientesState.todos = await resAll.json();

        cerrarModalCliente("modalCliente");
        filtrarClientes();
        showAlert("success", data.message || "Cliente guardado correctamente");
    } catch (err) {
        console.error(err);
        mostrarErrorCliente("Error de conexión con el servidor.");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    }
}

// ─── Ver detalle ──────────────────────────────────────────────
function verDetalleCliente(id) {
    const c = clientesState.todos.find(x => x.id_cliente === id);
    if (!c) return;

    const campos = [
        { label: "Nombre",         valor: `${c.nombre} ${c.apellido || ""}`.trim() },
        { label: "Tipo",           valor: c.tipo_cliente === "empresa" ? "Empresa" : "Común" },
        { label: "DNI / RUC",      valor: c.dni_ruc },
        { label: "Teléfono",       valor: c.telefono },
        { label: "Correo",         valor: c.correo },
        { label: "Estado",         valor: c.estado === "activo" ? "✅ Activo" : "❌ Inactivo" },
        { label: "Dirección",      valor: c.direccion, full: true },
        { label: "Notas",          valor: c.notas, full: true },
        { label: "Fecha Registro", valor: formatFechaLargaCliente(c.fecha_registro), full: false },
    ];

    const cont = document.getElementById("verContenidoCliente");
    if (cont) cont.innerHTML = campos.map(f => `
        <div class="ver-campo ${f.full ? "ver-campo-full" : ""}">
            <span class="ver-label">${f.label}</span>
            <span class="ver-valor ${!f.valor ? "sin-dato" : ""}">${f.valor || "Sin datos"}</span>
        </div>`).join("");

    abrirModalCliente("modalVerCliente");
}

// ─── Eliminar ─────────────────────────────────────────────────
function abrirModalEliminarCliente(id) {
    clientesState.eliminandoId = id;
    abrirModalCliente("modalEliminarCliente");
}

function cerrarModalEliminarCliente() {
    clientesState.eliminandoId = null;
    cerrarModalCliente("modalEliminarCliente");
}

async function confirmarEliminarCliente() {
    if (!clientesState.eliminandoId) return;
    const btn = document.getElementById("btnConfirmarEliminarCliente");
    if (btn) { btn.disabled = true; btn.textContent = "Eliminando…"; }

    try {
        const res  = await fetch(`${API}/clientes/${clientesState.eliminandoId}`, {
            method: "DELETE", headers: authHeaders(),
        });
        const data = await res.json();

        if (!res.ok) {
            cerrarModalCliente("modalEliminarCliente");
            showAlert("error", data.message || "No se pudo eliminar");
            return;
        }

        clientesState.todos = clientesState.todos.filter(c => c.id_cliente !== clientesState.eliminandoId);
        cerrarModalCliente("modalEliminarCliente");
        filtrarClientes();
        showAlert("success", "Cliente eliminado correctamente");
    } catch {
        showAlert("error", "Error de conexión");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Sí, eliminar"; }
    }
}

// ─── Helpers UI ───────────────────────────────────────────────
function abrirModalCliente(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = "flex"; el.classList.add("activo"); }
}

function cerrarModalCliente(id = "modalCliente") {
    const el = document.getElementById(id);
    if (el) { el.style.display = "none"; el.classList.remove("activo"); }
}

function limpiarFormCliente() {
    ["inNombreCliente","inApellidoCliente","inDniCliente","inTelefonoCliente",
     "inCorreoCliente","inDireccionCliente","inNotasCliente"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("inEstadoCliente").value = "activo";
    const inTipo = document.getElementById("inTipoCliente");
    if (inTipo && inTipo.tagName === "SELECT") inTipo.value = "comun";
    limpiarErrorCliente();
}

function mostrarErrorCliente(msg) {
    const el = document.getElementById("errorModalCliente"); if (el) el.textContent = msg;
}
function limpiarErrorCliente() {
    const el = document.getElementById("errorModalCliente"); if (el) el.textContent = "";
}
function mostrarSpinnerClientes(v) {
    const el = document.getElementById("spinnerClientes"); if (el) el.style.display = v ? "flex" : "none";
}

function formatFechaCliente(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE", { day:"2-digit", month:"2-digit", year:"numeric" });
}

function formatFechaLargaCliente(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-PE", {
        day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit"
    });
}

function esc(s) { return String(s||"").replace(/'/g,"\\'").replace(/"/g,"&quot;"); }

// Cerrar modales al clic fuera
document.addEventListener("click", (e) => {
    ["modalCliente","modalVerCliente","modalEliminarCliente"].forEach(id => {
        if (e.target.id === id) cerrarModalCliente(id);
    });
});