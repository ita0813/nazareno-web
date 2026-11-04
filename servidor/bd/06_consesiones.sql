CREATE TABLE concesion (
  id_concesion      SERIAL PRIMARY KEY,
  id_pozo           INTEGER NOT NULL REFERENCES pozo(id_pozo),
  titulo            TEXT NOT NULL,                 -- número de título del REPDA
  titular           TEXT,                          -- dato personal: solo para investigadores
  uso               TEXT,
  volumen_m3_anual  NUMERIC(14,2) CHECK (volumen_m3_anual >= 0),
  volumen_dudoso    BOOLEAN NOT NULL DEFAULT false,
  fecha_registro    DATE,
  autoridad         TEXT,
  observaciones     TEXT,
  id_fuente         INTEGER NOT NULL REFERENCES fuente(id_fuente),
  fecha_carga       TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (titulo, id_pozo)
);

CREATE INDEX concesion_pozo_idx ON concesion (id_pozo);