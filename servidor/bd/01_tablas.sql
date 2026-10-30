CREATE TABLE fuente (
  id_fuente      SERIAL PRIMARY KEY,
  tipo           TEXT NOT NULL
                 CHECK (tipo IN ('institucional', 'academica', 'campo')),
  nombre         TEXT NOT NULL,
  referencia     TEXT,
  fecha_consulta DATE
);

-- Tabla POZO: datos fijos de cada pozo
CREATE TABLE pozo (
  id_pozo             SERIAL PRIMARY KEY,
  codigo_interno      TEXT UNIQUE,              -- código propio: NAZ-001, NAZ-002...
  clave_repda         TEXT,                     -- opcional: no todos están en el REPDA
  clave_sgm           TEXT,                     -- opcional: no todos son del SGM
  nombre              TEXT,
  uso                 TEXT,
  profundidad_total_m NUMERIC(7,2) CHECK (profundidad_total_m > 0),
  elevacion_terreno_m NUMERIC(7,2),
  altura_brocal_m     NUMERIC(5,2) CHECK (altura_brocal_m >= 0),
  metodo_elevacion    TEXT,                     -- 'CEM 15 m' o 'GPS diferencial'
  geom                GEOMETRY(Point, 4326) NOT NULL,
  id_fuente           INTEGER NOT NULL REFERENCES fuente(id_fuente),
  estado_revision     TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado_revision IN ('pendiente', 'revisado')),
  fecha_registro      TIMESTAMP NOT NULL DEFAULT now()
);

-- Índice espacial: hace rápidas las búsquedas por ubicación
CREATE INDEX pozo_geom_idx ON pozo USING GIST (geom);