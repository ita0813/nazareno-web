CREATE TABLE medicion (
  id_medicion         SERIAL PRIMARY KEY,
  id_pozo             INTEGER NOT NULL REFERENCES pozo(id_pozo),
  id_campana          INTEGER REFERENCES campana(id_campana),
  id_usuario          INTEGER NOT NULL REFERENCES usuario(id_usuario),
  id_fuente           INTEGER NOT NULL REFERENCES fuente(id_fuente),
  fecha_hora          TIMESTAMP NOT NULL,
  profundidad_nivel_m NUMERIC(6,2) CHECK (profundidad_nivel_m >= 0),  -- medida desde el brocal
  condicion           TEXT NOT NULL
                      CHECK (condicion IN ('estatico', 'dinamico', 'seco', 'sin_acceso')),
  horas_sin_bombeo    NUMERIC(5,1) CHECK (horas_sin_bombeo >= 0),
  metodo              TEXT,                    -- sonda eléctrica, cinta, dispositivo CIIDIR
  observaciones       TEXT,
  estado_revision     TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado_revision IN ('pendiente', 'revisado')),
  fecha_registro      TIMESTAMP NOT NULL DEFAULT now(),

  -- Regla: si hay agua medible, debe haber profundidad; si está seco o sin acceso, no
  CHECK (
    (condicion IN ('estatico', 'dinamico') AND profundidad_nivel_m IS NOT NULL)
    OR
    (condicion IN ('seco', 'sin_acceso') AND profundidad_nivel_m IS NULL)
  )
);

-- Índice: hace rápido buscar el historial de un pozo ordenado por fecha
CREATE INDEX medicion_pozo_fecha_idx ON medicion (id_pozo, fecha_hora);