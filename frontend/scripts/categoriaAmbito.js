"use strict";

/** Debe coincidir con backend/src/constants/categoriaAmbito.js */
const RAIZ_PRODUCTO = new Set([
    "pinturas",
    "diluyentes",
    "accesorios",
]);

const RAIZ_HERRAMIENTA = new Set([
    "herramientas",
    "herramientas de aplicacion",
    "proteccion personal",
    "preparacion de superficies",
]);

function normalizarNombreCategoria(nombre) {
    return (nombre || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function ambitoDeRaizNombre(nombreRaiz) {
    const n = normalizarNombreCategoria(nombreRaiz);
    if (RAIZ_HERRAMIENTA.has(n)) return TIPO_ITEM.HERRAMIENTA;
    if (RAIZ_PRODUCTO.has(n)) return TIPO_ITEM.PRODUCTO;
    return null;
}

function obtenerRaizCategoria(categoria, todas) {
    if (!categoria) return null;
    if (!categoria.id_padre) return categoria;
    const padre = todas.find((c) => c.id_categoria === categoria.id_padre);
    return padre ? obtenerRaizCategoria(padre, todas) : categoria;
}

function filtrarCategoriasPorTipoItem(tipoItem, todas) {
    if (!tipoItem || !Array.isArray(todas)) return [];

    const activas = todas.filter((c) => c.estado !== "inactivo");
    const esHerr = esHerramienta(tipoItem);

    const raices = activas
        .filter((c) => !c.id_padre)
        .filter((c) => {
            const amb = ambitoDeRaizNombre(c.nombre);
            return esHerr ? amb === TIPO_ITEM.HERRAMIENTA : amb === TIPO_ITEM.PRODUCTO;
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const resultado = [];
    raices.forEach((raiz) => {
        const hijos = activas
            .filter((c) => c.id_padre === raiz.id_categoria)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

        if (hijos.length === 0) {
            resultado.push({ categoria: raiz, esHijo: false });
        } else {
            hijos.forEach((h) => resultado.push({ categoria: h, esHijo: true, raiz }));
        }
    });

    return resultado;
}
