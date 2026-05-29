let usuarioEditandoId  = null;
let usuarioEliminandoId = null;

const rolActual    = localStorage.getItem("rolUsuario");
const idActual     = parseInt(localStorage.getItem("idUsuario"));

let rolesDisponibles = [];

// ── Carga roles para el select ──────────────────────────────────────────
async function cargarRolesSelect() {
    const res = await fetch("http://localhost:3000/roles");
    rolesDisponibles = await res.json();
}



function filtrarUsuarios() {
    const texto  = (document.getElementById("buscarUsuarios")?.value || "").toLowerCase();
    const estado = document.getElementById("filtroEstado")?.value || "";

    document.querySelectorAll("#cuerpoTabla tr").forEach(fila => {
        const nombre   = fila.children[1]?.textContent.toLowerCase() || "";
        const apellido = fila.children[2]?.textContent.toLowerCase() || "";
        const correo   = fila.children[3]?.textContent.toLowerCase() || "";
        const estadoFila = fila.children[5]?.textContent.trim() || "";

        const okTexto  = nombre.includes(texto) || apellido.includes(texto) || correo.includes(texto);
        const okEstado = estado === "" || estadoFila === estado;

        fila.style.display = (okTexto && okEstado) ? "" : "none";
    });
}


// ── Carga tabla de usuarios ─────────────────────────────────────────────
async function cargarUsuarios() {
    const res      = await fetch("http://localhost:3000/usuarios");
    const usuarios = await res.json();
    const tbody    = document.getElementById("cuerpoTabla");
    tbody.innerHTML = "";

    usuarios.forEach(u => {
        const tr = document.createElement("tr");

        const estadoClase  = u.estado === "activo" ? "estado-aprobado" : "estado-noaccess";
        const esElMismo    = u.id_usuario === idActual;
        const nivelActual  = jerarquia[rolActual]  || 0;
        const nivelObj     = jerarquia[u.rol]      || 0;

        const puedeEditar  = nivelActual > nivelObj || esElMismo;
        const puedeEliminar = nivelActual > nivelObj && !esElMismo;

        tr.innerHTML = `
            <td>${u.id_usuario}</td>
            <td>${u.nombre}</td>
            <td>${u.apellido}</td>
            <td>${u.correo}</td>
            <td>${u.rol || "-"}</td>
            <td><span class="${estadoClase}">${u.estado}</span></td>
            <td style="display:flex;gap:6px;justify-content:center;">
                <button class="btn-editar"
                    ${!puedeEditar ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ""}
                    onclick="${puedeEditar ? `abrirModalEditar(${u.id_usuario},'${u.nombre}','${u.apellido}','${u.correo}',${u.id_rol},'${u.estado}',${esElMismo})` : ""}">
                    Editar
                </button>
                <button class="btn-eliminar-tabla"
                    ${!puedeEliminar ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ""}
                    onclick="${puedeEliminar ? `abrirModalEliminar(${u.id_usuario})` : ""}">
                    Eliminar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Llena el select de roles filtrando por jerarquía ───────────────────
function llenarSelectRol(selectId, rolActualId, esElMismo) {
    const select      = document.getElementById(selectId);
    const nivelActual = jerarquia[rolActual] || 0;
    select.innerHTML  = "";

    rolesDisponibles.forEach(r => {
        const nivelRol = jerarquia[r.nombre] || 0;
        // Solo muestra roles de menor jerarquía; si es el mismo usuario, solo su rol
        if (nivelRol < nivelActual || (esElMismo && r.id_rol === rolActualId)) {
            const opt = document.createElement("option");
            opt.value       = r.id_rol;
            opt.textContent = r.nombre;
            if (r.id_rol === rolActualId) opt.selected = true;
            select.appendChild(opt);
        }
    });

    select.disabled = esElMismo; // No puede cambiar su propio rol
}

// ── Modales ─────────────────────────────────────────────────────────────
function abrirModalCrear() {
    usuarioEditandoId = null;
    document.getElementById("tituloModal").textContent          = "Nuevo Usuario";
    document.getElementById("inNombre").value                   = "";
    document.getElementById("inApellido").value                 = "";
    document.getElementById("inCorreo").value                   = "";
    document.getElementById("inContrasena").value               = "";
    document.getElementById("inContrasena").style.display       = "block";
    document.getElementById("inEstado").value                   = "activo";
    llenarSelectRol("inPerfil", null, false);
    document.getElementById("inPerfil").disabled                = false;
    document.getElementById("modalUsuario").style.display       = "flex";
}

function abrirModalEditar(id, nombre, apellido, correo, id_rol, estado, esElMismo) {
    usuarioEditandoId = id;
    document.getElementById("tituloModal").textContent    = "Editar Usuario";
    document.getElementById("inNombre").value             = nombre;
    document.getElementById("inApellido").value           = apellido;
    document.getElementById("inCorreo").value             = correo;
    document.getElementById("inContrasena").style.display = "none"; // No edita contraseña aquí
    document.getElementById("inEstado").value             = estado;
    llenarSelectRol("inPerfil", id_rol, esElMismo);
    document.getElementById("modalUsuario").style.display = "flex";
}

function cerrarModal() {
    document.getElementById("inPerfil").disabled          = false;
    document.getElementById("modalUsuario").style.display = "none";
}

async function guardarUsuario() {
    const esElMismo  = document.getElementById("inPerfil").disabled;
    const nuevoEstado = document.getElementById("inEstado").value;

    if (esElMismo && nuevoEstado !== "activo") {
        alert("No puedes desactivar tu propia cuenta.");
        return;
    }

    const body = {
        nombre:    document.getElementById("inNombre").value.trim(),
        apellido:  document.getElementById("inApellido").value.trim(),
        correo:    document.getElementById("inCorreo").value.trim(),
        id_rol:    document.getElementById("inPerfil").value,
        estado:    nuevoEstado
    };

    if (!usuarioEditandoId) {
        body.contrasena = document.getElementById("inContrasena").value;
        if (!body.contrasena) {
            alert("La contraseña es obligatoria para usuarios nuevos.");
            return;
        }
    }

    const url    = usuarioEditandoId
        ? `http://localhost:3000/usuarios/${usuarioEditandoId}`
        : "http://localhost:3000/usuarios";
    const method = usuarioEditandoId ? "PUT" : "POST";

    const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
        alert(data.message);
        return;
    }

    cerrarModal();
    cargarUsuarios();
}

// ── Modal eliminar ───────────────────────────────────────────────────────
function abrirModalEliminar(id) {
    usuarioEliminandoId = id;
    document.getElementById("modalEliminar").style.display = "flex";
}

function cerrarModalEliminar() {
    document.getElementById("modalEliminar").style.display = "none";
}

async function confirmarEliminar() {
    await fetch(`http://localhost:3000/usuarios/${usuarioEliminandoId}`, {
        method: "DELETE"
    });
    cerrarModalEliminar();
    cargarUsuarios();
}

// ── Init ─────────────────────────────────────────────────────────────────
async function init() {
    await cargarRolesSelect();
    cargarUsuarios();
}

init();