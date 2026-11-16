# Plataforma WebGIS – Microcuenca del río Nazareno

Plataforma para la gestión y el monitoreo de información hidrogeológica de la
microcuenca del río Nazareno, Santa Cruz Xoxocotlán, Oaxaca.

Proyecto de tesis de la Maestría en Ciencias en Conservación y Aprovechamiento
de Recursos Naturales, CIIDIR Unidad Oaxaca, Instituto Politécnico Nacional.

## Funciones

- Mapa interactivo con capas de la microcuenca (Leaflet)
- Pozos del REPDA y de campo, con su fuente, mediciones y concesiones
- Filtros por fuente y uso del agua
- Registro de pozos y mediciones con validación (solo usuarios autenticados)
- Exportación de datos en CSV y GeoJSON
- Medición de distancias

## Tecnologías

Node.js · Express · PostgreSQL · PostGIS · Leaflet · QGIS

## Requisitos

- Node.js 18 o superior
- PostgreSQL 16 o superior con la extensión PostGIS

## Instalación

1. Clonar el repositorio:
   ```
   git clone https://github.com/ita0813/nazareno-web.git
   cd nazareno-web/servidor
   npm install
   ```

2. Crear la base de datos y activar PostGIS (en psql o pgAdmin):
   ```sql
   CREATE DATABASE nazareno;
   \c nazareno
   CREATE EXTENSION postgis;
   ```

3. Crear las tablas ejecutando, **en orden**, los archivos de `servidor/bd/`
   (01, 02, 03, 05, 06).

4. Crear el archivo `servidor/.env` con los datos de conexión
   (este archivo **no** se sube a GitHub):
   ```
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=nazareno
   PGUSER=postgres
   PGPASSWORD=tu_contraseña
   SESSION_SECRET=una_cadena_larga_y_aleatoria
   ```

5. Cargar los datos:
   ```
   node cargar_cuenca.js
   node cargar_repda.js
   ```

6. Asignar la contraseña de un usuario existente:
   ```
   node crear_contraseña.js
   ```

## Uso

Desde la carpeta `servidor`:
```
node index.js
```
Abrir http://localhost:3000

## Respaldos

```
pg_dump -U postgres -Fc nazareno > respaldo_AAAA-MM-DD.backup
pg_restore -U postgres -d nazareno respaldo_AAAA-MM-DD.backup
```

## Estructura

```
nazareno-web/
├── index.html        Página principal
├── mapa_qgis/        Mapa (exportado de QGIS y extendido)
└── servidor/
    ├── index.js      Servidor y API
    ├── db.js         Conexión a PostgreSQL
    ├── bd/           Scripts SQL de las tablas
    └── *.js          Scripts de carga y utilidades
```

## Autora

Itamar Sarahi Hernández García · Director: Dr. Francisco Castellanos León