const express = require('express');
const cors = require('cors');
const DatabaseAdapter = require('./db-adapter');
const crypto = require('crypto');
const Stripe = require('stripe');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Basic-Auth'],
}));

// Returns a date one month after `from`, clamped to the last day of the target month.
function nextMonthSameDay(from) {
  const day = from.getDate();
  const result = new Date(from);
  result.setMonth(result.getMonth() + 1);
  // If month overflowed (e.g. Jan 31 → Mar 2), clamp to last day of intended month.
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result;
}

// Stripe webhook must receive raw body — register before express.json()
app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const configClient = await dbAdapter.getConnection();
    let webhookSecret = '';
    let stripeSecretKey = '';
    try {
      stripeSecretKey = await getStripeSecretKey(configClient);
      webhookSecret = await getStripeWebhookSecret(configClient);
    } finally {
      configClient.release();
    }

    if (!stripeSecretKey) {
      return res.status(400).send('Stripe not configured');
    }

    const stripe = Stripe(stripeSecretKey);

    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      event = JSON.parse(req.body.toString());
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const userId = session.metadata && session.metadata.user_id;
      const planoId = session.metadata && session.metadata.plano_id;
      const sessionType = session.metadata && session.metadata.type;
      const lojaCartelaId = session.metadata && session.metadata.loja_cartela_id;

      if (userId && planoId) {
        const updateClient = await dbAdapter.getConnection();
        try {
          const now = new Date();
          const vencimento = nextMonthSameDay(now);
          await updateClient.query(
            'UPDATE usuarios SET plano_id = $1, plano_inicio = $2, plano_vencimento = $3, updated_at = NOW() WHERE id = $4',
            [planoId, now, vencimento, userId]
          );
        } finally {
          updateClient.release();
        }
      }

      if (sessionType === 'cartela_loja' && lojaCartelaId) {
        const updateClient = await dbAdapter.getConnection();
        try {
          const compradorNome = (session.metadata && session.metadata.comprador_nome) || '';
          const compradorEmail = (session.metadata && session.metadata.comprador_email) || session.customer_email || '';
          const compradorEndereco = (session.metadata && session.metadata.comprador_endereco) || '';
          const compradorCidade = (session.metadata && session.metadata.comprador_cidade) || '';
          const compradorTelefone = (session.metadata && session.metadata.comprador_telefone) || '';
          const lojaResult = await updateClient.query(
            'SELECT lc.*, bcs.sorteio_id FROM loja_cartelas lc JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id WHERE lc.id = $1',
            [lojaCartelaId]
          );
          if (lojaResult.rows.length > 0) {
            const lc = lojaResult.rows[0];
            await updateClient.query(
              'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, stripe_session_id = $7, updated_at = NOW() WHERE id = $8',
              ['vendida', compradorNome, compradorEmail, compradorEndereco, compradorCidade, compradorTelefone, session.id, lojaCartelaId]
            );
            if (lc.sorteio_id) {
              await updateClient.query(
                'UPDATE cartelas SET status = $1, comprador_nome = $2, updated_at = NOW() WHERE sorteio_id = $3 AND numero = $4',
                ['vendida', compradorNome, lc.sorteio_id, lc.numero_cartela]
              );
              await updateClient.query(
                `UPDATE atribuicao_cartelas SET status = 'vendida' WHERE numero_cartela = $1 AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $2)`,
                [lc.numero_cartela, lc.sorteio_id]
              );
              // Upsert cartelas_validadas (Req 1)
              if (dbConfig.type === 'mysql') {
                await updateClient.query(
                  `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
                   ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
                  [lc.sorteio_id, lc.numero_cartela, compradorNome || null]
                );
              } else {
                await updateClient.query(
                  `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
                  [lc.sorteio_id, lc.numero_cartela, compradorNome || null]
                );
              }
              // Create venda linked to the assigned vendedor
              const vendaExistWh = await updateClient.query(
                'SELECT id FROM vendas WHERE stripe_session_id = $1 LIMIT 1',
                [session.id]
              );
              if (vendaExistWh.rows.length === 0) {
                let vendaIdWh;
                if (dbConfig.type === 'mysql') {
                  await updateClient.query(
                    `INSERT INTO vendas (id, sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, data_venda)
                     VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, 'concluida', NOW())`,
                    [lc.sorteio_id, lc.vendedor_id || null, compradorNome || 'Comprador Online', compradorTelefone || null, String(lc.numero_cartela), lc.preco, lc.preco]
                  );
                  const lastVenda = await updateClient.query('SELECT id FROM vendas ORDER BY created_at DESC LIMIT 1');
                  vendaIdWh = lastVenda.rows[0]?.id;
                } else {
                  const vendaWhResult = await updateClient.query(
                    `INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, data_venda)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluida', NOW()) RETURNING id`,
                    [lc.sorteio_id, lc.vendedor_id || null, compradorNome || 'Comprador Online', compradorTelefone || null, String(lc.numero_cartela), lc.preco, lc.preco]
                  );
                  vendaIdWh = vendaWhResult.rows[0]?.id;
                }
                if (vendaIdWh) {
                  await updateClient.query(
                    'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
                    [vendaIdWh, 'cartao', lc.preco]
                  );
                  // Store stripe_session_id on the venda to prevent duplicates
                  await updateClient.query(
                    'UPDATE vendas SET stripe_session_id = $1 WHERE id = $2',
                    [session.id, vendaIdWh]
                  ).catch(() => {}); // ignore if column doesn't exist yet
                }
              }
            }
          }
        } finally {
          updateClient.release();
        }
      }

      if (sessionType === 'cartela_loja_multi') {
        const updateClient = await dbAdapter.getConnection();
        try {
          const compradorNome = (session.metadata && session.metadata.comprador_nome) || '';
          const compradorEmail = (session.metadata && session.metadata.comprador_email) || session.customer_email || '';
          const compradorEndereco = (session.metadata && session.metadata.comprador_endereco) || '';
          const compradorCidade = (session.metadata && session.metadata.comprador_cidade) || '';
          const compradorTelefone = (session.metadata && session.metadata.comprador_telefone) || '';
          const allIds = [];
          for (let i = 0; i < 10; i++) {
            const key = i === 0 ? 'loja_cartela_ids' : `loja_cartela_ids_${i}`;
            if (session.metadata && session.metadata[key]) allIds.push(...session.metadata[key].split(',').filter(Boolean));
            else break;
          }
          const multiPurchased = [];
          for (const lcId of allIds) {
            const lojaMultiResult = await updateClient.query(
              'SELECT lc.*, bcs.sorteio_id FROM loja_cartelas lc JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id WHERE lc.id = $1',
              [lcId]
            );
            if (lojaMultiResult.rows.length > 0) {
              const lc = lojaMultiResult.rows[0];
              await updateClient.query(
                'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, stripe_session_id = $7, updated_at = NOW() WHERE id = $8',
                ['vendida', compradorNome, compradorEmail, compradorEndereco, compradorCidade, compradorTelefone, session.id, lc.id]
              );
              if (lc.sorteio_id) {
                await updateClient.query(
                  'UPDATE cartelas SET status = $1, comprador_nome = $2, updated_at = NOW() WHERE sorteio_id = $3 AND numero = $4',
                  ['vendida', compradorNome, lc.sorteio_id, lc.numero_cartela]
                );
                await updateClient.query(
                  `UPDATE atribuicao_cartelas SET status = 'vendida' WHERE numero_cartela = $1 AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $2)`,
                  [lc.numero_cartela, lc.sorteio_id]
                );
                // Upsert cartelas_validadas (Req 1)
                if (dbConfig.type === 'mysql') {
                  await updateClient.query(
                    `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
                     ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
                    [lc.sorteio_id, lc.numero_cartela, compradorNome || null]
                  );
                } else {
                  await updateClient.query(
                    `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
                    [lc.sorteio_id, lc.numero_cartela, compradorNome || null]
                  );
                }
                multiPurchased.push(lc);
              }
            }
          }
          // Create single grouped venda for all cartelas in this multi purchase
          if (multiPurchased.length > 0) {
            const firstLc = multiPurchased[0];
            const vendaExistWhMulti = await updateClient.query(
              'SELECT id FROM vendas WHERE stripe_session_id = $1 LIMIT 1',
              [session.id]
            );
            if (vendaExistWhMulti.rows.length === 0) {
              const numerosVendidos = multiPurchased.map(c => c.numero_cartela).join(',');
              const totalPreco = multiPurchased.reduce((s, c) => s + parseFloat(c.preco || 0), 0);
              let vendaIdWhMulti;
              if (dbConfig.type === 'mysql') {
                await updateClient.query(
                  `INSERT INTO vendas (id, sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, data_venda)
                   VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, 'concluida', NOW())`,
                  [firstLc.sorteio_id, firstLc.vendedor_id || null, compradorNome || 'Comprador Online', compradorTelefone || null, numerosVendidos, totalPreco, totalPreco]
                );
                const lastVendaM = await updateClient.query('SELECT id FROM vendas ORDER BY created_at DESC LIMIT 1');
                vendaIdWhMulti = lastVendaM.rows[0]?.id;
              } else {
                const vendaWhMultiResult = await updateClient.query(
                  `INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, data_venda)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluida', NOW()) RETURNING id`,
                  [firstLc.sorteio_id, firstLc.vendedor_id || null, compradorNome || 'Comprador Online', compradorTelefone || null, numerosVendidos, totalPreco, totalPreco]
                );
                vendaIdWhMulti = vendaWhMultiResult.rows[0]?.id;
              }
              if (vendaIdWhMulti) {
                await updateClient.query(
                  'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
                  [vendaIdWhMulti, 'cartao', totalPreco]
                );
                await updateClient.query(
                  'UPDATE vendas SET stripe_session_id = $1 WHERE id = $2',
                  [session.id, vendaIdWhMulti]
                ).catch(() => {});
              }
            }
          }
        } finally {
          updateClient.release();
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    res.status(500).send('Internal error');
  }
});

// MercadoPago webhook (IPN / notifications)
app.post('/mp-webhook', express.json(), async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (type !== 'payment' || !data?.id) {
      return res.sendStatus(200);
    }
    const paymentId = String(data.id);

    const mpConfigClient = await dbAdapter.getConnection();
    try {
      const mpCfg = await getMercadoPagoClient(mpConfigClient);
      if (!mpCfg) return res.sendStatus(200);

      // Verify webhook signature (HMAC-SHA256) if secret is configured
      const signatureHeader = req.headers['x-signature'];
      const requestId = req.headers['x-request-id'];
      if (signatureHeader) {
        const webhookSecretResult = await mpConfigClient.query(
          "SELECT valor FROM configuracoes WHERE chave = 'mp_webhook_secret'"
        );
        const webhookSecret = webhookSecretResult.rows[0]?.valor || '';
        if (webhookSecret) {
          const parts = String(signatureHeader).split(',');
          const tsPart = parts.find(p => p.startsWith('ts='));
          const v1Part = parts.find(p => p.startsWith('v1='));
          if (!tsPart || !v1Part) {
            return res.status(400).send('Invalid signature format');
          }
          const ts = tsPart.slice(3);
          const v1 = v1Part.slice(3);
          const manifest = `id:${paymentId};request-id:${requestId || ''};ts:${ts};`;
          const expected = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
          if (expected !== v1) {
            return res.status(401).send('Signature mismatch');
          }
        }
      }

      const paymentApi = new Payment(mpCfg.client);
      const paymentData = await paymentApi.get({ id: paymentId });
      if (paymentData.status !== 'approved') return res.sendStatus(200);
      const meta = paymentData.metadata || {};
      const cartelaId = meta.loja_cartela_id;
      const cartelaIds = meta.loja_cartela_ids ? String(meta.loja_cartela_ids).split(',').filter(Boolean) : null;
      const compradorNome = meta.comprador_nome || '';
      const compradorEmail = paymentData.payer?.email || meta.comprador_email || '';
      const compradorEndereco = meta.comprador_endereco || '';
      const compradorCidade = meta.comprador_cidade || '';
      const compradorTelefone = meta.comprador_telefone || '';

      if (cartelaIds && cartelaIds.length > 0) {
        // Multi-cartela purchase
        for (const lcId of cartelaIds) {
          await mpConfigClient.query(
            'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, updated_at = NOW() WHERE id = $7 AND status = $8',
            ['vendida', compradorNome, compradorEmail, compradorEndereco, compradorCidade, compradorTelefone, lcId, 'disponivel']
          );
        }
      } else if (cartelaId) {
        // Single cartela purchase
        await mpConfigClient.query(
          'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, updated_at = NOW() WHERE id = $7 AND status = $8',
          ['vendida', compradorNome, compradorEmail, compradorEndereco, compradorCidade, compradorTelefone, cartelaId, 'disponivel']
        );
      }
    } finally {
      mpConfigClient.release();
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('MercadoPago webhook error:', err.message);
    res.status(500).send('Internal error');
  }
});

app.use(express.json({ limit: '10mb' }));

// Load database configuration from environment variables
const dbConfig = {
  type: process.env.DB_TYPE || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || (process.env.DB_TYPE === 'mysql' ? '3306' : '5432')),
  database: process.env.DB_NAME || 'bingo',
  user: process.env.DB_USER || (process.env.DB_TYPE === 'mysql' ? 'root' : 'postgres'),
  password: process.env.DB_PASSWORD || '',
};

// Initialize database adapter
const dbAdapter = new DatabaseAdapter(dbConfig);
dbAdapter.connect();
console.log(`Database adapter initialized for ${dbConfig.type}`);

// Auto-create sorteio_compartilhado table for existing deployments
async function initSchema() {
  try {
    const client = await dbAdapter.getConnection();
    try {
      if (dbConfig.type === 'mysql') {
        await client.query(`
          CREATE TABLE IF NOT EXISTS sorteio_compartilhado (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            sorteio_id CHAR(36) NOT NULL,
            user_id CHAR(36) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            UNIQUE KEY uq_sorteio_user (sorteio_id, user_id)
          )
        `);
        // Add numeros_grade column if missing (MySQL)
        try {
          await client.query(`ALTER TABLE cartelas ADD COLUMN numeros_grade JSON`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('numeros_grade column may already exist or could not be added:', e.message);
          }
        }
        // Create bingo_card_sets table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS bingo_card_sets (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            sorteio_id CHAR(36) NOT NULL,
            nome VARCHAR(255) NOT NULL,
            layout_data LONGTEXT NOT NULL,
            cards_data LONGTEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL
          )
        `);
        // Create cartelas_validadas table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS cartelas_validadas (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            sorteio_id CHAR(36) NOT NULL,
            numero INT NOT NULL,
            comprador_nome VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            UNIQUE KEY uq_validada_sorteio_numero (sorteio_id, numero)
          )
        `);
        // Create loja_cartelas table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS loja_cartelas (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            user_id CHAR(36) NOT NULL,
            card_set_id CHAR(36) NOT NULL,
            numero_cartela INT NOT NULL,
            preco DECIMAL(10,2) NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'disponivel',
            vendedor_id CHAR(36) DEFAULT NULL,
            comprador_nome VARCHAR(255),
            comprador_email VARCHAR(255),
            comprador_endereco VARCHAR(255),
            comprador_cidade VARCHAR(255),
            comprador_telefone VARCHAR(50),
            stripe_session_id VARCHAR(255),
            card_data LONGTEXT NOT NULL,
            layout_data LONGTEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
            UNIQUE KEY uq_loja_cartela (user_id, card_set_id, numero_cartela)
          )
        `);
        // Add new columns to loja_cartelas if upgrading (MySQL)
        const lojaExtraCols = [
          ['comprador_endereco', 'ALTER TABLE loja_cartelas ADD COLUMN comprador_endereco VARCHAR(255)'],
          ['comprador_cidade',   'ALTER TABLE loja_cartelas ADD COLUMN comprador_cidade VARCHAR(255)'],
          ['comprador_telefone', 'ALTER TABLE loja_cartelas ADD COLUMN comprador_telefone VARCHAR(50)'],
          ['layout_data',        "ALTER TABLE loja_cartelas ADD COLUMN layout_data LONGTEXT NOT NULL DEFAULT ''"],
          ['vendedor_id',        'ALTER TABLE loja_cartelas ADD COLUMN vendedor_id CHAR(36) DEFAULT NULL'],
        ];
        for (const [, sql] of lojaExtraCols) {
          try { await client.query(sql); } catch (e) {
            if (!e.message || !e.message.includes('Duplicate column')) {
              console.warn('loja_cartelas migration warning (may be pre-existing):', e.message);
            }
          }
        }
        // Add comprador_nome to cartelas (MySQL)
        try {
          await client.query(`ALTER TABLE cartelas ADD COLUMN comprador_nome VARCHAR(255)`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('Could not add comprador_nome to cartelas:', e.message);
          }
        }
        // Create planos table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS planos (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            nome VARCHAR(255) NOT NULL,
            valor DECIMAL(10,2) NOT NULL DEFAULT 0,
            descricao TEXT,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL
          )
        `);
        // Create configuracoes table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS configuracoes (
            chave VARCHAR(100) PRIMARY KEY,
            valor TEXT,
            updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL
          )
        `);
        // Add plano_id and gratuidade_vitalicia to usuarios (MySQL)
        try {
          await client.query(`ALTER TABLE usuarios ADD COLUMN plano_id CHAR(36)`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('Could not add plano_id column (unexpected error):', e.message);
          }
          // 'Duplicate column' means it already exists — silently continue
        }
        try {
          await client.query(`ALTER TABLE usuarios ADD COLUMN gratuidade_vitalicia TINYINT(1) NOT NULL DEFAULT 0`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('Could not add gratuidade_vitalicia column (unexpected error):', e.message);
          }
          // 'Duplicate column' means it already exists — silently continue
        }
        try {
          await client.query(`ALTER TABLE usuarios ADD COLUMN plano_inicio TIMESTAMP`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('Could not add plano_inicio column (unexpected error):', e.message);
          }
        }
        try {
          await client.query(`ALTER TABLE usuarios ADD COLUMN plano_vencimento TIMESTAMP`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('Could not add plano_vencimento column (unexpected error):', e.message);
          }
        }
        try {
          await client.query(`ALTER TABLE planos ADD COLUMN stripe_price_id VARCHAR(255)`);
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('Could not add stripe_price_id column (unexpected error):', e.message);
          }
        }
        // Create loja_compradores table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS loja_compradores (
            id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
            email VARCHAR(255) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            nome VARCHAR(255) NOT NULL,
            cpf VARCHAR(20) DEFAULT NULL,
            endereco VARCHAR(255) DEFAULT NULL,
            cidade VARCHAR(100) DEFAULT NULL,
            telefone VARCHAR(50) DEFAULT NULL,
            reset_token VARCHAR(64) DEFAULT NULL,
            reset_token_expires DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL
          )
        `);
        // Add columns to loja_compradores if upgrading (MySQL)
        const compradoresExtraCols = [
          'ALTER TABLE loja_compradores ADD COLUMN reset_token VARCHAR(64) DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN reset_token_expires DATETIME DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN cpf VARCHAR(20) DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN endereco VARCHAR(255) DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN cidade VARCHAR(100) DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN telefone VARCHAR(50) DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN owner_user_id CHAR(36) DEFAULT NULL',
          'ALTER TABLE loja_compradores ADD COLUMN avatar_url LONGTEXT DEFAULT NULL',
        ];
        for (const sql of compradoresExtraCols) {
          try { await client.query(sql); } catch (e) {
            if (!e.message || !e.message.includes('Duplicate column')) {
              console.warn('loja_compradores migration warning:', e.message);
            }
          }
        }
        // Migrate loja_compradores unique constraint: email -> (email, owner_user_id) (MySQL)
        try {
          await client.query('ALTER TABLE loja_compradores DROP INDEX email');
        } catch (e) { /* index may not exist */ }
        try {
          await client.query('CREATE UNIQUE INDEX loja_compradores_email_owner_key ON loja_compradores (email, owner_user_id)');
        } catch (e) {
          if (!e.message || !e.message.includes('Duplicate key name')) {
            console.warn('loja_compradores index migration warning:', e.message);
          }
        }
        // Create user_configuracoes table (MySQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_configuracoes (
            user_id CHAR(36) NOT NULL,
            chave VARCHAR(100) NOT NULL,
            valor TEXT,
            updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW() NOT NULL,
            PRIMARY KEY (user_id, chave)
          )
        `);
        // Add stripe_session_id to vendas for deduplication (MySQL)
        try { await client.query('ALTER TABLE vendas ADD COLUMN stripe_session_id VARCHAR(255) DEFAULT NULL'); } catch (e) {
          if (!e.message || !e.message.includes('Duplicate column')) {
            console.warn('vendas stripe_session_id migration warning:', e.message);
          }
        }
        // Add paper size and grid configuration columns to sorteios (MySQL)
        const sorteiosExtraCols = [
          'ALTER TABLE sorteios ADD COLUMN papel_largura DECIMAL(8,2) DEFAULT 210',
          'ALTER TABLE sorteios ADD COLUMN papel_altura DECIMAL(8,2) DEFAULT 297',
          'ALTER TABLE sorteios ADD COLUMN grade_colunas INT DEFAULT 5',
          'ALTER TABLE sorteios ADD COLUMN grade_linhas INT DEFAULT 5',
          'ALTER TABLE sorteios ADD COLUMN apenas_numero_rifa TINYINT(1) NOT NULL DEFAULT 0',
          "ALTER TABLE sorteios ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'bingo'",
          'ALTER TABLE sorteios ADD COLUMN tamanho_lote INT DEFAULT 50',
        ];
        for (const sql of sorteiosExtraCols) {
          try { await client.query(sql); } catch (e) {
            if (!e.message || !e.message.includes('Duplicate column')) {
              console.warn('sorteios migration warning:', e.message);
            }
          }
        }
        const mysqlIndexes = [
          'CREATE INDEX idx_cartelas_sorteio_numero ON cartelas (sorteio_id, numero)',
          'CREATE INDEX idx_cartelas_sorteio_status_vendedor ON cartelas (sorteio_id, status, vendedor_id)',
          'CREATE INDEX idx_cartelas_validadas_sorteio_numero ON cartelas_validadas (sorteio_id, numero)',
          'CREATE INDEX idx_sorteio_historico_rodada_ordem ON sorteio_historico (rodada_id, ordem)',
          'CREATE INDEX idx_sorteio_historico_rodada_numero ON sorteio_historico (rodada_id, numero_sorteado)',
          'CREATE UNIQUE INDEX uq_sorteio_historico_rodada_ordem ON sorteio_historico (rodada_id, ordem)',
          'CREATE UNIQUE INDEX uq_sorteio_historico_rodada_numero ON sorteio_historico (rodada_id, numero_sorteado)',
          'CREATE INDEX idx_loja_cartelas_user_status_created ON loja_cartelas (user_id, status, created_at)',
          'CREATE INDEX idx_loja_cartelas_card_set_numero ON loja_cartelas (card_set_id, numero_cartela)',
        ];
        for (const sql of mysqlIndexes) {
          try {
            await client.query(sql);
          } catch (e) {
            if (!e.message || (!e.message.includes('Duplicate key name') && !e.message.includes('already exists'))) {
              console.warn('mysql index migration warning:', e.message);
            }
          }
        }
      } else {
        // Create core base tables if they don't exist (first-run without SQL init file)
        await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.usuarios (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            ativo BOOLEAN NOT NULL DEFAULT true,
            avatar_url TEXT,
            titulo_sistema TEXT DEFAULT 'Sorteios',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.sorteios (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            nome TEXT NOT NULL,
            premio TEXT,
            premios JSONB DEFAULT '[]'::jsonb,
            data_sorteio DATE,
            valor_cartela NUMERIC,
            quantidade_cartelas INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ativo',
            tipo TEXT NOT NULL DEFAULT 'bingo',
            papel_largura NUMERIC DEFAULT 210,
            papel_altura NUMERIC DEFAULT 297,
            grade_colunas INTEGER DEFAULT 5,
            grade_linhas INTEGER DEFAULT 5,
            apenas_numero_rifa BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.vendedores (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            nome TEXT NOT NULL,
            telefone TEXT,
            email TEXT,
            cpf TEXT,
            endereco TEXT,
            ativo BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.cartelas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
            numero INTEGER NOT NULL,
            status TEXT DEFAULT 'disponivel',
            numeros_grade JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.atribuicoes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            vendedor_id UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.atribuicao_cartelas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            atribuicao_id UUID NOT NULL REFERENCES public.atribuicoes(id) ON DELETE CASCADE,
            numero_cartela INTEGER NOT NULL,
            status TEXT DEFAULT 'ativa',
            data_atribuicao TIMESTAMP WITH TIME ZONE,
            data_devolucao TIMESTAMP WITH TIME ZONE,
            venda_id UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.vendas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            vendedor_id UUID REFERENCES public.vendedores(id) ON DELETE SET NULL,
            cliente_nome TEXT,
            cliente_telefone TEXT,
            numeros_cartelas TEXT,
            valor_total NUMERIC,
            valor_pago NUMERIC DEFAULT 0,
            data_venda TIMESTAMP WITH TIME ZONE,
            status TEXT DEFAULT 'pendente',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.pagamentos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
            valor NUMERIC,
            forma_pagamento TEXT,
            data_pagamento TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.rodadas_sorteio (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            nome TEXT NOT NULL,
            range_start INTEGER NOT NULL,
            range_end INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'ativo',
            data_inicio TIMESTAMP WITH TIME ZONE,
            data_fim TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.sorteio_historico (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID REFERENCES public.sorteios(id) ON DELETE CASCADE,
            rodada_id UUID REFERENCES public.rodadas_sorteio(id) ON DELETE CASCADE,
            numero_sorteado INTEGER NOT NULL,
            range_start INTEGER NOT NULL,
            range_end INTEGER NOT NULL,
            ordem INTEGER NOT NULL,
            registro VARCHAR(255),
            data_sorteio TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT check_sorteio_or_rodada CHECK (sorteio_id IS NOT NULL OR rodada_id IS NOT NULL)
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.sorteio_compartilhado (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            UNIQUE(sorteio_id, user_id)
          )
        `);
        // Add numeros_grade column if missing (PostgreSQL)
        await client.query(`
          ALTER TABLE cartelas ADD COLUMN IF NOT EXISTS numeros_grade JSONB
        `);
        // Create bingo_card_sets table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.bingo_card_sets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            nome VARCHAR(255) NOT NULL,
            layout_data TEXT NOT NULL,
            cards_data TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
          )
        `);
        // Create cartelas_validadas table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.cartelas_validadas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sorteio_id UUID NOT NULL REFERENCES public.sorteios(id) ON DELETE CASCADE,
            numero INT NOT NULL,
            comprador_nome VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            UNIQUE(sorteio_id, numero)
          )
        `);
        // Create loja_cartelas table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.loja_cartelas (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            card_set_id UUID NOT NULL,
            numero_cartela INT NOT NULL,
            preco NUMERIC(10,2) NOT NULL DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'disponivel',
            vendedor_id UUID DEFAULT NULL,
            comprador_nome VARCHAR(255),
            comprador_email VARCHAR(255),
            comprador_endereco VARCHAR(255),
            comprador_cidade VARCHAR(255),
            comprador_telefone VARCHAR(50),
            stripe_session_id VARCHAR(255),
            card_data TEXT NOT NULL,
            layout_data TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            UNIQUE(user_id, card_set_id, numero_cartela)
          )
        `);
        // Add new columns to loja_cartelas if upgrading (PostgreSQL)
        await client.query(`ALTER TABLE loja_cartelas ADD COLUMN IF NOT EXISTS comprador_endereco VARCHAR(255)`);
        await client.query(`ALTER TABLE loja_cartelas ADD COLUMN IF NOT EXISTS comprador_cidade VARCHAR(255)`);
        await client.query(`ALTER TABLE loja_cartelas ADD COLUMN IF NOT EXISTS comprador_telefone VARCHAR(50)`);
        await client.query(`ALTER TABLE loja_cartelas ADD COLUMN IF NOT EXISTS layout_data TEXT NOT NULL DEFAULT ''`);
        await client.query(`ALTER TABLE loja_cartelas ADD COLUMN IF NOT EXISTS vendedor_id UUID DEFAULT NULL`);
        // Add comprador_nome to cartelas (PostgreSQL)
        await client.query(`ALTER TABLE cartelas ADD COLUMN IF NOT EXISTS comprador_nome VARCHAR(255)`);
        // Create planos table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.planos (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome VARCHAR(255) NOT NULL,
            valor NUMERIC(10,2) NOT NULL DEFAULT 0,
            descricao TEXT,
            ativo BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
          )
        `);
        // Create configuracoes table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.configuracoes (
            chave VARCHAR(100) PRIMARY KEY,
            valor TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
          )
        `);
        // Add plano_id and gratuidade_vitalicia to usuarios (PostgreSQL)
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_id UUID REFERENCES public.planos(id) ON DELETE SET NULL`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS gratuidade_vitalicia BOOLEAN NOT NULL DEFAULT false`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_inicio TIMESTAMP WITH TIME ZONE`);
        await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_vencimento TIMESTAMP WITH TIME ZONE`);
        await client.query(`ALTER TABLE planos ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)`);
        // Create loja_compradores table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.loja_compradores (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            nome VARCHAR(255) NOT NULL,
            cpf VARCHAR(20) DEFAULT NULL,
            endereco VARCHAR(255) DEFAULT NULL,
            cidade VARCHAR(100) DEFAULT NULL,
            telefone VARCHAR(50) DEFAULT NULL,
            reset_token VARCHAR(64) DEFAULT NULL,
            reset_token_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
          )
        `);
        // Add columns to loja_compradores if upgrading (PostgreSQL)
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64) DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS cpf VARCHAR(20) DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS endereco VARCHAR(255) DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS cidade VARCHAR(100) DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS telefone VARCHAR(50) DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS owner_user_id UUID DEFAULT NULL`);
        await client.query(`ALTER TABLE loja_compradores ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL`);
        // Migrate loja_compradores unique constraint: email -> (email, owner_user_id) (PostgreSQL)
        await client.query(`ALTER TABLE loja_compradores DROP CONSTRAINT IF EXISTS loja_compradores_email_key`);
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'loja_compradores_email_owner_key'
            ) THEN
              ALTER TABLE loja_compradores ADD CONSTRAINT loja_compradores_email_owner_key UNIQUE (email, owner_user_id);
            END IF;
          END $$
        `);
        // Create user_configuracoes table (PostgreSQL)
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.user_configuracoes (
            user_id UUID NOT NULL,
            chave VARCHAR(100) NOT NULL,
            valor TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            PRIMARY KEY (user_id, chave)
          )
        `);
        // Add stripe_session_id to vendas for deduplication (PostgreSQL)
        await client.query(`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255) DEFAULT NULL`);
        // Add short_id to sorteios for public store URL (PostgreSQL)
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS short_id VARCHAR(8) DEFAULT NULL`);
        await client.query(`
          DO $$
          DECLARE r RECORD;
          BEGIN
            FOR r IN SELECT id FROM sorteios WHERE short_id IS NULL LOOP
              UPDATE sorteios SET short_id = UPPER(SUBSTRING(MD5(RANDOM()::TEXT || r.id::TEXT) FROM 1 FOR 6)) WHERE id = r.id;
            END LOOP;
          END;
          $$;
        `);
        // Add paper size and grid configuration columns to sorteios (PostgreSQL)
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS papel_largura NUMERIC DEFAULT 210`);
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS papel_altura NUMERIC DEFAULT 297`);
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS grade_colunas INTEGER DEFAULT 5`);
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS grade_linhas INTEGER DEFAULT 5`);
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS apenas_numero_rifa BOOLEAN DEFAULT FALSE`);
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'bingo'`);
        await client.query(`ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS tamanho_lote INTEGER DEFAULT 50`);
        const pgIndexes = [
          'CREATE INDEX IF NOT EXISTS idx_cartelas_sorteio_numero ON cartelas (sorteio_id, numero)',
          'CREATE INDEX IF NOT EXISTS idx_cartelas_sorteio_status_vendedor ON cartelas (sorteio_id, status, vendedor_id)',
          'CREATE INDEX IF NOT EXISTS idx_cartelas_validadas_sorteio_numero ON cartelas_validadas (sorteio_id, numero)',
          'CREATE INDEX IF NOT EXISTS idx_sorteio_historico_rodada_ordem ON sorteio_historico (rodada_id, ordem)',
          'CREATE INDEX IF NOT EXISTS idx_sorteio_historico_rodada_numero ON sorteio_historico (rodada_id, numero_sorteado)',
          'CREATE INDEX IF NOT EXISTS idx_loja_cartelas_user_status_created ON loja_cartelas (user_id, status, created_at)',
          'CREATE INDEX IF NOT EXISTS idx_loja_cartelas_card_set_numero ON loja_cartelas (card_set_id, numero_cartela)',
          'CREATE UNIQUE INDEX IF NOT EXISTS uq_sorteio_historico_rodada_ordem ON sorteio_historico (rodada_id, ordem)',
          'CREATE UNIQUE INDEX IF NOT EXISTS uq_sorteio_historico_rodada_numero ON sorteio_historico (rodada_id, numero_sorteado)',
        ];
        for (const sql of pgIndexes) {
          await client.query(sql);
        }
      }
      console.log('Schema initialized: sorteio_compartilhado table ready');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Schema init error:', err.message);
  }
}
initSchema();

/** Generates a 6-character alphanumeric short ID for public store URLs. */
function generateShortId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Basic Auth credentials from environment
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || '';
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || '';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'bingo_jwt_secret_2024_secure';
const JWT_EXPIRY_HOURS = 24;
const STRIPE_MIN_AMOUNT_CENTAVOS = 50; // R$ 0,50 — Stripe minimum for BRL

// ================== Utility Functions ==================

/** Returns the active Stripe secret key based on sandbox mode config.
 *  If stripe_sandbox_mode is 'true', uses stripe_sandbox_secret_key;
 *  otherwise uses stripe_secret_key. */
async function getStripeSecretKey(dbClient) {
  const cfgResult = await dbClient.query(
    "SELECT chave, valor FROM configuracoes WHERE chave IN ('stripe_secret_key', 'stripe_sandbox_secret_key', 'stripe_sandbox_mode')"
  );
  const cfg = {};
  cfgResult.rows.forEach(r => { cfg[r.chave] = r.valor || ''; });
  if (cfg['stripe_sandbox_mode'] === 'true') {
    return cfg['stripe_sandbox_secret_key'] || '';
  }
  return cfg['stripe_secret_key'] || '';
}

/** Returns active Stripe webhook secret based on sandbox mode config. */
async function getStripeWebhookSecret(dbClient) {
  const cfgResult = await dbClient.query(
    "SELECT chave, valor FROM configuracoes WHERE chave IN ('stripe_webhook_secret', 'stripe_sandbox_webhook_secret', 'stripe_sandbox_mode')"
  );
  const cfg = {};
  cfgResult.rows.forEach(r => { cfg[r.chave] = r.valor || ''; });
  if (cfg['stripe_sandbox_mode'] === 'true') {
    return cfg['stripe_sandbox_webhook_secret'] || '';
  }
  return cfg['stripe_webhook_secret'] || '';
}

/** Returns a configured MercadoPagoConfig client based on sandbox mode.
 *  Uses mp_sandbox_access_token when mp_sandbox_mode is 'true'. */
async function getMercadoPagoClient(dbClient) {
  const cfgResult = await dbClient.query(
    "SELECT chave, valor FROM configuracoes WHERE chave IN ('mp_public_key', 'mp_access_token', 'mp_client_id', 'mp_client_secret', 'mp_sandbox_public_key', 'mp_sandbox_access_token', 'mp_sandbox_mode')"
  );
  const cfg = {};
  cfgResult.rows.forEach(r => { cfg[r.chave] = r.valor || ''; });
  const sandboxMode = cfg['mp_sandbox_mode'] === 'true';
  const accessToken = sandboxMode ? cfg['mp_sandbox_access_token'] : cfg['mp_access_token'];
  if (!accessToken) return null;
  const publicKey = sandboxMode ? cfg['mp_sandbox_public_key'] : cfg['mp_public_key'];
  const clientId = sandboxMode ? undefined : cfg['mp_client_id'];
  const clientSecret = sandboxMode ? undefined : cfg['mp_client_secret'];
  return { client: new MercadoPagoConfig({ accessToken }), sandboxMode, publicKey, clientId, clientSecret };
}

/** Returns the configured payment gateway ('stripe' or 'mercado_pago'). Defaults to 'stripe'. */
async function getPaymentGateway(dbClient) {
  const cfgResult = await dbClient.query(
    "SELECT valor FROM configuracoes WHERE chave = 'payment_gateway'"
  );
  return cfgResult.rows.length > 0 ? (cfgResult.rows[0].valor || 'stripe') : 'stripe';
}

/** Returns per-user Stripe secret key, falling back to global config. */
async function getUserStripeSecretKey(dbClient, userId) {
  if (!userId || userId === 'undefined') return getStripeSecretKey(dbClient);
  const cfgResult = await dbClient.query(
    "SELECT chave, valor FROM user_configuracoes WHERE user_id = $1 AND chave IN ('stripe_secret_key', 'stripe_sandbox_secret_key', 'stripe_sandbox_mode')",
    [userId]
  );
  const cfg = {};
  cfgResult.rows.forEach(r => { cfg[r.chave] = r.valor || ''; });
  if (!cfg['stripe_secret_key'] && !cfg['stripe_sandbox_secret_key']) {
    return getStripeSecretKey(dbClient);
  }
  if (cfg['stripe_sandbox_mode'] === 'true') {
    return cfg['stripe_sandbox_secret_key'] || '';
  }
  return cfg['stripe_secret_key'] || '';
}

/** Returns per-user MercadoPago client, falling back to global config. */
async function getUserMercadoPagoClient(dbClient, userId) {
  if (!userId || userId === 'undefined') return getMercadoPagoClient(dbClient);
  const cfgResult = await dbClient.query(
    "SELECT chave, valor FROM user_configuracoes WHERE user_id = $1 AND chave IN ('mp_access_token', 'mp_sandbox_access_token', 'mp_sandbox_mode', 'mp_public_key')",
    [userId]
  );
  const cfg = {};
  cfgResult.rows.forEach(r => { cfg[r.chave] = r.valor || ''; });
  if (!cfg['mp_access_token'] && !cfg['mp_sandbox_access_token']) {
    return getMercadoPagoClient(dbClient);
  }
  const sandboxMode = cfg['mp_sandbox_mode'] === 'true';
  const accessToken = sandboxMode ? cfg['mp_sandbox_access_token'] : cfg['mp_access_token'];
  if (!accessToken) return null;
  const publicKey = sandboxMode ? cfg['mp_sandbox_public_key'] : cfg['mp_public_key'];
  return { client: new MercadoPagoConfig({ accessToken }), sandboxMode, publicKey };
}

/** Returns per-user payment gateway, falling back to global config. */
async function getUserPaymentGateway(dbClient, userId) {
  if (!userId || userId === 'undefined') return getPaymentGateway(dbClient);
  const cfgResult = await dbClient.query(
    "SELECT valor FROM user_configuracoes WHERE user_id = $1 AND chave = 'payment_gateway'",
    [userId]
  );
  if (cfgResult.rows.length > 0 && cfgResult.rows[0].valor) {
    return cfgResult.rows[0].valor;
  }
  return getPaymentGateway(dbClient);
}

async function hashPassword(password) {
  const hash = crypto.createHash('sha256');
  hash.update(password + 'bingo_salt_2024');
  return hash.digest('hex');
}

async function verifyPassword(password, hash) {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) {
    padded += '=';
  }
  return Buffer.from(padded, 'base64');
}

async function createJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + (JWT_EXPIRY_HOURS * 60 * 60),
  };

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  hmac.update(signatureInput);
  const signatureB64 = base64UrlEncode(hmac.digest());

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function verifyJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const signatureInput = `${headerB64}.${payloadB64}`;
    const hmac = crypto.createHmac('sha256', JWT_SECRET);
    hmac.update(signatureInput);
    const expectedSignature = base64UrlEncode(hmac.digest());
    
    if (signatureB64 !== expectedSignature) return null;

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString());

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.log('Token expired');
      return null;
    }

    return { user_id: payload.user_id, comprador_id: payload.comprador_id, role: payload.role, email: payload.email };
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// ================== Middleware ==================

// Simple in-memory rate limiter for sensitive public actions (login, publicRegister)
const _rateLimitMap = new Map();
function rateLimitCheck(ip, action, maxRequests = 10, windowMs = 60000) {
  const key = `${ip}:${action}`;
  const now = Date.now();
  const entry = _rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count++;
  _rateLimitMap.set(key, entry);
  return entry.count <= maxRequests;
}

// Email helper
async function sendEmail(dbClient, { to, subject, text, html, attachments }) {
  if (!nodemailer) {
    console.warn('nodemailer not available — email not sent');
    return;
  }
  try {
    const cfgResult = await dbClient.query(
      "SELECT chave, valor FROM configuracoes WHERE chave IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_from_email','smtp_encryption','smtp_secure')"
    );
    const cfg = {};
    cfgResult.rows.forEach(r => { cfg[r.chave] = r.valor; });
    if (!cfg.smtp_host || !cfg.smtp_user) {
      console.warn('SMTP not configured — email not sent');
      return;
    }
    const encryption = cfg.smtp_encryption || (cfg.smtp_secure === 'true' ? 'ssl' : 'none');
    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port: parseInt(cfg.smtp_port || '587'),
      secure: encryption === 'ssl',
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass || '' },
    });
    await transporter.sendMail({
      from: cfg.smtp_from_email
        ? `"${cfg.smtp_from_name || 'Sistema'}" <${cfg.smtp_from_email}>`
        : cfg.smtp_user,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments ? { attachments } : {}),
    });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (e) {
    console.error('Email send error:', e.message);
  }
}

function applyTemplateVars(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{{${key}}}`));
}

// Basic Auth middleware (optional)
function checkBasicAuth(req, res, next) {
  // If no basic auth configured, skip
  if (!BASIC_AUTH_USER) {
    return next();
  }

  const basicAuth = req.headers['x-basic-auth'];
  if (!basicAuth) {
    return res.status(401).json({ error: 'Basic authentication required' });
  }

  try {
    const credentials = Buffer.from(basicAuth.replace('Basic ', ''), 'base64').toString();
    const [user, pass] = credentials.split(':');
    
    if (user !== BASIC_AUTH_USER || pass !== BASIC_AUTH_PASS) {
      return res.status(401).json({ error: 'Invalid basic auth credentials' });
    }
    
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid basic auth format' });
  }
}

// JWT Auth middleware
async function checkAuth(req, action) {
  const publicActions = ['checkFirstAccess', 'setupAdmin', 'login', 'publicRegister', 'getPublicPlanos', 'getLojaPublica', 'getPublicConfiguracoes', 'createStripeCheckoutCartela', 'confirmStripeCheckoutCartela', 'createStripeCheckoutMultiCartela', 'confirmStripeCheckoutMultiCartela', 'createMercadoPagoCheckoutCartela', 'confirmMercadoPagoCheckoutCartela', 'createMercadoPagoCheckoutMultiCartela', 'confirmMercadoPagoCheckoutMultiCartela', 'cadastrarComprador', 'loginComprador', 'getHistoricoComprador', 'emailCartelasPDF', 'solicitarRecuperacaoSenha', 'resetarSenha', 'atualizarComprador', 'deletarComprador'];
  const adminActions = [
    // User management
    'getUsers', 'createUser', 'updateUser', 'deleteUser', 'approveUser', 'rejectUser',
    // Sorteio management
    'getAllSorteiosAdmin', 'assignSorteioToUser', 'removeUserFromSorteio', 'getSorteioUsers', 'changeSorteioOwner',
    // Plan management
    'getPlanos', 'createPlano', 'updatePlano', 'deletePlano', 'assignUserPlan', 'grantLifetimeAccess',
    // Configuration
    'getConfiguracoes', 'updateConfiguracoes',
  ];

  if (publicActions.includes(action)) {
    return { authenticated: true, user: null };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Não autorizado. Faça login novamente.' };
  }

  const token = authHeader.substring(7);
  const user = await verifyJwt(token);
  
  if (!user) {
    return { authenticated: false, error: 'Token inválido ou expirado.' };
  }

  if (adminActions.includes(action) && user.role !== 'admin') {
    return { authenticated: false, error: 'Acesso negado. Apenas administradores.' };
  }

  return { authenticated: true, user };
}

// ================== Routes ==================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api', checkBasicAuth, async (req, res) => {
  const { action, data = {} } = req.body;
  
  console.log(`API Call: ${action}`);

  // Rate-limit sensitive public actions (10 requests per minute per IP)
  if (['login', 'publicRegister', 'cadastrarComprador', 'loginComprador', 'createStripeCheckoutCartela', 'confirmStripeCheckoutCartela', 'createStripeCheckoutMultiCartela', 'confirmStripeCheckoutMultiCartela'].includes(action)) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!rateLimitCheck(ip, action, 10, 60000)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um momento e tente novamente.' });
    }
  }
  
  // Check authentication
  const authResult = await checkAuth(req, action);
  if (!authResult.authenticated) {
    return res.status(401).json({ error: authResult.error });
  }
  
  // Add authenticated user info to data
  if (authResult.user) {
    data.authenticated_user_id = authResult.user.user_id;
    data.authenticated_role = authResult.user.role;
  }

  const client = await dbAdapter.getConnection();
  
  try {
    let result;
    
    switch (action) {
      // ================== AUTH ==================
      case 'checkFirstAccess':
        result = await client.query("SELECT COUNT(*) as count FROM usuarios WHERE role = 'admin'");
        return res.json({ isFirstAccess: parseInt(result.rows[0].count) === 0 });

      case 'setupAdmin': {
        const existingCheck = await client.query("SELECT COUNT(*) as count FROM usuarios WHERE role = 'admin'");
        if (parseInt(existingCheck.rows[0].count) > 0) {
          return res.json({ error: 'Administrador já existe' });
        }
        
        const adminHash = await hashPassword(data.senha);
        const adminResult = await client.query(`
          INSERT INTO usuarios (email, senha_hash, nome, role, ativo, titulo_sistema)
          VALUES ($1, $2, $3, 'admin', true, $4)
          RETURNING id, email, nome, role, ativo, titulo_sistema, avatar_url, created_at
        `, [data.email, adminHash, data.nome, data.titulo_sistema || 'Sorteios']);
        
        return res.json({ user: adminResult.rows[0] });
      }

      case 'login': {
        const userResult = await client.query(`
          SELECT id, email, nome, role, ativo, titulo_sistema, avatar_url, senha_hash, created_at, plano_id, gratuidade_vitalicia, plano_inicio, plano_vencimento
          FROM usuarios WHERE email = $1
        `, [data.email]);
        
        if (userResult.rows.length === 0) {
          return res.json({ error: 'Credenciais inválidas' });
        }
        
        const foundUser = userResult.rows[0];
        const passwordValid = await verifyPassword(data.senha, foundUser.senha_hash);
        
        if (!passwordValid) {
          return res.json({ error: 'Credenciais inválidas' });
        }
        
        if (!foundUser.ativo) {
          return res.json({ error: 'Seu cadastro está aguardando aprovação do administrador.' });
        }
        
        const token = await createJwt({
          user_id: foundUser.id,
          role: foundUser.role,
          email: foundUser.email
        });
        
        delete foundUser.senha_hash;
        
        console.log(`User ${foundUser.email} logged in successfully`);
        return res.json({ user: foundUser, token });
      }

      case 'getUsers':
        result = await client.query(`
          SELECT id, email, nome, role, ativo, titulo_sistema, avatar_url, created_at, updated_at, plano_id, gratuidade_vitalicia, plano_inicio, plano_vencimento
          FROM usuarios ORDER BY nome
        `);
        return res.json({ users: result.rows });

      case 'createUser': {
        const newUserHash = await hashPassword(data.senha);
        const newUserResult = await client.query(`
          INSERT INTO usuarios (email, senha_hash, nome, role, ativo, titulo_sistema, avatar_url)
          VALUES ($1, $2, $3, $4, true, $5, $6)
          RETURNING id, email, nome, role, ativo, titulo_sistema, avatar_url, created_at
        `, [data.email, newUserHash, data.nome, data.role, data.titulo_sistema || 'Sorteios', data.avatar_url || null]);
        
        return res.json({ user: newUserResult.rows[0] });
      }

      case 'updateUser': {
        if (data.senha) {
          const updateHash = await hashPassword(data.senha);
          await client.query(`
            UPDATE usuarios SET email = $2, nome = $3, role = $4, senha_hash = $5, titulo_sistema = $6, updated_at = NOW()
            WHERE id = $1
          `, [data.id, data.email, data.nome, data.role, updateHash, data.titulo_sistema || 'Sorteios']);
        } else {
          await client.query(`
            UPDATE usuarios SET email = $2, nome = $3, role = $4, titulo_sistema = $5, updated_at = NOW()
            WHERE id = $1
          `, [data.id, data.email, data.nome, data.role, data.titulo_sistema || 'Sorteios']);
        }
        
        return res.json({ success: true });
      }

      case 'deleteUser':
        await client.query('DELETE FROM usuarios WHERE id = $1', [data.id]);
        return res.json({ success: true });

      case 'publicRegister': {
        const emailCheck = await client.query('SELECT id FROM usuarios WHERE email = $1', [data.email]);
        if (emailCheck.rows.length > 0) {
          return res.json({ error: 'Este email já está cadastrado.' });
        }
        const regHash = await hashPassword(data.senha);
        const regResult = await client.query(`
          INSERT INTO usuarios (email, senha_hash, nome, role, ativo, titulo_sistema)
          VALUES ($1, $2, $3, 'user', false, $4)
          RETURNING id, email, nome, role, ativo, titulo_sistema, created_at
        `, [data.email, regHash, data.nome, data.titulo_sistema || 'Sorteios']);
        const newUser = regResult.rows[0];

        // Notify admin by email (fire and forget)
        try {
          const adminResult = await client.query("SELECT email FROM usuarios WHERE role = 'admin' LIMIT 1");
          const adminEmail = adminResult.rows[0]?.email;
          if (adminEmail) {
            const tplSubjectResult = await client.query("SELECT valor FROM configuracoes WHERE chave = 'email_admin_novo_cadastro_assunto'");
            const tplBodyResult   = await client.query("SELECT valor FROM configuracoes WHERE chave = 'email_admin_novo_cadastro_corpo'");
            const tituloResult    = await client.query("SELECT valor FROM configuracoes WHERE chave = 'titulo_sistema'");
            const defaultSubject  = 'Novo cadastro aguardando aprovação';
            const defaultBody     = 'Olá Administrador,\n\nUm novo usuário se cadastrou e aguarda sua aprovação:\n\nNome: {{nome_usuario}}\nEmail: {{email_usuario}}\n\nAcesse o painel de administração para aprovar ou rejeitar o cadastro.\n\nAtenciosamente,\n{{titulo_sistema}}';
            const subject = tplSubjectResult.rows[0]?.valor || defaultSubject;
            const bodyTpl = tplBodyResult.rows[0]?.valor || defaultBody;
            const titulo  = tituloResult.rows[0]?.valor || 'Sistema';
            const body = applyTemplateVars(bodyTpl, { nome_usuario: newUser.nome, email_usuario: newUser.email, titulo_sistema: titulo });
            sendEmail(client, { to: adminEmail, subject, text: body });
          }
        } catch (e) {
          console.warn('Could not send admin notification email:', e.message);
        }

        return res.json({ success: true });
      }

      case 'approveUser': {
        const approveResult = await client.query(
          'UPDATE usuarios SET ativo = true, updated_at = NOW() WHERE id = $1 RETURNING email, nome',
          [data.id]
        );
        const approved = approveResult.rows[0];
        if (!approved) return res.json({ error: 'Usuário não encontrado.' });

        // Send approval email to user (fire and forget)
        try {
          const tplSubjectResult = await client.query("SELECT valor FROM configuracoes WHERE chave = 'email_confirmacao_assunto'");
          const tplBodyResult   = await client.query("SELECT valor FROM configuracoes WHERE chave = 'email_confirmacao_corpo'");
          const tituloResult    = await client.query("SELECT valor FROM configuracoes WHERE chave = 'titulo_sistema'");
          const defaultSubject  = 'Seu cadastro foi aprovado';
          const defaultBody     = 'Olá {{nome}},\n\nSeu cadastro foi aprovado! Você já pode acessar o sistema com seu email {{email}}.\n\nAtenciosamente,\n{{titulo_sistema}}';
          const subject = tplSubjectResult.rows[0]?.valor || defaultSubject;
          const bodyTpl = tplBodyResult.rows[0]?.valor || defaultBody;
          const titulo  = tituloResult.rows[0]?.valor || 'Sistema';
          const body = applyTemplateVars(bodyTpl, { nome: approved.nome, email: approved.email, titulo_sistema: titulo });
          sendEmail(client, { to: approved.email, subject, text: body });
        } catch (e) {
          console.warn('Could not send approval email:', e.message);
        }

        return res.json({ success: true });
      }

      case 'rejectUser': {
        const rejectResult = await client.query(
          'DELETE FROM usuarios WHERE id = $1 AND ativo = false RETURNING email, nome',
          [data.id]
        );
        if (rejectResult.rows.length === 0) return res.json({ error: 'Usuário pendente não encontrado.' });
        return res.json({ success: true });
      }

      case 'getAllSorteiosAdmin':
        result = await client.query(`
          SELECT s.*, u.nome as owner_nome, u.email as owner_email
          FROM sorteios s
          JOIN usuarios u ON s.user_id = u.id
          ORDER BY s.created_at DESC
        `);
        return res.json({ data: result.rows });

      case 'getSorteioUsers': {
        const sorteioRow = await client.query(
          'SELECT user_id FROM sorteios WHERE id = $1', [data.sorteio_id]
        );
        const ownerId = sorteioRow.rows[0]?.user_id;
        const sharedResult = await client.query(
          'SELECT user_id FROM sorteio_compartilhado WHERE sorteio_id = $1', [data.sorteio_id]
        );
        const sharedUserIds = sharedResult.rows.map(r => r.user_id);
        const allIds = ownerId ? [ownerId, ...sharedUserIds] : sharedUserIds;
        if (allIds.length === 0) return res.json({ data: [], owner_id: ownerId || '' });
        const placeholders = allIds.map((_, i) => `$${i + 1}`).join(', ');
        const usersResult = await client.query(
          `SELECT id, nome, email, role FROM usuarios WHERE id IN (${placeholders})`, allIds
        );
        return res.json({ data: usersResult.rows, owner_id: ownerId });
      }

      case 'assignSorteioToUser': {
        await client.query(`
          INSERT INTO sorteio_compartilhado (sorteio_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (sorteio_id, user_id) DO NOTHING
        `, [data.sorteio_id, data.user_id]);
        return res.json({ success: true });
      }

      case 'removeUserFromSorteio':
        await client.query(
          'DELETE FROM sorteio_compartilhado WHERE sorteio_id = $1 AND user_id = $2',
          [data.sorteio_id, data.user_id]
        );
        return res.json({ success: true });

      case 'changeSorteioOwner': {
        const newOwnerId = data.new_owner_id;
        const sorteioId = data.sorteio_id;
        if (!newOwnerId || !sorteioId) return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
        await client.query(
          'UPDATE sorteios SET user_id = $1, updated_at = NOW() WHERE id = $2',
          [newOwnerId, sorteioId]
        );
        // Remove new owner from shared list if present (they are now the owner)
        await client.query(
          'DELETE FROM sorteio_compartilhado WHERE sorteio_id = $1 AND user_id = $2',
          [sorteioId, newOwnerId]
        );
        return res.json({ success: true });
      }

      case 'getMyProfile': {
        const myProfileResult = await client.query(
          'SELECT id, email, nome, role, ativo, titulo_sistema, avatar_url, created_at, updated_at, plano_id, gratuidade_vitalicia, plano_inicio, plano_vencimento FROM usuarios WHERE id = $1',
          [data.authenticated_user_id]
        );
        if (myProfileResult.rows.length === 0) {
          return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        return res.json({ user: myProfileResult.rows[0] });
      }

      case 'updateProfile': {
        const profileUserId = data.authenticated_user_id;
        
        if (data.nova_senha) {
          const currentUserResult = await client.query(
            'SELECT senha_hash FROM usuarios WHERE id = $1',
            [profileUserId]
          );
          
          if (currentUserResult.rows.length === 0) {
            return res.json({ error: 'Usuário não encontrado' });
          }
          
          const senhaValida = await verifyPassword(data.senha_atual, currentUserResult.rows[0].senha_hash);
          
          if (!senhaValida) {
            return res.json({ error: 'Senha atual incorreta' });
          }
          
          const newHash = await hashPassword(data.nova_senha);
          await client.query(`
            UPDATE usuarios SET nome = $2, email = $3, titulo_sistema = $4, avatar_url = $5, senha_hash = $6, updated_at = NOW()
            WHERE id = $1
          `, [profileUserId, data.nome, data.email, data.titulo_sistema, data.avatar_url || null, newHash]);
        } else {
          await client.query(`
            UPDATE usuarios SET nome = $2, email = $3, titulo_sistema = $4, avatar_url = $5, updated_at = NOW()
            WHERE id = $1
          `, [profileUserId, data.nome, data.email, data.titulo_sistema, data.avatar_url || null]);
        }
        
        return res.json({ success: true });
      }

      // ================== SORTEIOS ==================
      case 'getSorteios':
        if (data.authenticated_role === 'admin') {
          result = await client.query(
            `SELECT s.*, u.nome as owner_nome, u.email as owner_email
             FROM sorteios s
             JOIN usuarios u ON s.user_id = u.id
             ORDER BY s.created_at DESC`
          );
        } else {
          result = await client.query(
            `SELECT DISTINCT s.* FROM sorteios s
             LEFT JOIN sorteio_compartilhado sc ON sc.sorteio_id = s.id
             WHERE s.user_id = $1 OR sc.user_id = $1
             ORDER BY s.created_at DESC`,
            [data.authenticated_user_id]
          );
        }
        return res.json({ data: result.rows });

      case 'createSorteio': {
        const premiosCreate = data.premios || (data.premio ? [data.premio] : []);
        const premioCreate = premiosCreate[0] || '';

        // Admin can create sorteios on behalf of another user
        const sorteioOwnerId = (data.authenticated_role === 'admin' && data.target_user_id)
          ? data.target_user_id
          : data.authenticated_user_id;

        // Generate a unique short_id for the store URL
        let shortId = generateShortId();
        let shortIdUnique = false;
        for (let attempt = 0; attempt < 10 && !shortIdUnique; attempt++) {
          const existing = await client.query('SELECT id FROM sorteios WHERE short_id = $1', [shortId]);
          if (existing.rows.length === 0) { shortIdUnique = true; } else { shortId = generateShortId(); }
        }
        if (!shortIdUnique) {
          return res.status(500).json({ error: 'Não foi possível gerar um identificador único para a loja. Tente novamente.' });
        }
        
        result = await client.query(`
          INSERT INTO sorteios (user_id, nome, data_sorteio, premio, premios, valor_cartela, quantidade_cartelas, status, short_id, tipo, papel_largura, papel_altura, grade_colunas, grade_linhas, apenas_numero_rifa)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `, [sorteioOwnerId, data.nome, data.data_sorteio, premioCreate, JSON.stringify(premiosCreate), data.valor_cartela, data.quantidade_cartelas, data.status, shortId,
            data.tipo ?? 'bingo', data.papel_largura ?? 210, data.papel_altura ?? 297, data.grade_colunas ?? 5, data.grade_linhas ?? 5, data.apenas_numero_rifa ?? false]);
        
        const newSorteioId = result.rows[0].id;
        const quantidadeCartelas = Number(data.quantidade_cartelas || 0);
        
        // Generate cartelas in batches
        const batchSize = 500;
        for (let batch = 0; batch < Math.ceil(quantidadeCartelas / batchSize); batch++) {
          const startNum = batch * batchSize + 1;
          const endNum = Math.min((batch + 1) * batchSize, quantidadeCartelas);
          
          const values = [];
          const params = [newSorteioId];
          let paramIndex = 2;
          
          for (let i = startNum; i <= endNum; i++) {
            values.push(`($1, $${paramIndex}, 'disponivel')`);
            params.push(i);
            paramIndex++;
          }
          
          if (values.length > 0) {
            await client.query(
              `INSERT INTO cartelas (sorteio_id, numero, status) VALUES ${values.join(', ')}`,
              params
            );
          }
        }
        
        return res.json({ data: result.rows });
      }

      case 'updateSorteio': {
        const premiosUpdate = data.premios || (data.premio ? [data.premio] : []);
        const premioUpdate = premiosUpdate[0] || '';
        
        result = await client.query(`
          UPDATE sorteios 
          SET nome = $2, data_sorteio = $3, premio = $4, premios = $5::jsonb, valor_cartela = $6, quantidade_cartelas = $7, status = $8,
              tipo = $9, papel_largura = $10, papel_altura = $11, grade_colunas = $12, grade_linhas = $13, apenas_numero_rifa = $14,
              tamanho_lote = $15, updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `, [data.id, data.nome, data.data_sorteio, premioUpdate, JSON.stringify(premiosUpdate), data.valor_cartela, data.quantidade_cartelas, data.status,
            data.tipo ?? 'bingo', data.papel_largura ?? 210, data.papel_altura ?? 297, data.grade_colunas ?? 5, data.grade_linhas ?? 5, data.apenas_numero_rifa ?? false,
            data.tamanho_lote ?? 50]);
        return res.json({ data: result.rows });
      }

      case 'deleteSorteio':
        await client.query('DELETE FROM sorteios WHERE id = $1', [data.id]);
        return res.json({ data: [{ success: true }] });

      // ================== DRAW HISTORY ==================
      case 'getSorteioHistorico':
        result = await client.query(
          'SELECT * FROM sorteio_historico WHERE sorteio_id = $1 ORDER BY ordem ASC',
          [data.sorteio_id]
        );
        return res.json({ data: result.rows });

      case 'saveSorteioNumero': {
        const { sorteio_id, numero_sorteado, range_start, range_end, ordem, registro } = data;
        result = await client.query(`
          INSERT INTO sorteio_historico (sorteio_id, numero_sorteado, range_start, range_end, ordem, registro)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [sorteio_id, numero_sorteado, range_start, range_end, ordem, registro ?? null]);
        return res.json({ data: result.rows[0] });
      }

      case 'clearSorteioHistorico':
        await client.query('DELETE FROM sorteio_historico WHERE sorteio_id = $1', [data.sorteio_id]);
        return res.json({ data: [{ success: true }] });

      case 'updateSorteioRegistro':
        await client.query(
          'UPDATE sorteio_historico SET registro = $1 WHERE sorteio_id = $2',
          [data.registro, data.sorteio_id]
        );
        return res.json({ data: [{ success: true }] });

      // ================== RODADAS DE SORTEIO ==================
      case 'getRodadas':
        result = await client.query(
          `SELECT r.*, COALESCE(h.numeros_sorteados, 0) AS numeros_sorteados
           FROM rodadas_sorteio r
           LEFT JOIN (
             SELECT rodada_id, COUNT(*)::int AS numeros_sorteados
             FROM sorteio_historico
             WHERE rodada_id IS NOT NULL
             GROUP BY rodada_id
           ) h ON h.rodada_id = r.id
           WHERE r.sorteio_id = $1
           ORDER BY r.created_at DESC`,
          [data.sorteio_id]
        );
        return res.json({ data: result.rows });

      case 'createRodada':
        result = await client.query(`
          INSERT INTO rodadas_sorteio (sorteio_id, nome, range_start, range_end, status, data_inicio)
          VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING *
        `, [data.sorteio_id, data.nome, data.range_start, data.range_end, data.status || 'ativo']);
        return res.json({ data: result.rows[0] });

      case 'updateRodada':
        result = await client.query(`
          UPDATE rodadas_sorteio 
          SET nome = $2, range_start = $3, range_end = $4, status = $5, updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `, [data.id, data.nome, data.range_start, data.range_end, data.status]);
        return res.json({ data: result.rows[0] });

      case 'deleteRodada':
        await client.query('DELETE FROM rodadas_sorteio WHERE id = $1', [data.id]);
        return res.json({ data: [{ success: true }] });

      case 'getRodadaHistorico':
        result = await client.query(
          'SELECT * FROM sorteio_historico WHERE rodada_id = $1 ORDER BY ordem ASC',
          [data.rodada_id]
        );
        return res.json({ data: result.rows });

      case 'saveRodadaNumero': {
        const { rodada_id, numero_sorteado, ordem } = data;

        // Serializa gravações por rodada para evitar duplicidade em sorteios simultâneos.
        await client.query('BEGIN');
        try {
          const rodadaInfo = await client.query(
            'SELECT range_start, range_end FROM rodadas_sorteio WHERE id = $1 FOR UPDATE',
            [rodada_id]
          );

          if (rodadaInfo.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Rodada não encontrada' });
          }

          const duplicateNumber = await client.query(
            'SELECT 1 FROM sorteio_historico WHERE rodada_id = $1 AND numero_sorteado = $2 LIMIT 1',
            [rodada_id, Number(numero_sorteado)]
          );
          if (duplicateNumber.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Número ${numero_sorteado} já foi sorteado nesta rodada.` });
          }

          const nextOrderResult = await client.query(
            'SELECT COALESCE(MAX(ordem), 0) + 1 AS next_ordem FROM sorteio_historico WHERE rodada_id = $1',
            [rodada_id]
          );
          const nextOrdem = Number(nextOrderResult.rows[0]?.next_ordem || ordem || 1);
          const { range_start, range_end } = rodadaInfo.rows[0];

          result = await client.query(`
            INSERT INTO sorteio_historico (rodada_id, numero_sorteado, range_start, range_end, ordem, data_sorteio)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING *
          `, [rodada_id, Number(numero_sorteado), range_start, range_end, nextOrdem]);
          await client.query('COMMIT');
          return res.json({ data: result.rows[0] });
        } catch (txError) {
          await client.query('ROLLBACK');
          throw txError;
        }
      }

      case 'clearRodadaHistorico':
        await client.query('DELETE FROM sorteio_historico WHERE rodada_id = $1', [data.rodada_id]);
        return res.json({ data: [{ success: true }] });

      case 'deleteRodadaNumero':
        await client.query(
          'DELETE FROM sorteio_historico WHERE rodada_id = $1 AND numero_sorteado = $2',
          [data.rodada_id, data.numero_sorteado]
        );
        return res.json({ data: [{ success: true }] });

      // ================== VENDEDORES ==================
      case 'getVendedores':
        result = await client.query(
          'SELECT * FROM vendedores WHERE sorteio_id = $1 ORDER BY nome',
          [data.sorteio_id]
        );
        return res.json({ data: result.rows });

      case 'createVendedor':
        result = await client.query(`
          INSERT INTO vendedores (sorteio_id, nome, telefone, email, cpf, endereco, ativo)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [data.sorteio_id, data.nome, data.telefone, data.email, data.cpf, data.endereco, data.ativo]);
        return res.json({ data: result.rows });

      case 'updateVendedor':
        result = await client.query(`
          UPDATE vendedores 
          SET nome = $2, telefone = $3, email = $4, cpf = $5, endereco = $6, ativo = $7, updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `, [data.id, data.nome, data.telefone, data.email, data.cpf, data.endereco, data.ativo]);
        return res.json({ data: result.rows });

      case 'deleteVendedor':
        await client.query('DELETE FROM vendedores WHERE id = $1', [data.id]);
        return res.json({ data: [{ success: true }] });

      // ================== CARTELAS ==================
      case 'getCartelas': {
        const includeGrades = data.include_grades === true;
        const page = Math.max(1, Number(data.page || 1));
        const pageSize = Math.min(2000, Math.max(50, Number(data.page_size || 500)));
        const offset = (page - 1) * pageSize;
        const whereParts = ['sorteio_id = $1'];
        const whereParams = [data.sorteio_id];

        const busca = typeof data.busca === 'string' ? data.busca.trim() : '';
        if (busca) {
          const numeroBusca = Number(String(busca).replace(/\D/g, ''));
          if (!Number.isInteger(numeroBusca) || numeroBusca < 1) {
            whereParts.push('1 = 0');
          } else {
            whereParts.push(`numero = $${whereParams.length + 1}`);
            whereParams.push(numeroBusca);
          }
        }

        const status = typeof data.status === 'string' ? data.status : 'todos';
        if (status && status !== 'todos') {
          if (status === 'disponivel') {
            whereParts.push(`(status = $${whereParams.length + 1} OR status = $${whereParams.length + 2})`);
            whereParams.push('disponivel', 'devolvida');
          } else {
            whereParts.push(`status = $${whereParams.length + 1}`);
            whereParams.push(status);
          }
        }

        const vendedorId = typeof data.vendedor_id === 'string' ? data.vendedor_id : '';
        if (vendedorId && vendedorId !== 'todos') {
          whereParts.push(`vendedor_id = $${whereParams.length + 1}`);
          whereParams.push(vendedorId);
        }

        const whereSql = whereParts.join(' AND ');

        const totalResult = await client.query(
          `SELECT COUNT(*) AS total FROM cartelas WHERE ${whereSql}`,
          whereParams
        );
        const total = Number(totalResult.rows[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        const pagedParams = [...whereParams, pageSize, offset];
        result = await client.query(
          `SELECT numero, status, vendedor_id, ${includeGrades ? 'numeros_grade,' : ''} comprador_nome
           FROM cartelas
           WHERE ${whereSql}
           ORDER BY numero
           LIMIT $${pagedParams.length - 1} OFFSET $${pagedParams.length}`,
          pagedParams
        );

        const countersResult = await client.query(
          `SELECT status, COUNT(*) AS total
           FROM cartelas
           WHERE sorteio_id = $1
           GROUP BY status`,
          [data.sorteio_id]
        );
        const counters = {
          disponivel: 0,
          atribuida: 0,
          vendida: 0,
          devolvida: 0,
          extraviada: 0,
        };
        for (const row of countersResult.rows) {
          const qty = Number(row.total || 0);
          if (row.status === 'disponivel') counters.disponivel = qty;
          if (row.status === 'ativa') counters.atribuida = qty;
          if (row.status === 'vendida') counters.vendida = qty;
          if (row.status === 'devolvida') counters.devolvida = qty;
          if (row.status === 'extraviada') counters.extraviada = qty;
        }

        if (!includeGrades) {
          return res.json({
            data: result.rows,
            pagination: {
              page,
              page_size: pageSize,
              total,
              total_pages: totalPages,
            },
            counters,
          });
        }
        // Normalize numeros_grade to number[][] format
        const rows = result.rows.map(row => {
          if (!row.numeros_grade) return row;
          let raw;
          try {
            raw = Array.isArray(row.numeros_grade) ? row.numeros_grade : JSON.parse(row.numeros_grade);
          } catch {
            return row;
          }
          // Old format: flat number[] => wrap as [flat] (single prize)
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            return { ...row, numeros_grade: [raw] };
          }
          return { ...row, numeros_grade: raw };
        });
        return res.json({
          data: rows,
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: totalPages,
          },
          counters,
        });
      }

      case 'getCartelaDetalhe': {
        result = await client.query(
          'SELECT numero, status, vendedor_id, numeros_grade, comprador_nome FROM cartelas WHERE sorteio_id = $1 AND numero = $2 LIMIT 1',
          [data.sorteio_id, Number(data.numero)]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Cartela não encontrada' });
        }
        const row = result.rows[0];
        if (!row.numeros_grade) {
          return res.json({ data: row });
        }
        try {
          const raw = Array.isArray(row.numeros_grade) ? row.numeros_grade : JSON.parse(row.numeros_grade);
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            row.numeros_grade = [raw];
          } else {
            row.numeros_grade = raw;
          }
        } catch {
          // Keep raw value if parsing fails.
        }
        return res.json({ data: row });
      }

      case 'updateCartela':
        result = await client.query(`
          UPDATE cartelas 
          SET status = $2, vendedor_id = $3, updated_at = NOW()
          WHERE sorteio_id = $1 AND numero = $4
          RETURNING *
        `, [data.sorteio_id, data.status, data.vendedor_id, data.numero]);

        const atribuicaoStatus = data.status === 'disponivel' ? 'devolvida' : data.status;
        await client.query(
          `UPDATE atribuicao_cartelas
           SET status = $3,
               data_devolucao = CASE WHEN $3 = 'devolvida' THEN NOW() ELSE NULL END
           WHERE numero_cartela = $2
             AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $1)`,
          [data.sorteio_id, data.numero, atribuicaoStatus]
        );
        return res.json({ data: result.rows });

      case 'updateCartelasBatch':
        for (const cartela of data.cartelas) {
          await client.query(`
            UPDATE cartelas 
            SET status = $2, vendedor_id = $3, updated_at = NOW()
            WHERE sorteio_id = $1 AND numero = $4
          `, [data.sorteio_id, cartela.status, cartela.vendedor_id, cartela.numero]);
        }
        return res.json({ data: [{ success: true }] });

      case 'gerarCartelas': {
        await client.query('DELETE FROM cartelas WHERE sorteio_id = $1', [data.sorteio_id]);
        
        const batchSize = 500;
        const totalCartelas = Number(data.quantidade || 0);
        
        for (let batch = 0; batch < Math.ceil(totalCartelas / batchSize); batch++) {
          const startNum = batch * batchSize + 1;
          const endNum = Math.min((batch + 1) * batchSize, totalCartelas);
          
          const values = [];
          const params = [data.sorteio_id];
          let paramIndex = 2;
          
          for (let i = startNum; i <= endNum; i++) {
            values.push(`($1, $${paramIndex}, 'disponivel')`);
            params.push(i);
            paramIndex++;
          }
          
          if (values.length > 0) {
            await client.query(
              `INSERT INTO cartelas (sorteio_id, numero, status) VALUES ${values.join(', ')}`,
              params
            );
          }
        }
        
        return res.json({ data: [{ success: true, quantidade: totalCartelas }] });
      }

      case 'salvarNumerosCartelas': {
        // data.sorteio_id, data.cartelas: [{numero, numeros_grade: number[][]}]
        // numeros_grade is an array of flat 25-number arrays (one per prize)
        const cartelasGrade = data.cartelas || [];
        if (dbConfig.type === 'postgres' && cartelasGrade.length > 0) {
          const chunkSize = 300;
          for (let i = 0; i < cartelasGrade.length; i += chunkSize) {
            const chunk = cartelasGrade.slice(i, i + chunkSize);
            const values = [];
            const params = [data.sorteio_id];
            let p = 2;
            for (const c of chunk) {
              values.push(`($${p}, $${p + 1}::jsonb)`);
              params.push(Number(c.numero), JSON.stringify(c.numeros_grade));
              p += 2;
            }
            await client.query(
              `UPDATE cartelas c
               SET numeros_grade = v.numeros_grade,
                   updated_at = NOW()
               FROM (VALUES ${values.join(', ')}) AS v(numero, numeros_grade)
               WHERE c.sorteio_id = $1 AND c.numero = v.numero`,
              params
            );
          }
        } else {
          for (const c of cartelasGrade) {
            await client.query(
              `UPDATE cartelas SET numeros_grade = $1, updated_at = NOW() WHERE sorteio_id = $2 AND numero = $3`,
              [JSON.stringify(c.numeros_grade), data.sorteio_id, c.numero]
            );
          }
        }
        return res.json({ data: [{ success: true, saved: cartelasGrade.length }] });
      }

      case 'deleteCartela': {
        // Remove from atribuicao_cartelas first to avoid orphaned records
        await client.query(
          `DELETE FROM atribuicao_cartelas WHERE atribuicao_id IN (
             SELECT id FROM atribuicoes WHERE sorteio_id = $1
           ) AND numero_cartela = $2`,
          [data.sorteio_id, data.numero]
        );
        await client.query(
          'DELETE FROM cartelas WHERE sorteio_id = $1 AND numero = $2',
          [data.sorteio_id, data.numero]
        );
        return res.json({ data: [{ success: true }] });
      }

      case 'createCartela': {
        const maxResult = await client.query(
          'SELECT COALESCE(MAX(numero), 0) as max_num FROM cartelas WHERE sorteio_id = $1',
          [data.sorteio_id]
        );
        const nextNum = (maxResult.rows[0]?.max_num ?? 0) + 1;
        const numerosGradeJson = data.numeros_grade ? JSON.stringify(data.numeros_grade) : null;
        await client.query(
          'INSERT INTO cartelas (sorteio_id, numero, status, numeros_grade) VALUES ($1, $2, $3, $4)',
          [data.sorteio_id, nextNum, 'disponivel', numerosGradeJson]
        );
        return res.json({ data: [{ success: true, numero: nextNum }] });
      }

      // ================== CARTELAS VALIDADAS ==================
      case 'getCartelasValidadas': {
        result = await client.query(
          'SELECT id, numero, comprador_nome, created_at FROM cartelas_validadas WHERE sorteio_id = $1 ORDER BY created_at ASC',
          [data.sorteio_id]
        );
        return res.json({ data: result.rows });
      }

      case 'validarCartela': {
        // data.sorteio_id, data.numero, data.comprador_nome (optional)
        const numero = Number(data.numero);
        if (!numero || numero < 1) {
          return res.status(400).json({ error: 'Número de cartela inválido' });
        }
        // Verify cartela exists for this sorteio
        const cartelaCheck = await client.query(
          'SELECT numero FROM cartelas WHERE sorteio_id = $1 AND numero = $2',
          [data.sorteio_id, numero]
        );
        if (cartelaCheck.rows.length === 0) {
          return res.status(404).json({ error: `Cartela ${numero} não encontrada neste sorteio` });
        }
        // Upsert validation record
        if (dbConfig.type === 'mysql') {
          await client.query(
            `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
             ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
            [data.sorteio_id, numero, data.comprador_nome || null]
          );
        } else {
          await client.query(
            `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
             VALUES ($1, $2, $3)
             ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
            [data.sorteio_id, numero, data.comprador_nome || null]
          );
        }
        return res.json({ data: [{ success: true, numero }] });
      }

      case 'removerValidacaoCartela': {
        // data.sorteio_id, data.numero
        await client.query(
          'DELETE FROM cartelas_validadas WHERE sorteio_id = $1 AND numero = $2',
          [data.sorteio_id, Number(data.numero)]
        );
        return res.json({ data: [{ success: true }] });
      }

      case 'validarCartelas': {
        // data.sorteio_id, data.numeros: number[], data.comprador_nome (optional)
        const numeros = (data.numeros || []).map(Number).filter(n => n > 0);
        if (numeros.length === 0) {
          return res.status(400).json({ error: 'Nenhum número de cartela válido fornecido' });
        }
        // Verify all cartelas exist for this sorteio
        const placeholders = numeros.map((_, i) => `$${i + 2}`).join(', ');
        const existCheck = await client.query(
          `SELECT numero FROM cartelas WHERE sorteio_id = $1 AND numero IN (${placeholders})`,
          [data.sorteio_id, ...numeros]
        );
        const existentes = new Set(existCheck.rows.map(r => r.numero));
        const naoEncontradas = numeros.filter(n => !existentes.has(n));
        if (naoEncontradas.length > 0) {
          return res.status(404).json({ error: `Cartelas não encontradas neste sorteio: ${naoEncontradas.join(', ')}` });
        }
        if (dbConfig.type === 'postgres') {
          await client.query(
            `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
             SELECT $1, x.numero, $2
             FROM UNNEST($3::int[]) AS x(numero)
             ON CONFLICT (sorteio_id, numero)
             DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
            [data.sorteio_id, data.comprador_nome || null, numeros]
          );
        } else {
          // Upsert all validations (MySQL fallback)
          for (const num of numeros) {
            await client.query(
              `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
               ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
              [data.sorteio_id, num, data.comprador_nome || null]
            );
          }
        }
        return res.json({ data: [{ success: true, count: numeros.length }] });
      }

      case 'getCartelasValidadasComGrade': {
        result = await client.query(
          `SELECT cv.numero, cv.comprador_nome, c.numeros_grade
           FROM cartelas_validadas cv
           INNER JOIN cartelas c ON c.sorteio_id = cv.sorteio_id AND c.numero = cv.numero
           WHERE cv.sorteio_id = $1 AND c.numeros_grade IS NOT NULL
           ORDER BY cv.created_at ASC`,
          [data.sorteio_id]
        );
        const rows = result.rows.map((row) => {
          let raw;
          try {
            raw = Array.isArray(row.numeros_grade) ? row.numeros_grade : JSON.parse(row.numeros_grade);
          } catch {
            return { ...row, numeros_grade: [] };
          }
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            return { ...row, numeros_grade: [raw] };
          }
          return { ...row, numeros_grade: raw };
        });
        return res.json({ data: rows });
      }

      case 'removerValidacaoLote': {
        // data.sorteio_id, data.numeros: number[]
        const numeros = (data.numeros || []).map(Number).filter(n => n > 0);
        if (numeros.length === 0) {
          return res.json({ data: [{ success: true }] });
        }
        const placeholders = numeros.map((_, i) => `$${i + 2}`).join(', ');
        await client.query(
          `DELETE FROM cartelas_validadas WHERE sorteio_id = $1 AND numero IN (${placeholders})`,
          [data.sorteio_id, ...numeros]
        );
        return res.json({ data: [{ success: true, count: numeros.length }] });
      }

      case 'removerTodasValidacoes': {
        // data.sorteio_id
        const delResult = await client.query(
          'DELETE FROM cartelas_validadas WHERE sorteio_id = $1',
          [data.sorteio_id]
        );
        return res.json({ data: [{ success: true, count: delResult.rowCount }] });
      }

      case 'updateCartelaValidada': {
        // data.sorteio_id, data.numero, data.comprador_nome
        const numero = Number(data.numero);
        if (!numero || numero < 1) {
          return res.status(400).json({ error: 'Número de cartela inválido' });
        }
        await client.query(
          'UPDATE cartelas_validadas SET comprador_nome = $1 WHERE sorteio_id = $2 AND numero = $3',
          [data.comprador_nome || null, data.sorteio_id, numero]
        );
        return res.json({ data: [{ success: true, numero }] });
      }

      case 'verificarVencedor': {
        // data.sorteio_id, data.numeros_sorteados: number[]
        // Only considers validated cartelas (cartelas_validadas table)
        const numerosSet = new Set((data.numeros_sorteados || []).map(Number));
        const cartelasResult = await client.query(
          `SELECT c.numero, c.numeros_grade
           FROM cartelas c
           INNER JOIN cartelas_validadas cv ON cv.sorteio_id = c.sorteio_id AND cv.numero = c.numero
           WHERE c.sorteio_id = $1 AND c.numeros_grade IS NOT NULL
           ORDER BY c.numero`,
          [data.sorteio_id]
        );
        const vencedoras = [];
        for (const row of cartelasResult.rows) {
          let raw;
          try {
            raw = Array.isArray(row.numeros_grade) ? row.numeros_grade : JSON.parse(row.numeros_grade);
          } catch {
            continue;
          }
          // Normalize to number[][] - use first prize grid for winner check
          let grade;
          if (!Array.isArray(raw) || raw.length === 0) continue;
          if (typeof raw[0] === 'number') {
            grade = raw; // old flat format
          } else {
            grade = Array.isArray(raw[0]) ? raw[0] : []; // new format: take first prize grid
          }
          const required = grade.filter((n) => n !== 0);
          if (required.length > 0 && required.every((n) => numerosSet.has(Number(n)))) {
            vencedoras.push(row.numero);
          }
        }
        return res.json({ data: vencedoras });
      }

      // ================== ATRIBUIÇÕES ==================
      case 'getAtribuicoes':
        result = await client.query(`
          SELECT a.*, v.nome as vendedor_nome,
            COALESCE(json_agg(
              json_build_object(
                'numero', ac.numero_cartela,
                'status', ac.status,
                'data_atribuicao', ac.data_atribuicao,
                'data_devolucao', ac.data_devolucao,
                'venda_id', ac.venda_id
              ) ORDER BY ac.numero_cartela
            ) FILTER (WHERE ac.id IS NOT NULL), '[]') as cartelas
          FROM atribuicoes a
          LEFT JOIN vendedores v ON a.vendedor_id = v.id
          LEFT JOIN atribuicao_cartelas ac ON a.id = ac.atribuicao_id
          WHERE a.sorteio_id = $1
          GROUP BY a.id, v.nome
          ORDER BY v.nome
        `, [data.sorteio_id]);
        return res.json({ data: result.rows });

      case 'createAtribuicao': {
        const atribResult = await client.query(`
          INSERT INTO atribuicoes (sorteio_id, vendedor_id)
          VALUES ($1, $2)
          RETURNING *
        `, [data.sorteio_id, data.vendedor_id]);
        
        const atribuicaoId = atribResult.rows[0].id;
        
        for (const cartela of data.cartelas) {
          await client.query(`
            INSERT INTO atribuicao_cartelas (atribuicao_id, numero_cartela, status, data_atribuicao)
            VALUES ($1, $2, 'ativa', NOW())
          `, [atribuicaoId, cartela]);
          
          await client.query(`
            UPDATE cartelas SET status = 'ativa', vendedor_id = $1 WHERE sorteio_id = $2 AND numero = $3
          `, [data.vendedor_id, data.sorteio_id, cartela]);
        }
        
        return res.json({ data: atribResult.rows });
      }

      case 'addCartelasToAtribuicao':
        for (const cartela of data.cartelas) {
          await client.query(`
            INSERT INTO atribuicao_cartelas (atribuicao_id, numero_cartela, status, data_atribuicao)
            VALUES ($1, $2, 'ativa', NOW())
          `, [data.atribuicao_id, cartela]);
          
          await client.query(`
            UPDATE cartelas SET status = 'ativa', vendedor_id = $1 WHERE sorteio_id = $2 AND numero = $3
          `, [data.vendedor_id, data.sorteio_id, cartela]);
        }
        return res.json({ data: [{ success: true }] });

      case 'removeCartelaFromAtribuicao':
        {
        const cartelaAtribuida = await client.query(
          'SELECT status FROM atribuicao_cartelas WHERE atribuicao_id = $1 AND numero_cartela = $2',
          [data.atribuicao_id, data.numero_cartela]
        );

        if (cartelaAtribuida.rows.length === 0) {
          return res.status(404).json({ error: 'Cartela não encontrada nesta atribuição' });
        }

        if (cartelaAtribuida.rows[0].status === 'vendida') {
          return res.status(400).json({ error: 'Não é possível remover cartela vendida da atribuição' });
        }

        await client.query(`
          DELETE FROM atribuicao_cartelas WHERE atribuicao_id = $1 AND numero_cartela = $2
        `, [data.atribuicao_id, data.numero_cartela]);
        
        await client.query(`
          UPDATE cartelas SET status = 'disponivel', vendedor_id = NULL WHERE sorteio_id = $1 AND numero = $2
        `, [data.sorteio_id, data.numero_cartela]);
        
        return res.json({ data: [{ success: true }] });
        }

      case 'updateCartelaStatusInAtribuicao':
        await client.query(`
          UPDATE atribuicao_cartelas 
          SET status = $3, data_devolucao = CASE WHEN $3 = 'devolvida' THEN NOW() ELSE NULL END
          WHERE atribuicao_id = $1 AND numero_cartela = $2
        `, [data.atribuicao_id, data.numero_cartela, data.status]);
        
        await client.query(`
          UPDATE cartelas
          SET status = $3,
              vendedor_id = CASE WHEN $3 IN ('disponivel', 'devolvida') THEN NULL ELSE vendedor_id END
          WHERE sorteio_id = $1 AND numero = $2
        `, [data.sorteio_id, data.numero_cartela, data.status]);
        
        return res.json({ data: [{ success: true }] });

      case 'transferirCartelas': {
        const cartelas = data.numeros_cartelas;
        if (!cartelas || cartelas.length === 0) {
          return res.status(400).json({ error: 'Nenhuma cartela selecionada para transferência' });
        }

        const destAtrib = await client.query(
          'SELECT id FROM atribuicoes WHERE sorteio_id = $1 AND vendedor_id = $2',
          [data.sorteio_id, data.vendedor_destino_id]
        );

        let destAtribId;
        if (destAtrib.rows.length > 0) {
          destAtribId = destAtrib.rows[0].id;
        } else {
          const newAtribResult = await client.query(
            'INSERT INTO atribuicoes (sorteio_id, vendedor_id) VALUES ($1, $2) RETURNING id',
            [data.sorteio_id, data.vendedor_destino_id]
          );
          destAtribId = newAtribResult.rows[0].id;
        }

        for (const numeroCartela of cartelas) {
          await client.query(
            'DELETE FROM atribuicao_cartelas WHERE atribuicao_id = $1 AND numero_cartela = $2',
            [data.atribuicao_origem_id, numeroCartela]
          );
          await client.query(
            'INSERT INTO atribuicao_cartelas (atribuicao_id, numero_cartela, status, data_atribuicao) VALUES ($1, $2, \'ativa\', NOW())',
            [destAtribId, numeroCartela]
          );
          await client.query(
            'UPDATE cartelas SET vendedor_id = $1 WHERE sorteio_id = $2 AND numero = $3',
            [data.vendedor_destino_id, data.sorteio_id, numeroCartela]
          );
        }

        const remainingInOrigin = await client.query(
          'SELECT COUNT(*) as count FROM atribuicao_cartelas WHERE atribuicao_id = $1',
          [data.atribuicao_origem_id]
        );
        
        if (parseInt(remainingInOrigin.rows[0].count) === 0) {
          await client.query('DELETE FROM atribuicoes WHERE id = $1', [data.atribuicao_origem_id]);
        }

        return res.json({ data: [{ success: true, count: cartelas.length }] });
      }

      case 'deleteAtribuicao': {
        const vendidasResult = await client.query(
          "SELECT 1 FROM atribuicao_cartelas WHERE atribuicao_id = $1 AND status = 'vendida' LIMIT 1",
          [data.atribuicao_id]
        );

        if (vendidasResult.rows.length > 0) {
          return res.status(400).json({ error: 'Não é possível excluir atribuição com cartela(s) vendida(s)' });
        }

        const cartelasResult = await client.query(
          'SELECT numero_cartela FROM atribuicao_cartelas WHERE atribuicao_id = $1',
          [data.atribuicao_id]
        );
        
        for (const row of cartelasResult.rows) {
          await client.query(
            'UPDATE cartelas SET status = \'disponivel\', vendedor_id = NULL WHERE sorteio_id = $1 AND numero = $2',
            [data.sorteio_id, row.numero_cartela]
          );
        }
        
        await client.query('DELETE FROM atribuicao_cartelas WHERE atribuicao_id = $1', [data.atribuicao_id]);
        await client.query('DELETE FROM atribuicoes WHERE id = $1', [data.atribuicao_id]);
        
        return res.json({ data: [{ success: true }] });
      }

      // ================== VENDAS ==================
      case 'getVendas':
        result = await client.query(`
          SELECT ve.*, v.nome as vendedor_nome,
            COALESCE(json_agg(
              json_build_object(
                'forma_pagamento', p.forma_pagamento,
                'valor', p.valor
              ) ORDER BY p.created_at
            ) FILTER (WHERE p.id IS NOT NULL), '[]') as pagamentos
          FROM vendas ve
          LEFT JOIN vendedores v ON ve.vendedor_id = v.id
          LEFT JOIN pagamentos p ON ve.id = p.venda_id
          WHERE ve.sorteio_id = $1
          GROUP BY ve.id, v.nome
          ORDER BY ve.data_venda DESC
        `, [data.sorteio_id]);
        return res.json({ data: result.rows });

      case 'createVenda': {
        const vendaResult = await client.query(`
          INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, data_venda)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          RETURNING *
        `, [data.sorteio_id, data.vendedor_id, data.cliente_nome, data.cliente_telefone, data.numeros_cartelas, data.valor_total, data.valor_pago, data.status]);
        
        const vendaId = vendaResult.rows[0].id;
        
        if (data.pagamentos && data.pagamentos.length > 0) {
          for (const pag of data.pagamentos) {
            await client.query(
              'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
              [vendaId, pag.forma_pagamento, pag.valor]
            );
          }
        }
        
        const numerosVenda = data.numeros_cartelas.split(',').map(n => parseInt(n.trim()));
        for (const numero of numerosVenda) {
          await client.query(
            'UPDATE cartelas SET status = \'vendida\' WHERE sorteio_id = $1 AND numero = $2',
            [data.sorteio_id, numero]
          );
          await client.query(`
            UPDATE atribuicao_cartelas SET status = 'vendida', venda_id = $1 
            WHERE numero_cartela = $2 AND atribuicao_id IN (
              SELECT id FROM atribuicoes WHERE sorteio_id = $3 AND vendedor_id = $4
            )
          `, [vendaId, numero, data.sorteio_id, data.vendedor_id]);
        }

        // Auto-assign cliente_nome to validated cartelas when a name is provided
        if (data.cliente_nome) {
          for (const numero of numerosVenda) {
            await client.query(
              `UPDATE cartelas_validadas SET comprador_nome = $1
               WHERE sorteio_id = $2 AND numero = $3 AND (comprador_nome IS NULL OR trim(comprador_nome) = '')`,
              [data.cliente_nome, data.sorteio_id, numero]
            );
          }
        }
        
        return res.json({ data: vendaResult.rows });
      }

      case 'updateVenda': {
        const oldVendaResult = await client.query(
          'SELECT numeros_cartelas, vendedor_id FROM vendas WHERE id = $1',
          [data.id]
        );
        const oldVenda = oldVendaResult.rows[0];
        const oldNumeros = oldVenda?.numeros_cartelas?.split(',').map(n => parseInt(n.trim())) || [];
        const newNumeros = data.numeros_cartelas.split(',').map(n => parseInt(n.trim()));
        
        const removedCartelas = oldNumeros.filter(n => !newNumeros.includes(n));
        for (const numero of removedCartelas) {
          await client.query(
            'UPDATE cartelas SET status = \'ativa\' WHERE sorteio_id = $1 AND numero = $2',
            [data.sorteio_id, numero]
          );
          await client.query(`
            UPDATE atribuicao_cartelas SET status = 'ativa', venda_id = NULL 
            WHERE numero_cartela = $1 AND atribuicao_id IN (
              SELECT id FROM atribuicoes WHERE sorteio_id = $2
            )
          `, [numero, data.sorteio_id]);
        }
        
        const addedCartelas = newNumeros.filter(n => !oldNumeros.includes(n));
        for (const numero of addedCartelas) {
          await client.query(
            'UPDATE cartelas SET status = \'vendida\' WHERE sorteio_id = $1 AND numero = $2',
            [data.sorteio_id, numero]
          );
          await client.query(`
            UPDATE atribuicao_cartelas SET status = 'vendida', venda_id = $1 
            WHERE numero_cartela = $2 AND atribuicao_id IN (
              SELECT id FROM atribuicoes WHERE sorteio_id = $3 AND vendedor_id = $4
            )
          `, [data.id, numero, data.sorteio_id, data.vendedor_id]);
        }
        
        await client.query('DELETE FROM pagamentos WHERE venda_id = $1', [data.id]);
        if (data.pagamentos && data.pagamentos.length > 0) {
          for (const pag of data.pagamentos) {
            await client.query(
              'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
              [data.id, pag.forma_pagamento, pag.valor]
            );
          }
        }
        
        result = await client.query(`
          UPDATE vendas 
          SET vendedor_id = $2, cliente_nome = $3, cliente_telefone = $4, numeros_cartelas = $5, 
              valor_total = $6, valor_pago = $7, status = $8, updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `, [data.id, data.vendedor_id, data.cliente_nome, data.cliente_telefone, data.numeros_cartelas, data.valor_total, data.valor_pago, data.status]);
        return res.json({ data: result.rows });
      }

      case 'deleteVenda': {
        const vendaToDeleteResult = await client.query(
          'SELECT numeros_cartelas, sorteio_id, vendedor_id FROM vendas WHERE id = $1',
          [data.id]
        );
        const vendaToDelete = vendaToDeleteResult.rows[0];
        
        if (vendaToDelete) {
          const numerosToReturn = vendaToDelete.numeros_cartelas.split(',').map(n => parseInt(n.trim()));
          
          for (const numero of numerosToReturn) {
            await client.query(
              'UPDATE cartelas SET status = \'ativa\' WHERE sorteio_id = $1 AND numero = $2',
              [vendaToDelete.sorteio_id, numero]
            );
            await client.query(`
              UPDATE atribuicao_cartelas SET status = 'ativa', venda_id = NULL 
              WHERE numero_cartela = $1 AND atribuicao_id IN (
                SELECT id FROM atribuicoes WHERE sorteio_id = $2
              )
            `, [numero, vendaToDelete.sorteio_id]);
            // Reset loja_cartelas to disponivel for the returned cards
            await client.query(`
              UPDATE loja_cartelas SET status = 'disponivel', comprador_nome = NULL, comprador_email = NULL,
                comprador_endereco = NULL, comprador_cidade = NULL, comprador_telefone = NULL, updated_at = NOW()
              WHERE numero_cartela = $1 AND status = 'vendida' AND card_set_id IN (
                SELECT id FROM bingo_card_sets WHERE sorteio_id = $2
              )
            `, [numero, vendaToDelete.sorteio_id]);
          }
        }
        
        await client.query('DELETE FROM pagamentos WHERE venda_id = $1', [data.id]);
        await client.query('DELETE FROM vendas WHERE id = $1', [data.id]);
        
        return res.json({ data: [{ success: true }] });
      }

      case 'addPagamento': {
        await client.query(`
          INSERT INTO pagamentos (venda_id, forma_pagamento, valor, observacao, data_pagamento)
          VALUES ($1, $2, $3, $4, NOW())
        `, [data.venda_id, data.forma_pagamento, data.valor, data.observacao]);
        
        const totalPaidResult = await client.query(
          'SELECT COALESCE(SUM(valor), 0) as total_pago FROM pagamentos WHERE venda_id = $1',
          [data.venda_id]
        );
        const totalPaid = parseFloat(totalPaidResult.rows[0].total_pago) || 0;
        
        const vendaInfoResult = await client.query(
          'SELECT valor_total FROM vendas WHERE id = $1',
          [data.venda_id]
        );
        const valorTotal = parseFloat(vendaInfoResult.rows[0].valor_total) || 0;
        
        const newStatus = totalPaid >= valorTotal ? 'concluida' : 'pendente';
        
        await client.query(
          'UPDATE vendas SET valor_pago = $2, status = $3, updated_at = NOW() WHERE id = $1',
          [data.venda_id, totalPaid, newStatus]
        );
        
        return res.json({ data: [{ success: true, total_pago: totalPaid, status: newStatus }] });
      }

      // ================== BINGO CARD SETS (LAYOUTS) ==================
      case 'getCartelaLayouts':
        result = await client.query(
          'SELECT id, sorteio_id, nome, layout_data, cards_data, created_at, updated_at FROM bingo_card_sets WHERE sorteio_id = $1 ORDER BY created_at DESC',
          [data.sorteio_id]
        );
        return res.json({ data: result.rows });

      case 'saveCartelaLayout': {
        // Each sorteio can only have one card set: upsert (update if exists, insert if not)
        const existingLayout = await client.query(
          'SELECT id FROM bingo_card_sets WHERE sorteio_id = $1 LIMIT 1',
          [data.sorteio_id]
        );
        if (existingLayout.rows.length > 0) {
          result = await client.query(
            'UPDATE bingo_card_sets SET nome = $2, layout_data = $3, cards_data = $4, updated_at = NOW() WHERE id = $1 RETURNING *',
            [existingLayout.rows[0].id, data.nome, data.layout_data, data.cards_data]
          );
        } else {
          result = await client.query(
            'INSERT INTO bingo_card_sets (sorteio_id, nome, layout_data, cards_data) VALUES ($1, $2, $3, $4) RETURNING *',
            [data.sorteio_id, data.nome, data.layout_data, data.cards_data]
          );
        }
        return res.json({ data: result.rows[0] });
      }

      case 'updateCartelaLayout': {
        result = await client.query(
          'UPDATE bingo_card_sets SET nome = $2, layout_data = $3, cards_data = $4, updated_at = NOW() WHERE id = $1 RETURNING *',
          [data.id, data.nome, data.layout_data, data.cards_data]
        );
        return res.json({ data: result.rows[0] });
      }

      case 'deleteCartelaLayout':
        await client.query('DELETE FROM bingo_card_sets WHERE id = $1', [data.id]);
        return res.json({ data: [{ success: true }] });

      // ================== PLANOS ==================
      case 'getPublicPlanos':
        result = await client.query('SELECT id, nome, valor, descricao, ativo, stripe_price_id FROM planos WHERE ativo = true ORDER BY valor ASC');
        return res.json({ data: result.rows });

      case 'getPlanos':
        result = await client.query('SELECT * FROM planos ORDER BY valor ASC');
        return res.json({ data: result.rows });

      case 'createPlano': {
        result = await client.query(
          `INSERT INTO planos (nome, valor, descricao, stripe_price_id) VALUES ($1, $2, $3, $4) RETURNING *`,
          [data.nome, data.valor || 0, data.descricao || null, data.stripe_price_id || null]
        );
        return res.json({ data: result.rows[0] });
      }

      case 'updatePlano': {
        result = await client.query(
          `UPDATE planos SET nome = $2, valor = $3, descricao = $4, stripe_price_id = $5, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [data.id, data.nome, data.valor || 0, data.descricao || null, data.stripe_price_id || null]
        );
        return res.json({ data: result.rows[0] });
      }

      case 'deletePlano':
        await client.query('DELETE FROM planos WHERE id = $1', [data.id]);
        return res.json({ success: true });

      case 'assignUserPlan': {
        const planoId = data.plano_id || null;
        if (planoId) {
          const now = new Date();
          const vencimento = nextMonthSameDay(now);
          await client.query(
            'UPDATE usuarios SET plano_id = $2, plano_inicio = $3, plano_vencimento = $4, updated_at = NOW() WHERE id = $1',
            [data.user_id, planoId, now, vencimento]
          );
        } else {
          await client.query(
            'UPDATE usuarios SET plano_id = NULL, plano_inicio = NULL, plano_vencimento = NULL, updated_at = NOW() WHERE id = $1',
            [data.user_id]
          );
        }
        return res.json({ success: true });
      }

      case 'createStripeCheckout': {
        const cfgResult = await client.query('SELECT chave, valor FROM configuracoes WHERE chave IN ($1, $2)', ['stripe_secret_key', 'stripe_webhook_secret']);
        let stripeSecretKey = '';
        cfgResult.rows.forEach(r => {
          if (r.chave === 'stripe_secret_key') stripeSecretKey = r.valor || '';
        });
        if (!stripeSecretKey) {
          return res.status(400).json({ error: 'Stripe não configurado. Contate o administrador.' });
        }
        const planoResult = await client.query('SELECT id, nome, valor, stripe_price_id FROM planos WHERE id = $1 AND ativo = true', [data.plano_id]);
        if (planoResult.rows.length === 0) {
          return res.status(404).json({ error: 'Plano não encontrado.' });
        }
        const plano = planoResult.rows[0];
        const stripe = Stripe(stripeSecretKey);
        const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;

        const isValidPath = (p) => typeof p === 'string' && /^\/[a-zA-Z0-9/_?=&-]*$/.test(p) && !p.includes('//') && !p.includes('..');
        const successPath = isValidPath(data.success_path) ? data.success_path : '/planos';
        const cancelPath = isValidPath(data.cancel_path) ? data.cancel_path : '/planos';

        const successUrl = successPath.includes('?')
          ? `${baseUrl}${successPath}&session_id={CHECKOUT_SESSION_ID}`
          : `${baseUrl}${successPath}?session_id={CHECKOUT_SESSION_ID}`;

        let sessionParams = {
          mode: 'payment',
          success_url: successUrl,
          cancel_url: `${baseUrl}${cancelPath}`,
          metadata: { user_id: data.authenticated_user_id, plano_id: plano.id },
          client_reference_id: data.authenticated_user_id,
        };

        if (plano.stripe_price_id) {
          sessionParams.line_items = [{ price: plano.stripe_price_id, quantity: 1 }];
        } else {
          const valorCentavos = Math.round(Number(plano.valor) * 100);
          sessionParams.line_items = [{
            price_data: {
              currency: 'brl',
              product_data: { name: plano.nome },
              unit_amount: valorCentavos,
            },
            quantity: 1,
          }];
        }

        const session = await stripe.checkout.sessions.create(sessionParams);
        return res.json({ url: session.url });
      }

      case 'confirmStripeCheckout': {
        if (!data.session_id) {
          return res.status(400).json({ error: 'Session ID não informado.' });
        }
        const confirmCfgResult = await client.query(
          'SELECT chave, valor FROM configuracoes WHERE chave = $1',
          ['stripe_secret_key']
        );
        const confirmStripeKey = confirmCfgResult.rows.length > 0 ? confirmCfgResult.rows[0].valor || '' : '';
        if (!confirmStripeKey) {
          return res.status(400).json({ error: 'Stripe não configurado.' });
        }
        const confirmStripe = Stripe(confirmStripeKey);
        const checkoutSession = await confirmStripe.checkout.sessions.retrieve(data.session_id);
        if (checkoutSession.client_reference_id !== data.authenticated_user_id) {
          return res.status(403).json({ error: 'Sessão de pagamento inválida.' });
        }
        if (checkoutSession.payment_status !== 'paid' && checkoutSession.payment_status !== 'no_payment_required') {
          return res.status(402).json({ error: 'Pagamento não confirmado.' });
        }
        const sessionPlanoId = checkoutSession.metadata && checkoutSession.metadata.plano_id;
        if (!sessionPlanoId) {
          return res.status(400).json({ error: 'Plano não identificado na sessão.' });
        }
        const confirmNow = new Date();
        const confirmVencimento = nextMonthSameDay(confirmNow);
        await client.query(
          'UPDATE usuarios SET plano_id = $1, plano_inicio = $2, plano_vencimento = $3, updated_at = NOW() WHERE id = $4',
          [sessionPlanoId, confirmNow, confirmVencimento, data.authenticated_user_id]
        );
        const confirmedUserResult = await client.query(
          'SELECT id, email, nome, role, ativo, titulo_sistema, avatar_url, created_at, updated_at, plano_id, gratuidade_vitalicia, plano_inicio, plano_vencimento FROM usuarios WHERE id = $1',
          [data.authenticated_user_id]
        );
        return res.json({ user: confirmedUserResult.rows[0] });
      }

      case 'grantLifetimeAccess':
        await client.query(
          'UPDATE usuarios SET gratuidade_vitalicia = $2, updated_at = NOW() WHERE id = $1',
          [data.user_id, data.gratuidade_vitalicia ? true : false]
        );
        return res.json({ success: true });

      // ================== CONFIGURACOES ==================
      case 'getPublicConfiguracoes': {
        result = await client.query("SELECT valor FROM configuracoes WHERE chave = 'favicon_url'");
        const faviconUrl = result.rows.length > 0 ? result.rows[0].valor : null;
        return res.json({ data: { favicon_url: faviconUrl } });
      }

      case 'getConfiguracoes': {
        result = await client.query('SELECT chave, valor FROM configuracoes');
        const config = {};
        result.rows.forEach(row => { config[row.chave] = row.valor; });
        return res.json({ data: config });
      }

      case 'updateConfiguracoes': {
        const entries = Object.entries(data.config || {});
        for (const [chave, valor] of entries) {
          if (dbConfig.type === 'mysql') {
            await client.query(
              `INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = NOW()`,
              [chave, valor]
            );
          } else {
            await client.query(
              `INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
              [chave, valor]
            );
          }
        }
        return res.json({ success: true });
      }

      // ================== LOJA PÚBLICA ==================
      case 'getLojaPublica': {
        // Public: get store by short_id (new format) or user_id (legacy)
        let lojaUserId = data.user_id;
        let lojaSorteioId = null;

        if (data.short_id) {
          // New URL format: lookup sorteio by short_id
          const sorteioByShortId = await client.query(
            'SELECT id, user_id FROM sorteios WHERE short_id = $1',
            [data.short_id]
          );
          if (sorteioByShortId.rows.length === 0) {
            return res.status(404).json({ error: 'Loja não encontrada.' });
          }
          lojaSorteioId = sorteioByShortId.rows[0].id;
          lojaUserId = sorteioByShortId.rows[0].user_id;
        }

        if (!lojaUserId || lojaUserId === 'undefined') {
          return res.status(404).json({ error: 'Loja não encontrada.' });
        }

        const ownerResult = await client.query(
          'SELECT id, nome, titulo_sistema FROM usuarios WHERE id = $1 AND ativo = true',
          [lojaUserId]
        );
        if (ownerResult.rows.length === 0) {
          return res.status(404).json({ error: 'Loja não encontrada.' });
        }
        const owner = ownerResult.rows[0];
        const ownerConfigResult = await client.query(
          "SELECT chave, valor FROM user_configuracoes WHERE user_id = $1 AND chave IN ('loja_favicon_url', 'loja_logo_url', 'loja_hero_image_url')",
          [lojaUserId]
        );
        const ownerConfig = {};
        ownerConfigResult.rows.forEach((row) => {
          ownerConfig[row.chave] = row.valor;
        });

        // Build WHERE clause: filter by user_id, optionally by sorteio
        const lojaParams = [lojaUserId, 'disponivel'];
        let lojaWhere = 'lc.user_id = $1 AND lc.status = $2';
        if (lojaSorteioId) {
          lojaParams.push(lojaSorteioId);
          lojaWhere += ` AND bcs.sorteio_id = $${lojaParams.length}`;
        }
        const lojaResult = await client.query(
          `SELECT lc.id, lc.numero_cartela, lc.preco, lc.status, lc.card_data, lc.layout_data,
                  bcs.sorteio_id, s.nome as sorteio_nome, s.data_sorteio,
                  s.papel_largura, s.papel_altura
           FROM loja_cartelas lc
           JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id
           JOIN sorteios s ON bcs.sorteio_id = s.id
           WHERE ${lojaWhere}
           ORDER BY s.data_sorteio DESC, s.nome ASC, lc.numero_cartela ASC`,
          lojaParams
        );
        return res.json({
          owner: {
            id: owner.id,
            nome: owner.nome,
            titulo_sistema: owner.titulo_sistema,
            favicon_url: ownerConfig.loja_favicon_url || null,
            logo_url: ownerConfig.loja_logo_url || null,
            hero_image_url: ownerConfig.loja_hero_image_url || null,
          },
          cartelas: lojaResult.rows,
          total: lojaResult.rows.length,
          payment_gateway: await getUserPaymentGateway(client, lojaUserId),
        });
      }

      case 'getMinhaLoja': {
        let minhaLojaUserId = data.authenticated_user_id;
        if (data.authenticated_role === 'admin' && data.sorteio_id) {
          const ownerRes = await client.query('SELECT user_id FROM sorteios WHERE id = $1', [data.sorteio_id]);
          if (ownerRes.rows.length > 0) minhaLojaUserId = ownerRes.rows[0].user_id;
        }
        const minhaLojaResult = await client.query(
          `SELECT lc.id, lc.card_set_id, lc.numero_cartela, lc.preco, lc.status, lc.comprador_nome, lc.card_data, lc.created_at, bcs.nome as card_set_nome
           FROM loja_cartelas lc
           LEFT JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id
           WHERE lc.user_id = $1
           ORDER BY lc.numero_cartela ASC`,
          [minhaLojaUserId]
        );
        return res.json({ data: minhaLojaResult.rows });
      }


      case 'adicionarCartelaLoja': {
        if (!data.card_set_id || !data.numero_cartela || !data.card_data) {
          return res.status(400).json({ error: 'Dados incompletos.' });
        }
        const preco = Number(data.preco) >= 0 ? Number(data.preco) : 0;
        const layoutData = data.layout_data || '';
        const vendedorIdLoja = data.vendedor_id || null;
        // When admin adds a cartela, use the sorteio owner's user_id
        let lojaUserId = data.authenticated_user_id;
        if (data.authenticated_role === 'admin') {
          const ownerLookup = await client.query(
            'SELECT s.user_id FROM bingo_card_sets bcs JOIN sorteios s ON bcs.sorteio_id = s.id WHERE bcs.id = $1',
            [data.card_set_id]
          );
          if (ownerLookup.rows.length > 0) lojaUserId = ownerLookup.rows[0].user_id;
        }
        if (dbConfig.type === 'mysql') {
          const insertResult = await client.query(
            `INSERT IGNORE INTO loja_cartelas (id, user_id, card_set_id, numero_cartela, preco, card_data, layout_data, vendedor_id)
             VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7)`,
            [lojaUserId, data.card_set_id, data.numero_cartela, preco, data.card_data, layoutData, vendedorIdLoja]
          );
          if (insertResult.rows.affectedRows === 0) {
            return res.status(409).json({ error: 'Cartela já está na loja.', code: 'DUPLICATE_CARTELA' });
          }
          const inserted = await client.query(
            'SELECT * FROM loja_cartelas WHERE user_id = $1 AND card_set_id = $2 AND numero_cartela = $3',
            [lojaUserId, data.card_set_id, data.numero_cartela]
          );
          return res.json({ data: inserted.rows[0] });
        } else {
          result = await client.query(
            `INSERT INTO loja_cartelas (user_id, card_set_id, numero_cartela, preco, card_data, layout_data, vendedor_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, card_set_id, numero_cartela) DO NOTHING
             RETURNING *`,
            [lojaUserId, data.card_set_id, data.numero_cartela, preco, data.card_data, layoutData, vendedorIdLoja]
          );
          if (result.rows.length === 0) {
            return res.status(409).json({ error: 'Cartela já está na loja.', code: 'DUPLICATE_CARTELA' });
          }
          return res.json({ data: result.rows[0] });
        }
      }


      case 'removerCartelaLoja':
        if (data.authenticated_role === 'admin') {
          await client.query('DELETE FROM loja_cartelas WHERE id = $1', [data.id]);
        } else {
          await client.query(
            'DELETE FROM loja_cartelas WHERE id = $1 AND user_id = $2',
            [data.id, data.authenticated_user_id]
          );
        }
        return res.json({ success: true });

      case 'removerMultiplasCartelasLoja': {
        const ids = Array.isArray(data.ids) ? data.ids.filter(Boolean) : [];
        if (ids.length === 0) return res.json({ success: true });
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        if (data.authenticated_role === 'admin') {
          await client.query(
            `DELETE FROM loja_cartelas WHERE id IN (${placeholders})`,
            ids
          );
        } else {
          const placeholdersUser = ids.map((_, i) => `$${i + 2}`).join(',');
          await client.query(
            `DELETE FROM loja_cartelas WHERE user_id = $1 AND id IN (${placeholdersUser})`,
            [data.authenticated_user_id, ...ids]
          );
        }
        return res.json({ success: true });
      }

      case 'atualizarPrecoLojaCartela': {
        const novoPreco = Number(data.preco) >= 0 ? Number(data.preco) : 0;
        if (data.authenticated_role === 'admin') {
          await client.query(
            'UPDATE loja_cartelas SET preco = $1, updated_at = NOW() WHERE id = $2',
            [novoPreco, data.id]
          );
        } else {
          await client.query(
            'UPDATE loja_cartelas SET preco = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
            [novoPreco, data.id, data.authenticated_user_id]
          );
        }
        return res.json({ success: true });
      }

      case 'createStripeCheckoutCartela': {
        if (!data.loja_cartela_id) {
          return res.status(400).json({ error: 'Cartela não especificada.' });
        }
        const lojaCartelaResult = await client.query(
          'SELECT lc.*, u.nome as owner_nome FROM loja_cartelas lc JOIN usuarios u ON lc.user_id = u.id WHERE lc.id = $1 AND lc.status = $2',
          [data.loja_cartela_id, 'disponivel']
        );
        if (lojaCartelaResult.rows.length === 0) {
          return res.status(404).json({ error: 'Cartela não disponível para compra.' });
        }
        const lojaCartela = lojaCartelaResult.rows[0];
        const stripeKeyCartela = await getUserStripeSecretKey(client, lojaCartela.user_id);
        if (!stripeKeyCartela) {
          return res.status(400).json({ error: 'Pagamento online não configurado. Contate o vendedor.' });
        }
        const valorCentavos = Math.round(Number(lojaCartela.preco) * 100);
        if (valorCentavos < STRIPE_MIN_AMOUNT_CENTAVOS) {
          return res.status(400).json({ error: `Valor mínimo para pagamento online é R$ ${(STRIPE_MIN_AMOUNT_CENTAVOS / 100).toFixed(2).replace('.', ',')}.` });
        }
        const stripeCartela = Stripe(stripeKeyCartela);
        const baseUrlCartela = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
        const isValidPathCartela = (p) => typeof p === 'string' && /^\/[a-zA-Z0-9/_?=&-]*$/.test(p) && !p.includes('//') && !p.includes('..');
        const successPathCartela = isValidPathCartela(data.success_path) ? data.success_path : `/loja/${lojaCartela.user_id}`;
        const cancelPathCartela = isValidPathCartela(data.cancel_path) ? data.cancel_path : `/loja/${lojaCartela.user_id}`;
        const successUrlCartela = successPathCartela.includes('?')
          ? `${baseUrlCartela}${successPathCartela}&session_id={CHECKOUT_SESSION_ID}`
          : `${baseUrlCartela}${successPathCartela}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
        const cartelaSession = await stripeCartela.checkout.sessions.create({
          mode: 'payment',
          success_url: successUrlCartela,
          cancel_url: `${baseUrlCartela}${cancelPathCartela}`,
          customer_email: data.comprador_email || undefined,
          line_items: [{
            price_data: {
              currency: 'brl',
              product_data: { name: `Cartela ${String(lojaCartela.numero_cartela).padStart(3, '0')} — ${lojaCartela.owner_nome}` },
              unit_amount: valorCentavos,
            },
            quantity: 1,
          }],
          metadata: {
            type: 'cartela_loja',
            owner_user_id: lojaCartela.user_id,
            loja_cartela_id: lojaCartela.id,
            comprador_nome: data.comprador_nome || '',
            comprador_email: data.comprador_email || '',
            comprador_endereco: data.comprador_endereco || '',
            comprador_cidade: data.comprador_cidade || '',
            comprador_telefone: data.comprador_telefone || '',
          },
        });
        return res.json({ url: cartelaSession.url });
      }

      case 'confirmStripeCheckoutCartela': {
        if (!data.session_id) {
          return res.status(400).json({ error: 'Session ID não informado.' });
        }
        const stripeKeyConfirm = await getUserStripeSecretKey(client, data.owner_user_id || null);
        if (!stripeKeyConfirm) {
          return res.status(400).json({ error: 'Stripe não configurado.' });
        }
        const stripeConfirm = Stripe(stripeKeyConfirm);
        const cartelaCheckoutSession = await stripeConfirm.checkout.sessions.retrieve(data.session_id);
        if (cartelaCheckoutSession.payment_status !== 'paid' && cartelaCheckoutSession.payment_status !== 'no_payment_required') {
          return res.status(402).json({ error: 'Pagamento não confirmado.' });
        }
        const sessionMeta = cartelaCheckoutSession.metadata || {};
        if (sessionMeta.type !== 'cartela_loja' || !sessionMeta.loja_cartela_id) {
          return res.status(400).json({ error: 'Sessão inválida.' });
        }
        const lcConfirmResult = await client.query(
          'SELECT lc.*, bcs.sorteio_id, s.papel_largura, s.papel_altura, s.grade_colunas, s.grade_linhas, s.apenas_numero_rifa FROM loja_cartelas lc JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id JOIN sorteios s ON bcs.sorteio_id = s.id WHERE lc.id = $1',
          [sessionMeta.loja_cartela_id]
        );
        if (lcConfirmResult.rows.length === 0) {
          return res.status(404).json({ error: 'Cartela não encontrada.' });
        }
        const lcConfirm = lcConfirmResult.rows[0];
        const compradorNomeConfirm = sessionMeta.comprador_nome || '';
        const compradorEmailConfirm = sessionMeta.comprador_email || cartelaCheckoutSession.customer_email || '';
        const compradorEnderecoConfirm = sessionMeta.comprador_endereco || '';
        const compradorCidadeConfirm = sessionMeta.comprador_cidade || '';
        const compradorTelefoneConfirm = sessionMeta.comprador_telefone || '';
        await client.query(
          'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, stripe_session_id = $7, updated_at = NOW() WHERE id = $8',
          ['vendida', compradorNomeConfirm, compradorEmailConfirm, compradorEnderecoConfirm, compradorCidadeConfirm, compradorTelefoneConfirm, data.session_id, lcConfirm.id]
        );
        if (lcConfirm.sorteio_id) {
          await client.query(
            'UPDATE cartelas SET status = $1, comprador_nome = $2, updated_at = NOW() WHERE sorteio_id = $3 AND numero = $4',
            ['vendida', compradorNomeConfirm, lcConfirm.sorteio_id, lcConfirm.numero_cartela]
          );
          await client.query(
            `UPDATE atribuicao_cartelas SET status = 'vendida' WHERE numero_cartela = $1 AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $2)`,
            [lcConfirm.numero_cartela, lcConfirm.sorteio_id]
          );
          // Upsert into cartelas_validadas (Req 1)
          if (dbConfig.type === 'mysql') {
            await client.query(
              `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
               ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
              [lcConfirm.sorteio_id, lcConfirm.numero_cartela, compradorNomeConfirm || null]
            );
          } else {
            await client.query(
              `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
               VALUES ($1, $2, $3)
               ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
              [lcConfirm.sorteio_id, lcConfirm.numero_cartela, compradorNomeConfirm || null]
            );
          }
          // Insert into vendas — deduplicate by stripe_session_id
          const vendaExistCheck = await client.query(
            'SELECT id FROM vendas WHERE stripe_session_id = $1 LIMIT 1',
            [data.session_id]
          );
          if (vendaExistCheck.rows.length === 0) {
            let vendaIdConfirm;
            if (dbConfig.type === 'mysql') {
              await client.query(
                `INSERT INTO vendas (id, sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                 VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW())`,
                [lcConfirm.sorteio_id, lcConfirm.vendedor_id || null, compradorNomeConfirm || 'Comprador Online', compradorTelefoneConfirm || null, String(lcConfirm.numero_cartela), lcConfirm.preco, lcConfirm.preco, data.session_id]
              );
              const lastVendaC = await client.query('SELECT id FROM vendas ORDER BY created_at DESC LIMIT 1');
              vendaIdConfirm = lastVendaC.rows[0]?.id;
            } else {
              const vendaConfirmResult = await client.query(
                `INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW()) RETURNING id`,
                [lcConfirm.sorteio_id, lcConfirm.vendedor_id || null, compradorNomeConfirm || 'Comprador Online', compradorTelefoneConfirm || null, String(lcConfirm.numero_cartela), lcConfirm.preco, lcConfirm.preco, data.session_id]
              );
              vendaIdConfirm = vendaConfirmResult.rows[0]?.id;
            }
            if (vendaIdConfirm) {
              await client.query(
                'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
                [vendaIdConfirm, 'cartao', lcConfirm.preco]
              );
            }
          }
        }
        return res.json({
          success: true,
          numero_cartela: lcConfirm.numero_cartela,
          comprador_nome: compradorNomeConfirm,
          comprador_endereco: compradorEnderecoConfirm,
          comprador_cidade: compradorCidadeConfirm,
          comprador_telefone: compradorTelefoneConfirm,
          card_data: lcConfirm.card_data,
          layout_data: lcConfirm.layout_data,
          papel_largura: lcConfirm.papel_largura,
          papel_altura: lcConfirm.papel_altura,
          grade_colunas: lcConfirm.grade_colunas,
          grade_linhas: lcConfirm.grade_linhas,
          apenas_numero_rifa: lcConfirm.apenas_numero_rifa,
        });
      }

      case 'createStripeCheckoutMultiCartela': {
        const multiIds = Array.isArray(data.loja_cartela_ids) ? data.loja_cartela_ids.filter(Boolean) : [];
        if (multiIds.length === 0) {
          return res.status(400).json({ error: 'Nenhuma cartela selecionada.' });
        }
        if (multiIds.length > 20) {
          return res.status(400).json({ error: 'Selecione no máximo 20 cartelas por pedido.' });
        }
        // Fetch all cartelas first to get owner user_id
        const placeholders = multiIds.map((_, i) => `$${i + 1}`).join(',');
        const multiCartelasResult = await client.query(
          `SELECT lc.*, u.nome as owner_nome FROM loja_cartelas lc JOIN usuarios u ON lc.user_id = u.id WHERE lc.id IN (${placeholders}) AND lc.status = 'disponivel'`,
          multiIds
        );
        if (multiCartelasResult.rows.length === 0) {
          return res.status(404).json({ error: 'Nenhuma cartela disponível para compra.' });
        }
        if (multiCartelasResult.rows.length !== multiIds.length) {
          return res.status(400).json({ error: 'Uma ou mais cartelas não estão disponíveis para compra.' });
        }
        const multiCartelas = multiCartelasResult.rows;
        const stripeKeyMulti = await getUserStripeSecretKey(client, multiCartelas[0].user_id);
        if (!stripeKeyMulti) {
          return res.status(400).json({ error: 'Pagamento online não configurado. Contate o vendedor.' });
        }
        const stripeMulti = Stripe(stripeKeyMulti);
        const baseUrlMulti = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
        const isValidPathMulti = (p) => typeof p === 'string' && /^\/[a-zA-Z0-9/_?=&-]*$/.test(p) && !p.includes('//') && !p.includes('..');
        const successPathMulti = isValidPathMulti(data.success_path) ? data.success_path : `/loja/${multiCartelas[0].user_id}`;
        const cancelPathMulti = isValidPathMulti(data.cancel_path) ? data.cancel_path : `/loja/${multiCartelas[0].user_id}`;
        const successUrlMulti = successPathMulti.includes('?')
          ? `${baseUrlMulti}${successPathMulti}&session_id={CHECKOUT_SESSION_ID}`
          : `${baseUrlMulti}${successPathMulti}?payment=success&checkout_type=multi&session_id={CHECKOUT_SESSION_ID}`;
        const lineItems = multiCartelas.map(lc => {
          const valorCentavos = Math.round(Number(lc.preco) * 100);
          if (valorCentavos < STRIPE_MIN_AMOUNT_CENTAVOS) {
            throw Object.assign(new Error(`Cartela ${String(lc.numero_cartela).padStart(3, '0')}: valor mínimo para pagamento online é R$ ${(STRIPE_MIN_AMOUNT_CENTAVOS / 100).toFixed(2).replace('.', ',')}.`), { status: 400 });
          }
          return {
            price_data: {
              currency: 'brl',
              product_data: { name: `Cartela ${String(lc.numero_cartela).padStart(3, '0')} — ${lc.owner_nome}` },
              unit_amount: valorCentavos,
            },
            quantity: 1,
          };
        });
        // Store IDs in metadata split across keys to stay within Stripe's 500-char limit per value.
        // UUID = 36 chars + comma separator = 37 chars; 12 × 37 = 444 chars < 500-char limit.
        const idsChunks = [];
        for (let i = 0; i < multiIds.length; i += 12) {
          idsChunks.push(multiIds.slice(i, i + 12).join(','));
        }
        const idsMetadata = {};
        idsChunks.forEach((chunk, i) => { idsMetadata[`loja_cartela_ids${i === 0 ? '' : `_${i}`}`] = chunk; });
        const multiSession = await stripeMulti.checkout.sessions.create({
          mode: 'payment',
          success_url: successUrlMulti,
          cancel_url: `${baseUrlMulti}${cancelPathMulti}`,
          customer_email: data.comprador_email || undefined,
          line_items: lineItems,
          metadata: {
            type: 'cartela_loja_multi',
            owner_user_id: multiCartelas[0].user_id,
            comprador_nome: data.comprador_nome || '',
            comprador_email: data.comprador_email || '',
            comprador_endereco: data.comprador_endereco || '',
            comprador_cidade: data.comprador_cidade || '',
            comprador_telefone: data.comprador_telefone || '',
            ...idsMetadata,
          },
        });
        return res.json({ url: multiSession.url });
      }

      case 'confirmStripeCheckoutMultiCartela': {
        if (!data.session_id) {
          return res.status(400).json({ error: 'Session ID não informado.' });
        }
        const stripeKeyConfirmMulti = await getUserStripeSecretKey(client, data.owner_user_id || null);
        if (!stripeKeyConfirmMulti) {
          return res.status(400).json({ error: 'Stripe não configurado.' });
        }
        const stripeConfirmMulti = Stripe(stripeKeyConfirmMulti);
        const multiCheckoutSession = await stripeConfirmMulti.checkout.sessions.retrieve(data.session_id);
        if (multiCheckoutSession.payment_status !== 'paid' && multiCheckoutSession.payment_status !== 'no_payment_required') {
          return res.status(402).json({ error: 'Pagamento não confirmado.' });
        }
        const multiMeta = multiCheckoutSession.metadata || {};
        if (multiMeta.type !== 'cartela_loja_multi') {
          return res.status(400).json({ error: 'Sessão inválida.' });
        }
        // Reassemble IDs from metadata chunks
        const allMultiIds = [];
        for (let i = 0; i < 10; i++) {
          const key = i === 0 ? 'loja_cartela_ids' : `loja_cartela_ids_${i}`;
          if (multiMeta[key]) allMultiIds.push(...multiMeta[key].split(',').filter(Boolean));
          else break;
        }
        if (allMultiIds.length === 0) {
          return res.status(400).json({ error: 'Sessão inválida: cartelas não encontradas.' });
        }
        const compradorNomeMulti = multiMeta.comprador_nome || '';
        const compradorEmailMulti = multiMeta.comprador_email || multiCheckoutSession.customer_email || '';
        const compradorEnderecoMulti = multiMeta.comprador_endereco || '';
        const compradorCidadeMulti = multiMeta.comprador_cidade || '';
        const compradorTelefoneMulti = multiMeta.comprador_telefone || '';
        const purchasedCartelas = [];
        for (const lcId of allMultiIds) {
          const lcMultiResult = await client.query(
            'SELECT lc.*, bcs.sorteio_id, s.papel_largura, s.papel_altura, s.grade_colunas, s.grade_linhas, s.apenas_numero_rifa FROM loja_cartelas lc JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id JOIN sorteios s ON bcs.sorteio_id = s.id WHERE lc.id = $1',
            [lcId]
          );
          if (lcMultiResult.rows.length === 0) continue;
          const lcMulti = lcMultiResult.rows[0];
          await client.query(
            'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, stripe_session_id = $7, updated_at = NOW() WHERE id = $8',
            ['vendida', compradorNomeMulti, compradorEmailMulti, compradorEnderecoMulti, compradorCidadeMulti, compradorTelefoneMulti, data.session_id, lcMulti.id]
          );
          if (lcMulti.sorteio_id) {
            await client.query(
              'UPDATE cartelas SET status = $1, comprador_nome = $2, updated_at = NOW() WHERE sorteio_id = $3 AND numero = $4',
              ['vendida', compradorNomeMulti, lcMulti.sorteio_id, lcMulti.numero_cartela]
            );
            await client.query(
              `UPDATE atribuicao_cartelas SET status = 'vendida' WHERE numero_cartela = $1 AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $2)`,
              [lcMulti.numero_cartela, lcMulti.sorteio_id]
            );
            // Upsert into cartelas_validadas (Req 1)
            if (dbConfig.type === 'mysql') {
              await client.query(
                `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
                 ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
                [lcMulti.sorteio_id, lcMulti.numero_cartela, compradorNomeMulti || null]
              );
            } else {
              await client.query(
                `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
                [lcMulti.sorteio_id, lcMulti.numero_cartela, compradorNomeMulti || null]
              );
            }
          }
          purchasedCartelas.push({
            numero_cartela: lcMulti.numero_cartela,
            card_data: lcMulti.card_data,
            layout_data: lcMulti.layout_data,
            sorteio_id: lcMulti.sorteio_id,
            vendedor_id: lcMulti.vendedor_id,
            preco: lcMulti.preco,
            papel_largura: lcMulti.papel_largura,
            papel_altura: lcMulti.papel_altura,
            grade_colunas: lcMulti.grade_colunas,
            grade_linhas: lcMulti.grade_linhas,
            apenas_numero_rifa: lcMulti.apenas_numero_rifa,
          });
        }
        // Insert single grouped venda for all multi cartelas — deduplicate by stripe_session_id
        if (purchasedCartelas.length > 0) {
          const firstPc = purchasedCartelas[0];
          if (firstPc.sorteio_id) {
            const vendaExistCheckMulti = await client.query(
              'SELECT id FROM vendas WHERE stripe_session_id = $1 LIMIT 1',
              [data.session_id]
            );
            if (vendaExistCheckMulti.rows.length === 0) {
              const numerosVendidos = purchasedCartelas.map(c => c.numero_cartela).join(',');
              const totalPreco = purchasedCartelas.reduce((s, c) => s + parseFloat(c.preco || 0), 0);
              let vendaIdMultiConfirm;
              if (dbConfig.type === 'mysql') {
                await client.query(
                  `INSERT INTO vendas (id, sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                   VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW())`,
                  [firstPc.sorteio_id, firstPc.vendedor_id || null, compradorNomeMulti || 'Comprador Online', compradorTelefoneMulti || null, numerosVendidos, totalPreco, totalPreco, data.session_id]
                );
                const lastVendaMC = await client.query('SELECT id FROM vendas ORDER BY created_at DESC LIMIT 1');
                vendaIdMultiConfirm = lastVendaMC.rows[0]?.id;
              } else {
                const vendaMultiConfirmResult = await client.query(
                  `INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW()) RETURNING id`,
                  [firstPc.sorteio_id, firstPc.vendedor_id || null, compradorNomeMulti || 'Comprador Online', compradorTelefoneMulti || null, numerosVendidos, totalPreco, totalPreco, data.session_id]
                );
                vendaIdMultiConfirm = vendaMultiConfirmResult.rows[0]?.id;
              }
              if (vendaIdMultiConfirm) {
                await client.query(
                  'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
                  [vendaIdMultiConfirm, 'cartao', totalPreco]
                );
              }
            }
          }
        }
        return res.json({
          success: true,
          cartelas: purchasedCartelas.map(c => ({ numero_cartela: c.numero_cartela, card_data: c.card_data, layout_data: c.layout_data, papel_largura: c.papel_largura, papel_altura: c.papel_altura, grade_colunas: c.grade_colunas, grade_linhas: c.grade_linhas, apenas_numero_rifa: c.apenas_numero_rifa })),
          comprador_nome: compradorNomeMulti,
          comprador_endereco: compradorEnderecoMulti,
          comprador_cidade: compradorCidadeMulti,
          comprador_telefone: compradorTelefoneMulti,
        });
      }

      case 'createMercadoPagoCheckoutCartela': {
        if (!data.loja_cartela_id) {
          return res.status(400).json({ error: 'Cartela não especificada.' });
        }
        const mpLojaCartelaResult = await client.query(
          'SELECT lc.*, u.nome as owner_nome FROM loja_cartelas lc JOIN usuarios u ON lc.user_id = u.id WHERE lc.id = $1 AND lc.status = $2',
          [data.loja_cartela_id, 'disponivel']
        );
        if (mpLojaCartelaResult.rows.length === 0) {
          return res.status(404).json({ error: 'Cartela não disponível para compra.' });
        }
        const mpLojaCartela = mpLojaCartelaResult.rows[0];
        const mpCfgCartela = await getUserMercadoPagoClient(client, mpLojaCartela.user_id);
        if (!mpCfgCartela) {
          return res.status(400).json({ error: 'Mercado Pago não configurado. Contate o vendedor.' });
        }
        if (Number(mpLojaCartela.preco) <= 0) {
          return res.status(400).json({ error: 'Cartela sem preço definido.' });
        }
        const mpBaseUrl = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
        const isValidMpPath = (p) => typeof p === 'string' && /^\/[a-zA-Z0-9/_?=&-]*$/.test(p) && !p.includes('//') && !p.includes('..');
        const mpSuccessPath = isValidMpPath(data.success_path) ? data.success_path : `/loja/${mpLojaCartela.user_id}`;
        const mpCancelPath = isValidMpPath(data.cancel_path) ? data.cancel_path : `/loja/${mpLojaCartela.user_id}`;
        const mpNotificationUrl = `${mpBaseUrl}/mp-webhook`;
        const preferenceApi = new Preference(mpCfgCartela.client);
        const mpPref = await preferenceApi.create({
          body: {
            items: [{
              id: mpLojaCartela.id,
              title: `Cartela ${String(mpLojaCartela.numero_cartela).padStart(3, '0')} — ${mpLojaCartela.owner_nome}`,
              quantity: 1,
              unit_price: Number(mpLojaCartela.preco),
              currency_id: 'BRL',
            }],
            payer: data.comprador_email ? { email: data.comprador_email, name: data.comprador_nome || undefined } : undefined,
            back_urls: {
              success: `${mpBaseUrl}${mpSuccessPath}${mpSuccessPath.includes('?') ? '&' : '?'}payment=success&gateway=mp`,
              failure: `${mpBaseUrl}${mpCancelPath}`,
              pending: `${mpBaseUrl}${mpCancelPath}`,
            },
            auto_return: 'approved',
            external_reference: mpLojaCartela.id,
            notification_url: mpNotificationUrl,
            metadata: {
              type: 'cartela_loja',
              owner_user_id: mpLojaCartela.user_id,
              loja_cartela_id: mpLojaCartela.id,
              comprador_nome: data.comprador_nome || '',
              comprador_email: data.comprador_email || '',
              comprador_endereco: data.comprador_endereco || '',
              comprador_cidade: data.comprador_cidade || '',
              comprador_telefone: data.comprador_telefone || '',
            },
          },
        });
        const mpUrl = mpCfgCartela.sandboxMode ? mpPref.sandbox_init_point : mpPref.init_point;
        return res.json({ url: mpUrl, preference_id: mpPref.id });
      }

      case 'confirmMercadoPagoCheckoutCartela': {
        if (!data.payment_id) {
          return res.status(400).json({ error: 'Payment ID não informado.' });
        }
        const mpCfgConfirm = await getUserMercadoPagoClient(client, data.owner_user_id || null);
        if (!mpCfgConfirm) {
          return res.status(400).json({ error: 'Mercado Pago não configurado.' });
        }
        const paymentApiConfirm = new Payment(mpCfgConfirm.client);
        const mpPayment = await paymentApiConfirm.get({ id: data.payment_id });
        if (mpPayment.status !== 'approved') {
          return res.status(402).json({ error: 'Pagamento não aprovado.' });
        }
        const mpMeta = mpPayment.metadata || {};
        const mpCartelaId = mpMeta.loja_cartela_id || mpPayment.external_reference;
        if (!mpCartelaId) {
          return res.status(400).json({ error: 'Referência da cartela não encontrada.' });
        }
        const mpCartelaConfirmResult = await client.query(
          'SELECT lc.*, bcs.sorteio_id, s.papel_largura, s.papel_altura, s.grade_colunas, s.grade_linhas, s.apenas_numero_rifa FROM loja_cartelas lc JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id JOIN sorteios s ON bcs.sorteio_id = s.id WHERE lc.id = $1',
          [mpCartelaId]
        );
        if (mpCartelaConfirmResult.rows.length === 0) {
          return res.status(404).json({ error: 'Cartela não encontrada.' });
        }
        const mpCartelaConfirm = mpCartelaConfirmResult.rows[0];
        const mpCompradorNome = mpMeta.comprador_nome || '';
        const mpCompradorEmail = mpMeta.comprador_email || mpPayment.payer?.email || '';
        const mpCompradorEndereco = mpMeta.comprador_endereco || '';
        const mpCompradorCidade = mpMeta.comprador_cidade || '';
        const mpCompradorTelefone = mpMeta.comprador_telefone || '';
        await client.query(
          'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, updated_at = NOW() WHERE id = $7',
          ['vendida', mpCompradorNome, mpCompradorEmail, mpCompradorEndereco, mpCompradorCidade, mpCompradorTelefone, mpCartelaConfirm.id]
        );
        if (mpCartelaConfirm.sorteio_id) {
          await client.query(
            'UPDATE cartelas SET status = $1, comprador_nome = $2, updated_at = NOW() WHERE sorteio_id = $3 AND numero = $4',
            ['vendida', mpCompradorNome, mpCartelaConfirm.sorteio_id, mpCartelaConfirm.numero_cartela]
          );
          await client.query(
            `UPDATE atribuicao_cartelas SET status = 'vendida' WHERE numero_cartela = $1 AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $2)`,
            [mpCartelaConfirm.numero_cartela, mpCartelaConfirm.sorteio_id]
          );
          if (dbConfig.type === 'mysql') {
            await client.query(
              `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
               ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
              [mpCartelaConfirm.sorteio_id, mpCartelaConfirm.numero_cartela, mpCompradorNome || null]
            );
          } else {
            await client.query(
              `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
               VALUES ($1, $2, $3)
               ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
              [mpCartelaConfirm.sorteio_id, mpCartelaConfirm.numero_cartela, mpCompradorNome || null]
            );
          }
          const mpVendaExist = await client.query(
            'SELECT id FROM vendas WHERE stripe_session_id = $1 LIMIT 1',
            [`mp_${data.payment_id}`]
          );
          if (mpVendaExist.rows.length === 0) {
            let mpVendaId;
            if (dbConfig.type === 'mysql') {
              await client.query(
                `INSERT INTO vendas (id, sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                 VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW())`,
                [mpCartelaConfirm.sorteio_id, mpCartelaConfirm.vendedor_id || null, mpCompradorNome || 'Comprador Online', mpCompradorTelefone || null, String(mpCartelaConfirm.numero_cartela), mpCartelaConfirm.preco, mpCartelaConfirm.preco, `mp_${data.payment_id}`]
              );
              const lastVendaMP = await client.query('SELECT id FROM vendas ORDER BY created_at DESC LIMIT 1');
              mpVendaId = lastVendaMP.rows[0]?.id;
            } else {
              const mpVendaResult = await client.query(
                `INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW()) RETURNING id`,
                [mpCartelaConfirm.sorteio_id, mpCartelaConfirm.vendedor_id || null, mpCompradorNome || 'Comprador Online', mpCompradorTelefone || null, String(mpCartelaConfirm.numero_cartela), mpCartelaConfirm.preco, mpCartelaConfirm.preco, `mp_${data.payment_id}`]
              );
              mpVendaId = mpVendaResult.rows[0]?.id;
            }
            if (mpVendaId) {
              await client.query(
                'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
                [mpVendaId, 'mercado_pago', mpCartelaConfirm.preco]
              );
            }
          }
        }
        return res.json({
          success: true,
          numero_cartela: mpCartelaConfirm.numero_cartela,
          comprador_nome: mpCompradorNome,
          comprador_endereco: mpCompradorEndereco,
          comprador_cidade: mpCompradorCidade,
          comprador_telefone: mpCompradorTelefone,
          card_data: mpCartelaConfirm.card_data,
          layout_data: mpCartelaConfirm.layout_data,
          papel_largura: mpCartelaConfirm.papel_largura,
          papel_altura: mpCartelaConfirm.papel_altura,
          grade_colunas: mpCartelaConfirm.grade_colunas,
          grade_linhas: mpCartelaConfirm.grade_linhas,
          apenas_numero_rifa: mpCartelaConfirm.apenas_numero_rifa,
        });
      }

      case 'createMercadoPagoCheckoutMultiCartela': {
        const mpMultiIds = Array.isArray(data.loja_cartela_ids) ? data.loja_cartela_ids.filter(Boolean) : [];
        if (mpMultiIds.length === 0) {
          return res.status(400).json({ error: 'Nenhuma cartela selecionada.' });
        }
        if (mpMultiIds.length > 20) {
          return res.status(400).json({ error: 'Selecione no máximo 20 cartelas por pedido.' });
        }
        const mpMultiPlaceholders = mpMultiIds.map((_, i) => `$${i + 1}`).join(',');
        const mpMultiCartelasResult = await client.query(
          `SELECT lc.*, u.nome as owner_nome FROM loja_cartelas lc JOIN usuarios u ON lc.user_id = u.id WHERE lc.id IN (${mpMultiPlaceholders}) AND lc.status = 'disponivel'`,
          mpMultiIds
        );
        if (mpMultiCartelasResult.rows.length === 0) {
          return res.status(404).json({ error: 'Nenhuma cartela disponível para compra.' });
        }
        if (mpMultiCartelasResult.rows.length !== mpMultiIds.length) {
          return res.status(400).json({ error: 'Uma ou mais cartelas não estão disponíveis para compra.' });
        }
        const mpMultiCartelas = mpMultiCartelasResult.rows;
        const mpCfgMulti = await getUserMercadoPagoClient(client, mpMultiCartelas[0].user_id);
        if (!mpCfgMulti) {
          return res.status(400).json({ error: 'Mercado Pago não configurado. Contate o vendedor.' });
        }
        const mpBaseUrlMulti = (process.env.APP_URL || '').replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
        const isValidMpPathMulti = (p) => typeof p === 'string' && /^\/[a-zA-Z0-9/_?=&-]*$/.test(p) && !p.includes('//') && !p.includes('..');
        const mpSuccessPathMulti = isValidMpPathMulti(data.success_path) ? data.success_path : `/loja/${mpMultiCartelas[0].user_id}`;
        const mpCancelPathMulti = isValidMpPathMulti(data.cancel_path) ? data.cancel_path : `/loja/${mpMultiCartelas[0].user_id}`;
        const mpNotificationUrlMulti = `${mpBaseUrlMulti}/mp-webhook`;
        const mpLineItems = mpMultiCartelas.map(lc => ({
          id: lc.id,
          title: `Cartela ${String(lc.numero_cartela).padStart(3, '0')} — ${lc.owner_nome}`,
          quantity: 1,
          unit_price: Number(lc.preco),
          currency_id: 'BRL',
        }));
        const preferenceApiMulti = new Preference(mpCfgMulti.client);
        const mpPrefMulti = await preferenceApiMulti.create({
          body: {
            items: mpLineItems,
            payer: data.comprador_email ? { email: data.comprador_email, name: data.comprador_nome || undefined } : undefined,
            back_urls: {
              success: `${mpBaseUrlMulti}${mpSuccessPathMulti}${mpSuccessPathMulti.includes('?') ? '&' : '?'}payment=success&gateway=mp&checkout_type=multi`,
              failure: `${mpBaseUrlMulti}${mpCancelPathMulti}`,
              pending: `${mpBaseUrlMulti}${mpCancelPathMulti}`,
            },
            auto_return: 'approved',
            external_reference: mpMultiIds.join(','),
            notification_url: mpNotificationUrlMulti,
            metadata: {
              type: 'cartela_loja_multi',
              owner_user_id: mpMultiCartelas[0].user_id,
              loja_cartela_ids: mpMultiIds.join(','),
              comprador_nome: data.comprador_nome || '',
              comprador_email: data.comprador_email || '',
              comprador_endereco: data.comprador_endereco || '',
              comprador_cidade: data.comprador_cidade || '',
              comprador_telefone: data.comprador_telefone || '',
            },
          },
        });
        const mpUrlMulti = mpCfgMulti.sandboxMode ? mpPrefMulti.sandbox_init_point : mpPrefMulti.init_point;
        return res.json({ url: mpUrlMulti, preference_id: mpPrefMulti.id });
      }

      case 'confirmMercadoPagoCheckoutMultiCartela': {
        if (!data.payment_id) {
          return res.status(400).json({ error: 'Payment ID não informado.' });
        }
        const mpCfgConfirmMulti = await getUserMercadoPagoClient(client, data.owner_user_id || null);
        if (!mpCfgConfirmMulti) {
          return res.status(400).json({ error: 'Mercado Pago não configurado.' });
        }
        const paymentApiMulti = new Payment(mpCfgConfirmMulti.client);
        const mpPaymentMulti = await paymentApiMulti.get({ id: data.payment_id });
        if (mpPaymentMulti.status !== 'approved') {
          return res.status(402).json({ error: 'Pagamento não aprovado.' });
        }
        const mpMetaMulti = mpPaymentMulti.metadata || {};
        const rawIds = mpMetaMulti.loja_cartela_ids || mpPaymentMulti.external_reference || '';
        const allMpIds = rawIds.split(',').filter(Boolean);
        if (allMpIds.length === 0) {
          return res.status(400).json({ error: 'Sessão inválida: cartelas não encontradas.' });
        }
        const mpCompradorNomeMulti = mpMetaMulti.comprador_nome || '';
        const mpCompradorEmailMulti = mpMetaMulti.comprador_email || mpPaymentMulti.payer?.email || '';
        const mpCompradorEnderecoMulti = mpMetaMulti.comprador_endereco || '';
        const mpCompradorCidadeMulti = mpMetaMulti.comprador_cidade || '';
        const mpCompradorTelefoneMulti = mpMetaMulti.comprador_telefone || '';
        const mpPurchasedCartelas = [];
        for (const lcId of allMpIds) {
          const mpLcResult = await client.query(
            'SELECT lc.*, bcs.sorteio_id, s.papel_largura, s.papel_altura, s.grade_colunas, s.grade_linhas, s.apenas_numero_rifa FROM loja_cartelas lc JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id JOIN sorteios s ON bcs.sorteio_id = s.id WHERE lc.id = $1',
            [lcId]
          );
          if (mpLcResult.rows.length === 0) continue;
          const mpLc = mpLcResult.rows[0];
          await client.query(
            'UPDATE loja_cartelas SET status = $1, comprador_nome = $2, comprador_email = $3, comprador_endereco = $4, comprador_cidade = $5, comprador_telefone = $6, updated_at = NOW() WHERE id = $7',
            ['vendida', mpCompradorNomeMulti, mpCompradorEmailMulti, mpCompradorEnderecoMulti, mpCompradorCidadeMulti, mpCompradorTelefoneMulti, mpLc.id]
          );
          if (mpLc.sorteio_id) {
            await client.query(
              'UPDATE cartelas SET status = $1, comprador_nome = $2, updated_at = NOW() WHERE sorteio_id = $3 AND numero = $4',
              ['vendida', mpCompradorNomeMulti, mpLc.sorteio_id, mpLc.numero_cartela]
            );
            await client.query(
              `UPDATE atribuicao_cartelas SET status = 'vendida' WHERE numero_cartela = $1 AND atribuicao_id IN (SELECT id FROM atribuicoes WHERE sorteio_id = $2)`,
              [mpLc.numero_cartela, mpLc.sorteio_id]
            );
            if (dbConfig.type === 'mysql') {
              await client.query(
                `INSERT INTO cartelas_validadas (id, sorteio_id, numero, comprador_nome) VALUES (UUID(), $1, $2, $3)
                 ON DUPLICATE KEY UPDATE comprador_nome = VALUES(comprador_nome)`,
                [mpLc.sorteio_id, mpLc.numero_cartela, mpCompradorNomeMulti || null]
              );
            } else {
              await client.query(
                `INSERT INTO cartelas_validadas (sorteio_id, numero, comprador_nome)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (sorteio_id, numero) DO UPDATE SET comprador_nome = EXCLUDED.comprador_nome`,
                [mpLc.sorteio_id, mpLc.numero_cartela, mpCompradorNomeMulti || null]
              );
            }
          }
          mpPurchasedCartelas.push({
            numero_cartela: mpLc.numero_cartela,
            card_data: mpLc.card_data,
            layout_data: mpLc.layout_data,
            sorteio_id: mpLc.sorteio_id,
            vendedor_id: mpLc.vendedor_id,
            preco: mpLc.preco,
            papel_largura: mpLc.papel_largura,
            papel_altura: mpLc.papel_altura,
            grade_colunas: mpLc.grade_colunas,
            grade_linhas: mpLc.grade_linhas,
            apenas_numero_rifa: mpLc.apenas_numero_rifa,
          });
        }
        if (mpPurchasedCartelas.length > 0) {
          const firstMpPc = mpPurchasedCartelas[0];
          if (firstMpPc.sorteio_id) {
            const mpVendaExistMulti = await client.query(
              'SELECT id FROM vendas WHERE stripe_session_id = $1 LIMIT 1',
              [`mp_${data.payment_id}`]
            );
            if (mpVendaExistMulti.rows.length === 0) {
              const mpNumerosVendidos = mpPurchasedCartelas.map(c => c.numero_cartela).join(',');
              const mpTotalPreco = mpPurchasedCartelas.reduce((s, c) => s + parseFloat(c.preco || 0), 0);
              let mpVendaIdMulti;
              if (dbConfig.type === 'mysql') {
                await client.query(
                  `INSERT INTO vendas (id, sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                   VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW())`,
                  [firstMpPc.sorteio_id, firstMpPc.vendedor_id || null, mpCompradorNomeMulti || 'Comprador Online', mpCompradorTelefoneMulti || null, mpNumerosVendidos, mpTotalPreco, mpTotalPreco, `mp_${data.payment_id}`]
                );
                const lastVendaMPM = await client.query('SELECT id FROM vendas ORDER BY created_at DESC LIMIT 1');
                mpVendaIdMulti = lastVendaMPM.rows[0]?.id;
              } else {
                const mpVendaMultiResult = await client.query(
                  `INSERT INTO vendas (sorteio_id, vendedor_id, cliente_nome, cliente_telefone, numeros_cartelas, valor_total, valor_pago, status, stripe_session_id, data_venda)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, 'concluida', $8, NOW()) RETURNING id`,
                  [firstMpPc.sorteio_id, firstMpPc.vendedor_id || null, mpCompradorNomeMulti || 'Comprador Online', mpCompradorTelefoneMulti || null, mpNumerosVendidos, mpTotalPreco, mpTotalPreco, `mp_${data.payment_id}`]
                );
                mpVendaIdMulti = mpVendaMultiResult.rows[0]?.id;
              }
              if (mpVendaIdMulti) {
                await client.query(
                  'INSERT INTO pagamentos (venda_id, forma_pagamento, valor, data_pagamento) VALUES ($1, $2, $3, NOW())',
                  [mpVendaIdMulti, 'mercado_pago', mpTotalPreco]
                );
              }
            }
          }
        }
        return res.json({
          success: true,
          cartelas: mpPurchasedCartelas.map(c => ({ numero_cartela: c.numero_cartela, card_data: c.card_data, layout_data: c.layout_data, papel_largura: c.papel_largura, papel_altura: c.papel_altura, grade_colunas: c.grade_colunas, grade_linhas: c.grade_linhas, apenas_numero_rifa: c.apenas_numero_rifa })),
          comprador_nome: mpCompradorNomeMulti,
          comprador_endereco: mpCompradorEnderecoMulti,
          comprador_cidade: mpCompradorCidadeMulti,
          comprador_telefone: mpCompradorTelefoneMulti,
        });
      }

      case 'cadastrarComprador': {
        if (!data.email || !data.senha || !data.nome || !data.cpf || !data.endereco || !data.cidade || !data.telefone) {
          return res.status(400).json({ error: 'Nome, E-mail, CPF, Endereço, Cidade, Telefone e senha são obrigatórios.' });
        }
        const nomeComp = data.nome.trim();
        const cpfComp = data.cpf.trim();
        const enderecoComp = data.endereco.trim();
        const cidadeComp = data.cidade.trim();
        const telefoneComp = data.telefone.trim();
        if (!nomeComp || !cpfComp || !enderecoComp || !cidadeComp || !telefoneComp) {
          return res.status(400).json({ error: 'Nome, E-mail, CPF, Endereço, Cidade, Telefone e senha são obrigatórios.' });
        }
        const emailCheckComp = data.owner_user_id
          ? await client.query('SELECT id FROM loja_compradores WHERE email = $1 AND owner_user_id = $2', [data.email.toLowerCase().trim(), data.owner_user_id])
          : await client.query('SELECT id FROM loja_compradores WHERE email = $1', [data.email.toLowerCase().trim()]);
        if (emailCheckComp.rows.length > 0) {
          return res.status(400).json({ error: 'Este email já está cadastrado nesta loja.' });
        }
        const compHash = await hashPassword(data.senha);
        let newComp;
        if (dbConfig.type === 'mysql') {
          const newCompId = crypto.randomUUID();
          await client.query(
            'INSERT INTO loja_compradores (id, email, senha_hash, nome, cpf, endereco, cidade, telefone, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [newCompId, data.email.toLowerCase().trim(), compHash, nomeComp, cpfComp, enderecoComp, cidadeComp, telefoneComp, data.owner_user_id || null]
          );
          const inserted = await client.query(
            'SELECT id, email, nome, cpf, endereco, cidade, telefone, created_at FROM loja_compradores WHERE id = $1',
            [newCompId]
          );
          newComp = inserted.rows[0];
        } else {
          const inserted = await client.query(
            'INSERT INTO loja_compradores (email, senha_hash, nome, cpf, endereco, cidade, telefone, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, nome, cpf, endereco, cidade, telefone, created_at',
            [data.email.toLowerCase().trim(), compHash, nomeComp, cpfComp, enderecoComp, cidadeComp, telefoneComp, data.owner_user_id || null]
          );
          newComp = inserted.rows[0];
        }
        const compToken = await createJwt({ comprador_id: newComp.id, role: 'comprador', email: newComp.email, owner_user_id: data.owner_user_id || null });
        return res.json({ comprador: { id: newComp.id, email: newComp.email, nome: newComp.nome, cpf: newComp.cpf, endereco: newComp.endereco, cidade: newComp.cidade, telefone: newComp.telefone, avatar_url: null }, token: compToken });
      }

      case 'loginComprador': {
        if (!data.email || !data.senha) {
          return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        }
        const compResult = data.owner_user_id
          ? await client.query('SELECT * FROM loja_compradores WHERE email = $1 AND owner_user_id = $2', [data.email.toLowerCase().trim(), data.owner_user_id])
          : await client.query('SELECT * FROM loja_compradores WHERE email = $1', [data.email.toLowerCase().trim()]);
        if (compResult.rows.length === 0) {
          return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
        const foundComp = compResult.rows[0];
        const compPassValid = await verifyPassword(data.senha, foundComp.senha_hash);
        if (!compPassValid) {
          return res.status(401).json({ error: 'Credenciais inválidas.' });
        }
        const compLoginToken = await createJwt({ comprador_id: foundComp.id, role: 'comprador', email: foundComp.email, owner_user_id: foundComp.owner_user_id || null });
        return res.json({ comprador: { id: foundComp.id, email: foundComp.email, nome: foundComp.nome, cpf: foundComp.cpf || '', endereco: foundComp.endereco || '', cidade: foundComp.cidade || '', telefone: foundComp.telefone || '', avatar_url: foundComp.avatar_url || null }, token: compLoginToken });
      }

      case 'getHistoricoComprador': {
        // Verify buyer token
        const histToken = data.token;
        if (!histToken) return res.status(401).json({ error: 'Token não informado.' });
        const histUser = await verifyJwt(histToken);
        if (!histUser || histUser.role !== 'comprador') return res.status(401).json({ error: 'Token inválido.' });
        const historicSql = `
          SELECT lc.id, lc.numero_cartela, lc.preco, lc.status, lc.card_data, lc.layout_data,
                 lc.comprador_nome, lc.comprador_endereco, lc.comprador_cidade, lc.comprador_telefone,
                 lc.created_at, lc.updated_at,
                 u.nome as store_nome, u.titulo_sistema as store_titulo,
                 s.nome as sorteio_nome, s.data_sorteio,
                 s.papel_largura, s.papel_altura, s.grade_colunas, s.grade_linhas, s.apenas_numero_rifa
          FROM loja_cartelas lc
          JOIN usuarios u ON lc.user_id = u.id
          JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id
          JOIN sorteios s ON bcs.sorteio_id = s.id
          WHERE LOWER(lc.comprador_email) = LOWER($1) AND lc.status = 'vendida'`;
        const historico = histUser.owner_user_id
          ? await client.query(historicSql + ' AND lc.user_id = $2 ORDER BY lc.updated_at DESC', [histUser.email, histUser.owner_user_id])
          : await client.query(historicSql + ' ORDER BY lc.updated_at DESC', [histUser.email]);
        return res.json({ data: historico.rows });
      }

      case 'emailCartelasPDF': {
        // Send PDF to buyer email. pdf_base64 is the base64-encoded PDF content.
        if (!data.email || !data.pdf_base64) {
          return res.status(400).json({ error: 'Email e PDF são obrigatórios.' });
        }
        const pdfBuffer = Buffer.from(data.pdf_base64, 'base64');
        const nomeComprador = data.nome || 'Comprador';
        const tituloLoja = data.titulo_loja || 'Loja de Cartelas';
        const numerosCartelas = data.numeros_cartelas || '';
        const htmlBody = `<h2>Olá, ${nomeComprador}!</h2>
<p>Sua compra foi confirmada com sucesso na <strong>${tituloLoja}</strong>.</p>
${numerosCartelas ? `<p><strong>Cartelas:</strong> ${numerosCartelas}</p>` : ''}
<p>Em anexo você encontra seu(s) cartela(s) em PDF para impressão.</p>
<p>Para acessar seu histórico de compras, acesse a loja e faça login com seu email.</p>
<br><p>Obrigado pela compra!</p>`;
        await sendEmail(client, {
          to: data.email,
          subject: `Suas cartelas — ${tituloLoja}`,
          text: `Olá, ${nomeComprador}! Sua compra foi confirmada. Cartelas: ${numerosCartelas}. O PDF está em anexo.`,
          html: htmlBody,
          attachments: [{ filename: `cartelas-${(numerosCartelas || 'bingo').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
        });
        return res.json({ success: true });
      }

      case 'solicitarRecuperacaoSenha': {
        if (!data.email) {
          return res.status(400).json({ error: 'Email é obrigatório.' });
        }
        const emailRecup = data.email.toLowerCase().trim();
        const compRecupResult = data.owner_user_id
          ? await client.query('SELECT id, nome FROM loja_compradores WHERE email = $1 AND owner_user_id = $2', [emailRecup, data.owner_user_id])
          : await client.query('SELECT id, nome FROM loja_compradores WHERE email = $1', [emailRecup]);
        // Always return success to avoid user enumeration
        if (compRecupResult.rows.length === 0) {
          return res.json({ success: true });
        }
        const compRecup = compRecupResult.rows[0];
        const resetCode = crypto.randomInt(100000, 1000000).toString();
        const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await client.query(
          'UPDATE loja_compradores SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
          [resetCode, resetExpires, compRecup.id]
        );
        const safeNome = String(compRecup.nome).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        await sendEmail(client, {
          to: emailRecup,
          subject: 'Código de recuperação de senha',
          text: `Olá, ${compRecup.nome}! Seu código de recuperação de senha é: ${resetCode}. Válido por 15 minutos.`,
          html: `<p>Olá, <strong>${safeNome}</strong>!</p><p>Seu código de recuperação de senha é:</p><h2 style="letter-spacing:4px">${resetCode}</h2><p>Válido por 15 minutos.</p>`,
        });
        return res.json({ success: true });
      }

      case 'resetarSenha': {
        if (!data.email || !data.codigo || !data.nova_senha) {
          return res.status(400).json({ error: 'Email, código e nova senha são obrigatórios.' });
        }
        if (data.nova_senha.length < 6) {
          return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }
        const emailReset = data.email.toLowerCase().trim();
        const compResetResult = data.owner_user_id
          ? await client.query(
              'SELECT id FROM loja_compradores WHERE email = $1 AND reset_token = $2 AND reset_token_expires > NOW() AND owner_user_id = $3',
              [emailReset, data.codigo, data.owner_user_id]
            )
          : await client.query(
              'SELECT id FROM loja_compradores WHERE email = $1 AND reset_token = $2 AND reset_token_expires > NOW()',
              [emailReset, data.codigo]
            );
        if (compResetResult.rows.length === 0) {
          return res.status(400).json({ error: 'Código inválido ou expirado.' });
        }
        const newHash = await hashPassword(data.nova_senha);
        await client.query(
          'UPDATE loja_compradores SET senha_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
          [newHash, compResetResult.rows[0].id]
        );
        return res.json({ success: true });
      }

      case 'atualizarComprador': {
        if (!data.token) return res.status(401).json({ error: 'Token não informado.' });
        const updUser = await verifyJwt(data.token);
        if (!updUser || updUser.role !== 'comprador') return res.status(401).json({ error: 'Token inválido.' });
        const updComp = await client.query('SELECT id FROM loja_compradores WHERE id = $1', [updUser.comprador_id]);
        if (updComp.rows.length === 0) return res.status(404).json({ error: 'Comprador não encontrado.' });
        const compId = updComp.rows[0].id;
        const nomeUpd = (data.nome || '').trim();
        if (!nomeUpd) return res.status(400).json({ error: 'O nome é obrigatório.' });
        if (data.avatar_url && data.avatar_url.length > 2 * 1024 * 1024 * 1.4) {
          // base64 is ~1.37x the original file size; 2MB * 1.4 ≈ 2.8M chars
          return res.status(400).json({ error: 'A imagem de perfil é muito grande (máximo 2MB).' });
        }
        // Optional password change
        if (data.nova_senha) {
          if (!data.senha_atual) return res.status(400).json({ error: 'Senha atual é obrigatória para alterar a senha.' });
          if (data.nova_senha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
          const compWithHash = await client.query('SELECT senha_hash FROM loja_compradores WHERE id = $1', [compId]);
          const passOk = await verifyPassword(data.senha_atual, compWithHash.rows[0].senha_hash);
          if (!passOk) return res.status(400).json({ error: 'Senha atual incorreta.' });
          const newHash = await hashPassword(data.nova_senha);
          await client.query('UPDATE loja_compradores SET senha_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, compId]);
        }
        await client.query(
          'UPDATE loja_compradores SET nome = $1, cpf = $2, endereco = $3, cidade = $4, telefone = $5, avatar_url = $6, updated_at = NOW() WHERE id = $7',
          [nomeUpd, data.cpf || null, data.endereco || null, data.cidade || null, data.telefone || null, data.avatar_url || null, compId]
        );
        const updResult = await client.query('SELECT id, email, nome, cpf, endereco, cidade, telefone, avatar_url FROM loja_compradores WHERE id = $1', [compId]);
        return res.json({ comprador: updResult.rows[0] });
      }

      case 'deletarComprador': {
        if (!data.token) return res.status(401).json({ error: 'Token não informado.' });
        const delUser = await verifyJwt(data.token);
        if (!delUser || delUser.role !== 'comprador') return res.status(401).json({ error: 'Token inválido.' });
        const delComp = await client.query('SELECT id FROM loja_compradores WHERE id = $1', [delUser.comprador_id]);
        if (delComp.rows.length === 0) return res.status(404).json({ error: 'Comprador não encontrado.' });
        await client.query('DELETE FROM loja_compradores WHERE id = $1', [delComp.rows[0].id]);
        return res.json({ success: true });
      }

      // ================== PER-USER CONFIGURAÇÕES ==================
      case 'getUserConfiguracoes': {
        const ucResult = await client.query(
          'SELECT chave, valor FROM user_configuracoes WHERE user_id = $1',
          [data.authenticated_user_id]
        );
        const ucConfig = {};
        ucResult.rows.forEach(row => { ucConfig[row.chave] = row.valor; });
        return res.json({ data: ucConfig });
      }

      case 'updateUserConfiguracoes': {
        const ucEntries = Object.entries(data.config || {});
        for (const [chave, valor] of ucEntries) {
          if (dbConfig.type === 'mysql') {
            await client.query(
              `INSERT INTO user_configuracoes (user_id, chave, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor), updated_at = NOW()`,
              [data.authenticated_user_id, chave, valor]
            );
          } else {
            await client.query(
              `INSERT INTO user_configuracoes (user_id, chave, valor) VALUES ($1, $2, $3) ON CONFLICT (user_id, chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
              [data.authenticated_user_id, chave, valor]
            );
          }
        }
        return res.json({ success: true });
      }

      // ================== LOJA CLIENTES ==================
      case 'getLojaCompradores': {
        const lcQuery = await client.query(`
          SELECT
            lc.comprador_email AS email,
            lc.comprador_nome AS nome,
            lc.comprador_telefone AS telefone,
            lc.comprador_cidade AS cidade,
            MAX(lc.updated_at) AS ultima_compra,
            COUNT(*) AS total_compras,
            comp.cpf,
            comp.endereco,
            comp.id AS comprador_id,
            comp.owner_user_id
          FROM loja_cartelas lc
          LEFT JOIN loja_compradores comp ON LOWER(lc.comprador_email) = LOWER(comp.email)
          WHERE lc.user_id = $1 AND lc.status = 'vendida' AND lc.comprador_email IS NOT NULL AND lc.comprador_email <> ''
          GROUP BY lc.comprador_email, lc.comprador_nome, lc.comprador_telefone, lc.comprador_cidade, comp.cpf, comp.endereco, comp.id, comp.owner_user_id
          UNION ALL
          SELECT
            comp2.email,
            comp2.nome,
            comp2.telefone,
            comp2.cidade,
            comp2.created_at AS ultima_compra,
            0 AS total_compras,
            comp2.cpf,
            comp2.endereco,
            comp2.id AS comprador_id,
            comp2.owner_user_id
          FROM loja_compradores comp2
          WHERE comp2.owner_user_id = $1
            AND LOWER(comp2.email) NOT IN (
              SELECT DISTINCT LOWER(lc2.comprador_email)
              FROM loja_cartelas lc2
              WHERE lc2.user_id = $1 AND lc2.status = 'vendida' AND lc2.comprador_email IS NOT NULL AND lc2.comprador_email <> ''
            )
          ORDER BY ultima_compra DESC
        `, [data.authenticated_user_id]);
        return res.json({ data: lcQuery.rows });
      }

      case 'createLojaComprador': {
        if (!data.nome || !data.email) {
          return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
        }
        const emailNorm = data.email.toLowerCase().trim();
        const existingComp = await client.query('SELECT id, owner_user_id FROM loja_compradores WHERE email = $1', [emailNorm]);
        if (existingComp.rows.length > 0) {
          return res.status(400).json({ error: 'Já existe um cliente cadastrado com este e-mail.' });
        }
        let newComp;
        if (dbConfig.type === 'mysql') {
          await client.query(
            'INSERT INTO loja_compradores (id, email, senha_hash, nome, cpf, telefone, cidade, endereco, owner_user_id) VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, $8)',
            [emailNorm, '!', data.nome.trim(), data.cpf || null, data.telefone || null, data.cidade || null, data.endereco || null, data.authenticated_user_id]
          );
          const inserted = await client.query('SELECT id, email, nome, cpf, telefone, cidade, endereco, owner_user_id, created_at FROM loja_compradores WHERE email = $1', [emailNorm]);
          newComp = inserted.rows[0];
        } else {
          const inserted = await client.query(
            'INSERT INTO loja_compradores (email, senha_hash, nome, cpf, telefone, cidade, endereco, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, nome, cpf, telefone, cidade, endereco, owner_user_id, created_at',
            [emailNorm, '!', data.nome.trim(), data.cpf || null, data.telefone || null, data.cidade || null, data.endereco || null, data.authenticated_user_id]
          );
          newComp = inserted.rows[0];
        }
        return res.json({ data: newComp });
      }

      case 'updateLojaComprador': {
        if (!data.email) {
          return res.status(400).json({ error: 'E-mail é obrigatório.' });
        }
        const emailNormU = data.email.toLowerCase().trim();
        // Verify this customer belongs to this store (via purchases or manually added)
        const authCheck = await client.query(
          `SELECT id FROM loja_compradores WHERE LOWER(email) = $1 AND (owner_user_id = $2 OR EXISTS (SELECT 1 FROM loja_cartelas WHERE LOWER(comprador_email) = $1 AND user_id = $2))`,
          [emailNormU, data.authenticated_user_id]
        );
        if (authCheck.rows.length === 0) {
          return res.status(403).json({ error: 'Cliente não encontrado ou sem permissão.' });
        }
        const existingForUpdate = await client.query('SELECT id FROM loja_compradores WHERE LOWER(email) = $1', [emailNormU]);
        if (existingForUpdate.rows.length === 0) {
          // No account yet; create one linked to this owner
          if (dbConfig.type === 'mysql') {
            await client.query(
              'INSERT INTO loja_compradores (id, email, senha_hash, nome, cpf, telefone, cidade, endereco, owner_user_id) VALUES (UUID(), $1, $2, $3, $4, $5, $6, $7, $8)',
              [emailNormU, '!', data.nome || '', data.cpf || null, data.telefone || null, data.cidade || null, data.endereco || null, data.authenticated_user_id]
            );
          } else {
            await client.query(
              'INSERT INTO loja_compradores (email, senha_hash, nome, cpf, telefone, cidade, endereco, owner_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
              [emailNormU, '!', data.nome || '', data.cpf || null, data.telefone || null, data.cidade || null, data.endereco || null, data.authenticated_user_id]
            );
          }
        } else {
          await client.query(
            'UPDATE loja_compradores SET nome = $1, cpf = $2, telefone = $3, cidade = $4, endereco = $5, updated_at = NOW() WHERE LOWER(email) = $6',
            [data.nome || '', data.cpf || null, data.telefone || null, data.cidade || null, data.endereco || null, emailNormU]
          );
        }
        // Also update comprador info in loja_cartelas for this store
        await client.query(
          'UPDATE loja_cartelas SET comprador_nome = $1, comprador_telefone = $2, comprador_cidade = $3 WHERE LOWER(comprador_email) = $4 AND user_id = $5',
          [data.nome || '', data.telefone || null, data.cidade || null, emailNormU, data.authenticated_user_id]
        );
        return res.json({ success: true });
      }

      case 'getCartelasComprador': {
        if (!data.email) {
          return res.status(400).json({ error: 'E-mail é obrigatório.' });
        }
        const emailComp = data.email.toLowerCase().trim();
        const cartelasComp = await client.query(
          `SELECT lc.id, lc.numero_cartela, lc.preco, lc.status, lc.card_data, lc.layout_data,
                  lc.comprador_nome, lc.comprador_email, lc.updated_at,
                  s.nome AS sorteio_nome, s.data_sorteio, bcs.sorteio_id
           FROM loja_cartelas lc
           JOIN bingo_card_sets bcs ON lc.card_set_id = bcs.id
           JOIN sorteios s ON bcs.sorteio_id = s.id
           WHERE lc.user_id = $1 AND LOWER(lc.comprador_email) = $2 AND lc.status = 'vendida'
           ORDER BY lc.updated_at DESC`,
          [data.authenticated_user_id, emailComp]
        );
        return res.json({ data: cartelasComp.rows });
      }

      case 'deleteLojaComprador': {
        if (!data.email) {
          return res.status(400).json({ error: 'E-mail é obrigatório.' });
        }
        const emailNormD = data.email.toLowerCase().trim();
        // Nullify comprador_email in loja_cartelas for this store
        await client.query(
          'UPDATE loja_cartelas SET comprador_nome = NULL, comprador_email = NULL, comprador_telefone = NULL, comprador_cidade = NULL WHERE LOWER(comprador_email) = $1 AND user_id = $2',
          [emailNormD, data.authenticated_user_id]
        );
        // Delete loja_compradores record only if it was manually added by this owner
        await client.query(
          'DELETE FROM loja_compradores WHERE LOWER(email) = $1 AND owner_user_id = $2',
          [emailNormD, data.authenticated_user_id]
        );
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: error.message || 'Database error occurred' });
  } finally {
    client.release();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Bingo Backend API running on port ${PORT}`);
  console.log(`Basic Auth: ${BASIC_AUTH_USER ? 'ENABLED' : 'DISABLED'}`);
});
