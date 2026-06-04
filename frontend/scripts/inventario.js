"use strict";

// ─── Config ───────────────────────────────────────────────────
const API        = "http://localhost:3000";
const idUsuario  = parseInt(localStorage.getItem("idUsuario")) || null;
const nombreUser = localStorage.getItem("nombreUsuario") || "Usuario";
const rolUser    = localStorage.getItem("rolUsuario")    || "";

// ─── Estado global ────────────────────────────────────────────
const state = {
    stockData:       [],
    marcasData:      [],
    proveedoresData: [],
    // item activo para modales
    idPresProducto:  null,
    idHerramienta:   null,
    tipoItemActual:  "pintura",
    nombreProducto:  "",
    stockActual:     0,
    // paginación
    paginaActual:    1,
    totalPaginas:    1,
    limiteItems:     60,
    _debounceTimer:  null,
    // tipo movimiento activo
    tipoMov:         null,
};

// Motivos por tipo
const MOTIVOS = {
    ENTRADA: [
        "Compra a proveedor",
        "Devolución de cliente",
        "Corrección del sistema",
        "Transferencia entre almacenes",
        "Ajuste de inventario inicial",
    ],
    SALIDA: [
        "Venta",
        "Devolución a proveedor",
        "Merma o pérdida",
        "Vencimiento / deterioro",
        "Muestra o consumo interno",
    ],
    AJUSTE: [
        "Conteo físico",
        "Corrección del sistema",
        "Diferencia de conteo",
    ],
};

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    setText("movUsuarioDisplay", `${nombreUser} (${rolUser})`);
    actualizarFechaDisplay();
    iniciarPagina();
});

async function iniciarPagina() {
    try {
        const [resResumen, resMarcas, resProveedores] = await Promise.all([
            fetch(`${API}/inventario/resumen/v2`).catch(() => fetch(`${API}/inventario/resumen`)),
            fetch(`${API}/marcas`),
            fetch(`${API}/proveedores`),
        ]);

        if (resResumen.ok)     actualizarCards(await resResumen.json());
        if (resMarcas.ok)      { state.marcasData = await resMarcas.json(); llenarFiltroMarcas(); }
        if (resProveedores.ok) { state.proveedoresData = await resProveedores.json(); llenarSelectProveedores(); }

        await filtrarStock();
    } catch (err) {
        console.error("Error al iniciar inventario:", err);
        mostrarToast("Error al cargar inventario", "error");
    }
}

// ─── Cards ────────────────────────────────────────────────────
function actualizarCards(r) {
    setText("statTotal",   r.total_productos ?? "—");
    setText("statCritico", r.sin_stock       ?? "0");
    setText("statBajo",    r.stock_bajo      ?? "0");
    setText("statOk",      r.stock_ok        ?? "0");
    const valor = parseFloat(r.valor_venta || r.valor_total_venta || 0);
    setText("statValor", valor > 0 ? `S/ ${formatNum(valor)}` : "S/ 0");
}

// ─── Filtros ──────────────────────────────────────────────────
function llenarFiltroMarcas() {
    const sel = document.getElementById("filtroMarcaStock");
    if (!sel) return;
    sel.innerHTML = `<option value="">Todas las marcas</option>`;
    state.marcasData.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id_marca; opt.textContent = m.nombre;
        sel.appendChild(opt);
    });
}

function llenarSelectProveedores() {
    const sel = document.getElementById("movProveedor");
    if (!sel) return;
    sel.innerHTML = `<option value="">Sin proveedor</option>`;
    state.proveedoresData.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id_proveedor;
        opt.textContent = p.razon_social || `Proveedor #${p.id_proveedor}`;
        sel.appendChild(opt);
    });
}

// ─── Debounce ─────────────────────────────────────────────────
function debounceSearch() {
    clearTimeout(state._debounceTimer);
    state._debounceTimer = setTimeout(() => {
        state.paginaActual = 1;
        filtrarStock();
    }, 350);
}

// ─── Filtrar stock ────────────────────────────────────────────
async function filtrarStock() {
    const buscar   = (document.getElementById("buscarStock")?.value || "").trim();
    const marca    = document.getElementById("filtroMarcaStock")?.value || "";
    const semaf    = document.getElementById("filtroSemaforo")?.value  || "";
    const tipoItem = document.getElementById("filtroTipoItem")?.value  || "";

    mostrarSpinner("spinnerStock", true);
    try {
        const params = new URLSearchParams();
        if (buscar)   params.set("buscar",    buscar);
        if (marca)    params.set("marca",     marca);
        if (semaf)    params.set("semaforo",  semaf);
        if (tipoItem) params.set("tipo_item", tipoItem);
        params.set("page",  state.paginaActual);
        params.set("limit", state.limiteItems);

        let res = await fetch(`${API}/inventario/stock/v2?${params}`);

        if (!res.ok) {
            // fallback al endpoint original
            res = await fetch(`${API}/inventario/stock?${params}`);
            if (!res.ok) throw new Error("Error al cargar stock");
            const data = await res.json();
            state.stockData = Array.isArray(data) ? data : (data.datos || []);
            ocultarPaginacion();
        } else {
            const data = await res.json();
            state.stockData = Array.isArray(data) ? data : (data.datos || []);
            if (data.paginas) {
                state.totalPaginas = data.paginas;
                actualizarPaginacion(data.total, data.page);
            } else {
                state.totalPaginas = 1;
                ocultarPaginacion();
            }
        }
        renderStock(state.stockData);
    } catch (err) {
        console.error(err);
        renderStockError("Error al cargar el inventario. Verifica la conexión.");
    } finally {
        mostrarSpinner("spinnerStock", false);
    }
}

function filtrarRapido(semaforo) {
    const sel = document.getElementById("filtroSemaforo");
    if (sel) sel.value = semaforo;
    state.paginaActual = 1;
    filtrarStock();
}

// ─── Paginación ───────────────────────────────────────────────
function actualizarPaginacion(total, page) {
    const el = document.getElementById("paginacion");
    if (!el || state.totalPaginas <= 1) { ocultarPaginacion(); return; }
    el.style.display = "flex";
    setText("infoPagina", `Página ${page} de ${state.totalPaginas} · ${total} ítems`);
    document.getElementById("btnPrevPage").disabled = page <= 1;
    document.getElementById("btnNextPage").disabled = page >= state.totalPaginas;
}
function ocultarPaginacion() { const el = document.getElementById("paginacion"); if (el) el.style.display = "none"; }
function cambiarPagina(delta) { state.paginaActual = Math.max(1, Math.min(state.paginaActual + delta, state.totalPaginas)); filtrarStock(); }

// ─── Render tabla stock ───────────────────────────────────────
function renderStockError(msg) {
    const tbody = document.getElementById("cuerpoStock");
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="inv-vacia">❌ ${msg}</td></tr>`;
}

function renderStock(lista) {
    const tbody = document.getElementById("cuerpoStock");
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="inv-vacia">
                <div style="font-size:32px;margin-bottom:10px">📭</div>
                <strong>Sin resultados</strong><br>
                <span style="font-size:13px;color:#94a3b8">No hay ítems que coincidan con los filtros</span>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = "";
    lista.forEach((p, idx) => {
        const tr = document.createElement("tr");
        tr.style.animationDelay = `${idx * 0.025}s`;

        const esHerramienta = p.tipo_item === "herramienta";
        const idRef   = esHerramienta ? p.id_herramienta : p.id_pres_prod;
        const idProd  = esHerramienta ? null : p.id_producto;

        const semCls = { critico: "stock-critico", bajo: "stock-bajo", ok: "stock-ok" }[p.semaforo] || "stock-ok";
        const semBadge = p.semaforo === "critico"
            ? `<span class="inv-estado-badge estado-agotado">AGOTADO</span>`
            : p.semaforo === "bajo"
            ? `<span class="inv-estado-badge estado-bajo">BAJO</span>`
            : `<span class="inv-estado-badge estado-ok">OK</span>`;

        const tipoBadge = esHerramienta
            ? `<span class="td-tipo-badge td-tipo-herramienta">🔧 Herramienta</span>`
            : `<span class="td-tipo-badge td-tipo-pintura">🎨 Pintura</span>`;

        const presentacion = p.presentacion || "—";
        const marca = p.marca || "";

        const precioCompra = `S/ ${parseFloat(p.precio_costo || 0).toFixed(2)}`;
        const precioVenta  = `S/ ${parseFloat(p.precio_venta  || 0).toFixed(2)}`;

        const editHandler = esHerramienta
            ? `abrirEditorPreciosHerramienta(${idRef}, '${escapar(p.producto)}', ${parseFloat(p.precio_costo||0)}, ${parseFloat(p.precio_venta||0)})`
            : `abrirEditorPrecios(${idRef}, ${idProd}, '${escapar(p.producto)}', ${parseFloat(p.precio_costo||0)}, ${parseFloat(p.precio_venta||0)}, '${escapar(presentacion)}')`;

        const movHandler = esHerramienta
            ? `abrirMov(null, ${idRef}, '${escapar(p.producto)}', ${p.stock_actual})`
            : `abrirMov(${idRef}, null, '${escapar(p.producto)} — ${escapar(presentacion)}', ${p.stock_actual})`;

        // Botón verde solo para pinturas (tienen ventas)
        const btnVentas = !esHerramienta
            ? `<button class="inv-btn-acc inv-btn-ventas" title="Historial de ventas" onclick="verHistorialVentas(${idRef}, '${escapar(p.producto)}', '${escapar(presentacion)}')">📈</button>`
            : "";

        tr.innerHTML = `
            <td>
                <div class="td-producto-wrap">
                    ${tipoBadge}
                    <span class="td-prod-nombre">${p.producto || "—"}</span>
                    <span class="td-prod-sku">${p.sku || ""}</span>
                </div>
            </td>
            <td>
                <span class="td-pres">${presentacion}</span>
                ${marca ? `<br><span style="font-size:11px;color:#94a3b8">${marca}</span>` : ""}
            </td>
            <td class="td-center ${semCls}">
                <span class="td-stock-num">${p.stock_actual}</span>
            </td>
            <td class="td-center" style="color:#94a3b8;font-weight:600">${p.stock_minimo}</td>
            <td class="td-center">
                <div class="td-precio-wrap">
                    ${precioCompra}
                    <button class="inv-btn-edit-precio" title="Editar precios" onclick="${editHandler}">✏️</button>
                </div>
            </td>
            <td class="td-center">
                <div class="td-precio-wrap">
                    ${precioVenta}
                    <button class="inv-btn-edit-precio" title="Editar precios" onclick="${editHandler}">✏️</button>
                </div>
            </td>
            <td class="td-center">${semBadge}</td>
            <td class="td-center">
                <div class="inv-acciones">
                    <button class="inv-btn-acc inv-btn-mov" title="Registrar movimiento" onclick="${movHandler}">⇄</button>
                    <button class="inv-btn-acc inv-btn-kdx" title="Kardex / historial" onclick="verKardex(${idRef || 'null'}, '${escapar(p.producto)}', '${escapar(presentacion)}', ${esHerramienta})">🕐</button>
                    ${btnVentas}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ─── Excel stock ──────────────────────────────────────────────
function exportarStockExcel() {
    if (!state.stockData.length) { mostrarToast("No hay datos para exportar", "error"); return; }
    cargarSheetJS(() => {
        const filas = state.stockData.map(p => ({
            "Tipo":         p.tipo_item === "herramienta" ? "Herramienta" : "Pintura",
            "Producto":     p.producto || "",
            "Presentación": p.presentacion || "",
            "Marca":        p.marca || "",
            "SKU":          p.sku || "",
            "Stock Actual": p.stock_actual,
            "Stock Mínimo": p.stock_minimo,
            "Estado":       { critico: "Sin Stock", bajo: "Bajo", ok: "Normal" }[p.semaforo] || "",
            "P. Costo":     parseFloat(p.precio_costo || 0),
            "P. Venta":     parseFloat(p.precio_venta || 0),
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(filas);
        ws["!cols"] = [{wch:12},{wch:28},{wch:15},{wch:18},{wch:16},{wch:13},{wch:13},{wch:12},{wch:12},{wch:12}];
        XLSX.utils.book_append_sheet(wb, ws, "Stock");
        XLSX.writeFile(wb, `Inventario_${new Date().toISOString().split("T")[0]}.xlsx`);
        mostrarToast("Excel exportado ✅", "success");
    });
}

// ═══════════════════════════════════════════════════════════════
// EDITOR DE PRECIOS
// ═══════════════════════════════════════════════════════════════
let _editPrecioData = null;

function abrirEditorPrecios(idPresProd, idProducto, nombreProd, precioCosto, precioVenta, presentacion) {
    _editPrecioData = { idPresProd, idProducto, nombreProd, presentacion, tipo: "pintura" };
    setText("editPrecioTitulo", `${nombreProd} — ${presentacion}`);
    setValue("editPrecioCosto", precioCosto.toFixed(2));
    setValue("editPrecioVenta", precioVenta.toFixed(2));
    const syncRow = document.getElementById("editSyncRow");
    if (syncRow) syncRow.style.display = "flex";
    limpiarError("editPrecioError");
    calcularMargen();
    abrirModal("modalEditarPrecios");
}

function abrirEditorPreciosHerramienta(idHerramienta, nombre, precioCosto, precioVenta) {
    _editPrecioData = { idHerramienta, nombre, tipo: "herramienta" };
    setText("editPrecioTitulo", `🔧 ${nombre}`);
    setValue("editPrecioCosto", precioCosto.toFixed(2));
    setValue("editPrecioVenta", precioVenta.toFixed(2));
    const syncRow = document.getElementById("editSyncRow");
    if (syncRow) syncRow.style.display = "none";
    limpiarError("editPrecioError");
    calcularMargen();
    abrirModal("modalEditarPrecios");
}

function calcularMargen() {
    const costo = parseFloat(document.getElementById("editPrecioCosto")?.value) || 0;
    const venta = parseFloat(document.getElementById("editPrecioVenta")?.value) || 0;
    const el = document.getElementById("editMargenInfo");
    if (!el) return;
    if (costo > 0 && venta > 0) {
        const margen   = ((venta - costo) / costo * 100).toFixed(1);
        const ganancia = (venta - costo).toFixed(2);
        el.textContent = `Margen: ${margen}% · Ganancia: S/ ${ganancia}`;
        el.style.color = parseFloat(margen) >= 0 ? "#16a34a" : "#dc2626";
    } else { el.textContent = ""; }
}

async function guardarPrecios() {
    if (!_editPrecioData) return;
    const costo = parseFloat(document.getElementById("editPrecioCosto")?.value);
    const venta = parseFloat(document.getElementById("editPrecioVenta")?.value);
    if (isNaN(costo) || costo < 0) { mostrarErrorModal("editPrecioError", "Precio de costo inválido."); return; }
    if (isNaN(venta) || venta < 0) { mostrarErrorModal("editPrecioError", "Precio de venta inválido."); return; }

    const btn = document.getElementById("btnGuardarPrecios");
    btn.disabled = true; btn.textContent = "Guardando…";
    limpiarError("editPrecioError");

    try {
        if (_editPrecioData.tipo === "herramienta") {
            const res = await fetch(`${API}/inventario/precios-herramienta/${_editPrecioData.idHerramienta}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ precio_costo: costo, precio_venta: venta }),
            });
            if (!res.ok) { const d = await res.json(); mostrarErrorModal("editPrecioError", d.message || "Error."); return; }
        } else {
            const res1 = await fetch(`${API}/inventario/precios/${_editPrecioData.idPresProd}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ precio_costo: costo, precio_venta: venta }),
            });
            if (!res1.ok) { const d = await res1.json(); mostrarErrorModal("editPrecioError", d.message || "Error."); return; }

            const sincronizar = document.getElementById("editSincronizarProducto")?.checked ?? true;
            if (sincronizar && _editPrecioData.idProducto) {
                await fetch(`${API}/productos/${_editPrecioData.idProducto}/precio`, {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ precio_base: venta }),
                }).catch(() => {});
            }
        }
        cerrarModal("modalEditarPrecios");
        await refrescarCards();
        await filtrarStock();
        mostrarToast("Precios actualizados ✅", "success");
    } catch (err) {
        mostrarErrorModal("editPrecioError", "Error de conexión.");
    } finally {
        btn.disabled = false; btn.textContent = "Guardar Precios";
    }
}

// ═══════════════════════════════════════════════════════════════
// MODAL MOVIMIENTO — 3 tipos distintos
// ═══════════════════════════════════════════════════════════════

function abrirMov(idPresProd, idHerramienta, nombreCompleto, stockActual) {
    state.idPresProducto = idPresProd;
    state.idHerramienta  = idHerramienta;
    state.tipoItemActual = idHerramienta ? "herramienta" : "pintura";
    state.nombreProducto = nombreCompleto;
    state.stockActual    = stockActual;
    state.tipoMov        = null;

    // Resetear selección visual
    document.querySelectorAll(".inv-tipo-btn").forEach(b => b.className = "inv-tipo-btn");
    // Resetear header color
    const header = document.getElementById("movHeader");
    if (header) { header.className = "inv-modal-header"; }
    setText("movSubtitulo", nombreCompleto);
    ocultarSeccion("seccionEntrada");
    ocultarSeccion("seccionSalida");
    ocultarSeccion("seccionAjuste");
    ocultarSeccion("seccionCantidad");
    ocultarSeccion("seccionMotivo");
    limpiarMovForm();
    setText("movUsuarioDisplay", `${nombreUser} (${rolUser})`);
    actualizarFechaDisplay();
    abrirModal("modalMovimiento");
}

function seleccionarTipoMov(tipo) {
    state.tipoMov = tipo;

    // Actualizar botones
    document.querySelectorAll(".inv-tipo-btn").forEach(b => {
        b.className = "inv-tipo-btn";
    });
    const btn = document.getElementById(`btnTipo${tipo}`);
    if (btn) btn.className = `inv-tipo-btn activo-${tipo.toLowerCase()}`;

    // Color header
    const header = document.getElementById("movHeader");
    if (header) {
        const claseHeader = { ENTRADA: "inv-mov-header-entrada", SALIDA: "inv-mov-header-salida", AJUSTE: "inv-mov-header-ajuste" }[tipo];
        header.className = `inv-modal-header ${claseHeader}`;
    }

    // Color botón guardar
    const btnGuardar = document.getElementById("btnGuardarMov");
    if (btnGuardar) {
        btnGuardar.className = `inv-btn-guardar inv-btn-guardar-${tipo.toLowerCase()}`;
    }

    // Mostrar/ocultar secciones
    ocultarSeccion("seccionEntrada");
    ocultarSeccion("seccionSalida");
    ocultarSeccion("seccionAjuste");
    mostrarSeccion("seccionCantidad");
    mostrarSeccion("seccionMotivo");

    // Label cantidad
    const labelCant = document.getElementById("labelCantidad");
    if (tipo === "ENTRADA") {
        mostrarSeccion("seccionEntrada");
        if (labelCant) labelCant.innerHTML = `Cantidad a ingresar <span class="req">*</span>`;
    } else if (tipo === "SALIDA") {
        mostrarSeccion("seccionSalida");
        if (labelCant) labelCant.innerHTML = `Cantidad a retirar <span class="req">*</span>`;
    } else if (tipo === "AJUSTE") {
        mostrarSeccion("seccionAjuste");
        if (labelCant) labelCant.innerHTML = `Stock final real (actual: ${state.stockActual}) <span class="req">*</span>`;
    }

    // Llenar motivos
    const selMotivo = document.getElementById("movMotivo");
    if (selMotivo) {
        selMotivo.innerHTML = `<option value="">-- Seleccionar motivo --</option>`;
        (MOTIVOS[tipo] || []).forEach(m => {
            const opt = document.createElement("option");
            opt.value = m; opt.textContent = m;
            selMotivo.appendChild(opt);
        });
    }

    setText("movStockInfo", `Stock actual: ${state.stockActual} unidades`);
    setValue("movCantidad", "");
    limpiarError("movError");
}

function cerrarModalMovimiento() { cerrarModal("modalMovimiento"); }

function limpiarMovForm() {
    setValue("movCantidad",    "");
    setValue("movObservacion", "");
    setValue("movPrecioCompra","");
    const sel = document.getElementById("movMotivo");
    if (sel) sel.innerHTML = `<option value="">-- Seleccionar motivo --</option>`;
    limpiarError("movError");
}

function ocultarSeccion(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
function mostrarSeccion(id) { const el = document.getElementById(id); if (el) el.style.display = "block"; }

async function guardarMovimiento() {
    limpiarError("movError");

    const tipo     = state.tipoMov;
    const motivo   = document.getElementById("movMotivo")?.value || "";
    const cantidad = parseInt(document.getElementById("movCantidad")?.value) || 0;
    const obs      = document.getElementById("movObservacion")?.value?.trim() || "";

    if (!tipo)   { mostrarErrorModal("movError", "Selecciona el tipo de movimiento."); return; }
    if (!motivo) { mostrarErrorModal("movError", "Selecciona el motivo."); return; }
    if (cantidad <= 0) { mostrarErrorModal("movError", "La cantidad debe ser mayor a 0."); return; }
    if (!idUsuario)    { mostrarErrorModal("movError", "No se pudo identificar el usuario."); return; }

    // ── Herramienta ───────────────────────────────────────────
    if (state.tipoItemActual === "herramienta") {
        const stockAntes = state.stockActual;
        let stockDespues;
        if (tipo === "ENTRADA")      stockDespues = stockAntes + cantidad;
        else if (tipo === "SALIDA")  {
            if (cantidad > stockAntes) { mostrarErrorModal("movError", `Stock insuficiente. Actual: ${stockAntes}`); return; }
            stockDespues = stockAntes - cantidad;
        } else if (tipo === "AJUSTE") stockDespues = cantidad;

        const btn = document.getElementById("btnGuardarMov");
        btn.disabled = true; btn.textContent = "Guardando...";
        try {
            const res = await fetch(`${API}/herramientas/${state.idHerramienta}/stock`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stock_actual: stockDespues, motivo, notas: obs || null, id_usuario: idUsuario }),
            });
            const data = await res.json();
            if (!res.ok) { mostrarErrorModal("movError", data.message || "Error."); return; }
            cerrarModal("modalMovimiento");
            mostrarToast(`Stock actualizado: ${stockAntes} → ${stockDespues}`, "success");
            await refrescarCards();
            await filtrarStock();
        } catch (err) { mostrarErrorModal("movError", "Error de conexión."); }
        finally { btn.disabled = false; btn.textContent = "Guardar"; }
        return;
    }

    // ── Pintura ───────────────────────────────────────────────
    const stockAntes = state.stockActual;
    let stockDespues, cantRegistrar, tipoApi;

    if (tipo === "ENTRADA") {
        stockDespues = stockAntes + cantidad; cantRegistrar = cantidad; tipoApi = "entrada";
    } else if (tipo === "SALIDA") {
        if (cantidad > stockAntes) { mostrarErrorModal("movError", `Stock insuficiente. Actual: ${stockAntes}`); return; }
        stockDespues = stockAntes - cantidad; cantRegistrar = cantidad; tipoApi = "merma";
    } else if (tipo === "AJUSTE") {
        stockDespues = cantidad; cantRegistrar = Math.abs(cantidad - stockAntes); tipoApi = "ajuste";
    }

    const body = {
        id_pres_prod:    state.idPresProducto,
        tipo:            tipoApi,
        cantidad:        cantRegistrar,
        ajuste_cantidad: tipoApi === "ajuste" ? (stockDespues - stockAntes) : undefined,
        motivo, notas: obs || null, id_usuario: idUsuario,
    };

    const btn = document.getElementById("btnGuardarMov");
    btn.disabled = true; btn.textContent = "Guardando...";
    try {
        const res  = await fetch(`${API}/inventario/movimiento`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { mostrarErrorModal("movError", data.message || "Error."); return; }
        cerrarModal("modalMovimiento");
        mostrarToast(`Movimiento registrado: ${stockAntes} → ${data.stock_despues ?? stockDespues}`, "success");
        await refrescarCards();
        await filtrarStock();
    } catch (err) { mostrarErrorModal("movError", "Error de conexión."); }
    finally { btn.disabled = false; btn.textContent = "Guardar"; }
}

// ═══════════════════════════════════════════════════════════════
// KARDEX — botón naranja 🕐
// ═══════════════════════════════════════════════════════════════
async function verKardex(idPresProd, producto, presentacion, esHerramienta = false) {
    if (esHerramienta) {
        mostrarToast("Kardex de herramientas en desarrollo", "info");
        return;
    }
    setText("kardexTitulo",    "Historial de Movimientos");
    setText("kardexSubtitulo", `${producto} — ${presentacion}`);
    const tbody = document.getElementById("cuerpoKardex");
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="inv-vacia">Cargando historial...</td></tr>`;
    window._kardexData = [];
    abrirModal("modalKardex");
    try {
        const res  = await fetch(`${API}/inventario/movimientos?id_pres_prod=${idPresProd}&limit=200&page=1`);
        const data = await res.json();
        window._kardexData = data.datos || [];
        renderKardex(window._kardexData);
        setText("kardexPieInfo", `${window._kardexData.length} movimiento(s) · ${producto}`);
    } catch {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="inv-vacia">Error al cargar historial.</td></tr>`;
    }
}

function renderKardex(lista) {
    const tbody = document.getElementById("cuerpoKardex");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="inv-vacia">Sin movimientos registrados.</td></tr>`;
        return;
    }
    lista.forEach(m => {
        const tr = document.createElement("tr");
        const tipoKey = { entrada: "ENTRADA", merma: "SALIDA", ajuste: "AJUSTE", salida: "SALIDA", devolucion: "ENTRADA" }[m.tipo] || m.tipo.toUpperCase();
        const signo   = ["entrada","devolucion"].includes(m.tipo) ? "+" : (m.tipo === "ajuste" ? "±" : "−");
        tr.innerHTML = `
            <td style="font-size:12px;white-space:nowrap">${formatFechaHora(m.fecha)}</td>
            <td><span class="inv-tipo-badge inv-tipo-${tipoKey}">${tipoKey}</span></td>
            <td style="font-size:12px">${m.motivo || "—"}</td>
            <td style="font-weight:800;text-align:center">${signo}${m.cantidad}</td>
            <td style="color:#94a3b8;text-align:center">${m.stock_antes}</td>
            <td style="font-weight:800;text-align:center">${m.stock_despues}</td>
            <td style="font-size:12px;color:#6b7280;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapar(m.notas)}">${m.notas || "—"}</td>
            <td style="font-size:12px">${m.hecho_por || "—"}</td>
        `;
        tbody.appendChild(tr);
    });
}

function cerrarKardex() { cerrarModal("modalKardex"); }

function exportarKardexExcel() {
    const data = window._kardexData || [];
    if (!data.length) { mostrarToast("No hay datos para exportar", "error"); return; }
    cargarSheetJS(() => {
        const filas = data.map(m => ({
            "Fecha": formatFechaHora(m.fecha), "Tipo": m.tipo, "Motivo": m.motivo || "",
            "Cantidad": m.cantidad, "Stock Ant.": m.stock_antes, "Stock Nuevo": m.stock_despues,
            "Usuario": m.hecho_por || "", "Observación": m.notas || "",
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Movimientos");
        XLSX.writeFile(wb, `Movimientos_${new Date().toISOString().split("T")[0]}.xlsx`);
        mostrarToast("Excel exportado ✅", "success");
    });
}

// ═══════════════════════════════════════════════════════════════
// HISTORIAL VENTAS — botón verde 📈
// ═══════════════════════════════════════════════════════════════
async function verHistorialVentas(idPresProd, producto, presentacion) {
    setText("ventasTitulo",    "Historial de Ventas");
    setText("ventasSubtitulo", `${producto} — ${presentacion}`);

    const tbody = document.getElementById("cuerpoVentas");
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="inv-vacia">Cargando ventas...</td></tr>`;

    window._ventasData = [];
    abrirModal("modalVentas");

    try {
        // Buscar ventas que incluyan este producto (detalle_venta con id_pres_prod)
        const res  = await fetch(`${API}/ventas/producto/${idPresProd}`);

        if (!res.ok) {
            // Endpoint puede no existir aún — mostrar mensaje amigable
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="inv-vacia">
                <div style="font-size:28px;margin-bottom:8px">📊</div>
                <strong>Historial no disponible</strong><br>
                <span style="font-size:13px">Agrega el endpoint GET /ventas/producto/:id al backend</span>
            </td></tr>`;
            setText("ventasPieInfo", "Sin datos");
            setText("ventasTotal", "");
            return;
        }

        const data = await res.json();
        window._ventasData = Array.isArray(data) ? data : (data.ventas || data.datos || []);
        renderVentas(window._ventasData, producto, presentacion);
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="inv-vacia">Error al cargar ventas.</td></tr>`;
    }
}

function renderVentas(lista, producto, presentacion) {
    const tbody = document.getElementById("cuerpoVentas");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="inv-vacia">
            <div style="font-size:28px;margin-bottom:8px">🛒</div>
            Sin ventas registradas para este producto
        </td></tr>`;
        setText("ventasPieInfo", "0 venta(s)");
        setText("ventasTotal", "S/ 0.00");
        return;
    }

    let totalVendido = 0;
    lista.forEach(v => {
        const tr = document.createElement("tr");
        const subtotal = parseFloat(v.subtotal || 0);
        totalVendido += subtotal;

        const estadoBadge = v.estado === "pagada" || v.estado === "completada"
            ? `<span class="badge-venta-completada">COMPLETADA</span>`
            : v.estado === "anulada"
            ? `<span class="badge-venta-anulada">ANULADA</span>`
            : `<span class="badge-venta-pendiente">${(v.estado||"").toUpperCase()}</span>`;

        tr.style.background = v.estado === "anulada" ? "#fff5f5" : "";

        tr.innerHTML = `
            <td style="font-weight:700;color:#1a2744">#${v.id_venta}</td>
            <td style="font-family:monospace;font-size:12px">${v.numero_comprobante || "—"}</td>
            <td style="font-size:12px">${formatFechaHora(v.fecha)}</td>
            <td style="font-weight:600">${v.cliente_nombre || "—"}</td>
            <td style="font-size:12px">${v.vendedor || "—"}</td>
            <td><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${(v.metodo_pago||"").toUpperCase()}</span></td>
            <td style="text-align:center;font-weight:700">${v.cantidad || 0}</td>
            <td style="text-align:right;font-weight:700;color:#166534">S/ ${subtotal.toFixed(2)}</td>
            <td>${estadoBadge}</td>
        `;
        tbody.appendChild(tr);
    });

    setText("ventasPieInfo", `${lista.length} venta(s) encontrada(s)`);
    setText("ventasTotal", `Total vendido: S/ ${totalVendido.toFixed(2)}`);
}

function cerrarVentas() { cerrarModal("modalVentas"); }

function exportarVentasExcel() {
    const data = window._ventasData || [];
    if (!data.length) { mostrarToast("No hay datos para exportar", "error"); return; }
    cargarSheetJS(() => {
        const filas = data.map(v => ({
            "ID Venta": v.id_venta, "N° Doc": v.numero_comprobante,
            "Fecha": formatFechaHora(v.fecha), "Cliente": v.cliente_nombre || "",
            "Vendedor": v.vendedor || "", "F. Pago": v.metodo_pago || "",
            "Cantidad": v.cantidad || 0, "Subtotal": parseFloat(v.subtotal || 0),
            "Estado": v.estado || "",
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Ventas");
        XLSX.writeFile(wb, `Ventas_${new Date().toISOString().split("T")[0]}.xlsx`);
        mostrarToast("Excel exportado ✅", "success");
    });
}

// ─── Refresco cards ───────────────────────────────────────────
async function refrescarCards() {
    try {
        let res = await fetch(`${API}/inventario/resumen/v2`);
        if (!res.ok) res = await fetch(`${API}/inventario/resumen`);
        if (res.ok) actualizarCards(await res.json());
    } catch { /* silencioso */ }
}

// ─── SheetJS CDN ──────────────────────────────────────────────
function cargarSheetJS(cb) {
    if (window.XLSX) { cb(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = cb;
    document.head.appendChild(s);
}

// ─── Helpers UI ───────────────────────────────────────────────
function abrirModal(id)  { const el = document.getElementById(id); if (el) el.style.display = "flex"; }
function cerrarModal(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
function mostrarSpinner(id, v) { const el = document.getElementById(id); if (el) el.style.display = v ? "flex" : "none"; }
function setText(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function mostrarErrorModal(elId, msg) { const el = document.getElementById(elId); if (el) { el.textContent = msg; el.style.display = "block"; } }
function limpiarError(elId) { const el = document.getElementById(elId); if (el) { el.textContent = ""; el.style.display = "none"; } }
function escapar(str) { return (str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;"); }
function formatNum(n) { return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatFechaHora(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })
        + " " + d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function actualizarFechaDisplay() {
    const el = document.getElementById("movFechaDisplay");
    if (el) el.textContent = new Date().toLocaleString("es-PE", { day: "2-digit", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

function mostrarToast(mensaje, tipo = "success") {
    let t = document.getElementById("toast-global");
    if (!t) {
        t = document.createElement("div"); t.id = "toast-global";
        Object.assign(t.style, { position:"fixed", bottom:"28px", right:"28px", zIndex:"9999", padding:"12px 22px", borderRadius:"10px", fontSize:"14px", fontWeight:"600", fontFamily:"inherit", maxWidth:"380px", boxShadow:"0 6px 24px rgba(0,0,0,.22)", transition:"opacity .3s ease, transform .3s ease", pointerEvents:"none" });
        document.body.appendChild(t);
    }
    t.textContent = mensaje;
    t.style.background = tipo === "success" ? "#12b886" : tipo === "info" ? "#3b5bdb" : "#fa5252";
    t.style.color = "#fff"; t.style.opacity = "1"; t.style.transform = "translateY(0)";
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(10px)"; }, 4000);
}

// Cerrar modales al clic fuera
document.addEventListener("click", e => {
    ["modalMovimiento","modalKardex","modalEditarPrecios","modalVentas"].forEach(id => {
        if (e.target.id === id) cerrarModal(id);
    });
});

setInterval(actualizarFechaDisplay, 60000);