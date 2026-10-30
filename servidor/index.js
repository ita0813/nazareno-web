
const express = require('express');
const app = express();
const pool = require('./db');
const PUERTO = 3000;

const path = require('path');

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
});

app.listen(PUERTO, () => {
  console.log(`Servidor escuchando en http://localhost:${PUERTO}`);
});