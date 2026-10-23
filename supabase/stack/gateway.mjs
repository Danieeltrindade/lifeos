// =============================================================================
// Gateway da pilha local de testes (papel do Kong no Supabase) + caixa de e-mail de teste.
//
//   :54321  /auth/v1/*  → Supabase Auth (GoTrue)   /rest/v1/*  → PostgREST
//           Exige o header `apikey`, como a plataforma. Chaves opacas sb_publishable_… e
//           sb_secret_… são trocadas pelo JWT anon/service_role correspondente — o mesmo
//           que o Supabase faz com as chaves novas.
//   :2500   SMTP que só guarda as mensagens (o Auth envia confirmação e recuperação aqui).
//   :54324  API de leitura das mensagens compatível com o Mailpit do `supabase start`
//           (GET /api/v1/messages, GET /api/v1/message/:id, DELETE /api/v1/messages).
//
// Só para testes locais. Sem dependências: Node 22+.
// =============================================================================
import { createHmac } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';

const env = process.env;
const JWT_SECRET = env.STACK_JWT_SECRET;
const PUBLISHABLE = env.STACK_PUBLISHABLE_KEY;
const SECRET = env.STACK_SECRET_KEY;
const AUTH = env.STACK_AUTH_URL ?? 'http://127.0.0.1:9999';
const REST = env.STACK_REST_URL ?? 'http://127.0.0.1:3000';
if (!JWT_SECRET || !PUBLISHABLE || !SECRET) throw new Error('STACK_* não definidas');

const b64url = (v) => Buffer.from(v).toString('base64url');
function sign(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
const now = Math.floor(Date.now() / 1000);
const ANON_JWT = sign({ role: 'anon', iss: 'supabase', iat: now, exp: now + 10 * 365 * 86400 });
const SERVICE_JWT = sign({
  role: 'service_role',
  iss: 'supabase',
  iat: now,
  exp: now + 10 * 365 * 86400,
});
const keyToJwt = (k) => (k === PUBLISHABLE ? ANON_JWT : k === SECRET ? SERVICE_JWT : null);

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ??
      'authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version',
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'content-range,x-total-count,x-supabase-api-version',
  );
  res.setHeader('Access-Control-Max-Age', '600');
}

const api = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  const url = new URL(req.url, 'http://x');
  let target;
  if (url.pathname.startsWith('/auth/v1/')) target = AUTH + url.pathname.slice(8) + url.search;
  else if (url.pathname.startsWith('/rest/v1/')) target = REST + url.pathname.slice(8) + url.search;
  // Links dos e-mails apontam para /auth/v1/verify e abrem sem apikey (como na plataforma).
  const isEmailLink = url.pathname === '/auth/v1/verify' && req.method === 'GET';
  if (!target)
    return void res
      .writeHead(404, { 'content-type': 'application/json' })
      .end('{"message":"no route"}');

  const apikey = req.headers.apikey ?? url.searchParams.get('apikey');
  // Como na plataforma: sem chave → 401; chave que não é desta pilha → 401.
  const mapped = apikey ? keyToJwt(apikey) : null;
  if (!mapped && !isEmailLink) {
    return void res
      .writeHead(401, { 'content-type': 'application/json' })
      .end(apikey ? '{"message":"Invalid API key"}' : '{"message":"No API key found in request"}');
  }
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.origin;
  if (mapped) headers.apikey = mapped;
  const bearer =
    typeof headers.authorization === 'string'
      ? headers.authorization.replace(/^Bearer\s+/i, '')
      : '';
  const bearerJwt = bearer ? keyToJwt(bearer) : null;
  if (bearerJwt) headers.authorization = `Bearer ${bearerJwt}`;
  else if (!bearer && mapped && target.startsWith(REST)) headers.authorization = `Bearer ${mapped}`;

  const up = http.request(target, { method: req.method, headers }, (r) => {
    const out = { ...r.headers };
    for (const h of Object.keys(out))
      if (h.toLowerCase().startsWith('access-control-')) delete out[h];
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `upstream: ${e.message}` }));
  });
  req.pipe(up);
});
api.listen(Number(env.STACK_API_PORT ?? 54321), '0.0.0.0');

// ---------------------------------------------------------------------------------------
// E-mail de teste
// ---------------------------------------------------------------------------------------
const messages = [];
let seq = 0;

function decodeQP(s) {
  return Buffer.from(
    s
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1',
  ).toString('utf8');
}
function splitPart(raw) {
  const i = raw.search(/\r?\n\r?\n/);
  const head = i < 0 ? raw : raw.slice(0, i);
  const body = i < 0 ? '' : raw.slice(i).replace(/^\r?\n\r?\n/, '');
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body };
}
function decodeBody(part) {
  const enc = (part.headers['content-transfer-encoding'] ?? '').toLowerCase();
  if (enc === 'quoted-printable') return decodeQP(part.body);
  if (enc === 'base64')
    return Buffer.from(part.body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return part.body;
}
function parseMail(raw) {
  const top = splitPart(raw);
  const out = { Subject: top.headers.subject ?? '', Text: '', HTML: '' };
  const visit = (part) => {
    const type = (part.headers['content-type'] ?? 'text/plain').toLowerCase();
    const boundary = /boundary="?([^";]+)"?/i.exec(part.headers['content-type'] ?? '')?.[1];
    if (type.startsWith('multipart/') && boundary) {
      for (const chunk of part.body.split(`--${boundary}`).slice(1)) {
        if (chunk.startsWith('--')) break;
        visit(splitPart(chunk.replace(/^\r?\n/, '')));
      }
    } else if (type.startsWith('text/html')) out.HTML += decodeBody(part);
    else out.Text += decodeBody(part);
  };
  visit(top);
  return out;
}

net
  .createServer((sock) => {
    let buf = '';
    let data = false;
    let to = [];
    let from = '';
    sock.write('220 lifeos-stack ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      for (;;) {
        if (data) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          const raw = Buffer.from(buf.slice(0, end), 'latin1')
            .toString('utf8')
            .replace(/^\.\./gm, '.');
          buf = buf.slice(end + 5);
          data = false;
          const parsed = parseMail(raw);
          messages.push({
            ID: String(++seq),
            From: { Address: from },
            To: to.map((a) => ({ Address: a })),
            Created: new Date().toISOString(),
            ...parsed,
          });
          to = [];
          sock.write('250 OK\r\n');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 lifeos-stack\r\n');
        else if (cmd === 'MAIL') {
          from = /<([^>]*)>/.exec(line)?.[1] ?? '';
          sock.write('250 OK\r\n');
        } else if (cmd === 'RCPT') {
          to.push(/<([^>]*)>/.exec(line)?.[1] ?? '');
          sock.write('250 OK\r\n');
        } else if (cmd === 'DATA') {
          data = true;
          sock.write('354 End with <CR><LF>.<CR><LF>\r\n');
        } else if (cmd === 'QUIT') {
          sock.end('221 Bye\r\n');
          return;
        } else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  })
  .listen(Number(env.STACK_SMTP_PORT ?? 2500), '127.0.0.1');

http
  .createServer((req, res) => {
    cors(req, res);
    const url = new URL(req.url, 'http://x');
    const json = (code, v) =>
      res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(v));
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (url.pathname === '/api/v1/messages' && req.method === 'DELETE') {
      messages.length = 0;
      return json(200, 'ok');
    }
    if (url.pathname === '/api/v1/messages') {
      const list = [...messages]
        .reverse()
        .map(({ ID, From, To, Subject, Created }) => ({ ID, From, To, Subject, Created }));
      return json(200, { total: list.length, messages: list });
    }
    const m = /^\/api\/v1\/message\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const msg = messages.find((x) => x.ID === m[1]);
      return msg ? json(200, msg) : json(404, { message: 'not found' });
    }
    json(404, { message: 'no route' });
  })
  .listen(Number(env.STACK_MAIL_PORT ?? 54324), '0.0.0.0');

console.log('gateway pronto');
