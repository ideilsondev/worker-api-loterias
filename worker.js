/**
 * Caixa API Gateway v1 - Cloudflare Edge
 * Professional ACL (Access Control List) Implementation
 */
export default {
  async fetch(request, env) {
    const { CAIXA_API_URL, DEBUG_MODE, TOKENS } = env;
    const isDebug = DEBUG_MODE === "true";
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p);

    // 1. Root Path (/) - Discovery/Documentation
    if (pathParts.length === 0) {
      return Response.json({
        name: "API Loterias",
        version: "1.0.0",
        endpoints: {
          v1: {
            usage: "/v1/:loteria ou /v1/full/:loteria",
            history: "/v1/:loteria/:concurso",
            example: "/v1/megasena ou /v1/full/lotofacil/3000"
          }
        },
        auth: isDebug ? "Disabled (Debug Mode)" : "Required (Bearer Token)"
      });
    }

    // 2. Middleware de Autenticação para /v1
    if (pathParts[0] === 'v1' && !isDebug) {
      const isValid = validateToken(request, TOKENS);
      if (!isValid) {
        return Response.json({
          error: "unauthorized",
          message: "Token inválido ou não autorizado para este ambiente."
        }, { status: 401 });
      }
    }

    // 3. Roteamento da API (v1)
    if (pathParts[0] === 'v1') {
      const isFullView = pathParts[1] === 'full';
      const baseIdx = isFullView ? 2 : 1;
      const loteria = pathParts[baseIdx] || 'lotofacil';
      const concurso = pathParts[baseIdx + 1];

      const targetUrl = concurso
        ? `${CAIXA_API_URL}/${loteria}/${concurso}`
        : `${CAIXA_API_URL}/${loteria}`;

      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Origin': 'https://loterias.caixa.gov.br'
          }
        });

        if (!response.ok) return Response.json({ error: 'upstream_error', status: response.status }, { status: response.status });

        const data = await response.json();
        const isSpecial = checkIsSpecial(data.numero);

        // Payload Condicional
        if (isFullView) {
          return Response.json({
            loteria: data.tipoJogo,
            concurso: data.numero,
            concursoAt: data.dataApuracao || null,
            dezenas: data.dezenasSorteadasOrdemSorteio || [],
            dezenasAsc: data.listaDezenas || [],
            anterior: data.numeroConcursoAnterior,
            proximo: data.numeroConcursoProximo,
            proximoAt: data.dataProximoConcurso,
            especial: isSpecial,
            arrecadado: data.valorArrecadado,
            acumuladoConcursoEspecial: data.AcumuladoConcurso_0_5,
            acumuladoProximoConcurso: data.valorAcumuladoProximoConcurso,
            estimadoProximoConcurso: data.valorEstimadoProximoConcurso,
          }, { headers: corsHeaders() });
        }

        return Response.json({
          loteria: data.tipoJogo,
          concurso: data.numero,
          concursoAt: data.dataApuracao || null,
          dezenas: data.listaDezenas || [],
          proximo: data.numeroConcursoProximo,
          proximoAt: data.dataProximoConcurso,
          especial: isSpecial
        }, { headers: corsHeaders() });

      } catch (error) {
        return Response.json({ error: 'internal_error', message: error.message }, { status: 500 });
      }
    }

    return Response.json({ error: "not_found", message: "Use /v1 para acessar a API." }, { status: 404 });
  },
};

/**
 * Valida o token contra a lista de TOKENS (JSON) definida no ENV
 */
function validateToken(request, tokensEnv) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const token = authHeader.substring(7); // Remove "Bearer "

  try {
    const validTokens = JSON.parse(tokensEnv || "{}");
    // Verifica se a chave existe no objeto JSON. Ex: {"meu-token": "Descricao"}
    return !!validTokens[token];
  } catch (e) {
    console.error("Erro no parse da variável TOKENS. Certifique-se que é um JSON válido.");
    return false;
  }
}

function checkIsSpecial(value) {
  const num = Number(value);
  if (isNaN(num)) return false;
  const lastDigit = Math.abs(num) % 10;
  return lastDigit === 0 || lastDigit === 5;
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json;charset=UTF-8',
    'Access-Control-Allow-Origin': '*'
  };
}
