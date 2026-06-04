"use strict";

const db = {
    presentaciones: [],
    editandoId: null,
    eliminandoId: null,
};

const API            = "http://localhost:3000";
const rolActual      = localStorage.getItem("rolUsuario");
const puedeGestionar = ["Super Administrador", "Administrador"].includes(rolActual);

// Fracciones predefinidas para el selector rápido
const FRACCIONES = [
    { label: "1/8",  valor: 0.125 },
    { label: "1/4",  valor: 0.25  },
    { label: "1/2",  valor: 0.5   },
    { label: "3/4",  valor: 0.75  },
    { label: "1",    valor: 1     },
    { label: "2",    valor: 2     },
    { label: "4",    valor: 4     },
    { label: "5",    valor: 5     },
    { label: "10",   valor: 10    },
    { label: "20",   valor: 20    },
];

const UNIDADES = [
    { value: "litro",  label: "Litro (L)"   },
    { value: "galon",  label: "Galón (Gal)" },
    { value: "kg",     label: "Kilogramo (Kg)" },
    { value: "ml",     label: "Mililitro (ml)" },
    { value: "unidad", label: "Unidad (Und)"   },
];

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    iniciarPagina();
});

async function iniciarPagina() {
    mostrarSpinner(true);
    try {
        const res = await fetch(`${API}/presentaciones`);
        if (!res.ok) throw new Error("Error al cargar presentaciones");
        db.presentaciones = await res.json();
        mostrarMensajeInicial();
        actualizarContador(0);
    } catch (err) {
        mostrarError(`No se pudieron cargar las presentaciones: ${err.message}`);
    } finally {
        mostrarSpinner(false);
    }
}

// ─── Mensaje inicial ──────────────────────────────────────────────────────────
function mostrarMensajeInicial() {
    document.getElementById("cuerpoPresentaciones").innerHTML = `
        <tr>
            <td colspan="7" class="tabla-vacia">
                <span class="vacia-icono">🔍</span>
                <span>Busca o filtra para ver las presentaciones</span>
            </td>
        </tr>`;
}

// ─── Render tabla ─────────────────────────────────────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoPresentaciones");
    tbody.innerHTML = "";

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="tabla-vacia">
                    <span class="vacia-icono">📦</span>
                    <span>No se encontraron presentaciones</span>
                </td>
            </tr>`;
        return;
    }

    lista.forEach(p => tbody.appendChild(crearFila(p)));
}

function crearFila(p) {
    const tr = document.createElement("tr");
    tr.dataset.id = p.id_presentacion;

    // Mostrar cantidad bonita (fracciones)
    const cantidadBonita = formatCantidad(parseFloat(p.volumen_cantidad));
    const unidadLabel = UNIDADES.find(u => u.value === p.unidad_medida)?.label || p.unidad_medida;

    const estadoHtml = p.estado === "activo"
        ? `<span class="badge badge-activo">Activo</span>`
        : `<span class="badge badge-inactivo">Inactivo</span>`;

    const visibleHtml = p.es_visible_web
        ? `<span class="badge badge-visible">Web ✓</span>`
        : `<span class="badge badge-oculto">Oculto</span>`;

    const total = parseInt(p.total_productos) || 0;
    const prodHtml = total > 0
        ? `<span class="badge badge-prod">${total}</span>`
        : `<span class="td-vacio">—</span>`;

    const acciones = puedeGestionar
        ? `<button class="btn-accion btn-editar"   onclick="abrirModalEditar(${p.id_presentacion})">Editar</button>
           <button class="btn-accion btn-eliminar" onclick="abrirModalEliminar(${p.id_presentacion}, '${escapar(p.nombre)}')">Eliminar</button>`
        : `<button class="btn-accion btn-editar"   disabled>Editar</button>
           <button class="btn-accion btn-eliminar" disabled>Eliminar</button>`;

    tr.innerHTML = `
        <td class="td-nombre">
            <span class="cantidad-big">${cantidadBonita}</span>
            <span class="unidad-label">${unidadLabel}</span>
        </td>
        <td class="td-desc">${p.descripcion || '<span class="td-vacio">—</span>'}</td>
        <td>${prodHtml}</td>
        <td><span class="orden-badge">${p.orden_display}</span></td>
        <td>${visibleHtml}</td>
        <td>${estadoHtml}</td>
        <td class="td-acciones">${acciones}</td>
    `;
    return tr;
}

// ─── Formatear cantidad como fracción legible ─────────────────────────────────
function formatCantidad(n) {
    const fracs = { 0.125: "⅛", 0.25: "¼", 0.5: "½", 0.75: "¾" };
    if (fracs[n]) return fracs[n];
    // Si tiene decimales tipo 1.5 → "1½"
    const entero = Math.floor(n);
    const frac   = n - entero;
    if (frac > 0 && fracs[frac]) return entero > 0 ? `${entero}${fracs[frac]}` : fracs[frac];
    // Número entero o decimal normal
    return n % 1 === 0 ? String(n) : n.toString();
}

// ─── Filtro ───────────────────────────────────────────────────────────────────
function filtrarPresentaciones() {
    const texto   = (document.getElementById("buscarPresentacion")?.value || "").trim();
    const unidad  = document.getElementById("filtroUnidad")?.value  || "";
    const estado  = document.getElementById("filtroEstado")?.value  || "";

    if (!texto && !unidad && !estado) {
        mostrarMensajeInicial();
        actualizarContador(0);
        return;
    }

    const filtradas = db.presentaciones.filter(p => {
        const okTexto  = !texto   || p.nombre.toLowerCase().includes(texto.toLowerCase())
                                   || (p.descripcion || "").toLowerCase().includes(texto.toLowerCase());
        const okUnidad = !unidad  || p.unidad_medida === unidad;
        const okEstado = !estado  || p.estado === estado;
        return okTexto && okUnidad && okEstado;
    });

    renderTabla(filtradas);
    actualizarContador(filtradas.length);
}

// ─── Llenar fichas rápidas ────────────────────────────────────────────────────
function llenarFichasRapidas() {
    const container = document.getElementById("fichasRapidas");
    container.innerHTML = "";
    FRACCIONES.forEach(f => {
        const btn = document.createElement("button");
        btn.className   = "ficha-rapida";
        btn.textContent = f.label;
        btn.title       = `Insertar ${f.valor}`;
        btn.onclick     = () => {
            document.getElementById("inCantidad").value = f.valor;
            document.getElementById("inCantidad").dispatchEvent(new Event("input"));
            actualizarPreview();
        };
        container.appendChild(btn);
    });
}

// ─── Llenar select unidades en modal ─────────────────────────────────────────
function llenarSelectUnidades(valorActual = "") {
    const sel = document.getElementById("inUnidad");
    sel.innerHTML = "";
    UNIDADES.forEach(u => {
        const opt = document.createElement("option");
        opt.value       = u.value;
        opt.textContent = u.label;
        if (u.value === valorActual) opt.selected = true;
        sel.appendChild(opt);
    });
}

// ─── Preview del nombre ───────────────────────────────────────────────────────
function actualizarPreview() {
    const cant  = parseFloat(document.getElementById("inCantidad")?.value) || 0;
    const unid  = document.getElementById("inUnidad")?.value || "";
    const label = UNIDADES.find(u => u.value === unid)?.label.split(" ")[0] || unid;
    const prev  = document.getElementById("previewNombre");
    if (prev) {
        prev.textContent = cant > 0
            ? `Nombre generado: "${formatCantidad(cant)} ${label}"`
            : "Ingresa cantidad y unidad";
    }
}

// ─── Modal Crear ──────────────────────────────────────────────────────────────
function abrirModalCrear() {
    if (!puedeGestionar) { mostrarToast("Sin permiso para crear presentaciones", "error"); return; }
    db.editandoId = null;
    document.getElementById("tituloModal").textContent = "Nueva Presentación";
    limpiarFormulario();
    llenarFichasRapidas();
    llenarSelectUnidades("litro");
    actualizarPreview();
    abrirModal("modalPresentacion");
}

// ─── Modal Editar ─────────────────────────────────────────────────────────────
function abrirModalEditar(id) {
    const p = db.presentaciones.find(x => x.id_presentacion === id);
    if (!p) return;

    db.editandoId = id;
    document.getElementById("tituloModal").textContent = "Editar Presentación";

    llenarFichasRapidas();
    llenarSelectUnidades(p.unidad_medida);

    document.getElementById("inCantidad").value    = p.volumen_cantidad;
    document.getElementById("inDescripcion").value = p.descripcion   || "";
    document.getElementById("inOrden").value       = p.orden_display || "";
    document.getElementById("inEstado").value      = p.estado;
    document.getElementById("inVisibleWeb").checked = p.es_visible_web;

    actualizarPreview();
    limpiarErrorModal();
    abrirModal("modalPresentacion");
}

function cerrarModalForm() { cerrarModal("modalPresentacion"); }

// ─── Guardar ──────────────────────────────────────────────────────────────────
async function guardarPresentacion() {
    const cantidad = parseFloat(document.getElementById("inCantidad").value);
    const unidad   = document.getElementById("inUnidad").value;

    if (!cantidad || cantidad <= 0) { mostrarErrorModal("La cantidad debe ser mayor a 0."); return; }
    if (!unidad)                    { mostrarErrorModal("Selecciona una unidad de medida."); return; }

    limpiarErrorModal();
    document.getElementById("btnGuardar").disabled    = true;
    document.getElementById("btnGuardar").textContent = "Guardando…";

    const body = {
        volumen_cantidad: cantidad,
        unidad_medida:    unidad,
        descripcion:      document.getElementById("inDescripcion").value.trim() || null,
        orden_display:    parseInt(document.getElementById("inOrden").value) || 99,
        es_visible_web:   document.getElementById("inVisibleWeb").checked,
        estado:           document.getElementById("inEstado").value,
    };

    try {
        const esEdicion = db.editandoId !== null;
        const url    = esEdicion ? `${API}/presentaciones/${db.editandoId}` : `${API}/presentaciones`;
        const method = esEdicion ? "PUT" : "POST";

        const res  = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) { mostrarErrorModal(data.message || "Error al guardar"); return; }

        // Refrescar memoria
        const resAll = await fetch(`${API}/presentaciones`);
        db.presentaciones = await resAll.json();

        cerrarModal("modalPresentacion");
        filtrarPresentaciones();
        mostrarToast(esEdicion ? "Presentación actualizada" : "Presentación creada", "success");

    } catch (err) {
        mostrarErrorModal("Error de conexión con el servidor.");
    } finally {
        document.getElementById("btnGuardar").disabled    = false;
        document.getElementById("btnGuardar").textContent = "Guardar";
    }
}

// ─── Modal Eliminar ───────────────────────────────────────────────────────────
function abrirModalEliminar(id, nombre) {
    db.eliminandoId = id;
    document.getElementById("nombreEliminar").textContent = `"${nombre}"`;
    abrirModal("modalEliminar");
}

function cerrarModalEliminar() { cerrarModal("modalEliminar"); }

async function confirmarEliminar() {
    document.getElementById("btnConfirmarEliminar").disabled    = true;
    document.getElementById("btnConfirmarEliminar").textContent = "Eliminando…";

    try {
        const res  = await fetch(`${API}/presentaciones/${db.eliminandoId}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) {
            cerrarModal("modalEliminar");
            mostrarToast(data.message || "No se pudo eliminar", "error");
            return;
        }

        db.presentaciones = db.presentaciones.filter(x => x.id_presentacion !== db.eliminandoId);
        cerrarModal("modalEliminar");
        filtrarPresentaciones();
        mostrarToast("Presentación eliminada", "success");

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
    document.getElementById("inCantidad").value    = "";
    document.getElementById("inDescripcion").value = "";
    document.getElementById("inOrden").value       = "";
    document.getElementById("inEstado").value      = "activo";
    document.getElementById("inVisibleWeb").checked = true;
    limpiarErrorModal();
}

function mostrarErrorModal(msg) { const el = document.getElementById("modalError"); if (el) el.textContent = msg; }
function limpiarErrorModal()    { const el = document.getElementById("modalError"); if (el) el.textContent = ""; }

function actualizarContador(n) {
    const el = document.getElementById("totalPresentaciones");
    if (el) el.textContent = n > 0 ? `${n} registro${n !== 1 ? "s" : ""}` : "";
}

function mostrarSpinner(v) { const el = document.getElementById("spinnerCarga"); if (el) el.style.display = v ? "flex" : "none"; }
function mostrarError(msg) { const el = document.getElementById("errorGeneral"); if (el) { el.textContent = msg; el.style.display = "block"; } }

function mostrarToast(mensaje, tipo = "success") {
    let t = document.getElementById("toast-global");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast-global";
        Object.assign(t.style, {
            position:"fixed", bottom:"28px", right:"28px", zIndex:"9999",
            padding:"12px 22px", borderRadius:"10px", fontSize:"14px",
            fontWeight:"600", fontFamily:"inherit", maxWidth:"340px",
            boxShadow:"0 6px 24px rgba(0,0,0,0.22)",
            transition:"opacity 0.3s ease, transform 0.3s ease",
            pointerEvents:"none",
        });
        document.body.appendChild(t);
    }
    t.textContent = mensaje;
    t.style.background = tipo === "success" ? "#16a34a" : "#dc2626";
    t.style.color = "#fff"; t.style.opacity = "1"; t.style.transform = "translateY(0)";
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity="0"; t.style.transform="translateY(10px)"; }, 3200);
}

function escapar(str) { return (str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;"); }

document.addEventListener("click", e => {
    if (e.target.id === "modalPresentacion") cerrarModal("modalPresentacion");
    if (e.target.id === "modalEliminar")     cerrarModal("modalEliminar");
});