const bcrypt = require('bcryptjs');
const readline = require('readline/promises');
const pool = require('./db');

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const correo = (await rl.question('Correo del usuario: ')).trim();
  const contrasena = await rl.question('Nueva contraseña (mínimo 10 caracteres): ');
  rl.close();

  if (contrasena.length < 10) {
    console.log('La contraseña debe tener al menos 10 caracteres.');
    process.exit(1);
  }

  // Convertir la contraseña en hash (12 = nivel de seguridad)
  const hash = await bcrypt.hash(contrasena, 12);

  const resultado = await pool.query(
    'UPDATE usuario SET contrasena_hash = $1 WHERE correo = $2 RETURNING nombre, rol',
    [hash, correo]
  );

  if (resultado.rowCount === 0) {
    console.log('No existe un usuario con ese correo.');
  } else {
    console.log('Contraseña guardada para:', resultado.rows[0].nombre, '(' + resultado.rows[0].rol + ')');
  }

  await pool.end();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});