"use strict";

// ─── script.js — Control de sesión y permisos ────────────────────────────────
// Adaptado a la nueva BD: pinturas.roles (roles en lugar de perfiles antiguos)

const nombre = localStorage.getItem("nombreUsuario");
const rol    = localStorage.getItem("rolUsuario");

// Redirigir si no hay sesión activa
if (!nombre) {
    window.location.href = "index.html";
}

// Mostrar nombre de usuario en el sidebar
if (nombre) {
    const el = document.getElementById("bienvenida");
    if (el) el.textContent = nombre;
}

// ── Jerarquía de roles (debe coincidir con pinturas.roles en la BD) ──────────
const jerarquia = {
    "Super Administrador": 5,
    "Administrador":       4,
    "Supervisor":          3,
    "Vendedor":            2,
    "Usuario":             1,
};

// ── Páginas bloqueadas según rol ─────────────────────────────────────────────
// Lista de páginas que el rol NO puede ver
const restricciones = {
    "Super Administrador": [],
    "Administrador":       ["configuraciones.html"],
    "Supervisor":          ["usuarios.html", "configuraciones.html"],
    "Vendedor":            [
        "usuarios.html",
        "perfiles.html",
        "configuraciones.html",
        "proveedores.html",
        "inventario.html",
    ],
    "Usuario": [
        "usuarios.html",
        "perfiles.html",
        "configuraciones.html",
        "proveedores.html",
    ],
};

const paginaActual      = window.location.pathname.split("/").pop();
const paginasBloqueadas = restricciones[rol] ?? [];

// Bloquear acceso directo por URL
if (paginasBloqueadas.includes(paginaActual)) {
    alert("No tienes permiso para acceder a esta página.");
    window.location.href = "dashboard.html";
}

// Ocultar links del sidebar que el rol no puede usar
document.querySelectorAll("#navegador a").forEach((link) => {
    const href = (link.getAttribute("href") || "").split("/").pop();
    if (paginasBloqueadas.includes(href)) {
        const li = link.parentElement;
        if (li) li.style.display = "none";
    }
});

// Marcar link activo en el sidebar
document.querySelectorAll("#navegador a").forEach((link) => {
    if ((link.getAttribute("href") || "").includes(paginaActual)) {
        link.classList.add("nav-active");
    }
});

// ── Helper global: ¿puede gestionar? (crear/editar/eliminar) ─────────────────
window.puedeGestionar = ["Super Administrador", "Administrador"].includes(rol);
window.rolActual      = rol;
window.idUsuarioActual = parseInt(localStorage.getItem("idUsuario"), 10) || null;
window.nombreUsuarioActual = nombre || "";

// ── Función de logout ─────────────────────────────────────────────────────────
window.cerrarSesion = function () {
    localStorage.removeItem("nombreUsuario");
    localStorage.removeItem("rolUsuario");
    localStorage.removeItem("idUsuario");
    window.location.href = "index.html";
};