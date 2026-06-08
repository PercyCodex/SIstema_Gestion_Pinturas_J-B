"use strict";

// ─── ventas.js — adaptado a pinturas.ventas (nueva BD) ───────────────────────
// Campos nuevos: numero_comprobante, tipo_comprobante, metodo_pago, igv,
//                descuento_total, id_cliente (nullable), id_usuario
// detalle_venta: id_pres_prod | id_herramienta | id_mezcla, tipo_item

const API = "http://localhost:3000";

const idUsuario     = parseInt(localStorage.getItem("idUsuario"),  10) || null;
const nombreUsuario = localStorage.getItem("nombreUsuario") || "Usuario";
const rolUsuario    = localStorage.getItem("rolUsuario")    || "";

const state = {
    ventas:           [],
    carrito:          [],
    cliente:          null,
    modoPagoAdjunto:  "texto",
    pagoImagenBase64: null,
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function mostrarToast(msg, tipo = "ok") {
    let t = document.getElementById("toast-global");
    if (!t) {
        t = document.createElement("div");
        t.id = "toast-global";
        Object.assign(t.style, {
            position: "fixed", top: "20px", right: "20px", zIndex: "99999",
            padding: "12px 20px", borderRadius: "8px", fontSize: "13px",
            fontWeight: "600", boxShadow: "0 4px 12px rgba(0,0,0,.2)",
            transition: "opacity .3s ease", pointerEvents: "none",
        });
        document.body.appendChild(t);
    }
    t.textContent      = msg;
    t.style.background = tipo === "ok" ? "#22c55e" : "#ef4444";
    t.style.color      = "#fff";
    t.style.opacity    = "1";
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.style.opacity = "0"; }, 3500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    cargarVentas();
});

// ── Ayuda ─────────────────────────────────────────────────────────────────────
function mostrarAyuda() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.4);
        display:flex;align-items:center;justify-content:center;z-index:9999;`;
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:24px 28px;max-width:360px;width:90%">
            <h3 style="margin:0 0 14px;font-size:15px;color:#1e293b">❓ Ayuda — Ventas</h3>
            <ul style="margin:0 0 18px;padding-left:18px;color:#475569;font-size:13px;line-height:1.8">
                <li>Busca por N° de comprobante o nombre de cliente.</li>
                <li>Usa los filtros de fecha, estado y forma de pago.</li>
                <li><strong>+ Nueva Venta</strong> abre el punto de venta.</li>
                <li>Selecciona el cliente (opcional) antes de agregar productos.</li>
            </ul>
            <button onclick="this.closest('div[style*=fixed]').remove()" style="
                width:100%;padding:9px;background:#3b82f6;border:none;border-radius:7px;
                color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Cerrar</button>
        </div>`;
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

// ── Cargar ventas ─────────────────────────────────────────────────────────────
async function cargarVentas() {
    try {
        const res = await fetch(`${API}/ventas`);
        if (!res.ok) throw new Error();
        state.ventas = await res.json();
        filtrarVentas();
    } catch {
        const tbody = document.getElementById("cuerpoVentas");
        if (tbody) tbody.innerHTML =
            `<tr><td colspan="11" class="tabla-vacia">❌ Error al cargar ventas</td></tr>`;
    }
}

// ── Filtrar ───────────────────────────────────────────────────────────────────
function filtrarVentas() {
    const texto  = (document.getElementById("buscarVenta")?.value   || "").trim().toLowerCase();
    const estado = document.getElementById("filtroEstadoVenta")?.value || "";
    const metodo = document.getElementById("filtroPagoVenta")?.value  || "";
    const desde  = document.getElementById("filtroDesdeVenta")?.value || "";
    const hasta  = document.getElementById("filtroHastaVenta")?.value || "";

    let lista = [...state.ventas];
    if (texto)  lista = lista.filter(v =>
        `${v.numero_comprobante} ${v.cliente_nombre || ""} ${v.vendedor || ""}`.toLowerCase().includes(texto));
    if (estado) lista = lista.filter(v => v.estado === estado);
    if (metodo) lista = lista.filter(v => (v.metodo_pago || "").toLowerCase() === metodo.toLowerCase());
    if (desde)  lista = lista.filter(v => v.fecha && v.fecha.slice(0, 10) >= desde);
    if (hasta)  lista = lista.filter(v => v.fecha && v.fecha.slice(0, 10) <= hasta);

    renderTablaVentas(lista);
    const badge = document.getElementById("totalVentas");
    if (badge) badge.textContent = `${lista.length} registro${lista.length !== 1 ? "s" : ""}`;
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function renderTablaVentas(lista) {
    const tbody = document.getElementById("cuerpoVentas");
    if (!tbody) return;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="tabla-vacia">Sin ventas con estos filtros</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(v => {
        const estadoCls = v.estado === "anulada" ? "vent-badge-anulada" : "vent-badge-completada";
        const recibido  = v.monto_recibido != null ? `S/ ${parseFloat(v.monto_recibido).toFixed(2)}` : "—";
        const vuelto    = v.vuelto         != null ? `S/ ${parseFloat(v.vuelto).toFixed(2)}`         : "—";
        const descuento = v.descuento_total > 0   ? `S/ ${parseFloat(v.descuento_total).toFixed(2)}` : "—";

        return `<tr>
            <td style="font-family:monospace;font-size:12px">${v.numero_comprobante || "—"}</td>
            <td style="text-align:left;max-width:130px;overflow:hidden;text-overflow:ellipsis">${v.cliente_nombre || "Sin cliente"}</td>
            <td style="font-size:12px">${v.vendedor || "—"}</td>
            <td>${formatFecha(v.fecha)}</td>
            <td><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${(v.metodo_pago || "").toUpperCase()}</span></td>
            <td>S/ ${parseFloat(v.subtotal || 0).toFixed(2)}</td>
            <td>${recibido}</td>
            <td class="vent-total">S/ ${parseFloat(v.total || 0).toFixed(2)}</td>
            <td>${descuento}</td>
            <td>${vuelto}</td>
            <td><span class="${estadoCls}">${(v.estado || "").toUpperCase()}</span></td>
            <td>
                <div class="vent-acciones">
                    <button class="vent-btn-icon vent-btn-ver"   title="Ver detalle"  onclick="verVenta(${v.id_venta})">👁</button>
                    <button class="vent-btn-icon vent-btn-hist"  title="Historial"    onclick="verHistorialVenta(${v.id_venta})">🕐</button>
                    <button class="vent-btn-icon vent-btn-print" title="Imprimir"     onclick="imprimirVenta(${v.id_venta})">🖨</button>
                    ${v.estado !== "anulada"
                        ? `<button class="vent-btn-icon vent-btn-anular" title="Anular" onclick="anularVenta(${v.id_venta})">✕</button>`
                        : ""}
                </div>
            </td>
        </tr>`;
    }).join("");
}

// ── Nueva Venta ───────────────────────────────────────────────────────────────
function abrirModalNuevaVenta() {
    state.carrito          = [];
    state.cliente          = null;
    state.pagoImagenBase64 = null;
    state.modoPagoAdjunto  = "texto";

    document.getElementById("tituloModalVenta").textContent = "🛒 Nueva Venta";
    document.getElementById("buscarClienteVenta").value     = "";
    document.getElementById("clienteSeleccionado").style.display = "none";
    document.getElementById("listaClientesBusqueda").innerHTML   = "";
    document.getElementById("inDescuento").value  = "0";
    document.getElementById("inRecibido").value   = "0";
    document.getElementById("inPagoDescripcion").value = "";
    document.getElementById("previewPagoImg").style.display = "none";
    document.getElementById("inPagoImagen").value = "";
    document.getElementById("badgeVendedor").textContent = `${nombreUsuario} (${rolUsuario})`;

    setModoPagoAdjunto("texto");
    actualizarModoPagoExtra();
    renderCarrito();
    recalcularResumen();
    document.getElementById("modalVenta").style.display = "flex";
}

function cerrarModalVenta() {
    document.getElementById("modalVenta").style.display = "none";
}

// ── Búsqueda de cliente ───────────────────────────────────────────────────────
async function ejecutarBusquedaCliente() {
    const q = (document.getElementById("buscarClienteVenta").value || "").trim();
    if (!q) return;

    try {
        const res  = await fetch(`${API}/clientes/buscar?q=${encodeURIComponent(q)}`);
        const lista = await res.json();
        const cont  = document.getElementById("listaClientesBusqueda");

        if (!lista.length) {
            cont.innerHTML = `<p style="font-size:13px;color:#94a3b8;margin-top:8px">Sin resultados</p>`;
            return;
        }

        window._clientesBusqueda = lista;
        cont.innerHTML = lista.map(c => `
            <button type="button" onclick="seleccionarCliente(${c.id_cliente})"
                style="display:block;width:100%;text-align:left;margin-top:6px;padding:10px;
                       border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer">
                <strong>${c.nombre} ${c.apellido || ""}</strong><br>
                <small style="color:#64748b">${c.dni_ruc || "Sin doc"} · ${c.telefono || ""}</small>
            </button>`).join("");
    } catch {
        document.getElementById("listaClientesBusqueda").innerHTML =
            `<p style="font-size:13px;color:#ef4444;margin-top:8px">Error al buscar.</p>`;
    }
}

function seleccionarCliente(id) {
    const c = (window._clientesBusqueda || []).find(x => x.id_cliente === id);
    if (!c) return;
    state.cliente = c;
    document.getElementById("cliNombre").textContent = `${c.nombre} ${c.apellido || ""}`.trim();
    document.getElementById("cliDoc").textContent    = c.dni_ruc ? `Doc: ${c.dni_ruc}` : "";
    document.getElementById("clienteSeleccionado").style.display = "flex";
    document.getElementById("listaClientesBusqueda").innerHTML   = "";
}

function quitarCliente()    { state.cliente = null; document.getElementById("clienteSeleccionado").style.display = "none"; }
function usarSinCliente()   { quitarCliente(); document.getElementById("listaClientesBusqueda").innerHTML = ""; }

// ── Pago adjunto ──────────────────────────────────────────────────────────────
function setModoPagoAdjunto(modo) {
    state.modoPagoAdjunto = modo;
    document.getElementById("tabPagoTexto").classList.toggle("activo", modo === "texto");
    document.getElementById("tabPagoImg").classList.toggle("activo",   modo === "imagen");
    document.getElementById("inPagoDescripcion").style.display = modo === "texto"  ? "block" : "none";
    document.getElementById("inPagoImagen").style.display      = modo === "imagen" ? "block" : "none";
}

function previewPagoImagen(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        state.pagoImagenBase64 = e.target.result;
        const img = document.getElementById("previewPagoImg");
        img.src   = e.target.result;
        img.style.display = "block";
    };
    reader.readAsDataURL(file);
}

function actualizarModoPagoExtra() {
    const met         = document.getElementById("inMetodoPago").value;
    const bloqueEf    = document.getElementById("bloqueEfectivo");
    const bloqueExtra = document.getElementById("bloquePagoExtra");
    if (bloqueEf)    bloqueEf.style.display    = met === "efectivo" ? "block" : "none";
    if (bloqueExtra) bloqueExtra.style.display = met !== "efectivo" ? "block" : "none";
}

// ── Catálogo ──────────────────────────────────────────────────────────────────
function abrirCatalogo() {
    document.getElementById("modalCatalogo").style.display = "flex";
    cargarCatalogo();
}

function cerrarCatalogo() {
    document.getElementById("modalCatalogo").style.display = "none";
}

async function cargarCatalogo() {
    const buscar = (document.getElementById("buscarCatalogo")?.value || "").trim();
    const stock  = document.getElementById("filtroStockCatalogo")?.value || "";
    const params = new URLSearchParams();
    if (buscar) params.set("buscar", buscar);
    if (stock)  params.set("stock",  stock);

    try {
        const res   = await fetch(`${API}/ventas/catalogo/items?${params}`);
        const items = await res.json();
        window._catalogoItems = items;

        const grid = document.getElementById("gridCatalogo");
        if (!grid) return;

        if (!items.length) {
            grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#94a3b8">Sin productos</p>`;
            return;
        }

        grid.innerHTML = items.map((it, idx) => {
            const agotado = parseInt(it.stock_actual) <= 0 && it.tipo_item !== "mezcla";
            const precio  = parseFloat(it.precio_venta || 0).toFixed(2);
            const label   = it.tipo_item === "mezcla" ? "Mezcla personalizada" : (it.presentacion || "");

            return `<div class="vent-catalogo-card ${agotado ? "agotado" : ""}"
                onclick="${agotado ? "" : `agregarAlCarritoIdx(${idx})`}"
                style="${agotado ? "opacity:.5;cursor:not-allowed" : ""}">
                <div style="font-weight:700;font-size:13px;margin-bottom:3px">${esc(it.producto)}</div>
                <div style="font-size:11px;color:#64748b">${esc(label)}</div>
                <div style="font-weight:800;color:#15803d;margin:8px 0 4px">S/ ${precio}</div>
                <div style="font-size:11px;color:${agotado ? '#ef4444' : '#475569'}">
                    Stock: ${it.stock_actual ?? "—"}${agotado ? " ⚠️ Agotado" : ""}
                </div>
            </div>`;
        }).join("");
    } catch {
        const grid = document.getElementById("gridCatalogo");
        if (grid) grid.innerHTML = `<p style="color:#ef4444;grid-column:1/-1">Error al cargar catálogo.</p>`;
    }
}

function agregarAlCarritoIdx(idx) {
    const it = window._catalogoItems?.[idx];
    if (!it) return;
    agregarAlCarrito(it);
}

function agregarAlCarrito(it) {
    const existe = state.carrito.find(c => c.tipo_item === it.tipo_item && c.id_ref === it.id_ref);
    if (existe) {
        existe.cantidad++;
        existe.subtotal = existe.cantidad * existe.precio_unitario;
    } else {
        state.carrito.push({
            tipo_item:      it.tipo_item || "producto",
            id_ref:         it.id_ref,
            nombre:         it.producto,
            presentacion:   it.presentacion || "",
            stock:          it.stock_actual,
            cantidad:       1,
            precio_unitario: parseFloat(it.precio_venta) || 0,
            subtotal:       parseFloat(it.precio_venta)  || 0,
            descuento:      0,
        });
    }
    renderCarrito();
    recalcularResumen();
}

// ── Carrito ───────────────────────────────────────────────────────────────────
function renderCarrito() {
    const tbody = document.getElementById("carritoVenta");
    if (!tbody) return;

    if (!state.carrito.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:18px">Sin productos</td></tr>`;
        return;
    }

    tbody.innerHTML = state.carrito.map((c, i) => `
        <tr>
            <td style="text-align:left">
                <strong>${esc(c.nombre)}</strong>
                ${c.presentacion ? `<br><small style="color:#64748b">${esc(c.presentacion)}</small>` : ""}
            </td>
            <td><input type="number" min="0.01" step="0.01" value="${c.precio_unitario.toFixed(2)}"
                style="width:74px;padding:6px;border:1px solid #d1d5db;border-radius:6px"
                onchange="cambiarPrecio(${i}, this.value)"></td>
            <td>
                <button onclick="cambiarCant(${i},-1)" style="border:none;background:#e2e8f0;border-radius:5px;padding:4px 8px;cursor:pointer">−</button>
                <span style="margin:0 8px;font-weight:700">${c.cantidad}</span>
                <button onclick="cambiarCant(${i}, 1)" style="border:none;background:#e2e8f0;border-radius:5px;padding:4px 8px;cursor:pointer">+</button>
            </td>
            <td><strong>S/ ${c.subtotal.toFixed(2)}</strong></td>
            <td>
                <button onclick="quitarItem(${i})"
                    style="background:#fee2e2;border:none;border-radius:6px;padding:5px 9px;cursor:pointer;color:#991b1b">🗑</button>
            </td>
        </tr>`).join("");
}

function cambiarCant(i, delta) {
    const c = state.carrito[i];
    if (!c) return;
    c.cantidad = Math.max(1, c.cantidad + delta);
    c.subtotal = c.cantidad * c.precio_unitario;
    renderCarrito();
    recalcularResumen();
}

function cambiarPrecio(i, val) {
    const c = state.carrito[i];
    if (!c) return;
    c.precio_unitario = parseFloat(val) || 0;
    c.subtotal        = c.cantidad * c.precio_unitario;
    renderCarrito();
    recalcularResumen();
}

function quitarItem(i) {
    state.carrito.splice(i, 1);
    renderCarrito();
    recalcularResumen();
}

function recalcularResumen() {
    const sub   = state.carrito.reduce((s, c) => s + c.subtotal, 0);
    const desc  = parseFloat(document.getElementById("inDescuento")?.value) || 0;
    const total = Math.max(0, sub - desc);

    const elSub   = document.getElementById("resSubtotal");
    const elTotal = document.getElementById("resTotal");
    if (elSub)   elSub.textContent   = `S/ ${sub.toFixed(2)}`;
    if (elTotal) elTotal.textContent = `S/ ${total.toFixed(2)}`;

    const met = document.getElementById("inMetodoPago")?.value;
    if (met === "efectivo") {
        const rec    = parseFloat(document.getElementById("inRecibido")?.value) || 0;
        const vuelto = Math.max(0, rec - total);
        const elV    = document.getElementById("resVuelto");
        if (elV) elV.textContent = `S/ ${vuelto.toFixed(2)}`;
    }
}

// ── Confirmar Venta ───────────────────────────────────────────────────────────
async function confirmarVenta() {
    if (!state.carrito.length) {
        mostrarToast("Agrega al menos un producto.", "error"); return;
    }
    if (!idUsuario) {
        mostrarToast("Sesión inválida. Vuelve a iniciar sesión.", "error"); return;
    }

    const sub  = state.carrito.reduce((s, c) => s + c.subtotal, 0);
    const desc = parseFloat(document.getElementById("inDescuento")?.value) || 0;
    const total = Math.max(0, sub - desc);
    const met   = document.getElementById("inMetodoPago")?.value;

    let recibido = null;
    let vuelto   = null;
    if (met === "efectivo") {
        recibido = parseFloat(document.getElementById("inRecibido")?.value) || 0;
        vuelto   = Math.max(0, recibido - total);
    }

    let pago_adjunto = null;
    if (met !== "efectivo") {
        if (state.modoPagoAdjunto === "imagen" && state.pagoImagenBase64) {
            pago_adjunto = { tipo: "imagen", valor: state.pagoImagenBase64 };
        } else {
            const txt = (document.getElementById("inPagoDescripcion")?.value || "").trim();
            if (txt) pago_adjunto = { tipo: "texto", valor: txt };
        }
    }

    const body = {
        id_cliente:        state.cliente?.id_cliente || null,
        id_usuario:        idUsuario,
        tipo_comprobante:  document.getElementById("inTipoComprobante")?.value || "nota_venta",
        subtotal:          sub,
        descuento_total:   desc,
        total,
        metodo_pago:       met,
        estado:            "completada",
        monto_recibido:    recibido,
        vuelto,
        pago_adjunto,
        detalle: state.carrito.map(c => ({
            tipo_item:       c.tipo_item,
            id_ref:          c.id_ref,
            cantidad:        c.cantidad,
            precio_unitario: c.precio_unitario,
            descuento:       c.descuento || 0,
        })),
    };

    try {
        const res  = await fetch(`${API}/ventas`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { mostrarToast(data.message || "Error al guardar venta", "error"); return; }

        cerrarModalVenta();
        cerrarCatalogo();
        await cargarVentas();
        mostrarToast(data.message || "Venta registrada correctamente", "ok");
    } catch (err) {
        console.error(err);
        mostrarToast("Error de conexión con el servidor.", "error");
    }
}

// ── Ver detalle ───────────────────────────────────────────────────────────────
async function verVenta(id) {
    try {
        const res = await fetch(`${API}/ventas/${id}`);
        const v   = await res.json();
        mostrarDetalleVenta(v, false);
    } catch {
        mostrarToast("Error al cargar detalle.", "error");
    }
}

async function verHistorialVenta(id) {
    try {
        const res = await fetch(`${API}/ventas/${id}`);
        const v   = await res.json();
        mostrarDetalleVenta(v, true);
    } catch {
        mostrarToast("Error al cargar historial.", "error");
    }
}

function mostrarDetalleVenta(v, historial) {
    const titulo = document.getElementById("tituloDetalleVenta");
    if (titulo) titulo.textContent = historial
        ? `Historial — Venta #${v.id_venta}`
        : `Venta #${v.id_venta} — ${v.numero_comprobante || ""}`;

    const filas = (v.detalle || []).map(d => `
        <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:8px;text-align:left">${d.nombre_item || d.tipo_item}</td>
            <td style="padding:8px;text-align:center">${d.cantidad}</td>
            <td style="padding:8px;text-align:right">S/ ${parseFloat(d.precio_unitario || 0).toFixed(2)}</td>
            <td style="padding:8px;text-align:right;font-weight:700">S/ ${parseFloat(d.subtotal || 0).toFixed(2)}</td>
        </tr>`).join("");

    const pago = v.pago_adjunto;
    let pagoHtml = "";
    if (pago?.tipo === "imagen" && pago.valor) {
        pagoHtml = `<img src="${pago.valor}" style="max-width:200px;border-radius:8px;margin-top:8px">`;
    } else if (pago?.valor) {
        pagoHtml = `<p style="margin:4px 0;font-size:13px"><strong>Pago:</strong> ${pago.valor}</p>`;
    }

    const contenido = document.getElementById("contenidoDetalleVenta");
    if (contenido) contenido.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;margin-bottom:12px">
            <div><span style="color:#64748b">Cliente:</span> <strong>${v.cliente_nombre || "Sin cliente"}</strong></div>
            <div><span style="color:#64748b">Vendedor:</span> ${v.vendedor || "—"}</div>
            <div><span style="color:#64748b">Fecha:</span> ${formatFechaHora(v.fecha)}</div>
            <div><span style="color:#64748b">Tipo:</span> ${(v.tipo_comprobante || "").replace("_", " ").toUpperCase()}</div>
            <div><span style="color:#64748b">Pago:</span> ${(v.metodo_pago || "").toUpperCase()}</div>
            <div><span style="color:#64748b">Estado:</span>
                <span style="background:${v.estado === 'anulada' ? '#fee2e2' : '#dcfce7'};
                    color:${v.estado === 'anulada' ? '#991b1b' : '#166534'};
                    padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">
                    ${(v.estado || "").toUpperCase()}
                </span>
            </div>
        </div>
        ${pagoHtml}
        <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
                <tr style="background:#051c5c">
                    <th style="padding:8px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase">Producto</th>
                    <th style="padding:8px;text-align:center;color:#fff;font-size:11px">Cant.</th>
                    <th style="padding:8px;text-align:right;color:#fff;font-size:11px">P. Unit.</th>
                    <th style="padding:8px;text-align:right;color:#fff;font-size:11px">Subtotal</th>
                </tr>
            </thead>
            <tbody>${filas || "<tr><td colspan='4' style='text-align:center;padding:12px;color:#94a3b8'>Sin detalle</td></tr>"}</tbody>
        </table>
        <div style="margin-top:12px;border-top:2px solid #e2e8f0;padding-top:12px;font-size:13px">
            <div style="display:flex;justify-content:space-between;color:#64748b;margin-bottom:4px">
                <span>Subtotal</span><span>S/ ${parseFloat(v.subtotal||0).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#64748b;margin-bottom:4px">
                <span>Descuento</span><span>- S/ ${parseFloat(v.descuento_total||0).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin-top:8px">
                <span>TOTAL</span><span style="color:#15803d">S/ ${parseFloat(v.total||0).toFixed(2)}</span>
            </div>
            ${v.monto_recibido != null ? `
            <div style="display:flex;justify-content:space-between;margin-top:8px;color:#2563eb">
                <span>Recibido</span><span>S/ ${parseFloat(v.monto_recibido).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:#2563eb">
                <span>Vuelto</span><span>S/ ${parseFloat(v.vuelto||0).toFixed(2)}</span>
            </div>` : ""}
        </div>`;

    document.getElementById("modalDetalleVenta").style.display = "flex";
}

function cerrarDetalleVenta() {
    document.getElementById("modalDetalleVenta").style.display = "none";
}

async function anularVenta(id) {
    if (!confirm("¿Anular esta venta?")) return;
    try {
        await fetch(`${API}/ventas/${id}/anular`, { method: "PUT" });
        await cargarVentas();
        mostrarToast("Venta anulada", "ok");
    } catch {
        mostrarToast("Error al anular", "error");
    }
}

function imprimirVenta(id) {
    verVenta(id).then(() => setTimeout(() => window.print(), 400));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatFecha(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE");
}

function formatFechaHora(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-PE");
}

function esc(s) {
    return String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}