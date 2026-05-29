let categoriaEditandoId  = null;
let categoriaEliminandoId = null;

const rolActual      = localStorage.getItem("rolUsuario");
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

let todasCategorias = [];

// ── Cargar y renderizar tabla ───────────────────────────────────────────
async function cargarCategorias() {
    const res  = await fetch("http://localhost:3000/categorias");
    todasCategorias = await res.json();
    renderizarTabla(todasCategorias);
    llenarSelectPadre(null);
}

function renderizarTabla(categorias) {
    const tbody = document.getElementById("cuerpoCategorias");
    tbody.innerHTML = "";

    // Separar padres e hijos
    const padres = categorias.filter(c => !c.id_padre);
    const hijos  = categorias.filter(c => c.id_padre);

    // Renderizar padres primero, luego sus hijos
    padres.forEach(padre => {
        tbody.appendChild(crearFila(padre, false));

        hijos
            .filter(h => h.id_padre === padre.id_categoria)
            .forEach(hijo => tbody.appendChild(crearFila(hijo, true)));
    });

    // Hijos huérfanos (cuyo padre no está en la lista filtrada)
    hijos
        .filter(h => !padres.find(p => p.id_categoria === h.id_padre))
        .forEach(h => tbody.appendChild(crearFila(h, true)));
}

function crearFila(cat, esHijo) {
    const tr = document.createElement("tr");
    const estadoClase = cat.estado === "activo" ? "estado-aprobado" : "estado-noaccess";

    const nombreCell = esHijo
        ? `<span class="sub-indicador">└</span> ${cat.nombre}`
        : `<strong>${cat.nombre}</strong>`;

    const btnEditar = puedeGestionar
        ? `<button class="btn-editar" onclick="abrirModalEditar(${cat.id_categoria})">Editar</button>`
        : `<button class="btn-editar" disabled style="opacity:0.4;cursor:not-allowed;">Editar</button>`;

    const btnEliminar = puedeGestionar
        ? `<button class="btn-eliminar-tabla" onclick="abrirModalEliminar(${cat.id_categoria})">Eliminar</button>`
        : `<button class="btn-eliminar-tabla" disabled style="opacity:0.4;cursor:not-allowed;">Eliminar</button>`;

    tr.innerHTML = `
        <td>${cat.id_categoria}</td>
        <td class="${esHijo ? 'celda-hijo' : 'celda-padre'}">${nombreCell}</td>
        <td>${cat.nombre_padre || ""}</td>
        <td>${cat.descripcion || "-"}</td>
        <td><span class="${estadoClase}">${cat.estado}</span></td>
        <td style="display:flex;gap:6px;justify-content:center;">
            ${btnEditar}${btnEliminar}
        </td>
    `;
    return tr;
}

// ── Filtro ──────────────────────────────────────────────────────────────
function filtrarCategorias() {
    const texto  = (document.getElementById("buscarCategoria")?.value || "").toLowerCase();
    const estado = document.getElementById("filtroEstado")?.value || "";
    const tipo   = document.getElementById("filtroTipo")?.value || "";

    const filtradas = todasCategorias.filter(c => {
        const okTexto  = c.nombre.toLowerCase().includes(texto) ||
                        (c.descripcion || "").toLowerCase().includes(texto);
        const okEstado = estado === "" || c.estado === estado;
        const okTipo   = tipo === "" ||
                        (tipo === "padre" && !c.id_padre) ||
                        (tipo === "hijo"  &&  c.id_padre);
        return okTexto && okEstado && okTipo;
    });

    renderizarTabla(filtradas);
}

// ── Select de padre en el modal ─────────────────────────────────────────
function llenarSelectPadre(excluirId) {
    const select = document.getElementById("inPadre");
    select.innerHTML = `<option value="">— (categoría raíz) —</option>`;

    todasCategorias
        .filter(c => !c.id_padre && c.id_categoria !== excluirId)
        .forEach(c => {
            const opt = document.createElement("option");
            opt.value       = c.id_categoria;
            opt.textContent = c.nombre;
            select.appendChild(opt);
        });
}

// ── Modal Crear ─────────────────────────────────────────────────────────
function abrirModalCrear() {
    if (!puedeGestionar) { alert("No tienes permiso para crear categorías."); return; }
    categoriaEditandoId = null;
    document.getElementById("tituloModal").textContent = "Nueva Categoría";
    document.getElementById("inNombre").value      = "";
    document.getElementById("inDescripcion").value = "";
    document.getElementById("inEstado").value      = "activo";
    llenarSelectPadre(null);
    document.getElementById("inPadre").value = "";
    document.getElementById("modalCategoria").style.display = "flex";
}

// ── Modal Editar ────────────────────────────────────────────────────────
function abrirModalEditar(id) {
    const cat = todasCategorias.find(c => c.id_categoria === id);
    if (!cat) return;

    categoriaEditandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Categoría";
    document.getElementById("inNombre").value          = cat.nombre;
    document.getElementById("inDescripcion").value     = cat.descripcion || "";
    document.getElementById("inEstado").value          = cat.estado;
    llenarSelectPadre(id); // excluye la propia categoría
    document.getElementById("inPadre").value           = cat.id_padre || "";
    document.getElementById("modalCategoria").style.display = "flex";
}

function cerrarModal() {
    document.getElementById("modalCategoria").style.display = "none";
}

// ── Guardar ─────────────────────────────────────────────────────────────
async function guardarCategoria() {
    const nombre = document.getElementById("inNombre").value.trim();
    if (!nombre) { alert("El nombre es obligatorio."); return; }

    const body = {
        nombre,
        descripcion: document.getElementById("inDescripcion").value.trim(),
        id_padre:    document.getElementById("inPadre").value || null,
        estado:      document.getElementById("inEstado").value
    };

    const url    = categoriaEditandoId
        ? `http://localhost:3000/categorias/${categoriaEditandoId}`
        : "http://localhost:3000/categorias";
    const method = categoriaEditandoId ? "PUT" : "POST";

    const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) { alert(data.message); return; }

    cerrarModal();
    cargarCategorias();
}

// ── Modal Eliminar ──────────────────────────────────────────────────────
function abrirModalEliminar(id) {
    categoriaEliminandoId = id;
    document.getElementById("modalEliminar").style.display = "flex";
}

function cerrarModalEliminar() {
    document.getElementById("modalEliminar").style.display = "none";
}

async function confirmarEliminar() {
    const res  = await fetch(`http://localhost:3000/categorias/${categoriaEliminandoId}`, {
        method: "DELETE"
    });
    const data = await res.json();

    if (!res.ok) { alert(data.message); }

    cerrarModalEliminar();
    cargarCategorias();
}

// ── Init ────────────────────────────────────────────────────────────────
cargarCategorias();