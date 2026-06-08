"use strict";

const API = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", cargarCatalogoWeb);

async function cargarCatalogoWeb() {
    const spinner = document.getElementById("spinnerWeb");
    const grid = document.getElementById("gridWeb");
    const buscar = (document.getElementById("buscarWeb")?.value || "").trim();

    spinner.style.display = "block";
    grid.innerHTML = "";

    try {
        const params = buscar ? `?buscar=${encodeURIComponent(buscar)}` : "";
        const res = await fetch(`${API}/public/catalogo${params}`);
        const items = await res.json();

        if (!items.length) {
            grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#94a3b8">No hay productos publicados</p>`;
        } else {
            grid.innerHTML = items.map(p => {
                const stock = parseInt(p.stock_total) || 0;
                const badge = stock <= 0
                    ? `<span class="web-badge agotado">Agotado</span>`
                    : stock < 10
                    ? `<span class="web-badge bajo">Pocas unidades</span>`
                    : `<span class="web-badge ok">Disponible</span>`;
                const precio = p.precio_desde != null
                    ? `S/ ${parseFloat(p.precio_desde).toFixed(2)}`
                    : (p.precio_base != null ? `S/ ${parseFloat(p.precio_base).toFixed(2)}` : "Consultar");

                return `<article class="web-card">
                    ${badge}
                    <h3>${esc(p.nombre)}</h3>
                    <div class="marca">${esc(p.marca || p.codigo_interno || "")}</div>
                    <div class="precio">${precio}</div>
                    <div class="stock">Stock total: ${stock}</div>
                </article>`;
            }).join("");
        }

        document.getElementById("webContador").textContent =
            `${items.length} producto(s) mostrado(s)`;
    } catch (e) {
        grid.innerHTML = `<p style="color:#b91c1c">No se pudo conectar con el servidor</p>`;
    } finally {
        spinner.style.display = "none";
    }
}

function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
