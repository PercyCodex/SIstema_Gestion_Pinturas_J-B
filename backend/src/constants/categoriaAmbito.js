const { TIPO_ITEM, normalizarTipoItem, esHerramienta, esProducto } = require("./tipoItem");

/** Nombres de categorías raíz (sin padre) según tu catálogo */
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

function normalizarNombre(nombre) {
    return (nombre || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function ambitoDeRaizNombre(nombreRaiz) {
    const n = normalizarNombre(nombreRaiz);
    if (RAIZ_HERRAMIENTA.has(n)) return TIPO_ITEM.HERRAMIENTA;
    if (RAIZ_PRODUCTO.has(n)) return TIPO_ITEM.PRODUCTO;
    return null;
}

function obtenerRaiz(categoria, todas) {
    if (!categoria) return null;
    if (!categoria.id_padre) return categoria;
    const padre = todas.find((c) => c.id_categoria === categoria.id_padre);
    return padre ? obtenerRaiz(padre, todas) : categoria;
}

function ambitoDeCategoria(categoria, todas) {
    const raiz = obtenerRaiz(categoria, todas);
    return raiz ? ambitoDeRaizNombre(raiz.nombre) : null;
}

function filtrarCategoriasPorAmbito(todas, ambito) {
    const tipo = normalizarTipoItem(ambito);
    if (!tipo) return todas;

    const activas = todas.filter((c) => c.estado !== "inactivo");

    const raices = activas.filter((c) => {
        if (c.id_padre) return false;
        const amb = ambitoDeRaizNombre(c.nombre);
        return tipo === TIPO_ITEM.HERRAMIENTA
            ? amb === TIPO_ITEM.HERRAMIENTA
            : amb === TIPO_ITEM.PRODUCTO;
    });

    const idsRaiz = new Set(raices.map((r) => r.id_categoria));
    const hijos = activas.filter((c) => c.id_padre && idsRaiz.has(c.id_padre));

    return [...raices, ...hijos].sort((a, b) => {
        const raizA = a.id_padre || a.id_categoria;
        const raizB = b.id_padre || b.id_categoria;
        if (raizA !== raizB) return raizA - raizB;
        return (a.id_padre ? 1 : 0) - (b.id_padre ? 1 : 0) || a.nombre.localeCompare(b.nombre, "es");
    });
}

function categoriaValidaParaAmbito(idCategoria, todas, ambito) {
    if (!idCategoria) return true;
    const cat = todas.find((c) => c.id_categoria === parseInt(idCategoria, 10));
    if (!cat) return false;
    if (cat.id_padre) {
        return ambitoDeCategoria(cat, todas) === normalizarTipoItem(ambito);
    }
    return ambitoDeRaizNombre(cat.nombre) === normalizarTipoItem(ambito);
}

module.exports = {
    RAIZ_PRODUCTO,
    RAIZ_HERRAMIENTA,
    normalizarNombre,
    ambitoDeRaizNombre,
    obtenerRaiz,
    ambitoDeCategoria,
    filtrarCategoriasPorAmbito,
    categoriaValidaParaAmbito,
    esProducto,
    esHerramienta,
};
