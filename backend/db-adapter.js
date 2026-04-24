// Database Adapter - Abstração para suportar PostgreSQL e MySQL
const { Pool: PgPool } = require('pg');
const mysql = require('mysql2/promise');

class DatabaseAdapter {
  constructor(config) {
    this.config = config;
    this.type = config.type; // 'postgres' or 'mysql'
    this.pool = null;
  }

  async connect() {
    if (this.type === 'postgres') {
      this.pool = new PgPool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
      });
      console.log('PostgreSQL pool initialized');
    } else if (this.type === 'mysql') {
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      console.log('MySQL pool initialized');
    } else {
      throw new Error(`Tipo de banco de dados não suportado: ${this.type}`);
    }
  }

  // Helper method to convert PostgreSQL placeholders to MySQL format
  _convertPlaceholders(sql, params) {
    if (this.type !== 'mysql' || !sql.includes('$')) {
      return { sql, params };
    }

    // Convert $1, $2, etc. to ?
    // This works for sequential parameters
    let paramIndex = 0;
    const convertedSql = sql.replace(/\$\d+/g, () => {
      paramIndex++;
      return '?';
    });

    return { sql: convertedSql, params };
  }

  async query(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const { sql: convertedSql, params: convertedParams } = this._convertPlaceholders(sql, params);

    if (this.type === 'postgres') {
      const result = await this.pool.query(sql, params);
      return result;
    } else if (this.type === 'mysql') {
      const [rows, fields] = await this.pool.query(convertedSql, convertedParams);
      // Converter resultado do MySQL para formato compatível com PostgreSQL
      return { rows: rows, rowCount: rows.length };
    }
  }

  async getConnection() {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    if (this.type === 'postgres') {
      return await this.pool.connect();
    } else if (this.type === 'mysql') {
      const connection = await this.pool.getConnection();
      const self = this;
      // Wrap MySQL connection to be compatible with PostgreSQL client interface
      return {
        query: async (sql, params = []) => {
          const { sql: convertedSql, params: convertedParams } = self._convertPlaceholders(sql, params);
          const [rows] = await connection.query(convertedSql, convertedParams);
          return { rows: rows, rowCount: rows.length };
        },
        release: () => connection.release(),
      };
    }
  }

  async end() {
    if (this.pool) {
      if (this.type === 'postgres') {
        await this.pool.end();
      } else if (this.type === 'mysql') {
        await this.pool.end();
      }
      this.pool = null;
    }
  }

  // Converter UUID para formato compatível com MySQL (usar VARCHAR ou CHAR(36))
  generateId() {
    if (this.type === 'postgres') {
      return 'gen_random_uuid()';
    } else if (this.type === 'mysql') {
      // MySQL: usar UUID() function
      return 'UUID()';
    }
  }

  // Obter timestamp atual
  now() {
    if (this.type === 'postgres') {
      return 'NOW()';
    } else if (this.type === 'mysql') {
      return 'NOW()';
    }
  }

  // Converter tipo JSON
  jsonType() {
    if (this.type === 'postgres') {
      return 'JSONB';
    } else if (this.type === 'mysql') {
      return 'JSON';
    }
  }

  // Converter tipo UUID
  idType() {
    if (this.type === 'postgres') {
      return 'UUID';
    } else if (this.type === 'mysql') {
      return 'CHAR(36)';
    }
  }
}

module.exports = DatabaseAdapter;
