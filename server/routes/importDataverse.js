import express from 'express';
import pLimit from 'p-limit';
import { dvRequest } from '../auth/dataverseAuth.js';

const router = express.Router();

async function createWithRetry(entity, row, maxRetries = 5) {
  let attempt = 0;
  while (true) {
    try {
      await dvRequest({
        method: 'POST',
        path: `/${entity}`,
        data: row,
      });
      return { ok: true };
    } catch (err) {
      const status = err.response?.status;
      attempt += 1;
      if (status === 429 && attempt <= maxRetries) {
        const retryAfter = Number(err.response?.headers?.['retry-after']) || 0;
        const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 2 ** attempt * 250);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return {
        ok: false,
        error: err.response?.data?.error?.message || err.response?.data || err.message,
        status,
      };
    }
  }
}

// SSE
router.post('/import-dataverse', async (req, res) => {
  const { entity, rows = [] } = req.body || {};
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  if (!entity) {
    send({ type: 'error', error: 'entity is required' });
    return res.end();
  }

  const limit = pLimit(10);
  const total = rows.length;
  let success = 0;
  let failed = 0;
  const failedRows = [];

  send({ type: 'start', total });

  await Promise.all(
    rows.map((row, idx) =>
      limit(async () => {
        const r = await createWithRetry(entity, row);
        if (r.ok) {
          success += 1;
        } else {
          failed += 1;
          failedRows.push({ ...row, _error: r.error, _status: r.status });
        }
        send({
          type: 'progress',
          processed: success + failed,
          success,
          failed,
          total,
          lastIndex: idx,
        });
      })
    )
  );

  send({ type: 'done', success, failed, total, failedRows });
  res.end();
});

export default router;
