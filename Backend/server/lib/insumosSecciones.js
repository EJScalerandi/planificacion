// Secciones para pedidos de insumos = una por RUTA/tablet (App.jsx ROUTES[].path
// sin la barra inicial), no por stage de workflow. OJO: usa guion medio
// (armado-primario), a diferencia de los stage_key de workflow (armado_primario,
// guion bajo) - son universos distintos, no confundir.
const INSUMOS_SECCIONES = [
  { slug: 'diseno', label: 'Diseño' },
  { slug: 'laser', label: 'Laser' },
  { slug: 'corte', label: 'Corte' },
  { slug: 'plegado', label: 'Plegado' },
  { slug: 'prefabricados', label: 'Prefabricados / Armado' },
  { slug: 'armado-primario', label: 'Armado Primario' },
  { slug: 'pintura', label: 'Pintura' },
  { slug: 'inyeccion', label: 'Inyección' },
  { slug: 'revestimiento', label: 'Revestimiento' },
  { slug: 'armado-final', label: 'Armado Final' },
  { slug: 'despacho', label: 'Despacho' },
];

const SECCION_SLUGS = new Set(INSUMOS_SECCIONES.map((s) => s.slug));

function isValidInsumosSeccion(seccion) {
  return SECCION_SLUGS.has(String(seccion || '').trim());
}

module.exports = { INSUMOS_SECCIONES, isValidInsumosSeccion };
