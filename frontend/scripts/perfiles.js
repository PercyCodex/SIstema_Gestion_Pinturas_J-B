let rolEditandoId  = null;
let rolEliminandoId = null;

const rolActual      = localStorage.getItem("rolUsuario");
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

// Módulos y acciones disponibles en el sistema
const MODULOS = ["ventas", "inventario", "mezclas", "compras", "clientes",
                "usuarios", "reportes", "configuracion"];
const ACCIONES = ["ver", "crear", "editar", "eliminar"];

// ── Genera la grilla de permisos ────────────────────────────────────────
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
            label.innerHTML = `
                <input type="checkbox"
                    data-modulo="${modulo}"
                    data-accion="${accion}"
                    ${activo ? "checked" : ""}>
                <span>${accion}</span>
            `;
            fila.appendChild(label);
        });

        grid.appendChild(fila);
    });
}

// ── Carga tabla de roles ────────────────────────────────────────────────
async function cargarRoles() {
    const res   = await fetch("http://localhost:3000/roles");
    const roles = await res.json();
    const tbody = document.getElementById("cuerpoTabla");
    tbody.innerHTML = "";

    roles.forEach(r => {
        const tr         = document.createElement("tr");
        const estadoClase = r.estado === "activo" ? "estado-aprobado" : "estado-noaccess";

        const btnEditar = puedeGestionar
            ? `<button class="btn-editar" onclick="abrirModalEditar(${r.id_rol}, '${r.nombre}', '${(r.descripcion || "").replace(/'/g, "\\'")}', '${r.estado}')">Editar</button>`
            : `<button class="btn-editar" disabled style="opacity:0.4;cursor:not-allowed;">Editar</button>`;

        const btnEliminar = puedeGestionar
            ? `<button class="btn-eliminar-tabla" onclick="abrirModalEliminar(${r.id_rol})">Eliminar</button>`
            : `<button class="btn-eliminar-tabla" disabled style="opacity:0.4;cursor:not-allowed;">Eliminar</button>`;

        tr.innerHTML = `
            <td>${r.id_rol}</td>
            <td>${r.nombre}</td>
            <td>${r.descripcion || "-"}</td>
            <td><span class="${estadoClase}">${r.estado}</span></td>
            <td>${r.total_usuarios}</td>
            <td style="display:flex;gap:6px;justify-content:center;">
                <button class="btn-ver" onclick="verPermisos(${r.id_rol}, '${r.nombre}')">Permisos</button>
                ${btnEditar}
                ${btnEliminar}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Filtro de búsqueda ──────────────────────────────────────────────────
function filtrarRoles() {
    const texto  = (document.getElementById("buscarPerfiles")?.value || "").toLowerCase();
    const estado = document.getElementById("filtroEstado")?.value || "";

    document.querySelectorAll("#cuerpoTabla tr").forEach(fila => {
        const nombre      = fila.children[1]?.textContent.toLowerCase() || "";
        const descripcion = fila.children[2]?.textContent.toLowerCase() || "";
        const estadoFila  = fila.children[3]?.textContent.trim() || "";

        const okTexto  = nombre.includes(texto) || descripcion.includes(texto);
        const okEstado = estado === "" || estadoFila === estado;

        fila.style.display = (okTexto && okEstado) ? "" : "none";
    });
}

// ── Modales ─────────────────────────────────────────────────────────────
function abrirModalCrear() {
    if (!puedeGestionar) { alert("No tienes permiso para crear roles."); return; }
    rolEditandoId = null;
    document.getElementById("tituloModal").textContent = "Nuevo Rol";
    document.getElementById("inNombre").value      = "";
    document.getElementById("inDescripcion").value = "";
    document.getElementById("inEstado").value      = "activo";
    generarGrillaPermisos([]);
    document.getElementById("modalPerfil").style.display = "flex";
}

async function abrirModalEditar(id, nombre, descripcion, estado) {
    rolEditandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Rol";
    document.getElementById("inNombre").value          = nombre;
    document.getElementById("inDescripcion").value     = descripcion;
    document.getElementById("inEstado").value          = estado;

    // Cargar permisos actuales del rol
    const res      = await fetch(`http://localhost:3000/roles/${id}/permisos`);
    const permisos = await res.json();
    generarGrillaPermisos(permisos);

    document.getElementById("modalPerfil").style.display = "flex";
}

function cerrarModal() {
    document.getElementById("modalPerfil").style.display = "none";
}

async function guardarPerfil() {
    const nombre = document.getElementById("inNombre").value.trim();
    if (!nombre) { alert("El nombre del rol es obligatorio."); return; }

    // Recoger permisos marcados
    const permisos = [];
    document.querySelectorAll("#permisosGrid input[type='checkbox']:checked").forEach(cb => {
        permisos.push({ modulo: cb.dataset.modulo, accion: cb.dataset.accion });
    });

    const body = {
        nombre,
        descripcion: document.getElementById("inDescripcion").value.trim(),
        estado:      document.getElementById("inEstado").value,
    };

    const url    = rolEditandoId
        ? `http://localhost:3000/roles/${rolEditandoId}`
        : "http://localhost:3000/roles";
    const method = rolEditandoId ? "PUT" : "POST";

    const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json();

    // Si es nuevo, obtenemos el id del rol recién creado para guardar sus permisos
    if (!rolEditandoId) {
        const rolesRes = await fetch("http://localhost:3000/roles");
        const roles    = await rolesRes.json();
        const nuevo    = roles.find(r => r.nombre === nombre);
        if (nuevo) rolEditandoId = nuevo.id_rol;
    }

    // Guardar permisos
    await fetch(`http://localhost:3000/roles/${rolEditandoId}/permisos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permisos })
    });

    cerrarModal();
    cargarRoles();
}

// ── Modal ver permisos (solo lectura) ───────────────────────────────────
async function verPermisos(id, nombre) {
    const res      = await fetch(`http://localhost:3000/roles/${id}/permisos`);
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
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
                <tr style="background:#007BFF;color:white;">
                    <th style="padding:8px;text-align:left">Módulo</th>
                    ${ACCIONES.map(a => `<th style="padding:8px">${a}</th>`).join("")}
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

// ── Modal eliminar ───────────────────────────────────────────────────────
function abrirModalEliminar(id) {
    rolEliminandoId = id;
    document.getElementById("modalEliminar").style.display = "flex";
}

function cerrarModalEliminar() {
    document.getElementById("modalEliminar").style.display = "none";
}

async function confirmarEliminar() {
    const res  = await fetch(`http://localhost:3000/roles/${rolEliminandoId}`, { method: "DELETE" });
    const data = await res.json();

    if (!res.ok) { alert(data.message); }

    cerrarModalEliminar();
    cargarRoles();
}

// ── Init ─────────────────────────────────────────────────────────────────
cargarRoles();