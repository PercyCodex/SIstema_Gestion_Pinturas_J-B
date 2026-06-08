"use strict";

// ─── usuarios.js — adaptado a pinturas.usuarios + pinturas.roles ─────────────
// Endpoints usados:
//   GET  /usuarios          → lista todos los usuarios con su rol
//   POST /usuarios          → crea usuario (contrasena hasheada en backend)
//   PUT  /usuarios/:id      → actualiza datos (sin contraseña)
//   PUT  /usuarios/:id/password → cambia contraseña
//   DELETE /usuarios/:id    → elimina usuario
//   GET  /roles             → lista roles disponibles

const API = "http://localhost:3000";

let usuariosCache    = [];
let rolesDisponibles = [];

let usuarioEditandoId   = null;
let usuarioEliminandoId = null;

const rolActual = localStorage.getItem("rolUsuario");
const idActual  = parseInt(localStorage.getItem("idUsuario"), 10);

// Jerarquía para controlar qué roles puede asignar cada uno
const jerarquia = {
    "Super Administrador": 5,
    "Administrador":       4,
    "Supervisor":          3,
    "Vendedor":            2,
    "Usuario":             1,
};

document.addEventListener("DOMContentLoaded", () => {
    iniciarPagina();
});

// ── Carga inicial ─────────────────────────────────────────────────────────────
async function iniciarPagina() {
    try {
        const [resRoles, resUsuarios] = await Promise.all([
            fetch(`${API}/roles`),
            fetch(`${API}/usuarios`),
        ]);

        rolesDisponibles = await resRoles.json();
        usuariosCache    = await resUsuarios.json();

        mostrarMensajeInicial();
        actualizarContador(0);
    } catch (err) {
        console.error(err);
        const tbody = document.getElementById("cuerpoTabla");
        if (tbody) tbody.innerHTML =
            `<tr><td colspan="6" class="tabla-vacia">❌ Error al cargar usuarios</td></tr>`;
    }
}

// ── Estado inicial ─────────────────────────────────────────────────────────────
function mostrarMensajeInicial() {
    const tbody = document.getElementById("cuerpoTabla");
    if (tbody) tbody.innerHTML = `
        <tr>
            <td colspan="6" class="tabla-vacia">
                <span class="vacia-icono">🔍</span>
                <span>Busca o aplica un filtro para ver los usuarios</span>
            </td>
        </tr>`;
}

function actualizarContador(n) {
    const el = document.getElementById("totalUsuarios");
    if (el) el.textContent = n > 0 ? `${n} registro${n !== 1 ? "s" : ""}` : "";
}

// ── Filtrar ───────────────────────────────────────────────────────────────────
function filtrarUsuarios() {
    const texto  = (document.getElementById("buscarUsuarios")?.value || "").trim().toLowerCase();
    const estado = document.getElementById("filtroEstado")?.value || "";

    if (!texto && !estado) {
        mostrarMensajeInicial();
        actualizarContador(0);
        return;
    }

    const filtrados = usuariosCache.filter(u => {
        const haystack = `${u.nombre} ${u.apellido || ""} ${u.correo} ${u.rol || ""}`.toLowerCase();
        return (!texto  || haystack.includes(texto))
            && (!estado || u.estado === estado);
    });

    renderTabla(filtrados);
    actualizarContador(filtrados.length);
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoTabla");
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="tabla-vacia">
                <span class="vacia-icono">👤</span>
                <span>No se encontraron usuarios</span>
            </td></tr>`;
        return;
    }

    const nivelActual = jerarquia[rolActual] || 0;

    tbody.innerHTML = lista.map(u => {
        const estadoCls   = u.estado === "activo" ? "badge-activo" : "badge-inactivo";
        const esElMismo   = u.id_usuario === idActual;
        const nivelObj    = jerarquia[u.rol] || 0;
        const puedeEditar   = nivelActual > nivelObj || esElMismo;
        const puedeEliminar = nivelActual > nivelObj && !esElMismo;

        return `
        <tr>
            <td class="td-nombre" style="text-align:left;padding-left:16px">${u.nombre} ${u.apellido || ""}</td>
            <td>${u.correo}</td>
            <td>${u.rol || "—"}</td>
            <td><span class="badge ${estadoCls}">${capitalizar(u.estado)}</span></td>
            <td style="font-size:12px;color:#64748b">${formatFecha(u.ultimo_login) || "Nunca"}</td>
            <td class="td-acciones">
                <button class="btn-accion btn-editar"
                    ${!puedeEditar ? "disabled" : ""}
                    onclick="abrirModalEditar(${u.id_usuario}, '${esc(u.nombre)}', '${esc(u.apellido || "")}', '${esc(u.correo)}', ${u.id_rol}, '${u.estado}', ${esElMismo})">
                    Editar
                </button>
                <button class="btn-accion btn-eliminar-tabla"
                    ${!puedeEliminar ? "disabled" : ""}
                    onclick="abrirModalEliminar(${u.id_usuario})">
                    Eliminar
                </button>
            </td>
        </tr>`;
    }).join("");
}

// ── Llenar select de roles ─────────────────────────────────────────────────────
function llenarSelectRol(selectId, rolActualId, esElMismo) {
    const select      = document.getElementById(selectId);
    const nivelActual = jerarquia[rolActual] || 0;
    if (!select) return;

    select.innerHTML = `<option value="">— Selecciona un rol —</option>`;

    rolesDisponibles.forEach(r => {
        const nivelRol = jerarquia[r.nombre] || 0;
        if (nivelRol < nivelActual || (esElMismo && r.id_rol === rolActualId)) {
            const opt = document.createElement("option");
            opt.value       = r.id_rol;
            opt.textContent = r.nombre;
            if (r.id_rol === rolActualId) opt.selected = true;
            select.appendChild(opt);
        }
    });

    select.disabled = esElMismo; // no puede cambiar su propio rol
}

// ── Modal Crear ───────────────────────────────────────────────────────────────
function abrirModalCrear() {
    usuarioEditandoId = null;
    document.getElementById("tituloModal").textContent          = "Nuevo Usuario";
    document.getElementById("inNombre").value                   = "";
    document.getElementById("inApellido").value                 = "";
    document.getElementById("inCorreo").value                   = "";
    document.getElementById("inContrasena").value               = "";
    document.getElementById("wrapContrasena").style.display     = "block";
    document.getElementById("wrapCambiarPass").style.display    = "none";
    document.getElementById("inEstado").value                   = "activo";
    llenarSelectRol("inPerfil", null, false);
    document.getElementById("inPerfil").disabled                = false;
    limpiarError("modalError");
    document.getElementById("modalUsuario").style.display       = "flex";
}

// ── Modal Editar ──────────────────────────────────────────────────────────────
function abrirModalEditar(id, nombre, apellido, correo, id_rol, estado, esElMismo) {
    usuarioEditandoId = id;
    document.getElementById("tituloModal").textContent          = "Editar Usuario";
    document.getElementById("inNombre").value                   = nombre;
    document.getElementById("inApellido").value                 = apellido;
    document.getElementById("inCorreo").value                   = correo;
    document.getElementById("wrapContrasena").style.display     = "none";
    document.getElementById("wrapCambiarPass").style.display    = "block";
    document.getElementById("inNuevaPass").value                = "";
    document.getElementById("inEstado").value                   = estado;
    llenarSelectRol("inPerfil", id_rol, esElMismo);
    limpiarError("modalError");
    document.getElementById("modalUsuario").style.display       = "flex";
}

function cerrarModal() {
    document.getElementById("modalUsuario").style.display = "none";
    usuarioEditandoId = null;
}

// ── Guardar ───────────────────────────────────────────────────────────────────
async function guardarUsuario() {
    limpiarError("modalError");

    const esElMismo = document.getElementById("inPerfil").disabled;
    const nombre    = document.getElementById("inNombre").value.trim();
    const apellido  = document.getElementById("inApellido").value.trim();
    const correo    = document.getElementById("inCorreo").value.trim();
    const id_rol    = document.getElementById("inPerfil").value;
    const estado    = document.getElementById("inEstado").value;

    if (!nombre) { mostrarError("modalError", "El nombre es obligatorio."); return; }
    if (!correo) { mostrarError("modalError", "El correo es obligatorio."); return; }
    if (!id_rol && !esElMismo) { mostrarError("modalError", "Selecciona un rol."); return; }

    if (esElMismo && estado !== "activo") {
        mostrarError("modalError", "No puedes desactivar tu propia cuenta."); return;
    }

    const body = { nombre, apellido: apellido || null, correo, id_rol: parseInt(id_rol), estado };

    if (!usuarioEditandoId) {
        const pass = document.getElementById("inContrasena").value;
        if (!pass) { mostrarError("modalError", "La contraseña es obligatoria."); return; }
        body.contrasena = pass;
    }

    const url    = usuarioEditandoId ? `${API}/usuarios/${usuarioEditandoId}` : `${API}/usuarios`;
    const method = usuarioEditandoId ? "PUT" : "POST";

    try {
        const res  = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { mostrarError("modalError", data.message || "Error al guardar."); return; }

        // Si editó y quiere cambiar contraseña
        if (usuarioEditandoId) {
            const nuevaPass = document.getElementById("inNuevaPass")?.value?.trim();
            if (nuevaPass) {
                await fetch(`${API}/usuarios/${usuarioEditandoId}/password`, {
                    method:  "PUT",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ contrasena: nuevaPass }),
                });
            }
        }

        const resAll  = await fetch(`${API}/usuarios`);
        usuariosCache = await resAll.json();
        cerrarModal();
        filtrarUsuarios();
        mostrarToast(data.message || "Guardado correctamente", "success");

    } catch (err) {
        console.error(err);
        mostrarError("modalError", "Error de conexión con el servidor.");
    }
}

// ── Modal Eliminar ────────────────────────────────────────────────────────────
function abrirModalEliminar(id) {
    usuarioEliminandoId = id;
    document.getElementById("modalEliminar").style.display = "flex";
}

function cerrarModalEliminar() {
    document.getElementById("modalEliminar").style.display = "none";
    usuarioEliminandoId = null;
}

async function confirmarEliminar() {
    if (!usuarioEliminandoId) return;
    try {
        const res  = await fetch(`${API}/usuarios/${usuarioEliminandoId}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) { mostrarToast(data.message || "No se pudo eliminar", "error"); return; }
        usuariosCache = usuariosCache.filter(u => u.id_usuario !== usuarioEliminandoId);
        cerrarModalEliminar();
        filtrarUsuarios();
        mostrarToast("Usuario eliminado correctamente", "success");
    } catch (err) {
        mostrarToast("Error de conexión", "error");
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mostrarError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) el.textContent = msg;
}

function limpiarError(elId) {
    const el = document.getElementById(elId);
    if (el) el.textContent = "";
}

function capitalizar(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFecha(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("es-PE", {
        day: "2-digit", month: "2-digit", year: "numeric",
    });
}

function esc(str) {
    return (str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function mostrarToast(mensaje, tipo = "success") {
    let t = document.getElementById("toast-global");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast-global";
        Object.assign(t.style, {
            position: "fixed", bottom: "28px", right: "28px", zIndex: "9999",
            padding: "12px 22px", borderRadius: "10px", fontSize: "14px",
            fontWeight: "600", fontFamily: "inherit", maxWidth: "360px",
            boxShadow: "0 6px 24px rgba(0,0,0,.22)",
            transition: "opacity .3s ease, transform .3s ease",
            pointerEvents: "none",
        });
        document.body.appendChild(t);
    }
    t.textContent      = mensaje;
    t.style.background = tipo === "success" ? "#16a34a" : "#dc2626";
    t.style.color      = "#fff";
    t.style.opacity    = "1";
    t.style.transform  = "translateY(0)";
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(10px)"; }, 3500);
}

document.addEventListener("click", e => {
    if (e.target.id === "modalUsuario")  cerrarModal();
    if (e.target.id === "modalEliminar") cerrarModalEliminar();
});