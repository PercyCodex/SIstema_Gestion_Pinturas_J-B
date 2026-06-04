"use strict";

const db = {
    productos: [],
    marcas: [],
    tipos: [],
    categorias: [],
    usuarios: [],
    editandoId: null,
    eliminandoId: null,
    eliminandoNombre: null,
};

const API            = "http://localhost:3000";
const rolActual      = localStorage.getItem("rolUsuario");
const idUsuarioActual = parseInt(localStorage.getItem("idUsuario"));
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

// ─── Inicialización — 1 sola petición paralela ───────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    iniciarPagina();
});

async function iniciarPagina() {
    mostrarSpinner(true);
    try {
        // Carga en paralelo — mínimas peticiones al servidor
        const [resProductos, resMarcas, resTipos, resCategorias, resUsuarios] = await Promise.all([
            fetch(`${API}/productos`),
            fetch(`${API}/marcas`),
            fetch(`${API}/tipos-pintura`),
            fetch(`${API}/categorias`),
            fetch(`${API}/usuarios`),
        ]);

        if (!resProductos.ok) throw new Error("Error al cargar productos");

        db.productos  = await resProductos.json();
        db.marcas     = await resMarcas.json();
        db.tipos      = await resTipos.json();
        db.categorias = await resCategorias.json();
        db.usuarios   = await resUsuarios.json();

        llenarFiltros();
        mostrarMensajeInicial();
        actualizarContador(0);
    } catch (err) {
        mostrarError(`No se pudieron cargar los productos: ${err.message}`);
    } finally {
        mostrarSpinner(false);
    }
}

// ─── Llenar filtros dinámicos ────────────────────────────────────────────────
function llenarFiltros() {
    // Marcas
    const selMarca = document.getElementById("filtroMarca");
    selMarca.innerHTML = `<option value="">Todas las marcas</option>`;
    db.marcas.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id_marca;
        opt.textContent = m.nombre;
        selMarca.appendChild(opt);
    });

    // Categorías
    const selCat = document.getElementById("filtroCategoria");
    selCat.innerHTML = `<option value="">Todas las categorías</option>`;
    db.categorias.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id_categoria;
        opt.textContent = c.id_padre ? `└ ${c.nombre}` : c.nombre;
        selCat.appendChild(opt);
    });

    // Usuarios registradores
    const selUser = document.getElementById("filtroUsuario");
    selUser.innerHTML = `<option value="">Todos los usuarios</option>`;
    db.usuarios.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.id_usuario;
        opt.textContent = `${u.nombre} ${u.apellido}`;
        selUser.appendChild(opt);
    });
}

// ─── Mensaje inicial ─────────────────────────────────────────────────────────
function mostrarMensajeInicial() {
    document.getElementById("cuerpoProductos").innerHTML = `
        <tr>
            <td colspan="9" class="tabla-vacia">
                <span class="vacia-icono">🔍</span>
                <span>Selecciona un filtro o busca para ver los productos</span>
            </td>
        </tr>`;
}

// ─── Render tabla ────────────────────────────────────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoProductos");
    tbody.innerHTML = "";

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="tabla-vacia">
                    <span class="vacia-icono">📦</span>
                    <span>No se encontraron productos</span>
                </td>
            </tr>`;
        return;
    }

    lista.forEach(p => tbody.appendChild(crearFila(p)));
}

function crearFila(p) {
    const tr = document.createElement("tr");
    tr.dataset.id = p.id_producto;

    const estadoHtml = {
        activo:        `<span class="badge badge-activo">Activo</span>`,
        inactivo:      `<span class="badge badge-inactivo">Inactivo</span>`,
        descontinuado: `<span class="badge badge-desc">Descontinuado</span>`,
    }[p.estado] || `<span class="badge">${p.estado}</span>`;

    const mezcableHtml = p.es_mezcable
        ? `<span class="badge badge-mezcable">Sí</span>`
        : `<span class="td-vacio">No</span>`;

    const categoriasHtml = Array.isArray(p.categorias) && p.categorias.length > 0
        ? p.categorias.map(c => `<span class="badge-cat">${c}</span>`).join(" ")
        : `<span class="td-vacio">—</span>`;

    const acciones = puedeGestionar
        ? `<button class="btn-accion btn-editar"   onclick="abrirModalEditar(${p.id_producto})">Editar</button>
           <button class="btn-accion btn-eliminar" onclick="abrirModalEliminar(${p.id_producto}, '${escapar(p.nombre)}')">Eliminar</button>`
        : `<button class="btn-accion btn-editar"   disabled>Editar</button>
           <button class="btn-accion btn-eliminar" disabled>Eliminar</button>`;

    tr.innerHTML = `
        <td class="td-nombre td-padre">${p.nombre}</td>
        <td>${p.marca_nombre || '<span class="td-vacio">—</span>'}</td>
        <td>${categoriasHtml}</td>
        <td class="td-mono">${p.codigo_interno || '<span class="td-vacio">—</span>'}</td>
        <td class="td-precio">S/ ${parseFloat(p.precio_base).toFixed(2)}</td>
        <td>${p.unidad_medida}</td>
        <td>${mezcableHtml}</td>
        <td>${estadoHtml}</td>
        <td class="td-registrado">
            <span class="registrado-nombre">${p.registrado_por || '<span class="td-vacio">—</span>'}</span>
            <span class="registrado-fecha">${formatFecha(p.fecha_registro)}</span>
        </td>
        <td class="td-acciones">${acciones}</td>
    `;
    return tr;
}

// ─── Filtro 100% en memoria ──────────────────────────────────────────────────
function filtrarProductos() {
    const texto    = (document.getElementById("buscarProducto")?.value || "").trim();
    const marca    = document.getElementById("filtroMarca")?.value    || "";
    const cat      = document.getElementById("filtroCategoria")?.value || "";
    const estado   = document.getElementById("filtroEstado")?.value   || "";
    const usuario  = document.getElementById("filtroUsuario")?.value  || "";
    const desde    = document.getElementById("filtroDesde")?.value    || "";
    const hasta    = document.getElementById("filtroHasta")?.value    || "";

    if (!texto && !marca && !cat && !estado && !usuario && !desde && !hasta) {
        mostrarMensajeInicial();
        actualizarContador(0);
        return;
    }

    const filtrados = db.productos.filter(p => {
        const okTexto  = !texto   || p.nombre.toLowerCase().includes(texto.toLowerCase())
                                    || (p.codigo_interno || "").toLowerCase().includes(texto.toLowerCase())
                                    || (p.descripcion    || "").toLowerCase().includes(texto.toLowerCase());
        const okMarca  = !marca   || p.id_marca === parseInt(marca);
        const okCat = !cat || (() => {
        const catObj = db.categorias.find(c => c.id_categoria === parseInt(cat));
                if (!catObj) return false;
                return Array.isArray(p.categorias) && p.categorias.includes(catObj.nombre);
        })();
        const okEstado = !estado  || p.estado === estado;
        const okUser   = !usuario || p.id_usuario === parseInt(usuario);

        let okFecha = true;
        if (p.fecha_registro) {
            const fecha = new Date(p.fecha_registro).toISOString().split("T")[0];
            if (desde && fecha < desde) okFecha = false;
            if (hasta && fecha > hasta) okFecha = false;
        }

        return okTexto && okMarca && okCat && okEstado && okUser && okFecha;
    });

    renderTabla(filtrados);
    actualizarContador(filtrados.length);
}

// ─── Llenar selects del modal ────────────────────────────────────────────────
function llenarSelectsModal() {
    // Marcas
    const selMarca = document.getElementById("inMarca");
    selMarca.innerHTML = `<option value="">— Selecciona una marca —</option>`;
    db.marcas.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id_marca;
        opt.textContent = m.nombre;
        selMarca.appendChild(opt);
    });

    // Tipos
    const selTipo = document.getElementById("inTipo");
    selTipo.innerHTML = `<option value="">— Selecciona un tipo —</option>`;
    db.tipos.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id_tipo;
        opt.textContent = t.nombre;
        selTipo.appendChild(opt);
    });

    // Categorías
    const selCat = document.getElementById("inCategoria");
    selCat.innerHTML = `<option value="">— Selecciona una categoría —</option>`;
    db.categorias.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id_categoria;
        opt.textContent = c.id_padre ? `└ ${c.nombre}` : c.nombre;
        selCat.appendChild(opt);
    });
}

// ─── Modal Crear ─────────────────────────────────────────────────────────────
function abrirModalCrear() {
    if (!puedeGestionar) { mostrarToast("Sin permiso para crear productos", "error"); return; }
    db.editandoId = null;
    document.getElementById("tituloModal").textContent = "Nuevo Producto";
    limpiarFormulario();
    llenarSelectsModal();
    abrirModal("modalProducto");
}

// ─── Modal Editar ────────────────────────────────────────────────────────────
function abrirModalEditar(id) {
    const p = db.productos.find(x => x.id_producto === id);
    if (!p) return;

    db.editandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Producto";
    llenarSelectsModal();

    document.getElementById("inNombre").value       = p.nombre;
    document.getElementById("inDescripcion").value  = p.descripcion   || "";
    document.getElementById("inCodigo").value       = p.codigo_interno || "";
    document.getElementById("inPrecio").value       = p.precio_base;
    document.getElementById("inUnidad").value       = p.unidad_medida;
    document.getElementById("inMezcable").checked  = p.es_mezcable;
    document.getElementById("inEstado").value       = p.estado;
    document.getElementById("inMarca").value        = p.id_marca;
    document.getElementById("inTipo").value         = p.id_tipo;

    // Seleccionar categoría si tiene
    if (Array.isArray(p.categorias) && p.categorias.length > 0) {
    const catObj = db.categorias.find(c => c.nombre === p.categorias[0]);
    if (catObj) document.getElementById("inCategoria").value = catObj.id_categoria;
    }

    limpiarErrorModal();
    abrirModal("modalProducto");
}

function cerrarModalForm() { cerrarModal("modalProducto"); }

// ─── Guardar ─────────────────────────────────────────────────────────────────
async function guardarProducto() {
    const nombre  = document.getElementById("inNombre").value.trim();
    const marca   = document.getElementById("inMarca").value;
    const tipo    = document.getElementById("inTipo").value;
    const precio  = document.getElementById("inPrecio").value;
    const cat     = document.getElementById("inCategoria").value;

    if (!nombre)  { mostrarErrorModal("El nombre es obligatorio.");        return; }
    if (!marca)   { mostrarErrorModal("Selecciona una marca.");             return; }
    if (!tipo)    { mostrarErrorModal("Selecciona un tipo de pintura.");    return; }
    if (!precio)  { mostrarErrorModal("El precio base es obligatorio.");    return; }

    limpiarErrorModal();
    document.getElementById("btnGuardar").disabled    = true;
    document.getElementById("btnGuardar").textContent = "Guardando…";

    const body = {
        id_marca:       parseInt(marca),
        id_tipo:        parseInt(tipo),
        id_usuario:     idUsuarioActual || null,
        nombre,
        descripcion:    document.getElementById("inDescripcion").value.trim() || null,
        codigo_interno: document.getElementById("inCodigo").value.trim()      || null,
        precio_base:    parseFloat(precio),
        unidad_medida:  document.getElementById("inUnidad").value,
        es_mezcable:    document.getElementById("inMezcable").checked,
        estado:         document.getElementById("inEstado").value,
        categorias:     cat ? [parseInt(cat)] : [],
    };

    try {
        const esEdicion = db.editandoId !== null;
        const url    = esEdicion ? `${API}/productos/${db.editandoId}` : `${API}/productos`;
        const method = esEdicion ? "PUT" : "POST";

        const res  = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { mostrarErrorModal(data.message || "Error al guardar"); return; }

        if (esEdicion) {
            const idx = db.productos.findIndex(x => x.id_producto === db.editandoId);
            if (idx !== -1) {
                const marca_obj = db.marcas.find(m => m.id_marca === body.id_marca);
                const tipo_obj  = db.tipos.find(t => t.id_tipo === body.id_tipo);
                const cat_obj   = db.categorias.find(c => c.id_categoria === (cat ? parseInt(cat) : null));
                db.productos[idx] = {
                    ...db.productos[idx],
                    ...body,
                    marca_nombre:   marca_obj?.nombre || null,
                    tipo_nombre:    tipo_obj?.nombre  || null,
                    categorias:     cat_obj ? [cat_obj.nombre] : [],
                    categorias_ids: cat ? [parseInt(cat)] : [],
                };
            }
        } else {
            // Nuevo producto — refrescar desde BD para tener id correcto
            const res2 = await fetch(`${API}/productos`);
            db.productos = await res2.json();
        }

        cerrarModal("modalProducto");
        filtrarProductos();
        mostrarToast(esEdicion ? "Producto actualizado" : "Producto creado", "success");

    } catch (err) {
        mostrarErrorModal("Error de conexión con el servidor.");
    } finally {
        document.getElementById("btnGuardar").disabled    = false;
        document.getElementById("btnGuardar").textContent = "Guardar";
    }
}

// ─── Modal Eliminar ──────────────────────────────────────────────────────────
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
        const res  = await fetch(`${API}/productos/${db.eliminandoId}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) {
            cerrarModal("modalEliminar");
            mostrarToast(data.message || "No se pudo eliminar", "error");
            return;
        }

        db.productos = db.productos.filter(x => x.id_producto !== db.eliminandoId);
        cerrarModal("modalEliminar");
        filtrarProductos();
        mostrarToast("Producto eliminado", "success");

    } catch (err) {
        mostrarToast("Error de conexión", "error");
    } finally {
        document.getElementById("btnConfirmarEliminar").disabled    = false;
        document.getElementById("btnConfirmarEliminar").textContent = "Sí, eliminar";
    }
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────
function abrirModal(id)  { const el = document.getElementById(id); if (el) el.style.display = "flex"; }
function cerrarModal(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

function limpiarFormulario() {
    ["inNombre","inDescripcion","inCodigo","inPrecio"].forEach(id => {
        document.getElementById(id).value = "";
    });
    document.getElementById("inUnidad").value    = "litro";
    document.getElementById("inEstado").value    = "activo";
    document.getElementById("inMezcable").checked = false;
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
    const el = document.getElementById("totalProductos");
    if (el) el.textContent = n > 0 ? `${n} producto${n !== 1 ? "s" : ""}` : "";
}

function mostrarSpinner(visible) {
    const el = document.getElementById("spinnerCarga");
    if (el) el.style.display = visible ? "flex" : "none";
}

function mostrarError(msg) {
    const el = document.getElementById("errorGeneral");
    if (el) { el.textContent = msg; el.style.display = "block"; }
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
            transition: "opacity 0.3s ease, transform 0.3s ease",
            pointerEvents: "none",
        });
        document.body.appendChild(toast);
    }
    toast.textContent      = mensaje;
    toast.style.background = tipo === "success" ? "#16a34a" : "#dc2626";
    toast.style.color      = "#fff";
    toast.style.opacity    = "1";
    toast.style.transform  = "translateY(0)";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
        toast.style.opacity   = "0";
        toast.style.transform = "translateY(10px)";
    }, 3200);
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

document.addEventListener("click", e => {
    if (e.target.id === "modalProducto") cerrarModal("modalProducto");
    if (e.target.id === "modalEliminar") cerrarModal("modalEliminar");
});