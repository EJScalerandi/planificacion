// lib/logisticaCapacidad.js
//
// Regla de "peso" (cuántos portones cuenta) de una unidad para el descuento de
// capacidad del vehículo en un viaje. Mismo patrón "primer match gana" que las
// reglas de Sistema -> Fecha Salida del frontend (PreproduccionSistemaFechaSalidaRules.jsx),
// pero resuelto acá porque afecta capacidad real del vehículo (no es solo una
// recomendación visual) y tiene que quedar consistente sin importar quién arma
// el viaje.

// Igual heurística que toMmHeuristic en PreproduccionValoresTable.jsx: los datos
// de preproduccion_valores a veces vienen en metros ("2.4") y a veces ya en mm
// ("2400"), según cómo se haya tipeado.
function toMmHeuristic(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return x < 50 ? Math.round(x * 1000) : Math.round(x);
}

function campoValue(campo, altoMm, anchoMm) {
  if (campo === 'alto_mm') return altoMm;
  if (campo === 'ancho_mm') return anchoMm;
  // max_mm (default): la mayor dimensión, que es lo que en general importa para
  // decidir si entra o no en el vehículo.
  if (altoMm == null) return anchoMm;
  if (anchoMm == null) return altoMm;
  return Math.max(altoMm, anchoMm);
}

function compara(valor, operador, umbral) {
  if (valor == null) return false;
  switch (operador) {
    case '>': return valor > umbral;
    case '>=': return valor >= umbral;
    case '<': return valor < umbral;
    case '<=': return valor <= umbral;
    case '=': return valor === umbral;
    default: return false;
  }
}

/**
 * @param {{ alto?: any, ancho?: any }} medidas - valores crudos (string/number), como vienen de data.Alto/data.Ancho
 * @param {Array} reglas - filas de logistica_reglas_capacidad
 * @returns {{ peso: number, regla_id: number|null }}
 */
function computePeso(medidas, reglas) {
  const altoMm = toMmHeuristic(medidas?.alto);
  const anchoMm = toMmHeuristic(medidas?.ancho);

  const activas = (Array.isArray(reglas) ? reglas : [])
    .filter((r) => r?.activo !== false)
    .slice()
    .sort((a, b) => Number(a?.prioridad ?? 0) - Number(b?.prioridad ?? 0));

  for (const r of activas) {
    const valor = campoValue(r.campo, altoMm, anchoMm);
    const umbral = Number(r.valor_mm);
    if (!Number.isFinite(umbral)) continue;
    if (compara(valor, r.operador, umbral)) {
      return { peso: Number(r.peso) || 1, regla_id: r.id };
    }
  }

  return { peso: 1, regla_id: null };
}

module.exports = { computePeso, toMmHeuristic };
