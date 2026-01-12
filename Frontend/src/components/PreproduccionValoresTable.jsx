// src/components/PreproduccionValoresTable.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  fetchPreproduccionValores,
  updatePreproduccionValor,
  createPorton,
  fetchPortones,
  getAdminToken,
} from '../api';

import LogisticaAuthModal from './modals/LogisticaAuthModal';
import AdminAuthModal from './modals/AdminAuthModal';
import ComercialAuthModal from './modals/ComercialAuthModal';

// =====================
// NV bloqueados (no deben aparecer)
// =====================
const BLOCKED_NV_SET = new Set(
  `
2837 2838 2839 2840 2841 2842 2843 2844 2845 2846 2869 2870 2849 2850 2851 2852 2853 2854 2855 2856 2857 2858 2859 2865 2862 2863 2864 2866 2871 2872 2873 2874 2876 2875 2877 2878 2880 2879 2881 2882 2883 2884 2885 2886 2887 2888 2889 2890 2891 2892 2893 2894 2895 2896 1591 2897 2898 2899 2900 2901 2902 2903 2904 2905 2906 2907 2908 2909 2910 2911 2912 2913 2914 2917 2918 2920 2921 2922 2923 2924 2926 2927 2928 2929 2931 2932 2934 2933 2935 2936 2937 2938 2939 2940 2941 2942 2943 2944 2945 2946 2947 2948 2949 2950 2951 2952 2953 2954 2955 2956 2957 2958 2959 2960 2961 2962 2963 2964 2965 2966 2967 2968 2969 2970 2971 2972 2974 2973 2975 2976 2977 2978 2980 2981 2982 2984 2983 2979 2985 2986 2987 2988 2989 2991 2992 2993 2994 2995 2996 2997 2998 2999 3000 3001 3022 3003 3004 3006 3007 3008 3009 3010 3267 3012 3013 3014 3015 3016 3017 3018 3019 3020 3021 3023 3024 3026 3027 3028 3029 3030 3031 3032 3033 3034 3035 3037 3038 3040 3041 3042 3044 3045 3046 3047 3048 3049 3050 3051 3052 3053 3054 3055 3056 3057 2520 3058 3059 3060 3061 3062 3063 3064 3065 3066 3067 3069 3070 3071 3072 3073 3074 3075 3077 3078 3079 3080 3081 3082 3084 3085 3086 3087 3088 3089 3090 3091 3093 3095 3096 3097 3098 3099 3102 3101 3100 3103 3104 3105 3106 3107 3108 3109 3110 3111 3112 3113 3114 3115 3117 3118 3119 3120 3121 3122 3123 3124 3125 3126 3127 3128 3129 3130 3131 3132 3133 3134 3135 3136 3137 3138 3139 3140 3141 3142 3143 3144 3145 3146 3147 3149 3150 3151 3152 3153 3154 3155 3156 3157 3158 3159 3160 3161 3162 3163 3164 3165 3166 3167 3168 3169 3171 3172 3173 3174 3175 3176 3178 3179 3180 3181 3182 3183 3184 3185 3186 3187 3188 3189 3190 3191 3192 3193 3194 3195 3196 3197 3198 3199 3200 3201 3202 3203 3204 3205 3206 3207 3209 3210 3211 3213 3215 3216 3217 3218 3219 3220 3221 3222 3223 3224 1476 3225 3226 3227 3228 3231 3232 3233 3286 3235 3236 3237 3238 3239 3240 3248 3242 3243 3244 3245 3246 3247 3249 3250 3251 3252 3287 3254 3255 3256 3257 3258 3259 3260 3261 3262 3263 3429 3265 3266 3270 3271 3272 3273 3274 3275 3276 3277 3278 3279 3280 3281 3283 3284 3285 3288 3289 3291 3292 3293 3294 3295 3296 3297 3298 3299 3300 3301 3302 3303 3304 3305 3306 3307 3310 3311 3312 3313 3314 3315 3316 3317 3318 3319 3321 3322 3323 3324 3325 3326 3327 3328 3329 3330 3331 3332 3333 3334 3335 3336 3337 3338 3339 3340 3341 3342 3343 3344 3345 3346 3347 3348 3349 3350 3351 3352 3353 3354 3355 3356 3357 3358 3359 3360 3361 3362 3363 3364 3365 3366 3367 3368 3369 3370 3371 3372 3373 3374 3375 3376 3377 3378 3379 3381 3382 3384 3385 3386 3387 3388 3389 3390 3391 3392 3393 3425 3395 3396 3397 3398 3400 3399 3401 3402 3403 3404 3405 3406 3407 3408 3409 3410 3411 3413 3414 3415 3416 3417 3418 3419 3420 3421 3422 3423 3424 3426 3427 3428 3430 3431 3432 3433 3434 3435 3436 3437 3438 3439 3440 3441 3442 3443 3444 3445 3446 3447 3448 3449 3450 3451 3452 3453 3454 3455 3457 3458 3459 3461 3462 3463 3464 3465 3466 3467 3468 3469 3470 3471 3472 3473 3474 3475 3477 3478 3479 3480 3481 3482 3483 3484 3485 3486 3487 3488 3489 3490 3491 3492 3493 3494 3495 3496 3497 3498 3499 3501 3502 3503 3504 3505 3506 3507 3508 3509 3512 3514 3515 3516 3517 3518 3519 3520 3522 3523 3524 3525 3526 3527 3528 3529 3530 3531 3532 3533 3534 3535 3536 3537 3538 3539 3540 3541 3542 3543 3544 3545 3546 3547 3548 3549 3550 3551 3552 3553 3554 3555 3556 3557 3558 3559 3560 3561 3562 3563 3568 3569 3570 3572 3573 3576 3577 3578 3579 3580 3581 3583 3584 3586 3587 3591 3592 3595 3596 3597 3598 3599 3601 3602 3607 3604 3605 3606 3609 3608 3611 3612 3613 3614 3615 3616 3617 3618 3619 3620 3621 3622 3623 3624 3625 3626 3627 3628 3629 3630 3631 3632 3633 3634 3664 3637 3638 3640 1774 3641 3642 3643 3645 3646 3647 3648 3649 3650 3651 3652 3653 3654 3656 3657 3658 3659 3662 3663 3665 3666 3667 3668 3669 3671 3672 3675 3677 3679 3682 3683 3684 3685 3686 3691 3692 3693 3694 3695 3696 3697 3698 3699 3700 3701 3702 3703 3704 3705 3706 3708 3709 3710 3711 3712 3713 3714 3716 3717 3721 3723 3724 3725 3726 3727 3728 3729 3730 3731 3732 3733 3734 3735 3738 3741 3743 3745 3746 3747 3748 3749 3752 3755 3756 3759 3763 3765 3766 3767 3768 3769 3777 3780 3781 3782 3784 3791 3793 3794 3795 3796 3798
`
    .trim()
    .split(/\s+/)
);

// =====================
// Constantes
// =====================
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// =====================
// Helpers
// =====================
function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ===== JWT/Scopes =====
function parseJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') {
    return scopesRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function getCurrentScopes() {
  const token = getAdminToken();
  const payload = parseJwt(token) || {};
  return normalizeScopes(payload.scopes ?? payload.scope ?? payload.permissions ?? []);
}

function hasAny(scopes, needed) {
  const set = new Set((scopes || []).map((s) => String(s || '').trim()));
  return (needed || []).some((n) => set.has(n));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate10(v) {
  if (!v) return '';
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getUTCFullYear();
    const mm = pad2(d.getUTCMonth() + 1);
    const dd = pad2(d.getUTCDate());
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

function isISODate10(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

function normalizeDate10(v) {
  return toISODate10(v) || '';
}

function formatDMY(date10) {
  const d = toISODate10(date10);
  if (!d) return '';
  const [yyyy, mm, dd] = d.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function getAny(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
  }
  return null;
}

function getCellValue(row, col) {
  const data = row?.data || {};
  if (col.patchKey) {
    const v = data[col.patchKey];
    if (v != null) return v;
  }
  if (col.sourceKeys?.length) {
    const v1 = getAny(data, col.sourceKeys);
    if (v1 != null) return v1;
    const v2 = getAny(row, col.sourceKeys);
    if (v2 != null) return v2;
  }
  return null;
}

function ciIncludes(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function isoWeekLabelFromDate(dateLike) {
  const date10 = toISODate10(dateLike);
  if (!isISODate10(date10)) return '';
  const d = new Date(`${date10}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - firstThu) / (7 * 24 * 3600 * 1000));
  const year = d.getUTCFullYear();
  const ww = String(week).padStart(2, '0');
  return `${year}-W${ww}`;
}

function weekLabelFromRow(row, mode) {
  const d = row?.data || {};
  if (mode === 'produccion') return isoWeekLabelFromDate(d.inicio_prod_imput ?? d.Inicio_Prod_Imput ?? '');
  if (mode === 'despacho') return isoWeekLabelFromDate(d.fecha_salida_imput ?? d.Fecha_Salida_Imput ?? '');
  return '';
}

function weekNumberFromLabel(weekLabel) {
  const m = String(weekLabel || '').match(/^\d{4}-W(\d{2})$/);
  if (!m) return '';
  return String(Number(m[1]));
}

function isoWeekStartEndFromLabel(weekLabel) {
  const m = String(weekLabel || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return { start: '', end: '' };
  const year = Number(m[1]);
  const week = Number(m[2]);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day);

  const startDt = new Date(week1Mon);
  startDt.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  const endDt = new Date(startDt);
  endDt.setUTCDate(startDt.getUTCDate() + 7);

  const start = `${startDt.getUTCFullYear()}-${pad2(startDt.getUTCMonth() + 1)}-${pad2(startDt.getUTCDate())}`;
  const end = `${endDt.getUTCFullYear()}-${pad2(endDt.getUTCMonth() + 1)}-${pad2(endDt.getUTCDate())}`;
  return { start, end };
}

function weekTitleFromSelection(weekLabel) {
  const m = String(weekLabel || '').match(/^\d{4}-W(\d{2})$/);
  const n = m ? String(Number(m[1])) : '';
  const { start, end } = isoWeekStartEndFromLabel(weekLabel);
  if (!n || !start || !end) return '';
  return `Semana ${n} ${formatDMY(start)} al ${formatDMY(end)}`;
}

function toMmHeuristic(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return x < 50 ? Math.round(x * 1000) : Math.round(x);
}

function medidasDisplayFromRow(row) {
  const d = row?.data || {};
  const altoRaw = d.Alto ?? d.alto ?? d.Puerta_Alto ?? d.puerta_alto;
  const anchoRaw = d.Ancho ?? d.ancho ?? d.Puerta_Ancho ?? d.puerta_ancho;

  const altoMm = toMmHeuristic(altoRaw);
  const anchoMm = toMmHeuristic(anchoRaw);

  return altoMm != null && anchoMm != null ? `${altoMm}x${anchoMm}` : '';
}

function getNvCanonicalFromRow(row) {
  const d = row?.data || {};
  const v = getAny(d, ['NV', 'nv']) ?? getAny(row, ['NV', 'nv']);
  if (v == null) return '';
  const s = String(v).trim();
  const m = s.match(/\d+/);
  return m ? m[0] : s;
}

function getNvIntFromRow(row) {
  const nvStr = getNvCanonicalFromRow(row);
  const nv = parseInt(String(nvStr || '').trim(), 10);
  return Number.isFinite(nv) ? nv : null;
}

// =====================
// PDF field defs
// =====================
function getPdfFieldDefs() {
  return [
    { id: 'estado', label: 'ESTADO', type: 'text', patchKey: 'estado_imput' },
    { id: 'fecha_venta', label: 'Fecha Venta', type: 'text', sourceKeys: ['Fecha_NV', 'Fecha_Nv', 'fecha_nv'] },

    { id: 'fecha_medicion', label: 'Fecha Medición', type: 'date', patchKey: 'fecha_medicion_imput' },
    { id: 'inicio_prod', label: 'Inicio Prod', type: 'date', patchKey: 'inicio_prod_imput' },
    { id: 'fecha_probable', label: 'Fecha Probable', type: 'day', patchKey: 'fecha_probable_imput' },
    { id: 'fecha_salida', label: 'Fecha Salida', type: 'date', patchKey: 'fecha_salida_imput' },
    { id: 'fecha_llegada', label: 'Fecha Llegada', type: 'date', patchKey: 'fecha_llegada_imput' },

    { id: 'partida', label: 'Partida', type: 'text', sourceKeys: ['PARTIDA', 'Partida', 'partida'] },
    { id: 'nv', label: 'NV', type: 'text', sourceKeys: ['NV', 'nv'] },
    { id: 'nombre', label: 'Nombre', type: 'text', sourceKeys: ['Nombre'] },
    { id: 'distribuidor', label: 'Distribuidor', type: 'text', sourceKeys: ['RazSoc', 'RazonSocial', 'Raz_Soc'] },

    { id: 'tipo', label: 'Tipo', type: 'text', patchKey: 'tipo_imput' },
    { id: 'color', label: 'Color', type: 'text', sourceKeys: ['Color', 'Color_Hoja'] },
    { id: 'revestimiento', label: 'Revestimiento', type: 'text', sourceKeys: ['Sistema'] },

    {
      id: 'condicion',
      label: 'Condición',
      type: 'text',
      sourceKeys: ['Tipo_embalaje', 'Tipo_Embalaje', 'tipo_embalaje'],
    },
    { id: 'direccion', label: 'Dirección', type: 'text', sourceKeys: ['Direccion', 'Dirección', 'direccion'] },

    { id: 'medidas', label: 'Medidas', type: 'calc_medidas' },

    { id: 'transporte', label: 'Transporte', type: 'text', patchKey: 'transporte_imput' },
    { id: 'instaladores', label: 'Instaladores', type: 'text', patchKey: 'instaladores_imput' },
    { id: 'observacion', label: 'Observación', type: 'text', patchKey: 'observacion_imput' },
  ];
}

// =====================
// Print
// =====================
function openPdfPrintWindow({ title, rows, cols }) {
  const safeCols = (cols || []).filter((c) => c && c.id && c.label);

  const css = `
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
      h1 { font-size: 16px; margin: 0 0 10px 0; }
      .muted { color: #666; font-size: 11px; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; }
      th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; vertical-align: top; }
      th { background: #f4f4f4; text-align: left; }
      @media print { body { margin: 10mm; } table { page-break-inside: avoid; } }
    </style>
  `;

  const now = new Date();
  const stamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  const cellForPdf = (r, col) => {
    const d = r?.data || {};

    if (col.type === 'date') return formatDMY(toISODate10(d[col.patchKey] ?? ''));
    if (col.type === 'calc_medidas') return medidasDisplayFromRow(r);
    if (col.type === 'day') return toStr(d[col.patchKey] ?? '');
    if (col.patchKey) return toStr(d[col.patchKey] ?? '');
    if (col.sourceKeys?.length) return toStr(getAny(d, col.sourceKeys) ?? '');
    return '';
  };

  const thead = safeCols.map((c) => `<th>${toStr(c.label)}</th>`).join('');
  const tbody = (rows || [])
    .map((r) => `<tr>${safeCols.map((c) => `<td>${toStr(cellForPdf(r, c))}</td>`).join('')}</tr>`)
    .join('');

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${toStr(title || 'Preproducción - PDF')}</title>
        ${css}
      </head>
      <body>
        <h1>${toStr(title || 'Preproducción')}</h1>
        <div class="muted">Generado: ${stamp} · Registros: ${(rows || []).length} · Columnas: ${safeCols.length}</div>
        ${
          (rows || []).length
            ? `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
            : `<div class="muted">Sin datos para imprimir.</div>`
        }
      </body>
    </html>
  `;

  try {
    const w = window.open('about:blank', '_blank');
    if (w && w.document) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try {
          w.print();
        } catch {
          tryPrintInIframe(html);
          try {
            w.close();
          } catch {}
        }
      }, 250);
      return;
    }
  } catch {}

  tryPrintInIframe(html);

  function tryPrintInIframe(docHtml) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const idoc = iframe.contentWindow?.document;
    if (!idoc) {
      alert('No se pudo generar el PDF (bloqueo del navegador).');
      try {
        document.body.removeChild(iframe);
      } catch {}
      return;
    }

    idoc.open();
    idoc.write(docHtml);
    idoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } finally {
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 500);
      }
    }, 250);
  }
}

// =====================
// Column config
// =====================
const BASE_COLS = [
  { id: 'estado', label: 'ESTADO', patchKey: 'estado_imput' },

  { id: 'fecha_venta', label: 'Fecha Venta', type: 'date', sourceKeys: ['Fecha_NV', 'Fecha_Nv', 'fecha_nv'] },

  { id: 'fecha_medicion', label: 'Fecha Medición', type: 'date', patchKey: 'fecha_medicion_imput' },
  { id: 'inicio_prod', label: 'Inicio Prod', type: 'date', patchKey: 'inicio_prod_imput' },
  { id: 'fecha_probable', label: 'Fecha Probable', type: 'day', patchKey: 'fecha_probable_imput' },
  { id: 'fecha_salida', label: 'Fecha Salida', type: 'date', patchKey: 'fecha_salida_imput' },
  { id: 'semana_produccion', label: 'Semana Producción', type: 'week_produccion' },
  { id: 'semana_despacho', label: 'Semana Despacho', type: 'week_despacho' },
  { id: 'fecha_llegada', label: 'Fecha Llegada', type: 'date', patchKey: 'fecha_llegada_imput' },

  { id: 'partida', label: 'Partida', sourceKeys: ['PARTIDA', 'Partida', 'partida'] },
  { id: 'nv', label: 'NV', sourceKeys: ['NV', 'nv'] },
  { id: 'nombre', label: 'Nombre', sourceKeys: ['Nombre'] },
  { id: 'distribuidor', label: 'Distribuidor', sourceKeys: ['RazSoc', 'RazonSocial', 'Raz_Soc'] },

  { id: 'tipo', label: 'Tipo', patchKey: 'tipo_imput' },

  { id: 'color', label: 'Color', sourceKeys: ['Color', 'Color_Hoja'] },
  { id: 'revestimiento', label: 'Revestimiento', sourceKeys: ['Sistema'] },

  { id: 'condicion', label: 'Condición', sourceKeys: ['Tipo_embalaje', 'Tipo_Embalaje', 'tipo_embalaje'] },
  { id: 'direccion', label: 'Dirección', sourceKeys: ['Direccion', 'Dirección', 'direccion'] },

  { id: 'medidas', label: 'Medidas', type: 'calc_medidas' },

  { id: 'transporte', label: 'Transporte', patchKey: 'transporte_imput' },
  { id: 'instaladores', label: 'Instaladores', patchKey: 'instaladores_imput' },
  { id: 'observacion', label: 'Observación', patchKey: 'observacion_imput' },

  { id: 'auth_admin', label: 'Aut. Admin', type: 'bool', patchKey: 'auth_admin' },
  { id: 'auth_logistica', label: 'Aut. Logística', type: 'bool', patchKey: 'auth_logistica' },
  { id: 'auth_comercial', label: 'Aut. Comercial', type: 'bool', patchKey: 'auth_comercial' },
];

const ACTION_COL = { id: 'acciones', label: 'Acciones', type: 'actions' };

function loadVisibleColsFromStorage(allCols) {
  try {
    const raw = localStorage.getItem('pp_visible_cols_v5');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const out = {};
    for (const c of allCols) out[c.id] = parsed[c.id] !== false;
    return out;
  } catch {
    return null;
  }
}

function saveVisibleColsToStorage(map) {
  try {
    localStorage.setItem('pp_visible_cols_v5', JSON.stringify(map));
  } catch {}
}

function loadPdfFieldsFromStorage(fieldDefs) {
  try {
    const raw = localStorage.getItem('pp_pdf_fields_v4');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const out = {};
    for (const f of fieldDefs) out[f.id] = parsed[f.id] !== false;
    return out;
  } catch {
    return null;
  }
}

function savePdfFieldsToStorage(map) {
  try {
    localStorage.setItem('pp_pdf_fields_v4', JSON.stringify(map));
  } catch {}
}

export default function PreproduccionValoresTable() {
  // ===== Scopes / accessMode =====
  const userScopes = useMemo(() => getCurrentScopes(), []);

  const isFull = useMemo(() => hasAny(userScopes, ['preproduccion:full']), [userScopes]);

  const isAdmin = useMemo(() => !isFull && hasAny(userScopes, ['preproduccion:admin']), [userScopes, isFull]);

  const isLimited = useMemo(
    () => !isFull && !isAdmin && hasAny(userScopes, ['preproduccion:comercial_view']),
    [userScopes, isFull, isAdmin]
  );

  const accessMode = isFull ? 'full' : isAdmin ? 'admin' : isLimited ? 'limited' : 'none';

  const LIMITED_COL_IDS = useMemo(
    () => new Set(['fecha_venta', 'nv', 'nombre', 'distribuidor', 'fecha_salida', 'inicio_prod']),
    []
  );

  const ADMIN_COL_IDS = useMemo(() => new Set(['fecha_venta', 'nv', 'nombre', 'distribuidor', 'fecha_salida']), []);

  const LIMITED_LABEL_OVERRIDES = useMemo(
    () => ({
      distribuidor: 'Razón Social',
      inicio_prod: 'Fecha Producción',
    }),
    []
  );

  const ALL_COLS = useMemo(() => {
    if (accessMode === 'limited') {
      return BASE_COLS.filter((c) => LIMITED_COL_IDS.has(c.id)).map((c) =>
        LIMITED_LABEL_OVERRIDES[c.id] ? { ...c, label: LIMITED_LABEL_OVERRIDES[c.id] } : c
      );
    }

    if (accessMode === 'admin') {
      // Solo lectura, sin acciones, sin auth
      return BASE_COLS.filter((c) => ADMIN_COL_IDS.has(c.id));
    }

    // full
    return [...BASE_COLS, ACTION_COL];
  }, [accessMode, LIMITED_COL_IDS, ADMIN_COL_IDS, LIMITED_LABEL_OVERRIDES]);

  const PDF_DEFS = useMemo(() => getPdfFieldDefs(), []);

  // ADMIN: semana objetivo = "semana siguiente" (desde el lunes ya ve toda la semana próxima)
  const adminTargetWeekLabel = useMemo(() => {
    if (accessMode !== 'admin') return '';
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return isoWeekLabelFromDate(d.toISOString().slice(0, 10));
  }, [accessMode]);

  // Sin permisos
  if (accessMode === 'none') {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: 12, borderRadius: 12 }}>
          No tenés permisos para ver Preproducción. Pedí que te asignen: <b>preproduccion:full</b>,{' '}
          <b>preproduccion:admin</b> o <b>preproduccion:comercial_view</b>.
        </div>
      </div>
    );
  }

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(() => new Set());

  // ====== Estado basado en PORTONES (full/admin) ======
  const [portonesNvSet, setPortonesNvSet] = useState(() => new Set());
  const [portonesIndexState, setPortonesIndexState] = useState('idle'); // idle|loading|ok|error

  // Filtros:
  // - string para texto
  // - { from:'YYYY-MM-DD', to:'YYYY-MM-DD', has:boolean, empty:boolean } para fechas
  const [filters, setFilters] = useState(() => {
    const o = {};
    for (const c of ALL_COLS) {
      if (c.type === 'date') o[c.id] = { from: '', to: '', has: false, empty: false };
      else o[c.id] = '';
    }
    return o;
  });

  // Columnas visibles:
  // - full: configurable y persistente
  // - limited/admin: fijo (todas las disponibles del modo)
  const [showColsPanel, setShowColsPanel] = useState(false);
  const colsPanelRef = useRef(null);

  const [visibleCols, setVisibleCols] = useState(() => {
    const initial = {};
    for (const c of ALL_COLS) initial[c.id] = true;

    if (accessMode === 'limited' || accessMode === 'admin') return initial;

    const stored = loadVisibleColsFromStorage(ALL_COLS);
    if (stored) return stored;

    return initial;
  });

  useEffect(() => {
    if (accessMode !== 'full') return;
    saveVisibleColsToStorage(visibleCols);
  }, [visibleCols, accessMode]);

  // Panel PDF (solo full)
  const [showPdfPanel, setShowPdfPanel] = useState(false);
  const pdfPanelRef = useRef(null);
  const [pdfMode, setPdfMode] = useState('produccion');
  const [pdfWeek, setPdfWeek] = useState('');

  const [pdfFields, setPdfFields] = useState(() => {
    const stored = loadPdfFieldsFromStorage(PDF_DEFS);
    if (stored) return stored;
    const init = {};
    for (const f of PDF_DEFS) init[f.id] = true;
    return init;
  });
  useEffect(() => {
    if (accessMode !== 'full') return;
    savePdfFieldsToStorage(pdfFields);
  }, [pdfFields, PDF_DEFS, accessMode]);

  // ===== Modales (solo full) =====
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalRow, setLogModalRow] = useState(null);
  const [logModalBusy, setLogModalBusy] = useState(false);

  const openLogModal = (row) => {
    setLogModalRow(row);
    setLogModalOpen(true);
  };
  const closeLogModal = () => {
    if (logModalBusy) return;
    setLogModalOpen(false);
    setLogModalRow(null);
  };

  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminModalRow, setAdminModalRow] = useState(null);
  const [adminModalBusy, setAdminModalBusy] = useState(false);

  const openAdminModal = (row) => {
    const d = row?.data || {};
    if (Boolean(d.auth_admin)) return;
    setAdminModalRow(row);
    setAdminModalOpen(true);
  };
  const closeAdminModal = () => {
    if (adminModalBusy) return;
    setAdminModalOpen(false);
    setAdminModalRow(null);
  };

  const [comModalOpen, setComModalOpen] = useState(false);
  const [comModalRow, setComModalRow] = useState(null);
  const [comModalBusy, setComModalBusy] = useState(false);

  const openComModal = (row) => {
    const d = row?.data || {};
    if (Boolean(d.auth_comercial)) return;
    setComModalRow(row);
    setComModalOpen(true);
  };
  const closeComModal = () => {
    if (comModalBusy) return;
    setComModalOpen(false);
    setComModalRow(null);
  };

  // Paginado
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const onDocClick = (e) => {
      if (showColsPanel) {
        const el = colsPanelRef.current;
        if (el && !el.contains(e.target)) setShowColsPanel(false);
      }
      if (showPdfPanel) {
        const el = pdfPanelRef.current;
        if (el && !el.contains(e.target)) setShowPdfPanel(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showColsPanel, showPdfPanel]);

  const visibleColsList = useMemo(() => ALL_COLS.filter((c) => visibleCols[c.id] !== false), [ALL_COLS, visibleCols]);

  const refreshPortonesNvIndex = useCallback(async () => {
    setPortonesIndexState('loading');
    try {
      const rr = await fetchPortones();
      const list = Array.isArray(rr?.data) ? rr.data : rr?.data ? [rr.data] : [];

      const set = new Set();
      for (const it of list) {
        const nv = parseInt(String(it?.nv ?? it?.NV ?? it?.nlista ?? it?.NLista ?? '').trim(), 10);
        if (Number.isFinite(nv)) set.add(nv);
      }
      setPortonesNvSet(set);
      setPortonesIndexState('ok');
    } catch {
      setPortonesNvSet(new Set());
      setPortonesIndexState('error');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetchPreproduccionValores();
      const list = Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [];
      setRows(list);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Error cargando preproducción');
    } finally {
      setLoading(false);
    }

    if (accessMode === 'full' || accessMode === 'admin') {
      await refreshPortonesNvIndex();
    }
  }, [refreshPortonesNvIndex, accessMode]);

  useEffect(() => {
    load();
  }, [load]);

  const onPatch = useCallback(async (id, patch) => {
    if (!id) return;
    setSaving((prev) => new Set(prev).add(id));
    try {
      const res = await updatePreproduccionValor(id, patch);
      const updated = res?.data;
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      return updated;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Error guardando';
      alert(msg);
      throw e;
    } finally {
      setSaving((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }, []);

  const submitLogisticaAuth = useCallback(
    async (patch) => {
      const id = logModalRow?.id;
      if (!id) return;
      setLogModalBusy(true);
      try {
        await onPatch(id, patch);
        closeLogModal();
      } finally {
        setLogModalBusy(false);
      }
    },
    [logModalRow, onPatch]
  );

  const submitAdminAuth = useCallback(
    async (patch) => {
      const id = adminModalRow?.id;
      if (!id) return;
      setAdminModalBusy(true);
      try {
        await onPatch(id, patch);
        closeAdminModal();
      } finally {
        setAdminModalBusy(false);
      }
    },
    [adminModalRow, onPatch]
  );

  const submitComercialAuth = useCallback(
    async (patch) => {
      const id = comModalRow?.id;
      if (!id) return;
      setComModalBusy(true);
      try {
        await onPatch(id, patch);
        closeComModal();
      } finally {
        setComModalBusy(false);
      }
    },
    [comModalRow, onPatch]
  );

  // ====== EXCLUSIÓN GLOBAL por NV ======
  const rowsAfterNvExclusion = useMemo(() => {
    return (rows || []).filter((r) => {
      const nv = getNvCanonicalFromRow(r);
      return nv ? !BLOCKED_NV_SET.has(nv) : true;
    });
  }, [rows]);

  // ====== Estado acciones (solo full, pero queda definido) ======
  const getAccionesStatus = useCallback(
    (row) => {
      const d = row?.data || {};
      const okAuth = Boolean(d.auth_admin) && Boolean(d.auth_logistica) && Boolean(d.auth_comercial);

      const nv = getNvIntFromRow(row);
      const inPortones = nv != null ? portonesNvSet.has(nv) : false;

      if (inPortones) return 'produccion';
      if (!okAuth) return 'pendiente';
      return 'listo';
    },
    [portonesNvSet]
  );

  // =====================
  // Date filter: intervalo + con fecha + sin fecha
  // =====================
  function matchDateFilter(cellDateLike, filterObj) {
    const cell = normalizeDate10(cellDateLike);

    const from = normalizeDate10(filterObj?.from);
    const to = normalizeDate10(filterObj?.to);
    const wantHas = Boolean(filterObj?.has);
    const wantEmpty = Boolean(filterObj?.empty);

    const hasRange = Boolean(from || to);
    const hasDate = Boolean(cell);

    if (!hasRange && !wantHas && !wantEmpty) return true;

    let inRange = false;
    if (hasRange) {
      if (hasDate) {
        inRange = true;
        if (from && cell < from) inRange = false;
        if (to && cell > to) inRange = false;
      }
    }

    let ok = false;
    if (hasRange) ok = ok || inRange;
    if (wantEmpty) ok = ok || !hasDate;
    if (wantHas && !hasRange) ok = ok || hasDate;

    return ok;
  }

  const filteredRows = useMemo(() => {
    const active = Object.entries(filters).filter(([colId, v]) => {
      if (visibleCols[colId] === false) return false;
      const col = ALL_COLS.find((c) => c.id === colId);
      if (!col) return false;

      if (col.type === 'date') {
        const obj = v && typeof v === 'object' ? v : { from: '', to: '', has: false, empty: false };
        return (
          String(obj.from || '').trim() !== '' ||
          String(obj.to || '').trim() !== '' ||
          Boolean(obj.has) ||
          Boolean(obj.empty)
        );
      }
      return String(v || '').trim() !== '';
    });

    let base = rowsAfterNvExclusion;

    // ADMIN: mostrar SOLO portones cuya Fecha Salida cae en la semana siguiente (ISO week)
    // y que existan en Portones (según índice portonesNvSet).
    if (accessMode === 'admin') {
      base = base.filter((row) => {
        const nv = getNvIntFromRow(row);
        if (nv == null) return false;
        if (!portonesNvSet.has(nv)) return false;

        const lab = weekLabelFromRow(row, 'despacho'); // Fecha Salida
        return adminTargetWeekLabel ? lab === adminTargetWeekLabel : false;
      });
    }

    if (!active.length) return base;

    return base.filter((row) => {
      return active.every(([colId, fval]) => {
        const col = ALL_COLS.find((c) => c.id === colId);
        if (!col) return true;

        if (col.type === 'actions') {
          const needle = String(fval || '').toLowerCase().trim();
          if (!needle) return true;
          const st = getAccionesStatus(row);
          if (needle === 'pendiente') return st === 'pendiente';
          if (needle === 'listo') return st === 'listo';
          if (needle === 'produccion') return st === 'produccion';
          return true;
        }

        if (col.type === 'calc_medidas') return ciIncludes(medidasDisplayFromRow(row), fval);

        if (col.type === 'week_produccion') {
          const w = weekNumberFromLabel(weekLabelFromRow(row, 'produccion'));
          return ciIncludes(w, fval);
        }
        if (col.type === 'week_despacho') {
          const w = weekNumberFromLabel(weekLabelFromRow(row, 'despacho'));
          return ciIncludes(w, fval);
        }

        const raw = getCellValue(row, col);

        if (col.type === 'date') {
          const obj = fval && typeof fval === 'object' ? fval : { from: '', to: '', has: false, empty: false };
          return matchDateFilter(raw, obj);
        }

        if (col.type === 'bool') {
          const b = Boolean(raw);
          const needle = String(fval).toLowerCase().trim();
          if (['si', 'sí', 'true', '1'].includes(needle)) return b === true;
          if (['no', 'false', '0'].includes(needle)) return b === false;
          return true;
        }

        return ciIncludes(toStr(raw), fval);
      });
    });
  }, [
    rowsAfterNvExclusion,
    filters,
    ALL_COLS,
    visibleCols,
    getAccionesStatus,
    accessMode,
    portonesNvSet,
    adminTargetWeekLabel,
  ]);

  useEffect(() => setPage(1), [filters, pageSize]);

  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(total, startIdx + pageSize);
  const pagedRows = useMemo(() => filteredRows.slice(startIdx, endIdx), [filteredRows, startIdx, endIdx]);

  const sendToProduccion = useCallback(
    async (row) => {
      if (accessMode !== 'full') return;

      const id = row?.id;
      if (!id) return;

      const d = row?.data || {};
      const okAuth = Boolean(d.auth_admin) && Boolean(d.auth_logistica) && Boolean(d.auth_comercial);
      if (!okAuth) return;

      const nv = getNvIntFromRow(row);
      if (nv == null) {
        alert('No se pudo enviar: NV inválido.');
        return;
      }

      if (portonesNvSet.has(nv)) return;

      const dateOrNull = (v) => {
        const x = normalizeDate10(v);
        return x ? x : null;
      };

      const payload = {
        nv,
        nlista: nv,
        partida: 800,
        fecha_plan: dateOrNull(d.fecha_salida_imput ?? d.Fecha_Salida_Imput ?? null),
        fecha_prod: dateOrNull(d.inicio_prod_imput ?? d.Inicio_Prod_Imput ?? null),
        fecha_nv: dateOrNull(getAny(d, ['Fecha_NV', 'fecha_nv', 'Fecha_Venta', 'fecha_venta'])),
        fecha_med: dateOrNull(d.fecha_medicion_imput ?? d.Fecha_Medicion_Imput ?? null),
      };

      try {
        await createPorton(payload);
        setPortonesNvSet((prev) => {
          const next = new Set(prev);
          next.add(nv);
          return next;
        });

        await onPatch(id, { fecha_envio_produccion: new Date().toISOString() });
      } catch (e) {
        const status = e?.response?.status;
        const msg = e?.response?.data?.error || e?.message || 'Error enviando a producción';

        const isDuplicate =
          status === 409 ||
          String(msg).toLowerCase().includes('duplicate') ||
          String(msg).toLowerCase().includes('unique') ||
          String(msg).toLowerCase().includes('portones_nv_nlista_uniq');

        if (isDuplicate) {
          setPortonesNvSet((prev) => {
            const next = new Set(prev);
            next.add(nv);
            return next;
          });
          return;
        }

        alert(msg);
      }
    },
    [onPatch, portonesNvSet, accessMode]
  );

  // ======= ÚNICA DECLARACIÓN =======
  const pdfWeeksList = useMemo(() => {
    const set = new Set();
    for (const r of filteredRows) {
      const lab = weekLabelFromRow(r, pdfMode);
      if (lab) set.add(lab);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filteredRows, pdfMode]);

  const pdfSelectedRows = useMemo(() => {
    return filteredRows.filter((r) => (!pdfWeek ? true : weekLabelFromRow(r, pdfMode) === pdfWeek));
  }, [filteredRows, pdfMode, pdfWeek]);

  const printPdf = useCallback(() => {
    const colsOrdered = PDF_DEFS.filter((f) => pdfFields[f.id] !== false);

    if (pdfSelectedRows.length === 0) {
      alert('No hay registros para esa semana. Revisá formato de fechas o filtros.');
      return;
    }
    if (colsOrdered.length === 0) {
      alert('Seleccioná al menos un campo para imprimir.');
      return;
    }

    const title = pdfWeek ? weekTitleFromSelection(pdfWeek) : `Preproducción - Semanas (${pdfMode})`;
    openPdfPrintWindow({ title, rows: pdfSelectedRows, cols: colsOrdered });
  }, [PDF_DEFS, pdfFields, pdfSelectedRows, pdfWeek, pdfMode]);

  const toggleAllCols = (nextVisible) => {
    const map = {};
    for (const c of ALL_COLS) map[c.id] = nextVisible;
    setVisibleCols(map);
  };

  const toggleAllPdfFields = (nextVisible) => {
    const map = {};
    for (const f of PDF_DEFS) map[f.id] = nextVisible;
    setPdfFields(map);
  };

  const renderDateFilter = (colId) => {
    const curr =
      filters[colId] && typeof filters[colId] === 'object'
        ? filters[colId]
        : { from: '', to: '', has: false, empty: false };

    const from = curr.from || '';
    const to = curr.to || '';
    const has = Boolean(curr.has);
    const empty = Boolean(curr.empty);

    const setObj = (next) => setFilters((p) => ({ ...p, [colId]: { ...curr, ...next } }));

    return (
      <div className="pp-dateFilterBox">
        <div className="pp-dateRow">
          <div>
            <div className="pp-dateLabel">Desde</div>
            <input type="date" value={from} onChange={(e) => setObj({ from: e.target.value })} className="pp-input" />
          </div>
          <div>
            <div className="pp-dateLabel">Hasta</div>
            <input type="date" value={to} onChange={(e) => setObj({ to: e.target.value })} className="pp-input" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={has} onChange={(e) => setObj({ has: e.target.checked })} />
            <span style={{ fontSize: 12 }}>Con fecha</span>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={empty} onChange={(e) => setObj({ empty: e.target.checked })} />
            <span style={{ fontSize: 12 }}>Sin fecha</span>
          </label>
        </div>

        <button
          type="button"
          className="btn"
          style={{ marginTop: 8 }}
          onClick={() => setFilters((p) => ({ ...p, [colId]: { from: '', to: '', has: false, empty: false } }))}
        >
          Limpiar
        </button>
      </div>
    );
  };

  const renderCell = (row, col) => {
    // ===== limited/admin: SOLO LECTURA =====
    if (accessMode === 'limited' || accessMode === 'admin') {
      const raw = getCellValue(row, col);
      if (col.id === 'fecha_venta') {
        return <span>{formatDMY(toISODate10(raw))}</span>;
      }
      if (col.type === 'date') return <span>{formatDMY(toISODate10(raw))}</span>;
      return <span>{toStr(raw)}</span>;
    }

    // ===== full: comportamiento actual =====
    const data = row?.data || {};
    const id = row.id;
    const isBusy = saving.has(id);

    if (col.type === 'actions') {
      const st = getAccionesStatus(row);
      const alreadySent = st === 'produccion';

      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {alreadySent ? (
            <span className="pp-badge pp-badge--ok">Enviado</span>
          ) : st === 'listo' ? (
            <button
              onClick={() => sendToProduccion(row)}
              disabled={isBusy}
              className="btn btn--brand pp-btnCell"
              title="Enviar a producción (requiere 3 autorizaciones)"
            >
              Enviar a producción
            </button>
          ) : (
            <span className="pp-badge pp-badge--pending" title="Faltan autorizaciones">
              Pendiente
            </span>
          )}
        </div>
      );
    }

    if (col.type === 'week_produccion') return <span>{weekNumberFromLabel(weekLabelFromRow(row, 'produccion'))}</span>;
    if (col.type === 'week_despacho') return <span>{weekNumberFromLabel(weekLabelFromRow(row, 'despacho'))}</span>;
    if (col.type === 'calc_medidas') return <span>{medidasDisplayFromRow(row)}</span>;

    if (col.type === 'bool' && col.patchKey) {
      if (col.patchKey === 'auth_admin') {
        const ok = Boolean(data.auth_admin);
        if (ok) return <span className="pp-badge pp-badge--ok">Autorizado</span>;
        return (
          <button
            type="button"
            className="pp-btnCell pp-btnCell--brand"
            onClick={() => openAdminModal(row)}
            disabled={isBusy}
            title="Autorizar administración"
          >
            Autorizar
          </button>
        );
      }

      if (col.patchKey === 'auth_logistica') {
        const ok = Boolean(data.auth_logistica);
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {ok ? (
              <>
                <span className="pp-badge pp-badge--ok">Autorizado</span>
                <button
                  type="button"
                  className="pp-btnCell"
                  onClick={() => openLogModal(row)}
                  disabled={isBusy}
                  title="Ver / Editar datos de autorización logística"
                >
                  Ver / Editar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pp-btnCell pp-btnCell--brand"
                onClick={() => openLogModal(row)}
                disabled={isBusy}
                title="Autorizar logística (requiere completar datos obligatorios)"
              >
                Autorizar
              </button>
            )}
          </div>
        );
      }

      if (col.patchKey === 'auth_comercial') {
        const ok = Boolean(data.auth_comercial);
        if (ok) return <span className="pp-badge pp-badge--ok">Autorizado</span>;

        return (
          <button
            type="button"
            className="pp-btnCell pp-btnCell--brand"
            onClick={() => openComModal(row)}
            disabled={isBusy}
            title="Autorizar comercial (requiere responder la pregunta obligatoria)"
          >
            Autorizar
          </button>
        );
      }

      const checked = Boolean(data[col.patchKey]);
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={isBusy}
          onChange={(e) => onPatch(id, { [col.patchKey]: e.target.checked })}
        />
      );
    }

    if (col.patchKey) {
      const v = data[col.patchKey] ?? '';

      if (col.type === 'date') {
        return (
          <input
            type="date"
            value={normalizeDate10(v)}
            disabled={isBusy}
            onChange={(e) => {
              const next = e.target.value;
              setRows((prev) =>
                prev.map((r) => (r.id === id ? { ...r, data: { ...(r.data || {}), [col.patchKey]: next } } : r))
              );
            }}
            onBlur={() => onPatch(id, { [col.patchKey]: normalizeDate10(data[col.patchKey] ?? '') || null })}
            className="pp-input"
            style={{ width: 150 }}
          />
        );
      }

      if (col.type === 'day') {
        const curr = String(v || '').toLowerCase();
        return (
          <select
            value={curr}
            disabled={isBusy}
            onChange={(e) => {
              const next = e.target.value;
              setRows((prev) =>
                prev.map((r) => (r.id === id ? { ...r, data: { ...(r.data || {}), [col.patchKey]: next } } : r))
              );
              onPatch(id, { [col.patchKey]: next || null });
            }}
            className="pp-select"
            style={{ width: 170 }}
          >
            <option value="">(vacío)</option>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          type="text"
          value={String(v ?? '')}
          disabled={isBusy}
          onChange={(e) => {
            const next = e.target.value;
            setRows((prev) =>
              prev.map((r) => (r.id === id ? { ...r, data: { ...(r.data || {}), [col.patchKey]: next } } : r))
            );
          }}
          onBlur={() => onPatch(id, { [col.patchKey]: (data[col.patchKey] ?? '').toString().trim() || null })}
          className="pp-input"
          style={{ width: 220 }}
        />
      );
    }

    const raw = getCellValue(row, col);
    if (col.type === 'date') return <span>{normalizeDate10(raw)}</span>;
    return <span>{toStr(raw)}</span>;
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            Preproducción{' '}
            {accessMode === 'limited' ? <span style={{ fontSize: 12, fontWeight: 700 }}>(Vista)</span> : null}
            {accessMode === 'admin' ? (
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                (Portones {adminTargetWeekLabel ? `· ${weekTitleFromSelection(adminTargetWeekLabel)}` : ''})
              </span>
            ) : null}
          </h2>

          <button onClick={load} disabled={loading} className="btn">
            Recargar
          </button>

          {accessMode === 'full' && portonesIndexState === 'error' ? (
            <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: 8, borderRadius: 10 }}>
              No se pudo cargar <b>Portones</b>. El estado “Enviado” puede ser incorrecto hasta recargar.
            </div>
          ) : null}

          {accessMode === 'admin' && portonesIndexState === 'error' ? (
            <div style={{ background: '#fff5f5', border: '1px solid #fecaca', padding: 8, borderRadius: 10 }}>
              No se pudo cargar <b>Portones</b>. La vista puede estar incompleta hasta recargar.
            </div>
          ) : null}

          {/* Panel Columnas (solo full) */}
          {accessMode === 'full' ? (
            <div style={{ position: 'relative' }} ref={colsPanelRef}>
              <button onClick={() => setShowColsPanel((p) => !p)} className="btn" disabled={loading}>
                Columnas
              </button>

              {showColsPanel ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 40,
                    left: 0,
                    width: 380,
                    maxHeight: 460,
                    overflow: 'auto',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                    padding: 10,
                    zIndex: 5,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Mostrar/Ocultar columnas (Tabla)</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button className="btn" onClick={() => toggleAllCols(true)}>
                      Mostrar todas
                    </button>
                    <button
                      className="btn"
                      style={{ borderColor: '#ef4444', background: '#fff5f5', color: '#991b1b' }}
                      onClick={() => toggleAllCols(false)}
                    >
                      Ocultar todas
                    </button>
                  </div>

                  {ALL_COLS.map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
                      <input
                        type="checkbox"
                        checked={visibleCols[c.id] !== false}
                        onChange={(e) => setVisibleCols((p) => ({ ...p, [c.id]: e.target.checked }))}
                      />
                      <span style={{ fontSize: 12 }}>{c.label}</span>
                    </label>
                  ))}

                  <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>Se guarda en este navegador.</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Panel PDF (solo full) */}
          {accessMode === 'full' ? (
            <div style={{ position: 'relative' }} ref={pdfPanelRef}>
              <button
                onClick={() => setShowPdfPanel((p) => !p)}
                className="btn"
                disabled={loading || filteredRows.length === 0}
              >
                PDF
              </button>

              {showPdfPanel ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 40,
                    left: 0,
                    width: 380,
                    maxHeight: 460,
                    overflow: 'auto',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                    padding: 10,
                    zIndex: 5,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>PDF: semana y campos</div>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    <label style={{ fontSize: 12 }}>
                      Semana según
                      <select
                        value={pdfMode}
                        onChange={(e) => setPdfMode(e.target.value)}
                        className="pp-select"
                        style={{ marginTop: 6, width: '100%' }}
                      >
                        <option value="produccion">Producción (Inicio Prod)</option>
                        <option value="despacho">Despacho (Fecha Salida)</option>
                      </select>
                    </label>

                    <label style={{ fontSize: 12 }}>
                      Semana a imprimir
                      <select
                        value={pdfWeek}
                        onChange={(e) => setPdfWeek(e.target.value)}
                        className="pp-select"
                        style={{ marginTop: 6, width: '100%' }}
                      >
                        <option value="">Todas</option>
                        {pdfWeeksList.map((w) => (
                          <option key={w} value={w}>
                            {w} {weekTitleFromSelection(w) ? `· ${weekTitleFromSelection(w)}` : ''}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>
                        Filas a imprimir: <b>{pdfSelectedRows.length}</b>
                      </div>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button className="btn" onClick={() => toggleAllPdfFields(true)}>
                      Campos: todos
                    </button>
                    <button
                      className="btn"
                      style={{ borderColor: '#ef4444', background: '#fff5f5', color: '#991b1b' }}
                      onClick={() => toggleAllPdfFields(false)}
                    >
                      Campos: ninguno
                    </button>
                  </div>

                  {PDF_DEFS.map((f) => (
                    <label
                      key={`pdf_${f.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}
                    >
                      <input
                        type="checkbox"
                        checked={pdfFields[f.id] !== false}
                        onChange={(e) => setPdfFields((p) => ({ ...p, [f.id]: e.target.checked }))}
                      />
                      <span style={{ fontSize: 12 }}>{f.label}</span>
                    </label>
                  ))}

                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn--brand" onClick={printPdf} disabled={pdfSelectedRows.length === 0}>
                      Imprimir PDF
                    </button>
                    <button className="btn" onClick={() => setShowPdfPanel(false)}>
                      Cerrar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#374151' }}>
            {loading ? 'Cargando…' : `Registros: ${total}`}
          </div>
        </div>

        {err ? (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #fecaca',
              padding: 10,
              borderRadius: 10,
              marginBottom: 10,
              color: '#7f1d1d',
              fontSize: 12,
            }}
          >
            <b>Error:</b> {err}
          </div>
        ) : null}

        <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                {visibleColsList.map((c) => (
                  <th
                    key={c.id}
                    style={{
                      position: 'sticky',
                      top: 0,
                      background: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      padding: 10,
                      textAlign: 'left',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      zIndex: 3,
                      color: '#111827',
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>

              <tr>
                {visibleColsList.map((c) => (
                  <th
                    key={`${c.id}_filter`}
                    style={{
                      position: 'sticky',
                      top: 40,
                      background: '#f3f4f6',
                      borderBottom: '2px solid #d1d5db',
                      padding: 8,
                      zIndex: 2,
                      boxShadow: 'inset 0 0 0 1px #d1d5db',
                    }}
                  >
                    {c.type === 'actions' ? (
                      <select
                        value={filters[c.id] || ''}
                        onChange={(e) => setFilters((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="pp-select"
                        style={{ width: '100%' }}
                      >
                        <option value="">(todos)</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="listo">Listo</option>
                        <option value="produccion">En producción</option>
                      </select>
                    ) : c.type === 'day' ? (
                      <select
                        value={filters[c.id] || ''}
                        onChange={(e) => setFilters((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="pp-select"
                        style={{ width: '100%' }}
                      >
                        <option value="">(todos)</option>
                        {DAYS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    ) : c.type === 'date' ? (
                      renderDateFilter(c.id)
                    ) : (
                      <input
                        value={filters[c.id] || ''}
                        onChange={(e) => setFilters((p) => ({ ...p, [c.id]: e.target.value }))}
                        placeholder="Filtrar…"
                        className="pp-input"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id}>
                  {visibleColsList.map((col) => (
                    <td
                      key={`${row.id}_${col.id}`}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        padding: 8,
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        verticalAlign: 'top',
                        color: '#111827',
                      }}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColsList.length || 1} style={{ padding: 12, color: '#6b7280', fontSize: 12 }}>
                    No hay filas para mostrar (revisá filtros o datos).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: '#374151' }}>
            Mostrando <b>{total ? startIdx + 1 : 0}</b>–<b>{endIdx}</b> de <b>{total}</b>
          </div>

          <label style={{ fontSize: 12, color: '#111827' }}>
            Tamaño
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="pp-select"
              style={{ width: 110, marginLeft: 8 }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            Anterior
          </button>

          <div style={{ fontSize: 12, color: '#374151' }}>
            Página <b>{safePage}</b> / <b>{pageCount}</b>
          </div>

          <button className="btn" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>
            Siguiente
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
          Fechas: podés usar <b>Desde/Hasta</b> (intervalo), y/o <b>Con fecha</b>, y/o <b>Sin fecha</b>. Si combinás
          intervalo + “Sin fecha” trae <i>intervalo OR sin fecha</i>.
        </div>
      </div>

      {/* Modales (solo full) */}
      {accessMode === 'full' ? (
        <>
          <LogisticaAuthModal
            open={logModalOpen}
            row={logModalRow}
            busy={logModalBusy}
            onClose={closeLogModal}
            onSubmit={submitLogisticaAuth}
          />

          <AdminAuthModal
            open={adminModalOpen}
            row={adminModalRow}
            busy={adminModalBusy}
            onClose={closeAdminModal}
            onSubmit={submitAdminAuth}
          />

          <ComercialAuthModal
            open={comModalOpen}
            row={comModalRow}
            busy={comModalBusy}
            onClose={closeComModal}
            onSubmit={submitComercialAuth}
          />
        </>
      ) : null}
    </div>
  );
}
