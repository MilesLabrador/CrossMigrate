import knex from 'knex';

const CLIENT_MAP = { postgres: 'pg', mysql: 'mysql2', mssql: 'mssql', sqlite: 'better-sqlite3' };

// Only word chars and $ allowed in identifiers to prevent injection.
// Cap length at 128 — every major engine's identifier limit is at or under
// this, so anything longer is an attack or a mistake.
const VALID_IDENT = /^[\w$]{1,128}$/;

export function validateIdent(name) {
  if (typeof name !== 'string' || !VALID_IDENT.test(name)) {
    throw new Error(`Invalid identifier: "${name}"`);
  }
  return name;
}

export function createConnection({ type, host, port, user, password, database, filename }) {
  const client = CLIENT_MAP[type];
  if (!client) throw new Error(`Unsupported database type: ${type}`);

  if (type === 'sqlite') {
    return knex({
      client,
      connection: { filename: filename || database },
      useNullAsDefault: true,
    });
  }

  return knex({
    client,
    connection: {
      host,
      port: port ? Number(port) : undefined,
      user,
      password,
      database,
    },
    acquireConnectionTimeout: 10_000,
  });
}
