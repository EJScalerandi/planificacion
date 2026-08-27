// lib/logisticaDeposito.js
//
// Punto de partida fijo de TODOS los viajes de portones (depósito central) -
// pedido explícito del usuario. Coordenadas resueltas del link de Google
// Maps que pasó (De Grandis Portones): https://maps.app.goo.gl/k1iQaWnicnPnnMbN8
// -> redirige a @-31.6985857,-63.8706919. No es configurable desde la UI por
// ahora (un solo depósito, sin variación) - archivo propio y chico para que
// tanto el config del mapa (frontend) como el contexto de la IA de rutas lo
// usen desde un único lugar, sin duplicar el número.
const DEPOSITO = Object.freeze({
  nombre: 'De Grandis Portones',
  lat: -31.6985857,
  lng: -63.8706919,
});

module.exports = { DEPOSITO };
