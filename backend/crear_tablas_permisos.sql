-- Tabla de Perfiles (Roles)
CREATE TABLE IF NOT EXISTS perfiles (
    id_perfil SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    estado VARCHAR(20) DEFAULT 'activo',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Permisos por Perfil
CREATE TABLE IF NOT EXISTS permisos_perfil (
    id SERIAL PRIMARY KEY,
    id_perfil INTEGER REFERENCES perfiles(id_perfil) ON DELETE CASCADE,
    modulo VARCHAR(50) NOT NULL,
    ver BOOLEAN DEFAULT false,
    crear BOOLEAN DEFAULT false,
    editar BOOLEAN DEFAULT false,
    eliminar BOOLEAN DEFAULT false,
    UNIQUE(id_perfil, modulo)
);

-- Insertar perfil Super Administrador por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('SUPER ADMINISTRADOR', 'Acceso total al sistema', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar perfil Administrador por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('ADMINISTRADOR', 'Acceso administrativo', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar perfil Supervisor por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('SUPERVISOR', 'Supervisión de operaciones', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar perfil Almacenero por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('ALMACENERO', 'Gestión de inventario', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar perfil Cajero por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('CAJERO', 'Gestión de ventas', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar perfil Vendedor por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('VENDEDOR', 'Ventas y atención al cliente', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Insertar perfil Usuario por defecto
INSERT INTO perfiles (nombre, descripcion, estado) 
VALUES ('USUARIO', 'Usuario básico', 'activo')
ON CONFLICT (nombre) DO NOTHING;

-- Dar todos los permisos al Super Administrador
INSERT INTO permisos_perfil (id_perfil, modulo, ver, crear, editar, eliminar)
SELECT id_perfil, modulo, true, true, true, true
FROM perfiles, (SELECT unnest(ARRAY['dashboard', 'usuarios', 'perfiles', 'categoria', 'marcas', 'inventario', 'productos', 'ventas', 'clientes', 'presentaciones', 'proveedores', 'mezclas', 'gestion-tienda', 'cotizaciones', 'configuraciones']) AS modulo)
WHERE nombre = 'SUPER ADMINISTRADOR'
ON CONFLICT (id_perfil, modulo) DO NOTHING;
