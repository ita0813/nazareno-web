// Carga los pozos del REPDA desde el archivo del mapa a la base de datos.
// - Si ya existe un pozo a menos de 15 m, solo le agrega la concesión (no lo duplica).
// - Si no, crea el pozo con fuente institucional (REPDA).
// Uso: node cargar_repda.js

const fs = require('fs');
const path = require('path');
const pool = require('./db');

const ID_FUENTE_REPDA = 2;          // el id_fuente de "REPDA (CONAGUA)"
const ID_ADMIN = 1;                 // quién queda como responsable de la carga
const DISTANCIA_UNION_M = 15;       // misma regla que el formulario
const VOLUMEN_IRREAL_M3 = 1000000;  

const USOS = {
  'AGRICOLA': 'Agrícola',
  'PUBLICO URBANO': 'Público urbano',
  'DOMÉSTICO': 'Doméstico',
  'SERVICIOS': 'Servicios',
  'INDUSTRIAL': 'Industrial'
};

// El volumen correcto está en el campo original 
function leerVolumen(valor) {
  if (valor === null || valor === undefined || valor === 'None' || String(valor).trim() === '') return null;
  const numero = Number(String(valor).replace(/\s/g, '').replace(/,/g, ''));
  return Number.isFinite(numero) ? numero : null;
}

function leerFecha(valor) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main() {
  const archivo = path.join(__dirname, '..', 'mapa_qgis', 'data', 'Pozos_8.js');
  const texto = fs.readFileSync(archivo, 'utf8');
  const geojson = JSON.parse(texto.slice(texto.indexOf('{')).trim().replace(/;$/, ''));

  const resumen = { leidos: 0, pozos_creados: 0, pozos_unidos: 0, concesiones: 0, volumen_dudoso: 0, sin_volumen: 0 };
  const cliente = await pool.connect();

  try {
    await cliente.query('BEGIN');   

    for (const f of geojson.features) {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const titulo = String(p['Título'] || '').trim();
      if (!titulo) continue;
      resumen.leidos++;

      const uso = USOS[String(p['Uso'] || '').trim()] || null;
      const volumen = leerVolumen(p['Volumen de']);
      const dudoso = volumen !== null && volumen > VOLUMEN_IRREAL_M3;

      // Ya existe un pozo a menos de 15 m?
      const cercano = await cliente.query(
        `SELECT id_pozo FROM pozo
         WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
         ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
         LIMIT 1`,
        [lon, lat, DISTANCIA_UNION_M]
      );

      let idPozo;
      if (cercano.rowCount > 0) {

        // Es el mismo pozo: completar su clave y su uso si estaban vacíos
        idPozo = cercano.rows[0].id_pozo;
        await cliente.query(
          'UPDATE pozo SET clave_repda = COALESCE(clave_repda, $1), uso = COALESCE(uso, $2) WHERE id_pozo = $3',
          [titulo, uso, idPozo]
        );
        resumen.pozos_unidos++;
      } else {
        // Pozo nuevo con el siguiente código NAZ-###
        const siguiente = await cliente.query(
          `SELECT 'NAZ-' || LPAD((COALESCE(MAX(SUBSTRING(codigo_interno FROM 5)::int), 0) + 1)::text, 3, '0') AS codigo
           FROM pozo WHERE codigo_interno ~ '^NAZ-[0-9]+$'`
        );
        const nuevo = await cliente.query(
          `INSERT INTO pozo (codigo_interno, clave_repda, uso, geom, id_fuente, id_usuario_registro)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7)
           RETURNING id_pozo`,
          [siguiente.rows[0].codigo, titulo, uso, lon, lat, ID_FUENTE_REPDA, ID_ADMIN]
        );
        idPozo = nuevo.rows[0].id_pozo;
        resumen.pozos_creados++;
      }

      // 2. Guardar la concesión
      const notas = [];
      if (volumen === null) { notas.push('Volumen no disponible en el registro original'); resumen.sin_volumen++; }
      if (dudoso) { notas.push('Volumen irreal para la zona; verificar en el REPDA'); resumen.volumen_dudoso++; }

      const c = await cliente.query(
        `INSERT INTO concesion (id_pozo, titulo, titular, uso, volumen_m3_anual, volumen_dudoso,
                                fecha_registro, autoridad, observaciones, id_fuente)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (titulo, id_pozo) DO NOTHING`,
        [idPozo, titulo, p['Titular'] || null, uso, volumen, dudoso,
         leerFecha(p['Fecha de r']), p['Autoridad'] || null, notas.join('. ') || null, ID_FUENTE_REPDA]
      );
      resumen.concesiones += c.rowCount;
    }

    await cliente.query('COMMIT');
    console.log('Carga terminada:', resumen);
  } catch (error) {
    await cliente.query('ROLLBACK');
    console.error('Error: no se guardó nada.', error);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
}

main();