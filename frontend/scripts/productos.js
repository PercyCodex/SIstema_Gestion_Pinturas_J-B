"use strict";

// ============================================================
// productos.js — Módulo Catálogo (Pinturas + Herramientas)
// Base de datos: pinturas.productos | pinturas.herramientas
// API: GET|POST|PUT|DELETE /catalogo  y  /herramientas
// JWT: localStorage.getItem("token")
// ============================================================

const API = "http://localhost:3000";

// ─── Estado del módulo ────────────────────────────────────────
const catalogoState = {
    items:           [],      // catálogo completo (productos + herramientas)
    marcas:          [],
    tipos:           [],
    categorias:      [],
    presentaciones:  [],
    paginaActual:    1,
    limitePorPagina: 15,
    totalPaginas:    1,
    editandoId:      null,
    editandoTipo:    null,    // "producto" | "herramienta"
    eliminandoId:    null,
    eliminandoTipo:  null,
    presSeleccionadas: [],
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
document.addEventListener("DOMContentLoaded", iniciarModuloCatalogo);

async function iniciarModuloCatalogo() {
    mostrarSpinner(true);
    try {
        const [resCatalogo, resMarcas, resTipos, resCats, resPres] = await Promise.all([
            fetch(`${API}/catalogo`, { headers: authHeaders() }),
            fetch(`${API}/marcas`,   { headers: authHeaders() }),
            fetch(`${API}/tipos-pintura`, { headers: authHeaders() }),
            fetch(`${API}/categorias`,    { headers: authHeaders() }),
            fetch(`${API}/presentaciones`,{ headers: authHeaders() }),
        ]);

        if (!resCatalogo.ok) throw new Error("Error al cargar catálogo");

        catalogoState.items          = await resCatalogo.json();
        catalogoState.marcas         = await resMarcas.json();
        catalogoState.tipos          = await resTipos.json();
        catalogoState.categorias     = await resCats.json();
        catalogoState.presentaciones = (await resPres.json()).filter(p => p.estado === "activo");

        llenarFiltros();
        mostrarMensajeInicial();
        actualizarContador(0);
    } catch (err) {
        console.error(err);
        showAlert("error", "No se pudo cargar el catálogo");
    } finally {
        mostrarSpinner(false);
    }
}

// ─── Mensaje inicial ──────────────────────────────────────────
function mostrarMensajeInicial() {
    const tbody = document.getElementById("tabla-productos-body");
    if (tbody) tbody.innerHTML = `
        <tr><td colspan="12" class="tabla-vacia">
            <span class="vacia-icono">🔍</span>
            <span>Selecciona un filtro o busca para ver los productos</span>
        </td></tr>`;
    actualizarContador(0);
}

// ─── Llenar selects de filtros ────────────────────────────────
function llenarFiltros() {
    const selMarca = document.getElementById("filtroMarca");
    if (selMarca) {
        selMarca.innerHTML = `<option value="">Todas las marcas</option>`;
        catalogoState.marcas.forEach(m => {
            const o = document.createElement("option");
            o.value = m.id_marca; o.textContent = m.nombre;
            selMarca.appendChild(o);
        });
    }

    const selCat = document.getElementById("filtroCategoria");
    if (selCat) {
        selCat.innerHTML = `<option value="">Todas las categorías</option>`;
        catalogoState.categorias.forEach(c => {
            const o = document.createElement("option");
            o.value = c.id_categoria;
            o.textContent = c.id_padre ? `└ ${c.nombre}` : c.nombre;
            selCat.appendChild(o);
        });
    }
}

// ─── Filtrar en memoria ───────────────────────────────────────
function filtrarProductos() {
    const texto   = (document.getElementById("buscar-productos")?.value || "").trim().toLowerCase();
    const marca   = document.getElementById("filtroMarca")?.value    || "";
    const cat     = document.getElementById("filtroCategoria")?.value || "";
    const estado  = document.getElementById("filtroEstado")?.value   || "";
    const tipoItem= document.getElementById("filtroTipoItem")?.value || "";

    const hayFiltro = texto || marca || cat || estado || tipoItem;
    if (!hayFiltro) { mostrarMensajeInicial(); return; }

    const filtrados = catalogoState.items.filter(p => {
        const tipoOk    = !tipoItem || p.tipo_item === tipoItem;
        const textoOk   = !texto    || `${p.nombre} ${p.codigo_interno || ""}`.toLowerCase().includes(texto);
        const marcaOk   = !marca    || p.id_marca  === parseInt(marca);
        const estadoOk  = !estado   || p.estado    === estado;
        const catOk     = !cat      || (() => {
            const obj = catalogoState.categorias.find(c => c.id_categoria === parseInt(cat));
            return obj && Array.isArray(p.categorias) && p.categorias.includes(obj.nombre);
        })();
        return tipoOk && textoOk && marcaOk && estadoOk && catOk;
    });

    catalogoState.paginaActual = 1;
    catalogoState.totalPaginas = Math.ceil(filtrados.length / catalogoState.limitePorPagina);
    renderTabla(filtrados);
    actualizarContador(filtrados.length);
}

// ─── Render tabla con paginación ──────────────────────────────
function renderTabla(lista) {
    const tbody = document.getElementById("tabla-productos-body");
    if (!tbody) return;

    actualizarPaginacion(lista.length);

    const inicio = (catalogoState.paginaActual - 1) * catalogoState.limitePorPagina;
    const pagina = lista.slice(inicio, inicio + catalogoState.limitePorPagina);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="tabla-vacia">
            <span class="vacia-icono">📦</span>
            <span>Sin resultados para este filtro</span>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = pagina.map(p => {
        const tipoItem = p.tipo_item || "producto";
        const idRef    = p.id_ref ?? p.id_producto ?? p.id_herramienta;
        const estadoBadge = {
            activo:        `<span class="badge badge-activo">Activo</span>`,
            inactivo:      `<span class="badge badge-inactivo">Inactivo</span>`,
            descontinuado: `<span class="badge badge-desc">Descontinuado</span>`,
        }[p.estado] || p.estado;

        const tipoBadge = tipoItem === "herramienta"
            ? `<span class="badge badge-herramienta">Herramienta</span>`
            : `<span class="badge badge-producto">Pintura</span>`;

        const cats = Array.isArray(p.categorias) && p.categorias.length
            ? p.categorias.map(c => `<span class="badge-cat">${c}</span>`).join(" ")
            : "—";

        const mezcable = tipoItem === "herramienta" ? "—"
            : (p.es_mezcable ? `<span class="badge badge-mezcable">Sí</span>` : "No");

        return `<tr>
            <td class="td-nombre">${p.nombre}</td>
            <td>${tipoBadge}</td>
            <td>${p.marca_nombre || "—"}</td>
            <td>${cats}</td>
            <td class="td-mono">${p.codigo_interno || "—"}</td>
            <td class="td-precio">S/ ${parseFloat(p.precio_base || 0).toFixed(2)}</td>
            <td>${p.unidad_medida || "—"}</td>
            <td>${mezcable}</td>
            <td>${estadoBadge}</td>
            <td>${p.registrado_por || "—"}</td>
            <td class="td-acciones">
                <button class="btn-accion btn-editar"
                    onclick="abrirModalEditarProducto('${tipoItem}', ${idRef})">Editar</button>
                <button class="btn-accion btn-eliminar"
                    onclick="abrirModalEliminarProducto('${tipoItem}', ${idRef}, '${esc(p.nombre)}')">Eliminar</button>
            </td>
        </tr>`;
    }).join("");
}

// ─── Paginación ───────────────────────────────────────────────
function actualizarPaginacion(total) {
    catalogoState.totalPaginas = Math.ceil(total / catalogoState.limitePorPagina) || 1;
    const el = document.getElementById("infoPaginaProductos");
    if (el) el.textContent = `Página ${catalogoState.paginaActual} / ${catalogoState.totalPaginas} · ${total} ítems`;
    const prev = document.getElementById("btnPrevProductos");
    const next = document.getElementById("btnNextProductos");
    if (prev) prev.disabled = catalogoState.paginaActual <= 1;
    if (next) next.disabled = catalogoState.paginaActual >= catalogoState.totalPaginas;
}

function cambiarPaginaProductos(delta) {
    catalogoState.paginaActual = Math.max(1,
        Math.min(catalogoState.paginaActual + delta, catalogoState.totalPaginas));
    filtrarProductos();
}

// ─── Contador ─────────────────────────────────────────────────
function actualizarContador(n) {
    const el = document.getElementById("totalProductos");
    if (el) el.textContent = n > 0 ? `${n} producto${n !== 1 ? "s" : ""}` : "";
}

// ═══════════════════════════════════════════════════════════════
// MODAL CREAR / EDITAR
// ═══════════════════════════════════════════════════════════════
function abrirModalCrearProducto() {
    catalogoState.editandoId      = null;
    catalogoState.editandoTipo    = null;
    catalogoState.presSeleccionadas = [];
    document.getElementById("tituloModalProducto").textContent = "Nuevo ítem de catálogo";
    limpiarFormularioProducto();
    llenarSelectsModalProducto();
    document.getElementById("inTipoItem").disabled = false;
    document.getElementById("inTipoItem").value    = "";
    aplicarReglasTipoItem();
    renderPresentacionesModal();
    abrirModal("modalProducto");
}

async function abrirModalEditarProducto(tipoItem, id) {
    const p = catalogoState.items.find(x =>
        x.tipo_item === tipoItem &&
        (x.id_ref === id || x.id_producto === id || x.id_herramienta === id)
    );
    if (!p) return;

    catalogoState.editandoId   = id;
    catalogoState.editandoTipo = tipoItem;
    catalogoState.presSeleccionadas = [];

    document.getElementById("tituloModalProducto").textContent =
        `Editar ${tipoItem === "herramienta" ? "Herramienta" : "Pintura"}`;

    llenarSelectsModalProducto();
    document.getElementById("inTipoItem").value    = tipoItem;
    document.getElementById("inTipoItem").disabled = true;

    document.getElementById("inNombreProducto").value    = p.nombre;
    document.getElementById("inDescProducto").value      = p.descripcion || "";
    document.getElementById("inCodigoProducto").value    = p.codigo_interno || "";
    document.getElementById("inPrecioProducto").value    = p.precio_base || 0;
    document.getElementById("inUnidadProducto").value    = p.unidad_medida || "litro";
    document.getElementById("inEstadoProducto").value    = p.estado;

    aplicarReglasTipoItem();

    if (tipoItem === "producto") {
        if (p.id_marca)  document.getElementById("inMarcaProducto").value        = p.id_marca;
        if (p.id_tipo)   document.getElementById("inTipoPinturaProducto").value   = p.id_tipo;
        const chkMez = document.getElementById("inMezcableProducto");
        if (chkMez) chkMez.checked = !!p.es_mezcable;

        // Cargar presentaciones ya vinculadas
        try {
            const res = await fetch(`${API}/productos/${id}/presentaciones`, { headers: authHeaders() });
            if (res.ok) {
                const vinculadas = await res.json();
                catalogoState.presSeleccionadas = vinculadas.map(v => ({
                    id_presentacion: v.id_presentacion,
                    precio_costo:    parseFloat(v.precio_costo) || 0,
                    nombre:          v.nombre_presentacion || "",
                }));
            }
        } catch { /* sin presentaciones previas */ }
    }

    if (tipoItem === "herramienta") {
        const idCat = p.id_categoria || (Array.isArray(p.categorias) && p.categorias.length
            ? catalogoState.categorias.find(c => c.nombre === p.categorias[0])?.id_categoria
            : null);
        if (idCat) {
            llenarSelectCategoriaProducto(tipoItem, idCat);
        }
    }

    limpiarErrorProducto();
    renderPresentacionesModal();
    abrirModal("modalProducto");
}

// ─── Llenar selects del modal ─────────────────────────────────
function llenarSelectsModalProducto() {
    const selMarca = document.getElementById("inMarcaProducto");
    if (selMarca) {
        selMarca.innerHTML = `<option value="">— Selecciona marca —</option>`;
        catalogoState.marcas.forEach(m => {
            const o = document.createElement("option");
            o.value = m.id_marca; o.textContent = m.nombre;
            selMarca.appendChild(o);
        });
    }
    const selTipo = document.getElementById("inTipoPinturaProducto");
    if (selTipo) {
        selTipo.innerHTML = `<option value="">— Tipo pintura —</option>`;
        catalogoState.tipos.forEach(t => {
            const o = document.createElement("option");
            o.value = t.id_tipo; o.textContent = t.nombre;
            selTipo.appendChild(o);
        });
    }
}

function llenarSelectCategoriaProducto(tipoItem, valorActual = null) {
    const sel = document.getElementById("inCategoriaProducto");
    if (!sel) return;
    sel.innerHTML = `<option value="">— Categoría —</option>`;

    const esHerr = tipoItem === "herramienta";
    const filtradas = catalogoState.categorias.filter(c => {
        const raiz = c.id_padre
            ? catalogoState.categorias.find(x => x.id_categoria === c.id_padre)
            : c;
        const nombreRaiz = (raiz?.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return esHerr
            ? ["herramientas","herramientas de aplicacion","proteccion personal","preparacion de superficies"].some(r => nombreRaiz.includes(r))
            : ["pinturas","diluyentes","accesorios"].some(r => nombreRaiz.includes(r));
    });

    filtradas.forEach(c => {
        const o = document.createElement("option");
        o.value = c.id_categoria;
        o.textContent = c.id_padre ? `└ ${c.nombre}` : c.nombre;
        sel.appendChild(o);
    });
    if (valorActual) sel.value = String(valorActual);
}

// ─── Mostrar/ocultar campos según tipo ───────────────────────
function aplicarReglasTipoItem() {
    const tipo  = document.getElementById("inTipoItem").value;
    const esH   = tipo === "herramienta";

    const campoMarca  = document.getElementById("campoMarcaProducto");
    const campoTipo   = document.getElementById("campoTipoPinturaProducto");
    const campoMez    = document.getElementById("campoMezcableProducto");
    const campoCat    = document.getElementById("campoCategoriaProducto");
    const seccionPres = document.getElementById("seccionPresentaciones");

    if (campoMarca) campoMarca.style.display = esH ? "none" : "";
    if (campoTipo)  campoTipo.style.display  = esH ? "none" : "";
    if (campoMez)   campoMez.style.display   = esH ? "none" : "";
    if (campoCat)   campoCat.style.display   = tipo ? "" : "none";
    if (seccionPres)seccionPres.style.display= esH ? "none" : "";

    if (tipo) llenarSelectCategoriaProducto(tipo);
}

// ─── Presentaciones en modal ──────────────────────────────────
function renderPresentacionesModal() {
    const cont = document.getElementById("presContainer");
    if (!cont) return;

    if (!catalogoState.presentaciones.length) {
        cont.innerHTML = `<p style="color:#94a3b8;font-size:13px">Sin presentaciones activas.</p>`;
        return;
    }

    cont.innerHTML = catalogoState.presentaciones.map(pr => {
        const sel  = catalogoState.presSeleccionadas.find(s => s.id_presentacion === pr.id_presentacion);
        const chk  = !!sel;
        const costo= sel ? sel.precio_costo : "";

        return `<div class="pres-fila ${chk ? "pres-fila-activa" : ""}" id="pf-${pr.id_presentacion}">
            <label class="pres-check-label">
                <input type="checkbox" class="pres-check"
                    data-id="${pr.id_presentacion}" data-nombre="${esc(pr.nombre)}"
                    ${chk ? "checked" : ""}
                    onchange="togglePresentacionProducto(this)">
                <span class="pres-nombre">${pr.nombre}</span>
            </label>
            <div class="pres-precio-wrap ${!chk ? "pres-precio-disabled" : ""}" id="ppw-${pr.id_presentacion}">
                <span class="pres-precio-label">Costo S/</span>
                <input type="number" class="pres-precio-input" id="pc-${pr.id_presentacion}"
                    min="0" step="0.01" placeholder="0.00" value="${costo}"
                    ${!chk ? "disabled" : ""}
                    oninput="actualizarCostoPresProducto(${pr.id_presentacion}, this.value)">
            </div>
        </div>`;
    }).join("");

    actualizarResumenPres();
}

function togglePresentacionProducto(checkbox) {
    const id   = parseInt(checkbox.dataset.id);
    const nom  = checkbox.dataset.nombre;
    const fila = document.getElementById(`pf-${id}`);
    const wrap = document.getElementById(`ppw-${id}`);
    const inp  = document.getElementById(`pc-${id}`);

    if (checkbox.checked) {
        if (!catalogoState.presSeleccionadas.find(s => s.id_presentacion === id)) {
            catalogoState.presSeleccionadas.push({ id_presentacion: id, precio_costo: 0, nombre: nom });
        }
        fila?.classList.add("pres-fila-activa");
        wrap?.classList.remove("pres-precio-disabled");
        if (inp) { inp.disabled = false; inp.focus(); }
    } else {
        catalogoState.presSeleccionadas = catalogoState.presSeleccionadas.filter(s => s.id_presentacion !== id);
        fila?.classList.remove("pres-fila-activa");
        wrap?.classList.add("pres-precio-disabled");
        if (inp) { inp.disabled = true; inp.value = ""; }
    }
    actualizarResumenPres();
}

function actualizarCostoPresProducto(id, val) {
    const s = catalogoState.presSeleccionadas.find(x => x.id_presentacion === id);
    if (s) s.precio_costo = parseFloat(val) || 0;
}

function actualizarResumenPres() {
    const el = document.getElementById("presResumenProducto");
    if (!el) return;
    const n = catalogoState.presSeleccionadas.length;
    el.textContent  = n === 0
        ? "Sin presentaciones — el producto no aparecerá en Inventario"
        : `✅ ${n} presentación${n > 1 ? "es" : ""} seleccionada${n > 1 ? "s" : ""}`;
    el.className = n === 0 ? "pres-resumen pres-resumen-warn" : "pres-resumen pres-resumen-ok";
}

// ─── Guardar (crear / editar) ─────────────────────────────────
async function guardarProducto() {
    const nombre   = document.getElementById("inNombreProducto").value.trim();
    const tipoItem = document.getElementById("inTipoItem").value;
    const precio   = document.getElementById("inPrecioProducto").value;
    const marca    = document.getElementById("inMarcaProducto").value;
    const tipoPint = document.getElementById("inTipoPinturaProducto").value;
    const cat      = document.getElementById("inCategoriaProducto")?.value || "";

    // Validaciones
    if (!nombre)   { mostrarErrorProducto("El nombre es obligatorio."); return; }
    if (!tipoItem) { mostrarErrorProducto("Selecciona el tipo de ítem."); return; }
    if (!precio)   { mostrarErrorProducto("El precio es obligatorio."); return; }

    if (tipoItem === "producto") {
        if (!marca)   { mostrarErrorProducto("La marca es obligatoria."); return; }
        if (!tipoPint){ mostrarErrorProducto("El tipo de pintura es obligatorio."); return; }
    }
    if (tipoItem === "herramienta" && !cat) {
        mostrarErrorProducto("Selecciona una categoría de herramienta."); return;
    }

    limpiarErrorProducto();
    const btn = document.getElementById("btn-guardar-productos");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }

    const idUsuario = parseInt(localStorage.getItem("idUsuario")) || null;

    const body = {
        tipo_item:     tipoItem,
        id_usuario:    idUsuario,
        nombre,
        descripcion:   document.getElementById("inDescProducto").value.trim() || null,
        codigo_interno:document.getElementById("inCodigoProducto").value.trim() || null,
        precio_base:   parseFloat(precio),
        unidad_medida: document.getElementById("inUnidadProducto").value,
        estado:        document.getElementById("inEstadoProducto").value,
    };

    if (tipoItem === "producto") {
        Object.assign(body, {
            id_marca:       parseInt(marca),
            id_tipo:        parseInt(tipoPint),
            es_mezcable:    document.getElementById("inMezcableProducto")?.checked ?? false,
            categorias:     cat ? [parseInt(cat)] : [],
            presentaciones: catalogoState.presSeleccionadas.map(s => ({
                id_presentacion: s.id_presentacion,
                precio_costo:    s.precio_costo,
            })),
        });
    } else {
        Object.assign(body, {
            id_categoria: parseInt(cat),
            categorias:   [parseInt(cat)],
        });
    }

    try {
        const esEdicion = catalogoState.editandoId !== null;
        const url    = esEdicion
            ? `${API}/catalogo/${catalogoState.editandoTipo}/${catalogoState.editandoId}`
            : `${API}/catalogo`;
        const method = esEdicion ? "PUT" : "POST";

        const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
        const data = await res.json();

        if (!res.ok) { mostrarErrorProducto(data.message || "Error al guardar"); return; }

        // Si es edición de producto, sincronizar presentaciones via upsert
        if (esEdicion && tipoItem === "producto" && catalogoState.presSeleccionadas.length) {
            for (const p of catalogoState.presSeleccionadas) {
                await fetch(`${API}/inventario/presentaciones-upsert`, {
                    method: "POST", headers: authHeaders(),
                    body: JSON.stringify({
                        id_producto:     catalogoState.editandoId,
                        id_presentacion: p.id_presentacion,
                        precio_costo:    p.precio_costo,
                        precio_venta:    parseFloat(precio),
                    }),
                }).catch(() => {});
            }
        }

        // Refrescar catálogo
        const res2 = await fetch(`${API}/catalogo`, { headers: authHeaders() });
        catalogoState.items = await res2.json();

        cerrarModal("modalProducto");
        filtrarProductos();
        showAlert("success", `${tipoItem === "herramienta" ? "Herramienta" : "Producto"} ${esEdicion ? "actualizado" : "creado"} correctamente`);
    } catch (err) {
        mostrarErrorProducto("Error de conexión con el servidor.");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    }
}

// ─── Eliminar ─────────────────────────────────────────────────
function abrirModalEliminarProducto(tipoItem, id, nombre) {
    catalogoState.eliminandoId   = id;
    catalogoState.eliminandoTipo = tipoItem;
    const el = document.getElementById("nombreEliminarProducto");
    if (el) el.textContent = `"${nombre}"`;
    abrirModal("modalEliminarProducto");
}

async function confirmarEliminarProducto() {
    const btn = document.getElementById("btnConfirmarEliminarProducto");
    if (btn) { btn.disabled = true; btn.textContent = "Eliminando…"; }

    try {
        const res  = await fetch(
            `${API}/catalogo/${catalogoState.eliminandoTipo}/${catalogoState.eliminandoId}`,
            { method: "DELETE", headers: authHeaders() }
        );
        const data = await res.json();

        if (!res.ok) {
            cerrarModal("modalEliminarProducto");
            showAlert("error", data.message || "No se pudo eliminar");
            return;
        }

        catalogoState.items = catalogoState.items.filter(x => {
            const xId = x.id_ref ?? x.id_producto ?? x.id_herramienta;
            return !(x.tipo_item === catalogoState.eliminandoTipo && xId === catalogoState.eliminandoId);
        });

        cerrarModal("modalEliminarProducto");
        filtrarProductos();
        showAlert("success", "Ítem eliminado correctamente");
    } catch {
        showAlert("error", "Error de conexión");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Sí, eliminar"; }
    }
}

// ─── Helpers UI ───────────────────────────────────────────────
function abrirModal(id)  { const el = document.getElementById(id); if (el) el.style.display = "flex"; }
function cerrarModal(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

function limpiarFormularioProducto() {
    ["inNombreProducto","inDescProducto","inCodigoProducto","inPrecioProducto"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
    });
    document.getElementById("inTipoItem").value            = "";
    document.getElementById("inUnidadProducto").value      = "litro";
    document.getElementById("inEstadoProducto").value      = "activo";
    const mez = document.getElementById("inMezcableProducto");
    if (mez) mez.checked = false;
    limpiarErrorProducto();
    aplicarReglasTipoItem();
}

function mostrarErrorProducto(msg) {
    const el = document.getElementById("errorModalProducto"); if (el) el.textContent = msg;
}
function limpiarErrorProducto() {
    const el = document.getElementById("errorModalProducto"); if (el) el.textContent = "";
}
function mostrarSpinner(v) {
    const el = document.getElementById("spinnerCargaProductos"); if (el) el.style.display = v ? "flex" : "none";
}
function esc(s) {
    return String(s || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// Cerrar modales al clic fuera
document.addEventListener("click", e => {
    if (e.target.id === "modalProducto")        cerrarModal("modalProducto");
    if (e.target.id === "modalEliminarProducto") cerrarModal("modalEliminarProducto");
});