// Universo de claves de sección física de planta, con su etiqueta legible.
// Usado por los pickers de workflow de Prefabricados y Servicio Técnico.
export const SECTION_LABELS = {
  diseno: 'Diseño',
  laser: 'Laser',
  guillotina: 'Corte piernas',
  corte_revest: 'Corte revestimiento',
  plegadora: 'Plegado piernas',
  plegado_revest: 'Plegado revestimiento',
  armado_piernas: 'Prefabricados (Armado de piernas)',
  armado_marco_piernas: 'Armado de marcos piernas',
  armado_primario: 'Armado Primario',
  armado_hojas: 'Armado de hoja',
  inyeccion: 'Inyección',
  revestimiento: 'Revestimiento',
  pintura: 'Pintura Sistemas',
  pintura_revestimiento: 'Pintura Revestimiento',
  armado_final: 'Armado Final',
  despacho: 'Despacho',
  prefabricados: 'Prefabricados (stock)',
};

export const SECTION_KEYS = Object.keys(SECTION_LABELS);

export function sectionLabel(key) {
  return SECTION_LABELS[key] || key;
}
