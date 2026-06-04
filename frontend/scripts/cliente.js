// ============================================================
// clientes.js
// ============================================================

const API = "http://localhost:3000"; // Ajusta si tu servidor usa otro puerto

let clientes = [];        // lista completa en memoria
let clienteEditandoId = null;
let clienteEliminandoId = null;

// ─────────────────────────────
// INIT
// ─────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    cargarNombreUsuario();
    cargarClientes();
});

function cargarNombreUsuario() {
    const nombre = localStorage.getItem("usuario") || "Usuario";
    const el = document.getElementById("bienvenida");
    if (el) el.textContent = nombre;
}

// ─────────────────────────────
// CARGAR CLIENTES
// ─────────────────────────────
async function cargarClientes() {
    try {
        const res = await fetch(`${API}/clientes`);
        if (!res.ok) throw new Error("Error al obtener clientes");
        clientes = await res.json();
        renderTabla(clientes);
    } catch (err) {
        console.error(err);
        document.getElementById("cuerpoTabla").innerHTML =
            `<tr><td colspan="10" class="tabla-vacia">❌ Error al cargar clientes</td></tr>`;
    }
}

// ─────────────────────────────
// RENDER TABLA
// ─────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoTabla");
    const badge = document.getElementById("totalClientes");

    badge.textContent = `${lista.length} registro${lista.length !== 1 ? "s" : ""}`;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="tabla-vacia">No se encontraron clientes.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(c => `
        <tr>
            <td>${c.id_cliente}</td>
            <td class="td-nombre">${c.nombre}${c.apellido ? " " + c.apellido : ""}</td>
            <td>${c.dni_ruc || "<span style='color:#bbb'>—</span>"}</td>
            <td><span class="tipo-${c.tipo_cliente}">${c.tipo_cliente === "natural" ? "Natural" : "Empresa"}</span></td>
            <td>${c.telefono || "—"}</td>
            <td>${c.correo   || "—"}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${c.direccion || ''}">${c.direccion || "—"}</td>
            <td><span class="badge badge-${c.estado}">${capitalizar(c.estado)}</span></td>
            <td>${formatFecha(c.fecha_registro)}</td>
            <td>
                <div class="acciones">
                    <button class="btn-ver"            onclick="verCliente(${c.id_cliente})">👁</button>
                    <button class="btn-editar"         onclick="abrirModalEditar(${c.id_cliente})">✏️</button>
                    <button class="btn-eliminar-tabla" onclick="abrirModalEliminar(${c.id_cliente})">🗑</button>
                </div>
            </td>
        </tr>
    `).join("");
}

// ─────────────────────────────
// FILTRO
// ─────────────────────────────
function filtrarClientes() {
    const texto  = document.getElementById("buscarCliente").value.toLowerCase();
    const estado = document.getElementById("filtroEstado").value;

    const filtrados = clientes.filter(c => {
        const nombreCompleto = `${c.nombre} ${c.apellido || ""} ${c.dni_ruc || ""} ${c.telefono || ""}`.toLowerCase();
        const coinTexto  = nombreCompleto.includes(texto);
        const coinEstado = !estado || c.estado === estado;
        return coinTexto && coinEstado;
    });

    renderTabla(filtrados);
}

// ─────────────────────────────
// MODAL CREAR
// ─────────────────────────────
function abrirModalCrear() {
    clienteEditandoId = null;
    limpiarModal();
    document.getElementById("tituloModal").textContent = "Nuevo Cliente";
    abrirModal("modalCliente");
}

// ─────────────────────────────
// MODAL EDITAR
// ─────────────────────────────
function abrirModalEditar(id) {
    const c = clientes.find(x => x.id_cliente === id);
    if (!c) return;

    clienteEditandoId = id;
    limpiarModal();
    document.getElementById("tituloModal").textContent = "Editar Cliente";

    document.getElementById("inNombre").value    = c.nombre    || "";
    document.getElementById("inApellido").value  = c.apellido  || "";
    document.getElementById("inDni").value       = c.dni_ruc   || "";
    document.getElementById("inTelefono").value  = c.telefono  || "";
    document.getElementById("inCorreo").value    = c.correo    || "";
    document.getElementById("inDireccion").value = c.direccion || "";
    document.getElementById("inNotas").value     = c.notas     || "";
    document.getElementById("inEstado").value    = c.estado    || "activo";

    abrirModal("modalCliente");
}
// ─────────────────────────────
// GUARDAR (crear o editar)
// ─────────────────────────────

async function guardarCliente() {
    limpiarError();

    const nombre = document.getElementById("inNombre").value.trim();
    if (!nombre) {
        mostrarError("El nombre es obligatorio.");
        return;
    }

    const payload = {
        nombre,
        apellido:     document.getElementById("inApellido").value.trim()  || null,
        dni_ruc:      document.getElementById("inDni").value.trim()        || null,
        tipo_cliente: "natural",
        telefono:     document.getElementById("inTelefono").value.trim()   || null,
        correo:       document.getElementById("inCorreo").value.trim()     || null,
        direccion:    document.getElementById("inDireccion").value.trim()  || null,
        notas:        document.getElementById("inNotas").value.trim()      || null,
        estado:       document.getElementById("inEstado").value,
    };

    try {
        const url    = clienteEditandoId ? `${API}/clientes/${clienteEditandoId}` : `${API}/clientes`;
        const method = clienteEditandoId ? "PUT" : "POST";

        const res  = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarError(data.message || "Error al guardar");
            return;
        }

        cerrarModal();
        await cargarClientes();
        mostrarToast(data.message || "Guardado correctamente", "success");

    } catch (err) {
        console.error(err);
        mostrarError("Error de conexión con el servidor.");
    }
}


// ─────────────────────────────
// MODAL VER DETALLE
// ─────────────────────────────
function verCliente(id) {
    const c = clientes.find(x => x.id_cliente === id);
    if (!c) return;

    const campos = [
        { label: "ID",              valor: c.id_cliente },
        { label: "Tipo",            valor: c.tipo_cliente === "natural" ? "Natural" : "Empresa" },
        { label: "Nombre",          valor: c.nombre },
        { label: "Apellido",        valor: c.apellido },
        { label: "DNI",       valor: c.dni_ruc },
        { label: "Teléfono",        valor: c.telefono },
        { label: "Correo",          valor: c.correo },
        { label: "Estado",          valor: capitalizar(c.estado) },
        { label: "Dirección",       valor: c.direccion,   full: true },
        { label: "Notas",           valor: c.notas,       full: true },
        { label: "Fecha Registro",  valor: formatFechaLarga(c.fecha_registro), full: false },
    ];

    document.getElementById("verContenido").innerHTML = campos.map(f => `
        <div class="ver-campo ${f.full ? "ver-campo-full" : ""}">
            <span class="ver-label">${f.label}</span>
            <span class="ver-valor ${!f.valor ? "sin-dato" : ""}">${f.valor || "Sin datos"}</span>
        </div>
    `).join("");

    abrirModal("modalVer");
}

function cerrarModalVer() { cerrarModal("modalVer"); }

// ─────────────────────────────
// MODAL ELIMINAR
// ─────────────────────────────
function abrirModalEliminar(id) {
    clienteEliminandoId = id;
    abrirModal("modalEliminar");
}

function cerrarModalEliminar() {
    clienteEliminandoId = null;
    cerrarModal("modalEliminar");
}

async function confirmarEliminar() {
    if (!clienteEliminandoId) return;

    try {
        const res  = await fetch(`${API}/clientes/${clienteEliminandoId}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) {
            cerrarModalEliminar();
            mostrarToast(data.message || "No se pudo eliminar", "error");
            return;
        }

        cerrarModalEliminar();
        await cargarClientes();
        mostrarToast("Cliente eliminado correctamente", "success");

    } catch (err) {
        console.error(err);
        mostrarToast("Error de conexión", "error");
    }
}

// ─────────────────────────────
// HELPERS MODAL
// ─────────────────────────────
function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = "flex"; el.classList.add("activo"); }
}

function cerrarModal(id = "modalCliente") {
    const el = document.getElementById(id);
    if (el) { el.style.display = "none"; el.classList.remove("activo"); }
}

function limpiarModal() {
    ["inNombre","inApellido","inDni","inTelefono","inCorreo","inDireccion","inNotas"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("inEstado").value = "activo";
    limpiarError();
}

function mostrarError(msg) {
    const el = document.getElementById("modalError");
    if (el) el.textContent = msg;
}

function limpiarError() {
    const el = document.getElementById("modalError");
    if (el) el.textContent = "";
}

// Cerrar modales al hacer click fuera
document.addEventListener("click", (e) => {
    ["modalCliente","modalVer","modalEliminar"].forEach(id => {
        const overlay = document.getElementById(id);
        if (e.target === overlay) cerrarModal(id);
    });
});

// ─────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────
function mostrarToast(mensaje, tipo = "success") {
    let toast = document.getElementById("toast-global");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-global";
        toast.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:9999;
            padding:12px 20px; border-radius:10px; font-size:14px;
            font-weight:600; font-family:inherit; max-width:320px;
            box-shadow:0 6px 20px rgba(0,0,0,0.25);
            transition: opacity 0.3s ease, transform 0.3s ease;
            pointer-events:none;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = mensaje;
    toast.style.background = tipo === "success" ? "#16a34a" : "#dc2626";
    toast.style.color       = "#fff";
    toast.style.opacity     = "1";
    toast.style.transform   = "translateY(0)";

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateY(10px)";
    }, 3000);
}

// ─────────────────────────────
// UTILIDADES
// ─────────────────────────────
function capitalizar(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFecha(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFechaLarga(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    return d.toLocaleString("es-PE", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}