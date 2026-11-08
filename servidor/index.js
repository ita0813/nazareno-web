
require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const pool = require('./db');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const PUERTO = 3000;

app.use(express.json());

// Sesiones: el servidor recuerda quién inició sesión
app.use(session({
  name: 'nazareno.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,                 // el JavaScript de la página no puede leerla
    sameSite: 'lax',                // protege contra envíos desde otros sitios
    secure: false,                  // cambiar a true cuando haya HTTPS en el servidor del IPN
    maxAge: 8 * 60 * 60 * 1000      // la sesión dura 8 horas
  }
}));

// Iniciar sesión
app.post('/api/login', async (req, res) => {
  const { correo, contrasena } = req.body || {};
  if (!correo || !contrasena) {
    return res.status(400).json({ error: 'Escribe tu correo y tu contraseña' });
  }

  try {
    const resultado = await pool.query(
      'SELECT id_usuario, nombre, rol, contrasena_hash, activo FROM usuario WHERE correo = $1',
      [correo.trim().toLowerCase()]
    );
    const usuario = resultado.rows[0];

    const valida = usuario && usuario.activo &&
      await bcrypt.compare(contrasena, usuario.contrasena_hash);

    if (!valida) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    // Crear una sesión nueva (evita que alguien reutilice una sesión anterior)
    req.session.regenerate(error => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'No se pudo iniciar sesión' });
      }
      req.session.usuario = { id: usuario.id_usuario, nombre: usuario.nombre, rol: usuario.rol };
      res.json({ mensaje: 'Sesión iniciada', usuario: req.session.usuario });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

function requiereSesion(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  next();
}
function requiereRol(rol) {
  return (req, res, next) => {
    if (!req.session.usuario) {
      return res.status(401).json({ error: 'Debes iniciar sesión' });
    }
    if (req.session.usuario.rol !== rol) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    next();
  };
}


// ¿Quién tiene la sesión iniciada?
app.get('/api/sesion', (req, res) => {
  res.json({ usuario: req.session.usuario || null });
});

// Cerrar sesión
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('nazareno.sid');
    res.json({ mensaje: 'Sesión cerrada' });
  });
});

// Seguridad: nadie puede ver los archivos del servidor desde el navegador
app.use('/servidor', (req, res) => {
  res.status(404).send('No encontrado');
});

// Entregar la plataforma (index.html, mapa_qgis, css, etc.)
app.use(express.static(path.join(__dirname, '..'), { dotfiles: 'deny' }));

app.get('/api/estado', (req, res) => {
  res.json({
    estado: 'ok',
    proyecto: 'Microcuenca Nazareno',
    fecha: new Date().toISOString()
  });
});
// Ruta de prueba
app.get('/api/prueba-bd', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT COUNT(*) AS total_pozos FROM pozo');
    res.json({
      conexion: 'ok',
      total_pozos: Number(resultado.rows[0].total_pozos)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ conexion: 'error', mensaje: error.message });
  }
});
// Arma el GeoJSON de todos los pozos (lo usan la ruta del mapa y la exportación)
async function obtenerPozosGeoJSON() {
  const sql = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.geom)::json,
            'properties', json_build_object(
              'id_pozo',     p.id_pozo,
              'codigo',      p.codigo_interno,
              'nombre',      p.nombre,
              'clave_sgm',   p.clave_sgm,
              'clave_repda', p.clave_repda,
              'uso',         p.uso,
              'fuente',      f.nombre,
              'tipo_fuente', f.tipo,
              'elevacion_terreno_m', p.elevacion_terreno_m
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM pozo p
      JOIN fuente f ON f.id_fuente = p.id_fuente;
    `;
  const resultado = await pool.query(sql);
  return resultado.rows[0].geojson;
}

// Ruta: todos los pozos en formato GeoJSON, para el mapa
app.get('/api/pozos', async (req, res) => {
  try {
    res.json(await obtenerPozosGeoJSON());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron obtener los pozos', mensaje: error.message });
  }
});

// Ruta: historial de mediciones de un pozo
app.get('/api/pozos/:id/mediciones', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'El id del pozo debe ser un número' });
  }

  try {
    const resultado = await pool.query(
      `SELECT m.fecha_hora, m.condicion, m.profundidad_nivel_m, m.metodo, m.alerta,
              c.nombre AS campana, v.nivel_estatico_msnm
       FROM medicion m
       LEFT JOIN campana c ON c.id_campana = m.id_campana
       LEFT JOIN v_carga_hidraulica v ON v.id_medicion = m.id_medicion
       WHERE m.id_pozo = $1
       ORDER BY m.fecha_hora DESC`,
      [id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron obtener las mediciones', mensaje: error.message });
  }
})

// Catálogos para el formulario de captura: solo con sesión
app.get('/api/catalogos', requiereSesion, async (req, res) => {
  try {
    const [pozos, campanas, fuentes] = await Promise.all([
      pool.query('SELECT id_pozo, codigo_interno, nombre FROM pozo ORDER BY codigo_interno'),
      pool.query('SELECT id_campana, nombre FROM campana ORDER BY fecha_inicio DESC'),
      pool.query("SELECT id_fuente, nombre FROM fuente WHERE tipo = 'campo' ORDER BY id_fuente DESC")
    ]);
    res.json({ pozos: pozos.rows, campanas: campanas.rows, fuentes: fuentes.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/admin/usuarios', requiereRol('administrador'), async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id_usuario, nombre, correo, rol, activo, fecha_alta FROM usuario ORDER BY nombre'
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

const UMBRAL_CAMBIO_NIVEL_M = 10;
// Guardar una medición: solo con sesión iniciada
app.post('/api/mediciones', requiereSesion, async (req, res) => {
  const {
    id_pozo, id_campana, id_fuente, fecha_hora,
    profundidad_nivel_m, condicion, horas_sin_bombeo, metodo, observaciones
  } = req.body || {};

  // 1. Revisar los datos antes de tocar la base de datos
  const errores = [];
  const CONDICIONES = ['estatico', 'dinamico', 'seco', 'sin_acceso'];

  if (!Number.isInteger(id_pozo)) errores.push('Falta el pozo');
  if (!Number.isInteger(id_fuente)) errores.push('Falta la fuente');
  if (!CONDICIONES.includes(condicion)) errores.push('La condición no es válida');

  const fecha = new Date(fecha_hora);
  if (isNaN(fecha)) errores.push('La fecha no es válida');
  else if (fecha > new Date()) errores.push('La fecha no puede estar en el futuro');

  const conNivel = condicion === 'estatico' || condicion === 'dinamico';
  if (conNivel && !(typeof profundidad_nivel_m === 'number' && profundidad_nivel_m >= 0)) {
    errores.push('Escribe la profundidad del nivel (un número mayor o igual a 0)');
  }
  if (!conNivel && profundidad_nivel_m != null) {
    errores.push('Un pozo seco o sin acceso no lleva profundidad');
  }

  if (errores.length > 0) {
    return res.status(400).json({ errores });
  }

  try {
    // Regla: el pozo debe existir y el nivel no puede ser más hondo que el pozo
    const pozoRes = await pool.query(
      'SELECT profundidad_total_m FROM pozo WHERE id_pozo = $1', [id_pozo]
    );
    if (pozoRes.rowCount === 0) {
      return res.status(400).json({ errores: ['El pozo no existe'] });
    }
    const profundidadTotal = pozoRes.rows[0].profundidad_total_m;
    if (conNivel && profundidadTotal !== null && profundidad_nivel_m > Number(profundidadTotal)) {
      return res.status(400).json({
        errores: [`La profundidad del nivel (${profundidad_nivel_m} m) es mayor que la profundidad total del pozo (${profundidadTotal} m)`]
      });
    }

    // Alerta: cambio grande respecto a la medición estática anterior del mismo pozo
    let alerta = null;
    if (condicion === 'estatico') {
      const anteriorRes = await pool.query(
        `SELECT profundidad_nivel_m FROM medicion
         WHERE id_pozo = $1 AND condicion = 'estatico' AND fecha_hora < $2
         ORDER BY fecha_hora DESC LIMIT 1`,
        [id_pozo, fecha]
      );
      if (anteriorRes.rowCount > 0) {
        const anterior = Number(anteriorRes.rows[0].profundidad_nivel_m);
        const diferencia = Math.abs(profundidad_nivel_m - anterior);
        if (diferencia > UMBRAL_CAMBIO_NIVEL_M) {
          alerta = `Cambio de ${diferencia.toFixed(2)} m respecto a la medición estática anterior (${anterior} m). Revisar.`;
        }
      }
    }

    const resultado = await pool.query(
      `INSERT INTO medicion (id_pozo, id_campana, id_usuario, id_fuente, fecha_hora,
                             profundidad_nivel_m, condicion, horas_sin_bombeo, metodo,
                             observaciones, alerta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id_medicion`,
      [
        id_pozo,
        id_campana ?? null,
        req.session.usuario.id,
        id_fuente,
        fecha,
        conNivel ? profundidad_nivel_m : null,
        condicion,
        horas_sin_bombeo ?? null,
        metodo ?? null,
        observaciones ?? null,
        alerta
      ]
    );
    res.status(201).json({ mensaje: 'Medición guardada', id_medicion: resultado.rows[0].id_medicion, alerta });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ errores: ['El pozo, la campaña o la fuente no existen'] });
    }
    if (error.code === '23514') {
      return res.status(400).json({ errores: ['El dato no cumple las reglas de la base de datos'] });
    }
    console.error(error);
    res.status(500).json({ errores: ['Error del servidor'] });
  }
});

// Rectángulo aproximado del estado de Oaxaca
const LIMITES_OAXACA = { latMin: 15.6, latMax: 18.7, lonMin: -98.6, lonMax: -93.8 };

// Registrar un pozo nuevo: solo con sesión iniciada
app.post('/api/pozos', requiereSesion, async (req, res) => {
  const {
    nombre, uso, clave_repda, clave_sgm,
    latitud, longitud, profundidad_total_m, altura_brocal_m, id_fuente
  } = req.body || {};

  // 1. Revisar los datos
  const errores = [];
  const L = LIMITES_OAXACA;

  if (typeof latitud !== 'number' || typeof longitud !== 'number') {
    errores.push('Faltan las coordenadas');
  } else if (latitud < L.latMin || latitud > L.latMax || longitud < L.lonMin || longitud > L.lonMax) {
    errores.push('Las coordenadas están fuera de Oaxaca. Revisa que la latitud y la longitud no estén invertidas');
  }
  if (!Number.isInteger(id_fuente)) errores.push('Falta la fuente');
  if (profundidad_total_m != null && !(profundidad_total_m > 0)) {
    errores.push('La profundidad total debe ser mayor que 0');
  }
  if (altura_brocal_m != null && !(altura_brocal_m >= 0 && altura_brocal_m <= 3)) {
    errores.push('La altura del brocal debe estar entre 0 y 3 m');
  }

  if (errores.length > 0) {
    return res.status(400).json({ errores });
  }

  try {

    // ¿Ya existe un pozo a menos de 15 m?
    const cercano = await pool.query(
      `SELECT codigo_interno, nombre FROM pozo
       WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 15)
       LIMIT 1`,
      [longitud, latitud]
    );
    if (cercano.rowCount > 0) {
      const p = cercano.rows[0];
      return res.status(409).json({
        errores: [`Ya existe un pozo a menos de 15 m: ${p.codigo_interno} ${p.nombre || ''}. Revisa si es el mismo`]
      });
    }

    // 3. Calcular el siguiente código: NAZ-006, NAZ-007...
    const siguiente = await pool.query(
      `SELECT 'NAZ-' || LPAD((COALESCE(MAX(SUBSTRING(codigo_interno FROM 5)::int), 0) + 1)::text, 3, '0') AS codigo
       FROM pozo WHERE codigo_interno ~ '^NAZ-[0-9]+$'`
    );
    const codigo = siguiente.rows[0].codigo;

    // 4. Guardar
    const resultado = await pool.query(
      `INSERT INTO pozo (codigo_interno, nombre, uso, clave_repda, clave_sgm,
                         profundidad_total_m, altura_brocal_m, geom, id_fuente, id_usuario_registro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11)
       RETURNING id_pozo, codigo_interno`,
      [
        codigo,
        nombre?.trim() || null,
        uso || null,
        clave_repda?.trim() || null,
        clave_sgm?.trim() || null,
        profundidad_total_m ?? null,
        altura_brocal_m ?? null,
        longitud,
        latitud,
        id_fuente,
        req.session.usuario.id
      ]
    );

    res.status(201).json({ mensaje: 'Pozo registrado', ...resultado.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ errores: ['Ese código ya existe. Intenta de nuevo'] });
    }
    if (error.code === '23503') {
      return res.status(400).json({ errores: ['La fuente no existe'] });
    }
    console.error(error);
    res.status(500).json({ errores: ['Error del servidor'] });
  }
});

// Concesiones REPDA de un pozo. El titular solo se incluye con sesión iniciada.
app.get('/api/pozos/:id/concesiones', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'El id del pozo debe ser un número' });
  }

  const conSesion = Boolean(req.session.usuario);
  const columnas = 'titulo, uso, volumen_m3_anual, volumen_dudoso, fecha_registro, observaciones'
    + (conSesion ? ', titular' : '');

  try {
    const resultado = await pool.query(
      `SELECT ${columnas} FROM concesion
       WHERE id_pozo = $1
       ORDER BY fecha_registro DESC NULLS LAST`,
      [id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron obtener las concesiones' });
  }
});

// Convierte filas en texto CSV que Excel abre bien (con acentos)
function aCSV(filas, columnas) {
  const celda = valor => {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor);
    return /[",\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };
  const lineas = [columnas.join(','), ...filas.map(f => columnas.map(c => celda(f[c])).join(','))];
  return '\uFEFF' + lineas.join('\r\n');
}

// Descargar los pozos en GeoJSON (público, sin titular)
app.get('/api/exportar/pozos.geojson', async (req, res) => {
  try {
    const geojson = await obtenerPozosGeoJSON();
    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pozos_nazareno.geojson"');
    res.send(JSON.stringify(geojson, null, 2));
  } catch (error) {
    console.error(error);
    res.status(500).send('No se pudo generar el archivo');
  }
});

// Descargar las mediciones en CSV (público)
app.get('/api/exportar/mediciones.csv', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.codigo_interno,
              p.nombre AS pozo,
              ROUND(ST_Y(p.geom)::numeric, 6) AS latitud,
              ROUND(ST_X(p.geom)::numeric, 6) AS longitud,
              to_char(m.fecha_hora, 'YYYY-MM-DD HH24:MI') AS fecha_hora,
              m.condicion,
              m.profundidad_nivel_m,
              m.metodo,
              m.estado_revision,
              m.alerta,
              f.nombre AS fuente,
              f.referencia
       FROM medicion m
       JOIN pozo p ON p.id_pozo = m.id_pozo
       JOIN fuente f ON f.id_fuente = m.id_fuente
       ORDER BY p.codigo_interno, m.fecha_hora`
    );
    const columnas = ['codigo_interno', 'pozo', 'latitud', 'longitud', 'fecha_hora', 'condicion',
      'profundidad_nivel_m', 'metodo', 'estado_revision', 'alerta', 'fuente', 'referencia'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mediciones_nazareno.csv"');
    res.send(aCSV(resultado.rows, columnas));
  } catch (error) {
    console.error(error);
    res.status(500).send('No se pudo generar el archivo');
  }
});
// Dirección preliminar del flujo subterráneo (RF-10).
// Ajusta un plano a los niveles estáticos: con 3 pozos es el método de los tres puntos,
// con más pozos es un ajuste por mínimos cuadrados. Usa la medición sin bombeo más reciente de cada pozo.
app.get('/api/flujo', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT DISTINCT ON (v.id_pozo)
              p.codigo_interno,
              v.nivel_estatico_msnm::float AS h,
              ST_X(ST_Transform(p.geom, 32614)) AS x,
              ST_Y(ST_Transform(p.geom, 32614)) AS y,
              ST_X(p.geom) AS lon,
              ST_Y(p.geom) AS lat
       FROM v_carga_hidraulica v
       JOIN pozo p ON p.id_pozo = v.id_pozo
       ORDER BY v.id_pozo, v.fecha_hora DESC`
    );
    const pozos = resultado.rows;
    const n = pozos.length;

    if (n < 3) {
      return res.json({ suficiente: false, pozos: n, mensaje: 'Se necesitan al menos 3 pozos con nivel estático' });
    }

    // Trabajar respecto al centro de los pozos
    const cx = pozos.reduce((s, p) => s + p.x, 0) / n;
    const cy = pozos.reduce((s, p) => s + p.y, 0) / n;
    const ch = pozos.reduce((s, p) => s + p.h, 0) / n;

    // Ajuste del plano: h = ch + b·(x − cx) + c·(y − cy)
    let sxx = 0, sxy = 0, syy = 0, sxh = 0, syh = 0;
    for (const p of pozos) {
      const dx = p.x - cx, dy = p.y - cy, dh = p.h - ch;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
      sxh += dx * dh; syh += dy * dh;
    }
    const det = sxx * syy - sxy * sxy;
    if (Math.abs(det) < 1e-6) {
      return res.json({ suficiente: false, pozos: n, mensaje: 'Los pozos están alineados; no se puede ajustar un plano' });
    }
    const b = (sxh * syy - syh * sxy) / det;   // cuánto sube h hacia el este (m por m)
    const c = (syh * sxx - sxh * sxy) / det;   // cuánto sube h hacia el norte (m por m)

    const gradiente = Math.hypot(b, c);
    // El agua va hacia donde h baja: dirección (−b, −c). Azimut medido desde el norte, en sentido horario.
    const azimut = (Math.atan2(-b, -c) * 180 / Math.PI + 360) % 360;

    res.json({
      suficiente: true,
      pozos: pozos.map(p => p.codigo_interno),
      gradiente: Number(gradiente.toFixed(5)),
      azimut: Number(azimut.toFixed(1)),
      centro: {
        lat: pozos.reduce((s, p) => s + p.lat, 0) / n,
        lon: pozos.reduce((s, p) => s + p.lon, 0) / n
      },
      vertices: pozos.map(p => [p.lat, p.lon])
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo calcular la dirección del flujo' });
  }
});
app.listen(PUERTO, () => {
  console.log(`Servidor escuchando en http://localhost:${PUERTO}`);
});