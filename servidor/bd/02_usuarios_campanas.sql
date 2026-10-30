- Tabla USUARIO: cuentas de los investigadores
CREATE TABLE usuario (
  id_usuario      SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  correo          TEXT NOT NULL UNIQUE,      -- no puede haber dos cuentas con el mismo correo
  institucion     TEXT,
  rol             TEXT NOT NULL
                  CHECK (rol IN ('investigador', 'administrador')),
  contrasena_hash TEXT NOT NULL,             -- nunca la contraseña real
  activo          BOOLEAN NOT NULL DEFAULT true,
  fecha_alta      TIMESTAMP NOT NULL DEFAULT now()
);

-- Tabla CAMPANA: salidas a campo
CREATE TABLE campana (
  id_campana     SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE,
  temporada      TEXT CHECK (temporada IN ('estiaje', 'lluvias')),
  id_responsable INTEGER REFERENCES usuario(id_usuario),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

-- Modificar POZO: agregar quién lo registró
ALTER TABLE pozo
  ADD COLUMN id_usuario_registro INTEGER REFERENCES usuario(id_usuario);