"use strict";

const db = {
    marcas: [],
    editandoId: null,
    eliminandoId: null,
    eliminandoNombre: null,
};

const API            = "http://localhost:3000";
const rolActual      = localStorage.getItem("rolUsuario");
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

// ─── Inicialización ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    iniciarPagina();
});

async function iniciarPagina() {
    mostrarSpinner(true);
    try {
        const res = await fetch(`${API}/marcas/todas`);
        if (!res.ok) throw new Error("Error al cargar marcas");
        db.marcas = await res.json();
        llenarFiltroPais();
        mostrarMensajeInicial();
        actualizarContador(0);
    } catch (err) {
        mostrarError(`No se pudieron cargar las marcas: ${err.message}`);
    } finally {
        mostrarSpinner(false);
    }
}

// ─── Mensaje inicial ─────────────────────────────────────────────────────────
function mostrarMensajeInicial() {
    document.getElementById("cuerpoMarcas").innerHTML = `
        <tr>
            <td colspan="6" class="tabla-vacia">
                <span class="vacia-icono">🔍</span>
                <span>Selecciona un filtro o busca para ver las marcas</span>
            </td>
        </tr>`;
}

// ─── Llenar filtro país dinámico ─────────────────────────────────────────────
function llenarFiltroPais() {
    const select = document.getElementById("filtroPais");
    select.innerHTML = `<option value="">Filtrar por país</option>`;
    const paises = [...new Set(db.marcas.map(m => m.pais_origen).filter(Boolean))].sort();
    paises.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
    });
}

// ─── Render tabla ────────────────────────────────────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoMarcas");
    tbody.innerHTML = "";

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="tabla-vacia">
                    <span class="vacia-icono">🔍</span>
                    <span>No se encontraron resultados</span>
                </td>
            </tr>`;
        return;
    }

    lista.forEach(m => tbody.appendChild(crearFila(m)));
}

function crearFila(m) {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id_marca;

    const estadoHtml = m.estado === "activo"
        ? `<span class="badge badge-activo">Activo</span>`
        : `<span class="badge badge-inactivo">Inactivo</span>`;

    const totalProductos = parseInt(m.total_productos) || 0;
    const productoBadge = totalProductos === 0
        ? `<span class="badge badge-sinprod">Sin productos</span>`
        : `<span class="badge badge-conprod">${totalProductos} producto${totalProductos !== 1 ? "s" : ""}</span>`;

    const acciones = puedeGestionar
        ? `<button class="btn-accion btn-editar"   onclick="abrirModalEditar(${m.id_marca})">Editar</button>
           <button class="btn-accion btn-eliminar" onclick="abrirModalEliminar(${m.id_marca}, '${escapar(m.nombre)}')">Eliminar</button>`
        : `<button class="btn-accion btn-editar"   disabled title="Sin permiso">Editar</button>
           <button class="btn-accion btn-eliminar" disabled title="Sin permiso">Eliminar</button>`;

    tr.innerHTML = `
        <td class="td-nombre td-padre">${m.nombre}</td>
        <td class="td-desc">${m.descripcion || '<span class="td-vacio">—</span>'}</td>
        <td>${m.pais_origen || '<span class="td-vacio">—</span>'}</td>
        <td>${productoBadge}</td>
        <td>${estadoHtml}</td>
        <td>${formatFecha(m.fecha_creacion)}</td>
        <td class="td-acciones">${acciones}</td>
    `;
    return tr;
}

// ─── Filtro 100% en memoria ──────────────────────────────────────────────────
function filtrarMarcas() {
    const texto  = (document.getElementById("buscarMarca")?.value || "").trim();
    const estado = document.getElementById("filtroEstado")?.value || "";
    const pais   = document.getElementById("filtroPais")?.value   || "";
    const desde  = document.getElementById("filtroDesde")?.value  || "";
    const hasta  = document.getElementById("filtroHasta")?.value  || "";

    if (!texto && !estado && !pais && !desde && !hasta) {
        mostrarMensajeInicial();
        actualizarContador(0);
        return;
    }

    const filtradas = db.marcas.filter(m => {
        const okTexto  = !texto  || m.nombre.toLowerCase().includes(texto.toLowerCase())
                                 || (m.descripcion  || "").toLowerCase().includes(texto.toLowerCase())
                                 || (m.pais_origen  || "").toLowerCase().includes(texto.toLowerCase());
        const okEstado = !estado || m.estado === estado;
        const okPais   = !pais   || m.pais_origen === pais;

        let okFecha = true;
        if (m.fecha_creacion) {
            const fecha = new Date(m.fecha_creacion).toISOString().split("T")[0];
            if (desde && fecha < desde) okFecha = false;
            if (hasta && fecha > hasta) okFecha = false;
        }

        return okTexto && okEstado && okPais && okFecha;
    });

    renderTabla(filtradas);
    actualizarContador(filtradas.length);
}

// ─── Modal Crear ─────────────────────────────────────────────────────────────
function abrirModalCrear() {
    if (!puedeGestionar) { mostrarToast("Sin permiso para crear marcas", "error"); return; }
    db.editandoId = null;
    document.getElementById("tituloModal").textContent = "Nueva Marca";
    limpiarFormulario();
    abrirModal("modalMarca");
}

// ─── Modal Editar ────────────────────────────────────────────────────────────
function abrirModalEditar(id) {
    const m = db.marcas.find(x => x.id_marca === id);
    if (!m) return;

    db.editandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Marca";
    document.getElementById("inNombre").value      = m.nombre;
    document.getElementById("inDescripcion").value = m.descripcion  || "";
    document.getElementById("inPais").value        = m.pais_origen  || "";
    document.getElementById("inEstado").value      = m.estado;
    limpiarErrorModal();
    abrirModal("modalMarca");
}

function cerrarModalForm() { cerrarModal("modalMarca"); }

// ─── Guardar ─────────────────────────────────────────────────────────────────
async function guardarMarca() {
    const nombre = document.getElementById("inNombre").value.trim();
    if (!nombre) { mostrarErrorModal("El nombre es obligatorio."); return; }

    limpiarErrorModal();
    document.getElementById("btnGuardar").disabled    = true;
    document.getElementById("btnGuardar").textContent = "Guardando…";

    const body = {
        nombre,
        descripcion:  document.getElementById("inDescripcion").value.trim() || null,
        pais_origen:  document.getElementById("inPais").value.trim()        || null,
        estado:       document.getElementById("inEstado").value,
    };

    try {
        const esEdicion = db.editandoId !== null;
        const url    = esEdicion ? `${API}/marcas/${db.editandoId}` : `${API}/marcas`;
        const method = esEdicion ? "PUT" : "POST";

        const res  = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { mostrarErrorModal(data.message || "Error al guardar"); return; }

        if (esEdicion) {
            const idx = db.marcas.findIndex(x => x.id_marca === db.editandoId);
            if (idx !== -1) {
                db.marcas[idx] = { ...db.marcas[idx], ...body };
            }
        } else {
            const nueva = data.marca;
            nueva.total_productos = 0;
            db.marcas.push(nueva);
            llenarFiltroPais();
        }

        cerrarModal("modalMarca");
        filtrarMarcas();
        mostrarToast(esEdicion ? "Marca actualizada" : "Marca creada", "success");

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
        const res  = await fetch(`${API}/marcas/${db.eliminandoId}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) {
            cerrarModal("modalEliminar");
            mostrarToast(data.message || "No se pudo eliminar", "error");
            return;
        }

        db.marcas = db.marcas.filter(x => x.id_marca !== db.eliminandoId);
        llenarFiltroPais();
        cerrarModal("modalEliminar");
        filtrarMarcas();
        mostrarToast("Marca eliminada", "success");

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
    document.getElementById("inNombre").value      = "";
    document.getElementById("inDescripcion").value = "";
    document.getElementById("inPais").value        = "";
    document.getElementById("inEstado").value      = "activo";
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
    const el = document.getElementById("totalMarcas");
    if (el) el.textContent = n > 0 ? `${n} registro${n !== 1 ? "s" : ""}` : "";
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
    if (e.target.id === "modalMarca")    cerrarModal("modalMarca");
    if (e.target.id === "modalEliminar") cerrarModal("modalEliminar");
});