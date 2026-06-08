"use strict";

const API = "http://localhost:3000";

let rolEditandoId   = null;
let rolEliminandoId = null;
let rolesCache      = [];

const rolActual      = localStorage.getItem("rolUsuario");
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

const MODULOS = ["ventas", "inventario", "mezclas", "compras", "clientes",
                "usuarios", "reportes", "configuracion"];
const ACCIONES = ["ver", "crear", "editar", "eliminar"];

document.addEventListener("DOMContentLoaded", () => {
    iniciarPagina();
});

async function iniciarPagina() {
    try {
        const res = await fetch(`${API}/roles`);
        if (!res.ok) throw new Error("Error al cargar roles");
        rolesCache = await res.json();
        mostrarMensajeInicial();
        actualizarContador(0);
    } catch (err) {
        console.error(err);
    }
}

function mostrarMensajeInicial() {
    document.getElementById("cuerpoTabla").innerHTML = `
        <tr>
            <td colspan="5" class="tabla-vacia">
                <span class="vacia-icono">🔍</span>
                <span>Busca o aplica un filtro para ver los perfiles</span>
            </td>
        </tr>`;
}

function actualizarContador(n) {
    const el = document.getElementById("totalPerfiles");
    if (!el) return;
    el.textContent = n > 0 ? `${n} registro${n !== 1 ? "s" : ""}` : "";
}

function filtrarRoles() {
    const texto  = (document.getElementById("buscarPerfiles")?.value || "").trim().toLowerCase();
    const estado = document.getElementById("filtroEstado")?.value || "";

    if (!texto && !estado) {
        mostrarMensajeInicial();
        actualizarContador(0);
        return;
    }

    const filtrados = rolesCache.filter(r => {
        const haystack = `${r.nombre} ${r.descripcion || ""}`.toLowerCase();
        const okTexto  = !texto || haystack.includes(texto);
        const okEstado = !estado || r.estado === estado;
        return okTexto && okEstado;
    });

    renderTabla(filtrados);
    actualizarContador(filtrados.length);
}

function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoTabla");
    tbody.innerHTML = "";

    if (!lista.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="tabla-vacia">
                    <span class="vacia-icono">🛡️</span>
                    <span>No se encontraron perfiles</span>
                </td>
            </tr>`;
        return;
    }

    lista.forEach(r => {
        const tr = document.createElement("tr");

        const btnEditar = puedeGestionar
            ? `<button class="btn-accion btn-editar" onclick="abrirModalEditar(${r.id_rol}, '${escapar(r.nombre)}', '${escapar(r.descripcion || "")}', '${r.estado}')">Editar</button>`
            : `<button class="btn-accion btn-editar" disabled>Editar</button>`;

        const btnEliminar = puedeGestionar
            ? `<button class="btn-accion btn-eliminar-tabla" onclick="abrirModalEliminar(${r.id_rol})">Eliminar</button>`
            : `<button class="btn-accion btn-eliminar-tabla" disabled>Eliminar</button>`;

        tr.innerHTML = `
            <td class="td-nombre" style="text-align:left; padding-left:16px; font-weight:700;">${r.nombre}</td>
            <td>${r.descripcion || "—"}</td>
            <td><span class="badge ${r.estado === 'activo' ? 'badge-activo' : 'badge-inactivo'}">${r.estado}</span></td>
            <td>${r.total_usuarios ?? 0}</td>
            <td class="td-acciones">
                <button class="btn-accion btn-permisos" onclick="verPermisos(${r.id_rol}, '${escapar(r.nombre)}')">Permisos</button>
                ${btnEditar}
                ${btnEliminar}
            </td>
        `;
        tbody.appendChild(tr);
    });
}


function recogerPermisos() {
    const permisos = [];
    document.querySelectorAll("#permisosGrid input[type='checkbox']:checked").forEach(cb => {
        permisos.push({ modulo: cb.dataset.modulo, accion: cb.dataset.accion });
    });
    return permisos;
}

function generarGrillaPermisos(permisosActuales = []) {
    const grid = document.getElementById("permisosGrid");
    grid.innerHTML = "";

    MODULOS.forEach(modulo => {
        const fila = document.createElement("div");
        fila.className = "permiso-fila";
        fila.innerHTML = `<span class="permiso-modulo">${modulo.charAt(0).toUpperCase() + modulo.slice(1)}</span>`;

        ACCIONES.forEach(accion => {
            const activo = permisosActuales.some(p => p.modulo === modulo && p.accion === accion);
            const label  = document.createElement("label");
            label.className = "permiso-check";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.dataset.modulo = modulo;
            input.dataset.accion = accion;
            input.checked = activo;
            if (rolEditandoId && puedeGestionar) {
                input.addEventListener("change", () => guardarPermisosAutomatico());
            }
            label.appendChild(input);
            label.appendChild(document.createElement("span"));
            fila.appendChild(label);
        });

        grid.appendChild(fila);
    });
}

async function guardarPermisosAutomatico() {
    if (!rolEditandoId || !puedeGestionar) return;

    try {
        const res = await fetch(`${API}/roles/${rolEditandoId}/permisos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permisos: recogerPermisos() }),
        });
        if (!res.ok) {
            const data = await res.json();
            mostrarToast(data.message || "Error al guardar permisos", "error");
            return;
        }
        mostrarToast("Permisos actualizados", "success");
    } catch {
        mostrarToast("Error de conexión al guardar permisos", "error");
    }
}

function scrollModalPerfilAlFormulario() {
    const body = document.querySelector("#modalPerfil .modal-body-scroll");
    if (body) body.scrollTop = 0;
}

function abrirModalCrear() {
    if (!puedeGestionar) { alert("No tienes permiso para crear roles."); return; }
    rolEditandoId = null;
    document.getElementById("tituloModal").textContent = "Nuevo Rol";
    document.getElementById("inNombre").value      = "";
    document.getElementById("inDescripcion").value = "";
    document.getElementById("inEstado").value      = "activo";
    generarGrillaPermisos([]);
    document.getElementById("modalPerfil").style.display = "flex";
    scrollModalPerfilAlFormulario();
}

async function abrirModalEditar(id, nombre, descripcion, estado) {
    rolEditandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Rol";
    document.getElementById("inNombre").value          = nombre;
    document.getElementById("inDescripcion").value     = descripcion;
    document.getElementById("inEstado").value          = estado;

    const res      = await fetch(`${API}/roles/${id}/permisos`);
    const permisos = await res.json();
    generarGrillaPermisos(permisos);

    document.getElementById("modalPerfil").style.display = "flex";
    scrollModalPerfilAlFormulario();
}

function cerrarModal() {
    document.getElementById("modalPerfil").style.display = "none";
    rolEditandoId = null;
}

async function guardarPerfil() {
    const nombre = document.getElementById("inNombre").value.trim();
    if (!nombre) { alert("El nombre del rol es obligatorio."); return; }

    const esEdicion = rolEditandoId !== null;
    const permisos = recogerPermisos();
    const body = {
        nombre,
        descripcion: document.getElementById("inDescripcion").value.trim(),
        estado:      document.getElementById("inEstado").value,
    };

    const url    = rolEditandoId ? `${API}/roles/${rolEditandoId}` : `${API}/roles`;
    const method = rolEditandoId ? "PUT" : "POST";

    const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
        alert(data.message || "Error al guardar");
        return;
    }

    if (!rolEditandoId) {
        const rolesRes = await fetch(`${API}/roles`);
        const roles    = await rolesRes.json();
        const nuevo    = roles.find(r => r.nombre === nombre);
        if (nuevo) rolEditandoId = nuevo.id_rol;
    }

    if (rolEditandoId) {
        await fetch(`${API}/roles/${rolEditandoId}/permisos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permisos }),
        });
    }

    const resAll = await fetch(`${API}/roles`);
    rolesCache = await resAll.json();

    cerrarModal();
    filtrarRoles();
    mostrarToast(esEdicion ? "Perfil actualizado" : "Perfil creado", "success");
}

async function verPermisos(id, nombre) {
    const res      = await fetch(`${API}/roles/${id}/permisos`);
    const permisos = await res.json();

    const tabla = MODULOS.map(mod => {
        const acciones = ACCIONES.map(acc => {
            const tiene = permisos.some(p => p.modulo === mod && p.accion === acc);
            return `<td style="text-align:center">${tiene ? "✅" : "—"}</td>`;
        }).join("");
        return `<tr><td><b>${mod}</b></td>${acciones}</tr>`;
    }).join("");

    document.getElementById("tituloModalUsuarios").textContent = `Permisos: ${nombre}`;
    document.getElementById("listaUsuariosPerfil").innerHTML = `
        <table class="tabla-modulo" style="min-width:100%">
            <thead>
                <tr>
                    <th style="text-align:left;padding-left:12px">Módulo</th>
                    ${ACCIONES.map(a => `<th>${a}</th>`).join("")}
                </tr>
            </thead>
            <tbody>${tabla}</tbody>
        </table>
    `;
    document.getElementById("modalUsuariosPerfil").style.display = "flex";
}

function cerrarModalUsuarios() {
    document.getElementById("modalUsuariosPerfil").style.display = "none";
}

function abrirModalEliminar(id) {
    rolEliminandoId = id;
    document.getElementById("modalEliminar").style.display = "flex";
}

function cerrarModalEliminar() {
    document.getElementById("modalEliminar").style.display = "none";
}

async function confirmarEliminar() {
    const res  = await fetch(`${API}/roles/${rolEliminandoId}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok) alert(data.message);

    rolesCache = rolesCache.filter(r => r.id_rol !== rolEliminandoId);
    cerrarModalEliminar();
    filtrarRoles();
}

function escapar(str) {
    return (str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function mostrarToast(mensaje, tipo = "success") {
    let toast = document.getElementById("toast-global");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-global";
        Object.assign(toast.style, {
            position: "fixed", bottom: "28px", right: "28px", zIndex: "9999",
            padding: "12px 22px", borderRadius: "10px", fontSize: "14px",
            fontWeight: "600", fontFamily: "inherit", maxWidth: "340px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
            transition: "opacity 0.3s ease", pointerEvents: "none",
        });
        document.body.appendChild(toast);
    }
    toast.textContent      = mensaje;
    toast.style.background = tipo === "success" ? "#16a34a" : "#dc2626";
    toast.style.color      = "#fff";
    toast.style.opacity    = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 2800);
}
