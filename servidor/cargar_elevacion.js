// Carga la elevación del terreno de cada pozo, muestreada del CEM 4.0 (INEGI) en QGIS.
// Uso: node cargar_elevacion.js
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const ARCHIVO = path.join(__dirname, 'elevaciones_cem.csv');
const METODO = 'CEM 4.0 INEGI (15 m)';

async function main() {
  // Leer el CSV y separarlo en líneas (quitando la marca BOM si la tiene)
  const lineas = fs.readFileSync(ARCHIVO, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);

  // Encontrar en qué columna está cada dato
  const encabezado = lineas[0].split(',').map(c => c.replace(/"/g, '').trim());
  const iId = encabezado.indexOf('id_pozo');
  const iElev = encabezado.indexOf('elev_1');
  if (iId === -1 || iElev === -1) {
    throw new Error('El CSV debe tener las columnas id_pozo y elev_1');
  }

  const cliente = await pool.connect();
  let actualizados = 0;
  let sinValor = 0;

  try {
    await cliente.query('BEGIN');

    for (const linea of lineas.slice(1)) {
      const celdas = linea.split(',').map(v => v.replace(/"/g, '').trim());
      const id = Number(celdas[iId]);
      const elevacion = Number(celdas[iElev]);

      if (!Number.isInteger(id)) continue;

      // Revisar que la elevación sea razonable para Oaxaca
      if (celdas[iElev] === '' || !(elevacion > 1000 && elevacion < 4000)) {
        console.log('Sin elevación válida para el pozo con id', id);
        sinValor++;
        continue;
      }

      await cliente.query(
        'UPDATE pozo SET elevacion_terreno_m = $1, metodo_elevacion = $2 WHERE id_pozo = $3',
        [elevacion, METODO, id]
      );
      actualizados++;
    }

    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  console.log(`Pozos actualizados: ${actualizados}. Sin valor: ${sinValor}.`);
  await pool.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});