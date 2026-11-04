// Lee las variables del archivo .env
require('dotenv').config();

const { Pool } = require('pg');
const { types } = require('pg');
types.setTypeParser(1082, valor => valor);
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD
});

module.exports = pool;