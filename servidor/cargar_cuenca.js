// Carga el contorno de la microcuenca desde el archivo del mapa a la base de datos.
// Uso: node cargar_cuenca.js

const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function main() {
  //Leer el archivo del contorno que exportó QGIS
  const archivo = path.join(__dirname, '..', 'mapa_qgis', 'data', 'DelimitacionMicrocuencaNazareno_1.js');
  const texto = fs.readFileSync(archivo, 'utf8');

  const json = texto.slice(texto.indexOf('{')).trim().replace(/;$/, '');
  const geojson = JSON.parse(json);
  const geometria = geojson.features[0].geometry;

  //Guardarlo en la tabla cuenca 
  await pool.query('DELETE FROM cuenca WHERE nombre = $1', ['Microcuenca del río Nazareno']);
  const resultado = await pool.query(
    `INSERT INTO cuenca (nombre, geom)
     VALUES ($1, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)))
     RETURNING ST_Area(geom::geography) / 10000 AS hectareas,
               ST_Perimeter(geom::geography) / 1000 AS perimetro_km`,
    ['Microcuenca del río Nazareno', JSON.stringify(geometria)]
  );

  //Mostrar el resultado
  const { hectareas, perimetro_km } = resultado.rows[0];
  console.log('Cuenca cargada.');
  console.log('Superficie:', Number(hectareas).toFixed(2), 'ha');
  console.log('Perímetro:', Number(perimetro_km).toFixed(2), 'km');

  await pool.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});