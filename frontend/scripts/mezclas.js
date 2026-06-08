"use strict";

const API = "http://localhost:3000";

const db = {
    mezclas: [],
    clientes: [],
    productosMezclables: [],
    detalle: [],
    editandoId: null,
};

document.addEventListener("DOMContentLoaded", iniciarPagina);

async function iniciarPagina() {
    try {
        const [resM, resC, resP] = await Promise.all([
            fetch(`${API}/mezclas`),
            fetch(`${API}/clientes`),
            fetch(`${API}/catalogo`),
        ]);
        db.mezclas = await resM.json();
        db.clientes = await resC.json();
        const catalogo = await resP.json();
        db.productosMezclables = catalogo.filter(p =>
            p.es_mezcable && p.tipo_item === "producto" && p.estado === "activo"
        );
        llenarSelectClientes();
        llenarSelectProductos();
        filtrarMezclas();
    } catch (e) {
        console.error(e);
    }
}

function llenarSelectClientes() {
    const sel = document.getElementById("inClienteMezcla");
    sel.innerHTML = `<option value="">Seleccione cliente</option>`;
    db.clientes.filter(c => c.estado === "activo").forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id_cliente;
        opt.textContent = `${c.nombre} ${c.apellido || ""}`.trim();
        sel.appendChild(opt);
    });
}

function llenarSelectProductos() {
    const sel = document.getElementById("selProdMezcla");
    sel.innerHTML = `<option value="">Producto base</option>`;
    db.productosMezclables.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id_producto;
        opt.textContent = p.nombre;
        sel.appendChild(opt);
    });
}

function filtrarMezclas() {
    const texto  = (document.getElementById("buscarMezcla")?.value || "").trim().toLowerCase();
    const estado = document.getElementById("filtroEstadoMezcla")?.value || "";

    let lista = [...db.mezclas];
    if (texto) {
        lista = lista.filter(m =>
            `${m.codigo_mezcla} ${m.nombre_mezcla} ${m.cliente_nombre}`.toLowerCase().includes(texto)
        );
    }
    if (estado) lista = lista.filter(m => m.estado === estado);

    renderTabla(lista);
    const el = document.getElementById("totalMezclas");
    if (el) el.textContent = `${lista.length} registro${lista.length !== 1 ? "s" : ""}`;
}

function renderTabla(lista) {
    const tbody = document.getElementById("cuerpoMezclas");
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="tabla-vacia">Sin mezclas</td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map(m => `
        <tr>
            <td><code>${m.codigo_mezcla}</code></td>
            <td class="td-nombre">${m.nombre_mezcla || "—"}<br><small>${m.cliente_nombre || ""}</small></td>
            <td>S/ ${parseFloat(m.precio_mezcla || 0).toFixed(2)}</td>
            <td><span class="badge-activo">${m.estado}</span></td>
            <td>${formatFecha(m.fecha_solicitud)}</td>
            <td class="td-acciones">
                <button class="btn-accion btn-ver" onclick="verHistorial(${m.id_mezcla})">Historial</button>
                <button class="btn-accion btn-editar" onclick="cambiarEstado(${m.id_mezcla},'listo')">Listo</button>
            </td>
        </tr>`).join("");
}

function abrirModalCrear() {
    db.editandoId = null;
    db.detalle = [];
    document.getElementById("tituloModalMezcla").textContent = "Nueva mezcla";
    document.getElementById("inNombreMezcla").value = "";
    document.getElementById("inDescMezcla").value = "";
    document.getElementById("inPrecioMezcla").value = "0";
    renderDetalleMezcla();
    document.getElementById("modalMezcla").style.display = "flex";
}

function cerrarModalMezcla() {
    document.getElementById("modalMezcla").style.display = "none";
}

function agregarLineaMezcla() {
    const id = parseInt(document.getElementById("selProdMezcla").value, 10);
    const cant = parseFloat(document.getElementById("inCantMezcla").value);
    if (!id || !cant) return;
    const prod = db.productosMezclables.find(p => p.id_producto === id);
    db.detalle.push({
        id_producto: id,
        producto_nombre: prod?.nombre || "Producto",
        cantidad_usada: cant,
        unidad: "ml",
    });
    document.getElementById("inCantMezcla").value = "";
    renderDetalleMezcla();
}

function renderDetalleMezcla() {
    const tbody = document.getElementById("cuerpoDetalleMezcla");
    if (!db.detalle.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="tabla-vacia">Sin componentes</td></tr>`;
        return;
    }
    tbody.innerHTML = db.detalle.map((d, i) => `
        <tr>
            <td>${d.producto_nombre}</td>
            <td>${d.cantidad_usada} ${d.unidad}</td>
            <td><button type="button" onclick="quitarLinea(${i})">✕</button></td>
        </tr>`).join("");
}

function quitarLinea(i) {
    db.detalle.splice(i, 1);
    renderDetalleMezcla();
}

async function guardarMezcla() {
    const id_cliente = document.getElementById("inClienteMezcla").value;
    if (!id_cliente) { alert("Seleccione un cliente"); return; }
    if (!db.detalle.length) { alert("Agregue al menos un producto a la fórmula"); return; }

    const empRes = await fetch(`${API}/empleados`);
    const empleados = await empRes.json();
    const id_empleado = empleados[0]?.id_empleado;
    if (!id_empleado) { alert("No hay empleados activos en el sistema"); return; }

    const body = {
        id_cliente: parseInt(id_cliente, 10),
        id_empleado,
        nombre_mezcla: document.getElementById("inNombreMezcla").value.trim(),
        descripcion: document.getElementById("inDescMezcla").value.trim() || null,
        precio_mezcla: parseFloat(document.getElementById("inPrecioMezcla").value) || 0,
        tiempo_preparacion_min: parseInt(document.getElementById("inTiempoMezcla").value, 10) || 0,
        detalle: db.detalle.map(d => ({
            id_producto: d.id_producto,
            cantidad_usada: d.cantidad_usada,
            unidad: d.unidad,
        })),
    };

    const res = await fetch(`${API}/mezclas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.message || "Error"); return; }

    cerrarModalMezcla();
    const resAll = await fetch(`${API}/mezclas`);
    db.mezclas = await resAll.json();
    filtrarMezclas();
    alert("Mezcla registrada");
}

async function verHistorial(id) {
    const res = await fetch(`${API}/mezclas/${id}`);
    const m = await res.json();

    const det = (m.detalle || []).map(d =>
        `<tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:8px;text-align:left">${d.producto_nombre}</td>
            <td style="padding:8px;text-align:center">${d.cantidad_usada} ${d.unidad}</td>
        </tr>`
    ).join("");

    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;z-index:9999;
    `;
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:24px;max-width:460px;width:90%;box-shadow:0 8px 24px rgba(0,0,0,0.15)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <div>
                    <div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase">${m.codigo_mezcla}</div>
                    <div style="font-size:16px;font-weight:800;color:#1e293b">${m.nombre_mezcla || "Sin nombre"}</div>
                </div>
                <span style="background:${m.estado === 'listo' ? '#dcfce7' : '#fef9c3'};
                    color:${m.estado === 'listo' ? '#166534' : '#854d0e'};
                    padding:4px 10px;border-radius:10px;font-size:11px;font-weight:700">
                    ${m.estado.toUpperCase()}
                </span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;margin-bottom:14px;padding:10px;background:#f8fafc;border-radius:8px">
                <div><span style="color:#64748b">Cliente:</span> <strong>${m.cliente_nombre}</strong></div>
                <div><span style="color:#64748b">Precio:</span> <strong style="color:#15803d">S/ ${parseFloat(m.precio_mezcla||0).toFixed(2)}</strong></div>
                <div><span style="color:#64748b">Fecha:</span> ${formatFecha(m.fecha_solicitud)}</div>
                <div><span style="color:#64748b">Tiempo:</span> ${m.tiempo_preparacion_min || 0} min</div>
            </div>
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px">Componentes</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                    <tr style="background:#f1f5f9">
                        <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase">Producto</th>
                        <th style="padding:8px;text-align:center;font-size:11px;text-transform:uppercase">Cantidad</th>
                    </tr>
                </thead>
                <tbody>${det || "<tr><td colspan='2' style='text-align:center;padding:12px;color:#94a3b8'>Sin componentes</td></tr>"}</tbody>
            </table>
            <button onclick="this.closest('div[style*=fixed]').remove()" style="
                width:100%;margin-top:16px;padding:10px;background:#3b82f6;
                border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-size:13px
            ">Cerrar</button>
        </div>
    `;
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

async function cambiarEstado(id, estado) {
    await fetch(`${API}/mezclas/${id}/estado`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
    });
    const resAll = await fetch(`${API}/mezclas`);
    db.mezclas = await resAll.json();
    filtrarMezclas();
}

function formatFecha(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-PE");
}
