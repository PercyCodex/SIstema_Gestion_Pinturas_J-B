const TIPO_ITEM = Object.freeze({
    PRODUCTO: "producto",
    HERRAMIENTA: "herramienta",
    MEZCLA: "mezcla",
});

const TIPOS_CATALOGO = [TIPO_ITEM.PRODUCTO];

function normalizarTipoItem(tipo) {
    if (!tipo) return null;
    const t = String(tipo).toLowerCase().trim();
    if (t === "pintura") return TIPO_ITEM.PRODUCTO;
    return t;
}

function esTipoCatalogoValido(tipo) {
    return TIPOS_CATALOGO.includes(normalizarTipoItem(tipo));
}

function esHerramienta(tipo) {
    return normalizarTipoItem(tipo) === TIPO_ITEM.HERRAMIENTA;
}

function esProducto(tipo) {
    return normalizarTipoItem(tipo) === TIPO_ITEM.PRODUCTO;
}

module.exports = {
    TIPO_ITEM,
    TIPOS_CATALOGO,
    normalizarTipoItem,
    esTipoCatalogoValido,
    esHerramienta,
    esProducto,
};