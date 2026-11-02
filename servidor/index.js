
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
// Ruta: todos los pozos en formato GeoJSON
app.get('/api/pozos', async (req, res) => {
  try {
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
              'tipo_fuente', f.tipo
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM pozo p
      JOIN fuente f ON f.id_fuente = p.id_fuente;
    `;

    const resultado = await pool.query(sql);
    res.json(resultado.rows[0].geojson);
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
      `SELECT m.fecha_hora, m.condicion, m.profundidad_nivel_m, m.metodo,
              c.nombre AS campana
       FROM medicion m
       LEFT JOIN campana c ON c.id_campana = m.id_campana
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

  // 2. Guardar
  try {
    const resultado = await pool.query(
      `INSERT INTO medicion (id_pozo, id_campana, id_usuario, id_fuente, fecha_hora,
                             profundidad_nivel_m, condicion, horas_sin_bombeo, metodo, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id_medicion`,
      [
        id_pozo,
        id_campana ?? null,
        req.session.usuario.id,        // quién mide: lo sabe el servidor, no el navegador
        id_fuente,
        fecha,
        conNivel ? profundidad_nivel_m : null,
        condicion,
        horas_sin_bombeo ?? null,
        metodo ?? null,
        observaciones ?? null
      ]
    );
    res.status(201).json({ mensaje: 'Medición guardada', id_medicion: resultado.rows[0].id_medicion });
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

app.listen(PUERTO, () => {
  console.log(`Servidor escuchando en http://localhost:${PUERTO}`);
});