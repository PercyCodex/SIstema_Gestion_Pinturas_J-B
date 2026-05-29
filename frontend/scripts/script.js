const nombre = localStorage.getItem("nombreUsuario");
const rol    = localStorage.getItem("rolUsuario");

// Redirigir si no hay sesión
if (!nombre) {
    window.location.href = "index.html";
}

if (nombre) {
    const el = document.getElementById("bienvenida");
    if (el) el.textContent = nombre;
}

// ── Jerarquía de roles (debe coincidir con pinturas.roles) ──────────────
const jerarquia = {
    "Super Administrador": 5,
    "Administrador":       4,
    "Supervisor":          3,
    "Vendedor":            2,
    "Usuario":             1
};

// ── Páginas bloqueadas por rol ──────────────────────────────────────────
// Lista de páginas que el rol NO puede ver
const restricciones = {
    "Super Administrador": [],                                          // todo permitido
    "Administrador":       ["configuraciones.html"],
    "Supervisor":          ["usuarios.html", "configuraciones.html"],
    "Vendedor":            ["usuarios.html", "perfiles.html", "configuraciones.html",
                            "proveedores.html", "inventario.html"],
    "Usuario":             ["usuarios.html", "perfiles.html", "configuraciones.html",
                            "proveedores.html"]
};

const paginaActual    = window.location.pathname.split("/").pop();
const paginasBloqueadas = restricciones[rol] ?? [];

// Bloquear acceso directo por URL
if (paginasBloqueadas.includes(paginaActual)) {
    alert("No tienes permiso para acceder a esta página.");
    window.location.href = "dashboard.html";
}

// Ocultar links del sidebar que el usuario no puede usar
document.querySelectorAll("#navegador a").forEach(link => {
    const href = link.getAttribute("href").split("/").pop();
    if (paginasBloqueadas.includes(href)) {
        link.parentElement.style.display = "none";
    }
});

// ── Marcar link activo en el sidebar ───────────────────────────────────
document.querySelectorAll("#navegador a").forEach(link => {
    if (link.getAttribute("href").includes(paginaActual)) {
        link.style.background = "#3c3850ff";
        link.style.fontWeight  = "600";
    }
});