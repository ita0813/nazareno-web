-- Archivo 05: contorno de la microcuenca
CREATE TABLE cuenca (
  id_cuenca SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL,
  geom      GEOMETRY(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX cuenca_geom_idx ON cuenca USING GIST (geom);