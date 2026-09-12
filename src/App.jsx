import { useState, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   SCAN HELPER — calls /api/scan serverless function
═══════════════════════════════════════════════════════════ */
async function scanLabReport(file) {
  // If file is HEIC/HEIF, convert via canvas first
  const tryCanvasConvert = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch(e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });

  return new Promise((resolve, reject) => {
    const fileType = (file.type || '').toLowerCase();
    const isHeic = fileType.includes('heic') || fileType.includes('heif') || file.name?.toLowerCase().endsWith('.heic');
    const isPdf = fileType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

    const processDataUrl = async (dataUrl) => {
      try {
        if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Could not read file.');
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) throw new Error('Invalid file format. Please use JPEG, PNG, or PDF.');
        const base64 = dataUrl.slice(commaIdx + 1);
        const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:([^;]+)/);
        let mediaType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/jpeg';
        if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
        if (mediaType.includes('heic') || mediaType.includes('heif')) mediaType = 'image/jpeg';
        if (mediaType === 'application/octet-stream' || !mediaType) mediaType = 'image/jpeg';
        const allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf'];
        if (!allowed.includes(mediaType)) mediaType = 'image/jpeg';

        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType })
        });
        const data = await res.json();
        if (data.error) reject(new Error(data.error));
        else resolve(data.extracted || {});
      } catch (err) { reject(err); }
    };

    if (isHeic) {
      // Try canvas conversion for HEIC
      tryCanvasConvert(file)
        .then(dataUrl => processDataUrl(dataUrl))
        .catch(() => reject(new Error('iPhone HEIC photos are not supported. Please take a screenshot instead, or save the lab as a PDF.')));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => processDataUrl(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file. For iPhone photos, try taking a screenshot or using a PDF instead.'));
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════
   COLORS — exact original palette
═══════════════════════════════════════════════════════════ */
const COLORS = {
  bg:         "#0f1117",
  surface:    "#1a1d27",
  card:       "#20243a",
  border:     "#2e3350",
  accent:     "#4f9cf9",
  accentSoft: "#1e3a5f",
  green:      "#22c55e",
  greenBg:    "#052e16",
  yellow:     "#f59e0b",
  yellowBg:   "#2d1f00",
  red:        "#ef4444",
  redBg:      "#2d0a0a",
  text:       "#e2e8f0",
  muted:      "#64748b",
  label:      "#94a3b8",
};

/* ═══════════════════════════════════════════════════════════
   VALIDATION RANGES
═══════════════════════════════════════════════════════════ */
const VALID_RANGES = {
  tc:            { min: 50,   max: 500   },
  hdl:           { min: 10,   max: 150   },
  ldl:           { min: 10,   max: 400   },
  tg:            { min: 20,   max: 2000  },
  vldl:          { min: 2,    max: 400   },
  lipoA:         { min: 1,    max: 300   },
  apoA:          { min: 40,   max: 250   },
  apoB:          { min: 20,   max: 300   },
  oxLdl:         { min: 1,    max: 200   },  lathosterol:   { min: 0.1,  max: 50    },
  desmosterol:   { min: 0.1,  max: 50    },
  betaSitosterol:{ min: 0.1,  max: 50    },
  campesterol:   { min: 0.1,  max: 50    },
  glucose:       { min: 30,   max: 700   },
  bun:           { min: 1,    max: 200   },
  creatinine:    { min: 0.1,  max: 20    },
  sodium:        { min: 100,  max: 180   },
  potassium:     { min: 1.5,  max: 9     },
  chloride:      { min: 60,   max: 130   },
  bicarb:        { min: 5,    max: 50    },
  calcium:       { min: 4,    max: 16    },
  albumin:       { min: 1,    max: 6     },
  totalProtein:  { min: 4,    max: 10    },
  globulin:      { min: 0.5,  max: 6     },
  a1c:           { min: 3,    max: 16    },
  insulin:       { min: 1,    max: 300   },
  crp:           { min: 0,    max: 200   },
  age:           { min: 18,   max: 110   },
  heightIn:      { min: 4,    max: 6     },
  heightInches:  { min: 0,    max: 11    },
  weightLb:      { min: 90,   max: 400   },
  sbp:           { min: 60,   max: 260   },
  alt:           { min: 1,    max: 2000  },
  ast:           { min: 1,    max: 2000  },
  platelets:     { min: 10,   max: 900   },
  urineAlb:      { min: 0,    max: 10000 },
  urineCr:       { min: 10,   max: 500   },
  shbg:          { min: 1,    max: 200   },
  igf1:          { min: 10,   max: 1000  },
  estradiol:     { min: 1,    max: 5000  },
  progesterone:  { min: 0.1,  max: 100   },
  psa:           { min: 0,    max: 100   },
  dheas:         { min: 5,    max: 800   },
  fsh:           { min: 0.1,  max: 200   },
  lh:            { min: 0.1,  max: 200   },
  prolactin:     { min: 1,    max: 500   },
  alkPhos:       { min: 5,    max: 1500  },
  tBili:         { min: 0.1,  max: 50    },
  directBili:    { min: 0,    max: 30    },
  ggt:           { min: 1,    max: 1000  },
  tsh:           { min: 0.01, max: 100   },
  freeT3:        { min: 0.5,  max: 20    },
  freeT4:        { min: 0.1,  max: 10    },
  reverseT3:     { min: 1,    max: 100   },
  tpoAb:         { min: 0,    max: 1000  },
  tgAb:          { min: 0,    max: 1000  },
  cortisol:      { min: 1,    max: 60    },
  homocysteine:  { min: 1,    max: 100   },
  mma:           { min: 0,    max: 10    },
  myeloperox:    { min: 0,    max: 2000  },
  folateMisc:    { min: 1,    max: 60    },
  ldh:           { min: 50,   max: 2000  },
  uricAcid:      { min: 1,    max: 20    },
  ck:            { min: 10,   max: 10000 },
  ckMb:          { min: 0,    max: 500   },
  vitD:          { min: 4,    max: 150   },
  rbcMag:        { min: 3.5,  max: 9.0   },
  b12:           { min: 100,  max: 2000  },
  folate:        { min: 1,    max: 60    },
  wbc:           { min: 1,    max: 30    },
  rbc:           { min: 2,    max: 7     },
  hemoglobin:    { min: 5,    max: 20    },
  hematocrit:    { min: 15,   max: 65    },
  mcv:           { min: 60,   max: 120   },
  mch:           { min: 15,   max: 40    },
  mchc:          { min: 25,   max: 40    },
  rdw:           { min: 10,   max: 25    },
  neutrophils:   { min: 1,    max: 15    },
  lymphocytes:   { min: 0.5,  max: 8     },
  monocytes:     { min: 0.1,  max: 2     },
  eosinophils:   { min: 0,    max: 1.5   },
  basophils:     { min: 0,    max: 0.5   },
  serumIron:     { min: 20,   max: 300   },
  tibc:          { min: 100,  max: 500   },
  uibc:          { min: 10,   max: 400   },
  transferrinSat:{ min: 5,    max: 60    },
  ferritin:      { min: 1,    max: 2000  },
  basicCrp:      { min: 0,    max: 200   },
  ldlP:          { min: 100,  max: 3500  },
  sdLdl:         { min: 0,    max: 100   },
  hdlP:          { min: 10,   max: 60    },
  smallLdlP:     { min: 0,    max: 2000  },
  ldlSize:       { min: 18,   max: 23    },
  largeVldlP:    { min: 0,    max: 10    },
  largeHdlP:     { min: 0,    max: 20    },
  vldlP:         { min: 0,    max: 15    },
  ldlSizeNmr:    { min: 18,   max: 23    },
  hdlSizeNmr:    { min: 7,    max: 12    },
  vldlSizeNmr:   { min: 30,   max: 90    },
};

/* ═══════════════════════════════════════════════════════════
   CALCULATION ENGINE
═══════════════════════════════════════════════════════════ */
const nv = v => (v === "" || v === null || v === undefined) ? null : parseFloat(v);

function calcAll(f) {
  const TC = nv(f.tc), HDL = nv(f.hdl), TG = nv(f.tg), LDL = nv(f.ldl), VLDL = nv(f.vldl);
  const APOB = nv(f.apoB), APOA = nv(f.apoA);
  const GLU = nv(f.glucose), BUN = nv(f.bun), CR = nv(f.creatinine);
  const NA = nv(f.sodium), CL = nv(f.chloride), HCO3 = nv(f.bicarb);
  const CAL = nv(f.calcium), ALB = nv(f.albumin);
  const A1C = nv(f.a1c), INS = nv(f.insulin), CRP = nv(f.crp);
  const ALT = nv(f.alt), AST = nv(f.ast), PLT = nv(f.platelets);
  const UALB = nv(f.urineAlb), UCR = nv(f.urineCr);
  const AGE = nv(f.age), SBP = nv(f.sbp);

 
  const friedewald = (TC && HDL && TG && TG <= 400) ? TC - HDL - TG / 5 : null;

  // Martin-Hopkins LDL (adjustable factor by TG / non-HDL strata)
  let martinHopkins = null;
  if (TC && HDL && TG && TG <= 800) {
    const nonHdlMH = TC - HDL;
    let f5 = 5.0;
    if      (TG < 50)  f5 = 3.3;
    else if (TG < 100) f5 = 4.0;
    else if (TG < 150) f5 = 4.6;
    else if (TG < 200) f5 = 5.0;
    else if (TG < 250) f5 = 5.4;
    else if (TG < 300) f5 = 6.0;
    else if (TG < 400) f5 = 7.0;
    else               f5 = 8.0;
    if (nonHdlMH < 100) f5 -= 0.3;
    else if (nonHdlMH > 220) f5 += 0.5;
    martinHopkins = TC - HDL - TG / f5;
  }

  const ldlHdl   = (LDL && HDL && HDL > 0) ? LDL / HDL : null;
  const tcHdl    = (TC  && HDL && HDL > 0) ? TC  / HDL : null;
  const tgHdl    = (TG  && HDL && HDL > 0) ? TG  / HDL : null;
  const nonHdl   = (TC  && HDL)             ? TC  - HDL : null;
  const remnant  = (TC  && LDL && HDL)      ? TC  - LDL - HDL : null;
  const ldlApoB  = (LDL && APOB && APOB > 0) ? LDL / APOB  : null;
  const apoBapoA = (APOB && APOA && APOA > 0) ? APOB / APOA : null;
  const aip      = (TG  && HDL && HDL > 0) ? Math.log10(TG / HDL) : null;

 
  const anionGap   = (NA && CL && HCO3)        ? NA - CL - HCO3           : null;
  const corrAG     = (anionGap !== null && ALB) ? anionGap + 2.5 * (4 - ALB) : null;
  const bunCr      = (BUN && CR && CR > 0)      ? BUN / CR                 : null;
  const corrCa     = (CAL && ALB)               ? CAL + 0.8 * (4 - ALB)   : null;
  const corrNa     = (NA && GLU && GLU > 100)   ? NA + 0.016 * (GLU - 100) : null;
  const osmolality = (NA && GLU && BUN)         ? 2 * NA + GLU / 18 + BUN / 2.8 : null;

 
  let egfr = null;
  if (CR && AGE && f.sex) {
    const fem = f.sex === "female", k = fem ? 0.7 : 0.9, alpha = fem ? -0.241 : -0.302;
    const crK = CR / k;
    egfr = 142 * Math.pow(Math.min(crK, 1), alpha) * Math.pow(Math.max(crK, 1), -1.2)
         * Math.pow(0.9938, AGE) * (fem ? 1.012 : 1);
  }

  const acr = (UALB && UCR && UCR > 0) ? (UALB / UCR) * 1000 : null;

 
  const homaIR   = (GLU && INS) ? (GLU * INS) / 405 : null;
  const homaBeta = (GLU && INS && GLU > 63) ? (360 * INS) / (GLU - 63) : null;
  const fib4     = (AGE && ALT && AST && PLT && PLT > 0 && ALT > 0)
                   ? (AGE * AST) / (PLT * Math.sqrt(ALT)) : null;

 
  const eag = A1C !== null ? 28.7 * A1C - 46.7 : null;

 
  const tcHdlRatio   = (TC && HDL && HDL > 0)   ? TC / HDL         : null;
  const hdlcTgRatio  = (HDL && TG && TG > 0)    ? HDL / TG         : null;
  const vldlcTgRatio = (VLDL && TG && TG > 0)   ? VLDL / TG        : null;

 
  // Full NMR-based LP-IR = weighted composite of 6 NMR particle variables.
  // Simplified validated proxy when NMR particles unavailable: uses TG, HDL, and VLDL size.
  // Full formula (Festa et al. / LabCorp): 0.369×Large VLDL-P + 0.321×Small LDL-P - 0.156×Large HDL-P + 0.711×VLDL size + 0.400×LDL size - 0.874×HDL size (standardized z-scores)
  // Proxy formula (when only TG/HDL available): LP-IR proxy = (TG/HDL) × 10 — scaled to approximate 0–100 range
  const largeVldlPval = nv(f.largeVldlP);
  const smallLdlPval  = nv(f.smallLdlP);
  const largeHdlPval  = nv(f.largeHdlP);
  const vldlSizeVal   = nv(f.vldlSizeNmr);
  const ldlSizeVal    = nv(f.ldlSizeNmr);
  const hdlSizeVal    = nv(f.hdlSizeNmr);

  let lpir = null;
  const hasNmr = largeVldlPval !== null && smallLdlPval !== null && largeHdlPval !== null
              && vldlSizeVal !== null && ldlSizeVal !== null && hdlSizeVal !== null;

  if (hasNmr) {
    // Full NMR LP-IR (population means for z-score centering from Festa 2005 / Mora 2015)
    // Centers: LargeVLDL 1.5 nmol/L (SD 2.2), SmallLDL 527 (SD 359), LargeHDL 8.8 (SD 3.2),
    //          VLDL size 47 nm (SD 8), LDL size 20.5 nm (SD 0.6), HDL size 9.4 nm (SD 0.5)
    const zLargeVLDL = (largeVldlPval - 1.5)  / 2.2;
    const zSmallLDL  = (smallLdlPval  - 527)  / 359;
    const zLargeHDL  = (largeHdlPval  - 8.8)  / 3.2;
    const zVLDLsize  = (vldlSizeVal   - 47)   / 8;
    const zLDLsize   = (ldlSizeVal    - 20.5) / 0.6;
    const zHDLsize   = (hdlSizeVal    - 9.4)  / 0.5;
    const rawLpir = 0.369 * zLargeVLDL + 0.321 * zSmallLDL - 0.156 * zLargeHDL
                  + 0.711 * zVLDLsize   + 0.400 * zLDLsize  - 0.874 * zHDLsize;
   
    lpir = Math.max(0, Math.min(100, (rawLpir + 3) / 6 * 100));
  } else if (TG && HDL && HDL > 0) {
    // Proxy: TG/HDL ratio scaled to 0–100 (ratio of ~1 = score ~10, ratio of 5+ = score ~50+)
    lpir = Math.min(100, (TG / HDL) * 10);
  }

 
  const PCE = {
    white_male:   { mean: 61.18,   base: 0.9144 },
    black_male:   { mean: 19.54,   base: 0.8954 },
    white_female: { mean: -29.799, base: 0.9665 },
    black_female: { mean: 86.61,   base: 0.9533 },
  };
  let ascvd = null, ascvdLifetime = null;
  if (TC && HDL && AGE && f.sex && f.race && f.race !== "other" && SBP) {
    const fem = f.sex === "female", wh = f.race === "white";
    const smk = f.smoker ? 1 : 0, dia = f.diabetic ? 1 : 0, bp = f.onBpMeds;
    const lA = Math.log(AGE), lTC = Math.log(TC), lH = Math.log(HDL), lS = Math.log(SBP);
    const key = `${wh ? "white" : "black"}_${fem ? "female" : "male"}`;
    const { mean, base } = PCE[key];
    let sum = 0;
    if (!fem && wh) {
      sum = 12.344 * lA + 11.853 * lTC - 2.664 * lA * lTC - 7.990 * lH + 1.769 * lA * lH
          + (bp ? 1.797 : 1.764) * lS + 7.837 * smk - 1.795 * lA * smk + 0.658 * dia;
    } else if (!fem && !wh) {
      sum = 2.469 * lA + 0.302 * lTC - 0.307 * lH
          + (bp ? 1.916 : 1.809) * lS + 0.549 * smk + 0.645 * dia;
    } else if (fem && wh) {
      sum = -29.799 * lA + 4.884 * lA * lA + 13.540 * lTC - 3.114 * lA * lTC
          - 13.578 * lH + 3.149 * lA * lH + (bp ? 2.019 : 1.957) * lS
          + 7.574 * smk - 1.665 * lA * smk + 0.661 * dia;
    } else {
      sum = 17.1141 * lA + 0.9396 * lTC - 18.9196 * lH + 4.4748 * lA * lH
          + (bp ? 29.2907 : 27.8197) * lS - 6.4321 * lA * lS + 0.8738 * smk + 0.8738 * dia;
    }
    ascvd = Math.max(0, Math.min(100, (1 - Math.pow(base, Math.exp(sum - mean))) * 100));
    if (AGE < 60) {
      const mult = AGE < 40 ? 3.2 : AGE < 50 ? 2.8 : 2.3;
      ascvdLifetime = Math.min(99, ascvd * mult);
    }
  }

 
 
  let ascvdPrevent = null;
  if (TC && HDL && AGE && f.sex && SBP && AGE >= 30 && AGE <= 79) {
    const fem = f.sex === "female";
    const nonHDL = TC - HDL;
    const dia = f.diabetic ? 1 : 0;
    const smk = f.smoker ? 1 : 0;
    const bp = f.onBpMeds ? 1 : 0;
    const egfrVal = egfr !== null ? Math.min(Math.max(egfr, 15), 140) : 90;
    const BMI_VAL = nv(f.bmi);
    const bmiVal = BMI_VAL !== null ? Math.min(Math.max(BMI_VAL, 15), 70) : null;
    const lnAge    = Math.log(AGE);
    const lnNonHDL = Math.log(nonHDL);
    const lnHDL    = Math.log(HDL);
    const lnSBP    = Math.log(SBP);
    const lnEGFR   = Math.log(egfrVal);
    // BMI centering constant from PREVENT supplement: 3.4112 (ln(30.3))
    const lnBMI    = bmiVal !== null ? Math.log(bmiVal) : Math.log(26.5);
    let pSum = 0;
    if (fem) {
      pSum = 0.3999 * (lnAge    - 3.8686)
           + 0.7309 * (lnNonHDL - 4.0875)
           - 0.5825 * (lnHDL    - 4.0875)
           + 0.4522 * (lnSBP    - 4.7791)
           + 0.3580 * bp
           + 0.8392 * smk
           + 0.8738 * dia
           - 0.2821 * (lnEGFR   - 4.4427)
           + 0.1231 * (lnBMI    - 3.4112);
      ascvdPrevent = (1 - Math.pow(0.9861, Math.exp(pSum))) * 100;
    } else {
      pSum = 0.4648 * (lnAge    - 3.8501)
           + 0.7814 * (lnNonHDL - 4.1713)
           - 0.5234 * (lnHDL    - 3.8816)
           + 0.5390 * (lnSBP    - 4.7791)
           + 0.3580 * bp
           + 0.7736 * smk
           + 0.8738 * dia
           - 0.2440 * (lnEGFR   - 4.4427)
           + 0.1231 * (lnBMI    - 3.4112);
      ascvdPrevent = (1 - Math.pow(0.9726, Math.exp(pSum))) * 100;
    }
    ascvdPrevent = Math.max(0, Math.min(100, ascvdPrevent));
  }

  const TSH  = nv(f.tsh);
  const FT3  = nv(f.freeT3);
  const FT4  = nv(f.freeT4);
  const RT3  = nv(f.reverseT3);

 
  // rT3/fT3: how much rT3 relative to active T3 (lower is better)
  const rT3_fT3  = (RT3 !== null && FT3 !== null && FT3 > 0) ? RT3 / FT3 : null;
  // fT3/rT3: classic conversion efficiency ratio (higher is better)
  const fT3_rT3  = (FT3 !== null && RT3 !== null && RT3 > 0) ? FT3 / RT3 : null;
  // fT3/fT4: conversion ratio — how well T4 is being converted to active T3
  const fT3_fT4  = (FT3 !== null && FT4 !== null && FT4 > 0) ? FT3 / FT4 : null;
  // fT3/TSH: sensitivity of pituitary-thyroid axis to active hormone
  const fT3_tsh  = (FT3 !== null && TSH !== null && TSH > 0) ? FT3 / TSH : null;
  // Free T3 : Free T4 (same as fT3/fT4 expressed differently — alias for clarity)
  // Already covered by fT3_fT4 above; we expose both with matching labels

  const BCRP = nv(f.basicCrp);

  // ── 12 new derived ratios (no new inputs required) ─────────
  const NEUT  = nv(f.neutrophils);
  const LYMPH = nv(f.lymphocytes);
  const MONO  = nv(f.monocytes);
  const CORT  = nv(f.cortisol);
  const DHEAS = nv(f.dheas);
  const PROG  = nv(f.progesterone);
  const E2    = nv(f.estradiol);
  const TESTO = nv(f.testosterone);
  const SHBG  = nv(f.shbg);
  const PROT  = nv(f.albumin);  // total protein not separately entered; use albumin

  // 1. TyG Index: ln(TG [mg/dL] × Glucose [mg/dL] / 2)
  const tygIndex = (TG && GLU && TG > 0 && GLU > 0)
    ? Math.log(TG * GLU / 2) : null;

  // 2. Glucose / Insulin Ratio (optimal >10; <6 = significant IR)
  const glucInsulinRatio = (GLU && INS && INS > 0) ? GLU / INS : null;

  // 3. Cortisol / DHEA-S Ratio (HPA axis resilience; lower = better resilience)
  const cortDheasRatio = (CORT && DHEAS && DHEAS > 0) ? CORT / DHEAS : null;

  // 4. Progesterone / Estradiol Ratio (estrogen dominance; optimal >100 in luteal, >200 postmenopausal)
  const progE2Ratio = (PROG && E2 && E2 > 0) ? (PROG * 1000) / E2 : null; // scaled: pg/mL × 1000 / pg/mL

  // 5. Free Testosterone Index: (Total T [nmol/L] / SHBG [nmol/L]) × 100
  // Convert ng/dL → nmol/L by dividing by 28.842
  const testoNmol = (TESTO) ? TESTO / 28.842 : null;
  const freeTestoIndex = (testoNmol && SHBG && SHBG > 0) ? (testoNmol / SHBG) * 100 : null;

  // 6. Neutrophil-to-Lymphocyte Ratio (NLR; optimal <2; >3 = elevated systemic inflammation)
  const nlr = (NEUT && LYMPH && LYMPH > 0) ? NEUT / LYMPH : null;

  // 7. Platelet-to-Lymphocyte Ratio (PLR; optimal <150)
  const plr = (PLT && LYMPH && LYMPH > 0) ? PLT / LYMPH : null;

  // 8. Lymphocyte-to-Monocyte Ratio (LMR; optimal >4; <2 = poor immune surveillance)
  const lmr = (LYMPH && MONO && MONO > 0) ? LYMPH / MONO : null;

  // 9. AST / ALT Ratio (>2 = alcoholic hepatitis; <1 = NAFLD pattern)
  const astAltRatio = (AST && ALT && ALT > 0) ? AST / ALT : null;

  // 10. Albumin / Globulin Ratio (A/G; need globulin = total protein - albumin)
  // Globulin derived from lab if total protein and albumin available via separate field
  // Using stored _globulin if present, else skip
  const GLOBULIN = nv(f.globulin);
  const agRatio = (ALB && GLOBULIN && GLOBULIN > 0) ? ALB / GLOBULIN : null;

  // 11. NAFLD Fibrosis Score: -1.675 + 0.037×age + 0.094×BMI + 1.13×IFG/diabetes + 0.99×AST/ALT - 0.013×platelets - 0.66×albumin
  const bmiVal2 = nv(f.bmi);
  const nafldScore = (AGE && bmiVal2 && AST && ALT && ALT > 0 && PLT && ALB)
    ? -1.675 + (0.037 * AGE) + (0.094 * bmiVal2) + (1.13 * (f.diabetic ? 1 : 0))
      + (0.99 * (AST / ALT)) - (0.013 * PLT) - (0.66 * ALB)
    : null;

  // 12. Uric Acid / Creatinine Ratio (tubular secretion efficiency; elevated = gout/IR risk)
  const URIC = nv(f.uricAcid);
  const uricCreatRatio = (URIC && CR && CR > 0) ? URIC / CR : null;

  return {
    friedewald, martinHopkins, ldlHdl, tcHdl, tgHdl, nonHdl, remnant,
    ldlApoB, apoBapoA, aip,
    anionGap, corrAG, bunCr, corrCa, corrNa, osmolality, egfr, acr,
    homaIR, homaBeta, fib4, lpir, eag, tcHdlRatio, hdlcTgRatio, vldlcTgRatio,
    tygIndex, glucInsulinRatio, cortDheasRatio, progE2Ratio, freeTestoIndex,
    nlr, plr, lmr, astAltRatio, agRatio, nafldScore, uricCreatRatio,
    ascvd, ascvdLifetime, ascvdPrevent,
    _lpirIsNmr: hasNmr,
    _crp: CRP, _basicCrp: BCRP, _a1c: A1C,
    _tsh: TSH, _freeT3: FT3, _freeT4: FT4, _reverseT3: RT3,
    _rT3_fT3: rT3_fT3, _fT3_rT3: fT3_rT3, _fT3_fT4: fT3_fT4, _fT3_tsh: fT3_tsh,
    _tibc: nv(f.tibc), _uibc: nv(f.uibc), _serumIron: nv(f.serumIron),
    _transferrinSat: nv(f.transferrinSat), _ferritin: nv(f.ferritin),
    _tBili: nv(f.tBili), _directBili: nv(f.directBili),
    _ldlP: nv(f.ldlP), _smallLdlP: nv(f.smallLdlP), _sdLdl: nv(f.sdLdl),
    _hdlP: nv(f.hdlP), _largeHdlP: nv(f.largeHdlP),
    _largeVldlP: nv(f.largeVldlP), _vldlP: nv(f.vldlP),
    _ldlSize: nv(f.ldlSize), _ldlSizeNmr: nv(f.ldlSizeNmr),
    _hdlSizeNmr: nv(f.hdlSizeNmr), _vldlSizeNmr: nv(f.vldlSizeNmr),
   
    _tc: TC, _hdl: HDL, _ldl: LDL, _tg: TG, _vldl: VLDL,
    _lipoA: nv(f.lipoA), _apoA: APOA, _apoB: APOB,
   
    _glucose: GLU, _sodium: NA, _potassium: nv(f.potassium), _chloride: CL,
    _bicarb: HCO3, _calcium: CAL, _albumin: ALB, _totalProtein: nv(f.totalProtein),
    _globulin: nv(f.globulin), _bun: BUN, _creatinine: CR,
   
    _alt: ALT, _ast: AST, _alkPhos: nv(f.alkPhos), _ggt: nv(f.ggt),
   
    _insulin: INS, _cortisol: nv(f.cortisol), _homocysteine: nv(f.homocysteine),
    _ldh: nv(f.ldh), _uricAcid: nv(f.uricAcid), _ck: nv(f.ck), _ckMb: nv(f.ckMb),
    _mma: nv(f.mma), _myeloperox: nv(f.myeloperox),
   
    _vitD: nv(f.vitD), _rbcMag: nv(f.rbcMag), _b12: nv(f.b12), _folate: nv(f.folate),
    _folateMisc: nv(f.folateMisc),
   
    _wbc: nv(f.wbc), _rbc: nv(f.rbc), _hemoglobin: nv(f.hemoglobin),
    _hematocrit: nv(f.hematocrit), _mcv: nv(f.mcv), _mch: nv(f.mch),
    _mchc: nv(f.mchc), _rdw: nv(f.rdw), _platelets: PLT,
    _neutrophils: nv(f.neutrophils), _lymphocytes: nv(f.lymphocytes),
    _monocytes: nv(f.monocytes), _eosinophils: nv(f.eosinophils), _basophils: nv(f.basophils),
   
    _testosterone: nv(f.testosterone), _estradiol: nv(f.estradiol),
    _psa: nv(f.psa), _dheas: nv(f.dheas), _fsh: nv(f.fsh),
    _lh: nv(f.lh), _prolactin: nv(f.prolactin),
    _shbg: nv(f.shbg), _igf1: nv(f.igf1),
   
    _tpoAb: nv(f.tpoAb), _tgAb: nv(f.tgAb),
    _sex: f.sex,
  };
}

/* ═══════════════════════════════════════════════════════════
   UNIFIED RISK ENGINE
═══════════════════════════════════════════════════════════ */
const RISK_BANDS = {
 
  tc:            [[0, 199, "normal"], [200, 239, "borderline"], [240, Infinity, "high"]],
  hdl:           [[60, Infinity, "normal"], [40, 59, "borderline"], [0, 39, "high"]],
  ldl:           [[0, 99, "normal"], [100, 129, "borderline"], [130, Infinity, "high"]],
  tg:            [[0, 149, "normal"], [150, 199, "borderline"], [200, Infinity, "high"]],
  vldl:          [[0, 30, "normal"], [31, 40, "borderline"], [41, Infinity, "high"]],
  lipoA:         [[0, 30, "normal"], [31, 50, "borderline"], [51, Infinity, "high"]],
  apoA:          [[120, Infinity, "normal"], [100, 119, "borderline"], [0, 99, "high"]],
  apoB:          [[0, 90, "normal"], [91, 110, "borderline"], [111, Infinity, "high"]],
 
  ldlP:          [[0, 999, "normal"], [1000, 1299, "borderline"], [1300, Infinity, "high"]],
  smallLdlP:     [[0, 527, "normal"], [528, 899, "borderline"], [900, Infinity, "high"]],
  sdLdl:         [[0, 35, "normal"], [36, 49, "borderline"], [50, Infinity, "high"]],
  hdlP:          [[30.5, Infinity, "normal"], [25, 30.4, "borderline"], [0, 24.9, "high"]],
  largeHdlP:     [[7, Infinity, "normal"], [4, 6.9, "borderline"], [0, 3.9, "high"]],
  largeVldlP:    [[0, 2.2, "normal"], [2.3, 4.0, "borderline"], [4.1, Infinity, "high"]],
  vldlP:         [[0, 4.0, "normal"], [4.1, 7.0, "borderline"], [7.1, Infinity, "high"]],
  // NMR particle sizes (nm) — larger LDL = better; larger VLDL = worse
  ldlSize:       [[20.6, Infinity, "normal"], [19.0, 20.5, "borderline"], [0, 18.9, "high"]],
  ldlSizeNmr:    [[20.6, Infinity, "normal"], [19.0, 20.5, "borderline"], [0, 18.9, "high"]],
  hdlSizeNmr:    [[9.4, Infinity, "normal"], [8.3, 9.3, "borderline"], [0, 8.2, "high"]],
  vldlSizeNmr:   [[0, 49, "normal"], [50, 59, "borderline"], [60, Infinity, "high"]],
 
  friedewald:    [[0, 99, "normal"], [100, 129, "borderline"], [130, Infinity, "high"]],
  martinHopkins: [[0, 99, "normal"], [100, 129, "borderline"], [130, Infinity, "high"]],
  ldlHdl:        [[0, 2.0, "normal"], [2.01, 3.0, "borderline"], [3.01, Infinity, "high"]],
  tcHdl:         [[0, 3.5, "normal"], [3.51, 5.0, "borderline"], [5.01, Infinity, "high"]],
  tgHdl:         [[0, 2.0, "normal"], [2.01, 3.5, "borderline"], [3.51, Infinity, "high"]],
  nonHdl:        [[0, 130, "normal"], [131, 159, "borderline"], [160, Infinity, "high"]],
  remnant:       [[0, 25, "normal"], [26, 35, "borderline"], [36, Infinity, "high"]],
  ldlApoB:       [[0.9, Infinity, "normal"], [0.6, 0.899, "borderline"], [0, 0.599, "high"]],
  apoBapoA:      [[0, 0.7, "normal"], [0.71, 0.9, "borderline"], [0.91, Infinity, "high"]],
  aip:           [[-9, 0.11, "normal"], [0.12, 0.21, "borderline"], [0.22, Infinity, "high"]],
 
  glucose:       [[0, 99, "normal"], [100, 125, "borderline"], [126, Infinity, "high"]],
  sodium:        [[0, 134, "low"], [135, 145, "normal"], [146, Infinity, "high"]],
  potassium:     [[0, 3.4, "low"], [3.5, 5.0, "normal"], [5.1, 5.5, "borderline"], [5.6, Infinity, "high"]],
  chloride:      [[0, 95, "low"], [96, 106, "normal"], [107, Infinity, "high"]],
  bicarb:        [[0, 21, "low"], [22, 29, "normal"], [30, Infinity, "high"]],
  calcium:       [[0, 8.4, "low"], [8.5, 10.5, "normal"], [10.6, 12.0, "borderline"], [12.1, Infinity, "high"]],
  albumin:       [[0, 3.4, "low"], [3.5, 5.0, "normal"], [5.1, Infinity, "high"]],
  totalProtein:  [[0, 5.9, "low"], [6.0, 8.3, "normal"], [8.4, Infinity, "high"]],
  globulin:      [[0, 1.4, "low"], [1.5, 3.7, "normal"], [3.8, 4.5, "borderline"], [4.6, Infinity, "high"]],
  bun:           [[0, 6, "low"], [7, 20, "normal"], [21, 25, "borderline"], [26, Infinity, "high"]],
  creatinine:    [[0, 0.5, "low"], [0.6, 1.2, "normal"], [1.21, 1.5, "borderline"], [1.51, Infinity, "high"]],
 
  anionGap:      [[0, 5, "low"], [6, 12, "normal"], [13, 16, "borderline"], [17, Infinity, "high"]],
  corrAG:        [[0, 5, "low"], [6, 12, "normal"], [13, 16, "borderline"], [17, Infinity, "high"]],
  bunCr:         [[0, 9, "low"], [10, 20, "normal"], [21, 25, "borderline"], [26, Infinity, "high"]],
  corrCa:        [[0, 8.49, "low"], [8.5, 10.5, "normal"], [10.51, 12, "borderline"], [12.01, Infinity, "high"]],
  corrNa:        [[0, 134, "low"], [135, 145, "normal"], [146, Infinity, "high"]],
  osmolality:    [[0, 274, "low"], [275, 295, "normal"], [296, Infinity, "high"]],
  egfr:          [[60, Infinity, "normal"], [30, 59, "borderline"], [0, 29, "high"]],
  acr:           [[0, 29, "normal"], [30, 300, "borderline"], [301, Infinity, "high"]],
 
  alt:           [[0, 40, "normal"], [41, 56, "borderline"], [57, Infinity, "high"]],
  ast:           [[0, 40, "normal"], [41, 56, "borderline"], [57, Infinity, "high"]],
  alkPhos:       [[30, 120, "normal"], [121, 150, "borderline"], [0, 29, "low"], [151, Infinity, "high"]],
  ggt:           [[0, 55, "normal"], [56, 100, "borderline"], [101, Infinity, "high"]],
  tBili:         [[0, 1.2, "normal"], [1.21, 2.0, "borderline"], [2.01, Infinity, "high"]],
  directBili:    [[0, 0.3, "normal"], [0.31, 0.5, "borderline"], [0.51, Infinity, "high"]],
  fib4:          [[0, 1.29, "normal"], [1.3, 2.66, "borderline"], [2.67, Infinity, "high"]],
 
  insulin:       [[0, 25, "normal"], [26, 29, "borderline"], [30, Infinity, "high"]],
  homaIR:        [[0, 1.9, "normal"], [2.0, 2.9, "borderline"], [3.0, Infinity, "high"]],
  homaBeta:      [[100, Infinity, "normal"], [50, 99, "borderline"], [0, 49, "high"]],
  lpir:          [[0, 44, "normal"], [45, 60, "borderline"], [61, Infinity, "high"]],
  eag:           [[0, 100, "normal"], [101, 125, "borderline"], [126, Infinity, "high"]],
  a1c:           [[0, 5.6, "normal"], [5.7, 6.4, "borderline"], [6.5, Infinity, "high"]],
  crp:           [[0, 1.0, "normal"], [1.01, 3.0, "borderline"], [3.01, Infinity, "high"]],
  basicCrp:      [[0, 5.0, "normal"], [5.01, 10.0, "borderline"], [10.01, Infinity, "high"]],
  cortisol:      [[6, 23, "normal"], [24, 30, "borderline"], [0, 5.9, "low"], [31, Infinity, "high"]],
  homocysteine:  [[0, 10, "normal"], [11, 15, "borderline"], [16, Infinity, "high"]],
  ldh:           [[0, 250, "normal"], [251, 350, "borderline"], [351, Infinity, "high"]],
  uricAcid:      [[2.5, 6.0, "normal"], [6.1, 7.0, "borderline"], [0, 2.4, "low"], [7.1, Infinity, "high"]],
  ck:            [[0, 200, "normal"], [201, 400, "borderline"], [401, Infinity, "high"]],
  ckMb:          [[0, 7.0, "normal"], [7.1, 10.0, "borderline"], [10.1, Infinity, "high"]],
  // MMA and myeloperoxidase bands defined above
  folateMisc:    [[5, 20, "normal"], [2, 4.9, "borderline"], [0, 1.9, "high"], [21, Infinity, "normal"]],
  mma:           [[0, 0.4, "normal"], [0.41, 0.75, "borderline"], [0.76, Infinity, "high"]],
  myeloperox:    [[0, 420, "normal"], [421, 600, "borderline"], [601, Infinity, "high"]],
 
  tcHdlRatio:    [[0, 3.5, "normal"], [3.51, 5.0, "borderline"], [5.01, Infinity, "high"]],
  hdlcTgRatio:   [[0.4, Infinity, "normal"], [0.25, 0.399, "borderline"], [0, 0.249, "high"]],
  vldlcTgRatio:  [[0.1, 0.25, "normal"], [0.26, 0.35, "borderline"], [0, 0.099, "borderline"], [0.36, Infinity, "high"]],
  // New derived ratios
  tygIndex:      [[0, 8.5, "normal"], [8.51, 9.0, "borderline"], [9.01, Infinity, "high"]],
  glucInsulinRatio: [[10, Infinity, "normal"], [6, 9.99, "borderline"], [0, 5.99, "high"]],
  cortDheasRatio: [[0, 0.1, "normal"], [0.101, 0.3, "borderline"], [0.301, Infinity, "high"]],
  progE2Ratio:   [[100, Infinity, "normal"], [50, 99, "borderline"], [0, 49, "high"]],
  freeTestoIndex:[[1.5, 3.0, "normal"], [0.5, 1.49, "borderline"], [3.01, 5.0, "borderline"], [0, 0.499, "high"], [5.01, Infinity, "high"]],
  nlr:           [[0, 2.0, "normal"], [2.01, 3.0, "borderline"], [3.01, Infinity, "high"]],
  plr:           [[0, 150, "normal"], [151, 200, "borderline"], [201, Infinity, "high"]],
  lmr:           [[4.0, Infinity, "normal"], [2.0, 3.99, "borderline"], [0, 1.99, "high"]],
  astAltRatio:   [[0.5, 1.0, "normal"], [1.01, 2.0, "borderline"], [2.01, Infinity, "high"], [0, 0.499, "low"]],
  agRatio:       [[1.2, 2.2, "normal"], [1.0, 1.19, "borderline"], [2.21, 2.8, "borderline"], [0, 0.99, "high"], [2.81, Infinity, "high"]],
  nafldScore:    [[-10, -1.456, "normal"], [-1.455, 0.675, "borderline"], [0.676, 10, "high"]],
  uricCreatRatio:[[0, 0.6, "normal"], [0.601, 0.8, "borderline"], [0.801, Infinity, "high"]],
 
  wbc:           [[0, 3.9, "low"], [4.0, 11.0, "normal"], [11.1, 15.0, "borderline"], [15.1, Infinity, "high"]],
  rbc:           [[0, 3.9, "low"], [4.0, 5.5, "normal"], [5.6, Infinity, "borderline"]],
  hemoglobin:    [[0, 11.9, "low"], [12.0, 17.5, "normal"], [17.6, Infinity, "high"]],
  hematocrit:    [[0, 35.9, "low"], [36, 52, "normal"], [52.1, Infinity, "high"]],
  mcv:           [[0, 79, "low"], [80, 100, "normal"], [101, Infinity, "high"]],
  mch:           [[0, 26.9, "low"], [27, 33, "normal"], [33.1, Infinity, "high"]],
  mchc:          [[0, 31.9, "low"], [32, 36, "normal"], [36.1, Infinity, "high"]],
  rdw:           [[0, 14.5, "normal"], [14.6, 17.0, "borderline"], [17.1, Infinity, "high"]],
  platelets:     [[0, 149, "low"], [150, 400, "normal"], [401, 500, "borderline"], [501, Infinity, "high"]],
 
  neutrophils:   [[0, 1.7, "low"], [1.8, 7.7, "normal"], [7.8, Infinity, "high"]],
  lymphocytes:   [[0, 0.9, "low"], [1.0, 4.8, "normal"], [4.9, Infinity, "high"]],
  monocytes:     [[0, 0.09, "low"], [0.1, 0.9, "normal"], [0.91, Infinity, "high"]],
  eosinophils:   [[0, 0.09, "normal"], [0.1, 0.5, "normal"], [0.51, 0.8, "borderline"], [0.81, Infinity, "high"]],
  basophils:     [[0, 0.1, "normal"], [0.11, 0.2, "borderline"], [0.21, Infinity, "high"]],
 
  vitD:          [[0, 19, "high"], [20, 29, "borderline"], [30, 80, "normal"], [81, Infinity, "borderline"]],
  rbcMag:        [[0, 4.19, "low"], [4.2, 6.8, "normal"], [6.81, Infinity, "high"]],
  b12:           [[0, 199, "low"], [200, 299, "borderline"], [300, 900, "normal"], [901, Infinity, "borderline"]],
  folate:        [[0, 2.9, "low"], [3.0, 4.9, "borderline"], [5.0, 20.0, "normal"], [20.1, Infinity, "borderline"]],
 
  tibc:          [[250, 350, "normal"], [175, 249, "borderline"], [351, 425, "borderline"], [0, 174, "high"], [426, Infinity, "high"]],
  uibc:          [[150, 375, "normal"], [100, 149, "borderline"], [376, 450, "borderline"], [0, 99, "high"], [451, Infinity, "high"]],
  serumIron:     [[80, 120, "normal"], [60, 79, "borderline"], [121, 160, "borderline"], [0, 59, "high"], [161, Infinity, "high"]],
  transferrinSat:[[25, 35, "normal"], [15, 24, "borderline"], [36, 45, "borderline"], [0, 14, "high"], [46, Infinity, "high"]],
 
 
  // Testosterone: sex-specific bands — males 300-1000, females 15-70 ng/dL
  testosterone:  [[300, 1000, "normal"], [200, 299, "borderline"], [0, 199, "high"], [1001, Infinity, "high"]],
  estradiol:     [[20, 400, "normal"], [10, 19, "borderline"], [401, Infinity, "borderline"], [0, 9, "high"]],
  progesterone:  [[0, 1.0, "normal"], [1.01, 5.0, "borderline"], [5.01, Infinity, "normal"]], 
  psa:           [[0, 2.5, "normal"], [2.6, 4.0, "borderline"], [4.1, Infinity, "high"]],
  dheas:         [[70, 395, "normal"], [35, 69, "borderline"], [0, 34, "high"], [396, Infinity, "borderline"]],
  fsh:           [[2, 12, "normal"], [1, 1.9, "borderline"], [0, 0.9, "low"], [12.1, Infinity, "high"]],
  lh:            [[2, 12, "normal"], [1, 1.9, "borderline"], [0, 0.9, "low"], [12.1, Infinity, "high"]],
  prolactin:     [[2, 20, "normal"], [21, 30, "borderline"], [0, 1.9, "low"], [31, Infinity, "high"]],
  shbg:          [[20, 60, "normal"], [10, 19, "borderline"], [61, 80, "borderline"], [0, 9, "high"], [81, Infinity, "high"]],
  igf1:          [[100, 300, "normal"], [50, 99, "borderline"], [301, 400, "borderline"], [0, 49, "high"], [401, Infinity, "high"]],
 
  tsh:           [[0, 1.79, "normal"], [1.8, 2.0, "normal"], [2.01, 4.5, "borderline"], [4.51, Infinity, "high"]],
  freeT4:        [[0.9, 1.2, "normal"], [0.7, 0.899, "borderline"], [1.21, 1.8, "borderline"], [0, 0.699, "high"], [1.81, Infinity, "high"]],
  freeT3:        [[3.6, 4.2, "normal"], [3.0, 3.599, "borderline"], [4.21, 4.8, "borderline"], [0, 2.999, "high"], [4.81, Infinity, "high"]],
  reverseT3:     [[8, 15, "normal"], [16, 24, "borderline"], [0, 7.999, "low"], [25, Infinity, "high"]],
  tpoAb:         [[0, 34, "normal"], [35, 100, "borderline"], [101, Infinity, "high"]],
  tgAb:          [[0, 40, "normal"], [41, 100, "borderline"], [101, Infinity, "high"]],
 
  rT3_fT3:       [[0, 3.0, "normal"], [3.01, 5.0, "borderline"], [5.01, Infinity, "high"]],
  fT3_rT3:       [[0.20, Infinity, "normal"], [0.12, 0.199, "borderline"], [0, 0.119, "high"]],
  fT3_fT4:       [[2.5, 4.5, "normal"], [1.8, 2.499, "borderline"], [4.51, 6.0, "borderline"], [0, 1.799, "high"], [6.01, Infinity, "high"]],
  fT3_tsh:       [[2.0, 6.0, "normal"], [1.0, 1.999, "borderline"], [6.01, 10.0, "borderline"], [0, 0.999, "high"], [10.01, Infinity, "high"]],
 
  ascvd:         [[0, 4.9, "normal"], [5, 7.49, "borderline"], [7.5, Infinity, "high"]],
  ascvdPrevent:  [[0, 4.9, "normal"], [5, 7.49, "borderline"], [7.5, Infinity, "high"]],
};

function getRisk(key, val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  for (const [lo, hi, lvl] of (RISK_BANDS[key] || [])) {
    if (val >= lo && val <= hi) return lvl;
  }
  return null;
}

function getRiskFerritin(val, sex) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const isFemale = sex === "female";
  const lo = isFemale ? 50 : 50;
  const hi = isFemale ? 70 : 100;
  if (val >= lo && val <= hi) return "normal";
  if (val < lo) return val < 20 ? "high" : "borderline";
  if (val <= hi * 2) return "borderline";
  return "high";
}

/* ═══════════════════════════════════════════════════════════
   INTERPRETATIONS
═══════════════════════════════════════════════════════════ */
const INTERP = {
  friedewald:    v => v < 100 ? "Optimal LDL-C." : v < 130 ? "Near optimal." : v < 160 ? "Borderline high — lifestyle modifications recommended." : "High — evaluate statin therapy.",
  martinHopkins: v => v < 100 ? "Optimal (Martin-Hopkins). More accurate than Friedewald at low TG or LDL." : v < 130 ? "Near optimal." : v < 160 ? "Borderline high." : "High — use preferentially over Friedewald when TG < 70 mg/dL.",
  ldlHdl:        v => v < 2.0 ? "Low cardiovascular risk ratio." : v < 3.0 ? "Moderate — trend monitoring advised." : "Elevated — significant atherogenic risk.",
  tcHdl:         v => v < 3.5 ? "Optimal lipid ratio." : v < 5.0 ? "Moderate cardiovascular risk." : "High cardiovascular risk — reduce LDL, raise HDL.",
  tgHdl:         v => v < 2.0 ? "Favorable — low insulin resistance signal." : v < 3.5 ? "Borderline — possible early insulin resistance." : "Elevated — insulin resistance / small dense LDL pattern likely.",
  nonHdl:        v => v < 130 ? "Optimal non-HDL cholesterol." : v < 160 ? "Borderline high." : "High — all atherogenic particles collectively elevated.",
  remnant:       v => v < 25 ? "Optimal remnant cholesterol." : v < 35 ? "Elevated — associated with residual cardiovascular risk." : "High remnant cholesterol — triglyceride-rich lipoprotein burden.",
  ldlApoB:       v => v >= 0.9 ? "Concordant LDL-C and particle number." : v >= 0.6 ? "Borderline discordance — particle number may underestimate risk." : "High discordance — small dense LDL pattern; risk greater than LDL-C suggests.",
  apoBapoA:      v => v < 0.7 ? "Favorable atherogenic balance." : v < 0.9 ? "Borderline — increased atherogenic burden." : "Unfavorable — ApoB dominance indicates significant cardiovascular risk.",
  aip:           v => v<0.11?"Low AIP — favorable.":v<0.21?"Intermediate — mixed dyslipidemia.":"High AIP — small dense LDL predictor.",
 
  tc:            v => v<200?"Optimal TC.":v<240?"Borderline high (200–239). Lifestyle changes.":"High (≥240) — evaluate lipid panel.",
  hdl:           v => v>=60?"Optimal HDL (≥60).":v>=40?"Borderline (40–59). Raise through exercise and diet.":"Low (<40) — significant CV risk.",
  ldl:           v => v<100?"Optimal LDL.":v<130?"Near optimal (100–129).":v<160?"Borderline high (130–159).":"High (≥160) — evaluate statin therapy.",
  tg:            v => v<150?"Normal TG.":v<200?"Borderline high (150–199). Reduce carbs/alcohol.":"High (≥200) — insulin resistance risk.",
  vldl:          v => v<=30?"Normal VLDL.":v<=40?"Borderline — evaluate TG and IR.":"Elevated (>40) — metabolic syndrome association.",
  lipoA:         v => v<=30?"Normal Lp(a).":v<=50?"Borderline — genetic ASCVD risk.":"Elevated (>50) — discuss PCSK9 inhibitors.",
  apoA:          v => v>=120?"Optimal ApoA1 (≥120).":v>=100?"Borderline (100–119) — reduced HDL function.":"Low (<100) — elevated CV risk.",
  apoB:          v => v<=90?"Optimal ApoB (≤90).":v<=110?"Borderline — monitor with LDL-C.":"Elevated (>110) — high particle count; superior ASCVD predictor.",
 
  hdlP:          v => v>=30.5?"Normal HDL-P.":v>=25?"Borderline low — impaired reverse cholesterol transport.":"Low HDL-P — elevated CV risk.",
  largeHdlP:     v => v >= 7 ? "Normal large HDL-P. Large HDL particles are most cardioprotective." : v >= 4 ? "Borderline low large HDL-P — reduced cardioprotective HDL subclass." : "Low large HDL-P — reduction in most protective HDL particle type; correlates with insulin resistance.",
  largeVldlP:    v => v<=2.2?"Normal large VLDL-P.":v<=4?"Borderline — hypertriglyceridemia and LP-IR.":"Elevated — insulin resistance signal.",
  vldlP:         v => v <= 4 ? "Normal VLDL-P." : v <= 7 ? "Borderline elevated VLDL-P." : "Elevated VLDL-P — high total triglyceride-rich lipoprotein particle burden.",
  ldlSizeNmr:    v => v>=20.6?"Optimal LDL size (Pattern A).":v>=19?"Intermediate — transitional A/B.":"Small (Pattern B) — higher ASCVD risk.",
  hdlSizeNmr:    v => v>=9.4?"Optimal HDL size.":v>=8.3?"Borderline.":"Small HDL — reduced reverse cholesterol transport.",
  vldlSizeNmr:   v => v <= 49 ? "Normal VLDL particle size." : v <= 59 ? "Borderline large VLDL — associated with high LP-IR." : "Large VLDL — strongly associated with insulin resistance.",
 
  glucose:       v => v<100?"Normal fasting glucose.":v<126?"Prediabetes (100–125) — lifestyle intervention.":"Diabetes range (≥126) — pharmacotherapy evaluation.",
  sodium:        v => v>=135&&v<=145?"Normal sodium.":v>145?"Hypernatremia — evaluate free water deficit.":"Hyponatremia — evaluate fluid status and SIADH.",
  potassium:     v => v>=3.5&&v<=5.0?"Normal potassium.":v<3.5?"Hypokalemia — evaluate diuretics, GI losses.":v<=5.5?"Borderline hyperkalemia.":"Hyperkalemia — evaluate renal function.",
  chloride:      v => v>=96&&v<=106?"Normal chloride.":v<96?"Low — metabolic alkalosis.":"High — metabolic acidosis.",
  bicarb:        v => v>=22&&v<=29?"Normal bicarbonate.":v<22?"Low — metabolic acidosis.":"High — metabolic alkalosis.",
  calcium:       v => v>=8.5&&v<=10.5?"Normal calcium.":v<8.5?"Hypocalcemia — evaluate PTH, vitamin D.":v<=12?"Borderline hypercalcemia.":"Significant hypercalcemia — evaluate malignancy.",
  albumin:       v => v>=3.5&&v<=5.0?"Normal albumin.":v<3.5?"Low — evaluate nutrition and liver function.":"High — evaluate dehydration.",
  totalProtein:  v => v>=6.0&&v<=8.3?"Normal total protein (6.0–8.3 g/dL).":v<6.0?"Low total protein — evaluate malnutrition, liver disease, or protein-losing nephropathy.":"Elevated total protein — evaluate dehydration or elevated globulins (multiple myeloma).",
  globulin:      v => v>=1.5&&v<=3.7?"Normal globulin (1.5–3.7 g/dL).":v<1.5?"Low globulin — evaluate immunodeficiency or agammaglobulinemia.":v<=4.5?"Borderline elevated — evaluate chronic inflammation, infection, or early dysproteinemia.":"Elevated globulin (>4.5 g/dL) — evaluate multiple myeloma, chronic liver disease, autoimmune disease, or chronic infection.",
  bun:           v => v>=7&&v<=20?"Normal BUN.":v<7?"Low — liver disease or low protein.":v<=25?"Borderline BUN.":"Elevated — evaluate renal function and GI bleeding.",
  creatinine:    v => v>=0.6&&v<=1.2?"Normal creatinine.":v<0.6?"Low — low muscle mass.":v<=1.5?"Borderline — monitor eGFR.":"Elevated — renal impairment.",
 
  alt:           v => v<=40?"Normal ALT.":v<=56?"Borderline — early inflammation or steatosis.":"Elevated — hepatocellular injury.",
  ast:           v => v<=40?"Normal AST.":v<=56?"Borderline — evaluate with ALT.":"Elevated — check AST/ALT ratio.",
  alkPhos:       v => v>=30&&v<=120?"Normal ALP.":v<30?"Low — hypothyroidism or zinc deficiency.":v<=150?"Borderline ALP.":"Elevated — biliary obstruction or bone disease.",
  ggt:           v => v<=55?"Normal GGT.":v<=100?"Borderline — biliary disease or alcohol.":"Elevated — hepatobiliary disease or oxidative stress.",
 
  insulin:       v => v<=25?"Normal fasting insulin.":v<=29?"Borderline — early hyperinsulinemia.":"Elevated — significant IR. Evaluate HOMA-IR.",
  cortisol:      v => v>=6&&v<=23?"Normal cortisol.":v<6?"Low — adrenal insufficiency.":v<=30?"Borderline elevated.":"Elevated — evaluate Cushing's.",
  homocysteine:  v => v<=10?"Normal homocysteine.":v<=15?"Borderline — evaluate B12, folate.":"Elevated (>15) — independent CV risk. Treat B12/folate deficiency.",
  ldh:           v => v<=250?"Normal LDH.":v<=350?"Borderline — mild tissue injury or hemolysis.":"Elevated — evaluate hemolysis, liver, cardiac, or malignancy.",
  uricAcid:      v => v>=2.5&&v<=6.0?"Normal uric acid.":v<2.5?"Low uric acid.":v<=7.0?"Borderline — approaching gout threshold.":"Elevated (>7.0) — hyperuricemia.",
  ck:            v => v<=200?"Normal CK.":v<=400?"Borderline — evaluate exercise, statins.":"Elevated (>400) — muscle injury. Check CK-MB.",
  ckMb:          v => v<=7?"Normal CK-MB.":v<=10?"Borderline — evaluate clinically.":"Elevated (>10) — evaluate myocardial injury.",
 
  vitD:          v => v<20?"Deficient (<20) — supplement.":v<30?"Insufficient (20–29).":v<=80?"Optimal Vitamin D.":"High (>80) — evaluate toxicity.",
  rbcMag:        v => v>=4.2&&v<=6.8?"Normal RBC Magnesium.":v<4.2?"Low — intracellular deficiency. CV and IR risk.":"High — evaluate supplementation.",
  b12:           v => v>=300&&v<=900?"Optimal B12.":v>=200?"Borderline (200–299) — consider supplementation.":"Low (<200) — deficiency. Evaluate absorption.",
  folate:        v => v>=5?"Normal folate.":v>=3?"Borderline (3–4.9) — may elevate homocysteine.":"Low (<3) — deficiency. Megaloblastic anemia risk.",
  folateMisc:    v => v >= 5 ? "Normal folate (≥5 ng/mL)." : v >= 3 ? "Borderline folate (3–4.9 ng/mL)." : "Low folate (<3 ng/mL) — deficiency.",
  mma:           v => v <= 0.4 ? "Normal MMA (≤0.40 µmol/L) — functional B12 sufficiency confirmed." : v <= 0.75 ? "Borderline MMA (0.41–0.75 µmol/L) — early functional B12 deficiency possible even if serum B12 appears normal. Evaluate with homocysteine." : "Elevated MMA (>0.75 µmol/L) — functional B12 deficiency. MMA is more sensitive than serum B12; elevated levels indicate inadequate cellular B12 activity. Supplement and recheck.",
  myeloperox:    v => v <= 420 ? "Normal myeloperoxidase (≤420 pmol/L) — low vascular oxidative stress and plaque vulnerability." : v <= 600 ? "Borderline MPO (421–600 pmol/L) — early oxidative vascular stress. Evaluate cardiovascular risk factors and inflammation markers." : "Elevated MPO (>600 pmol/L) — significant vascular oxidative stress. MPO is an independent predictor of major cardiac events and plaque rupture risk beyond standard lipid markers. Correlate with hs-CRP and clinical context.",
 
  wbc:           v => v>=4&&v<=11?"Normal WBC.":v<4?"Leukopenia — evaluate infection or bone marrow.":v<=15?"Borderline leukocytosis.":"Leukocytosis (>15) — evaluate infection.",
  rbc:           v => v>=4&&v<=5.5?"Normal RBC.":v<4?"Low — evaluate anemia (iron, B12, folate).":"Borderline elevated — evaluate polycythemia.",
  hemoglobin:    v => v>=12&&v<=17.5?"Normal hemoglobin.":v<12?"Low — anemia. Evaluate iron, B12, folate.":"Elevated — evaluate polycythemia.",
  hematocrit:    v => v>=36&&v<=52?"Normal hematocrit.":v<36?"Low — anemia.":"Elevated — dehydration or polycythemia.",
  mcv:           v => v>=80&&v<=100?"Normal MCV.":v<80?"Microcytosis — evaluate iron deficiency.":"Macrocytosis — evaluate B12/folate deficiency.",
  mch:           v => v>=27&&v<=33?"Normal MCH.":v<27?"Low — iron deficiency.":"High — macrocytic anemia.",
  mchc:          v => v>=32&&v<=36?"Normal MCHC.":v<32?"Low — iron deficiency.":"High — evaluate spherocytosis.",
  rdw:           v => v<=14.5?"Normal RDW.":v<=17?"Borderline anisocytosis.":"High — mixed anemia; evaluate nutritional deficiency.",
  platelets:     v => v>=150&&v<=400?"Normal platelets.":v<150?"Thrombocytopenia.":v<=500?"Borderline thrombocytosis.":"Significant — evaluate myeloproliferative.",
  neutrophils:   v => v>=1.8&&v<=7.7?"Normal neutrophils.":v<1.8?"Neutropenia — evaluate infection risk.":"Neutrophilia — evaluate infection or corticosteroids.",
  lymphocytes:   v => v>=1&&v<=4.8?"Normal lymphocytes.":v<1?"Lymphopenia — evaluate immunodeficiency.":"Lymphocytosis — evaluate viral infection or CLL.",
  monocytes:     v => v>=0.1&&v<=0.9?"Normal monocytes.":v<0.1?"Low — immunosuppression.":"Monocytosis — evaluate chronic infection or malignancy.",
  eosinophils:   v => v<=0.5?"Normal eosinophils.":v<=0.8?"Borderline eosinophilia.":"Eosinophilia — evaluate allergy or parasites.",
  basophils:     v => v<=0.1?"Normal basophils.":v<=0.2?"Borderline basophilia.":"Basophilia — evaluate myeloproliferative.",
 
  testosterone:  v => v>=300&&v<=1000?"Normal testosterone.":v<200?"Low (<200) — hypogonadism. Evaluate LH/FSH.":v<300?"Borderline low.":"Elevated — evaluate supplementation.",
  estradiol:     v => v>=20&&v<=400?"Estradiol in range (cycle/sex dependent).":v<20?"Low — evaluate menopause or HPA suppression.":"Elevated — evaluate estrogen excess.",
  psa:           v => v<=2.5?"Low PSA — low cancer risk.":v<=4.0?"Borderline — discuss with urologist.":"Elevated (>4.0) — urology referral.",
  dheas:         v => v>=70&&v<=395?"Normal DHEA-S.":v<35?"Low (<35) — reduced adrenal reserve.":v<70?"Borderline low DHEA-S.":"Borderline elevated — evaluate adrenal excess.",
  fsh:           v => v>=2&&v<=12?"Normal FSH.":v<2?"Low — hypogonadotropic hypogonadism.":"Elevated — evaluate ovarian insufficiency.",
  lh:            v => v>=2&&v<=12?"Normal LH.":v<2?"Low — hypogonadotropic hypogonadism.":"Elevated — evaluate gonadal failure.",
  prolactin:     v => v>=2&&v<=20?"Normal prolactin.":v<2?"Low — evaluate panhypopituitarism.":v<=30?"Borderline — rule out medications.":"Elevated (>30) — evaluate prolactinoma.",
  shbg:          v => v>=20&&v<=60?"Normal SHBG.":v<10?"Very low (<10) — free androgen excess; IR/NAFLD risk.":v<20?"Low — elevated free T fraction.":v<=80?"Borderline high — reduced free T.":"High (>80) — evaluate hyperthyroidism or estrogen excess.",
  igf1:          v => v>=100&&v<=300?"Normal IGF-1.":v<50?"Low (<50) — evaluate GH deficiency.":v<100?"Borderline low.":v<=400?"Borderline elevated — monitor acromegaly symptoms.":"Elevated (>400) — evaluate acromegaly.",
 
  tpoAb:         v => v<=34?"TPO antibodies normal.":v<=100?"Borderline — monitor TSH annually.":"Elevated — Hashimoto's thyroiditis pattern.",
  tgAb:          v => v<=40?"TgAb normal.":v<=100?"Borderline autoimmunity.":"Elevated — Hashimoto's or Graves'. Interferes with TG tumor marker.",
  ldlP:          v => v<1000?"Optimal LDL-P.":v<1300?"Borderline LDL-P (1,000–1,299) — elevated ASCVD risk.":"High (≥1,300) — atherogenic burden. Statin indicated.",
  smallLdlP:     v => v <= 527 ? "Optimal small LDL-P." : v <= 899 ? "Borderline — elevated small dense LDL. Evaluate TG/HDL." : "High small LDL-P (≥900) — Pattern B. High atherogenic risk.",
  sdLdl:         v => v<=35?"Optimal sdLDL-C.":v<=49?"Borderline — elevated small dense LDL.":"High (≥50) — most atherogenic LDL. High ASCVD risk.",
  anionGap:      v => v >= 6 && v <= 12 ? "Normal anion gap." : v > 12 ? "Elevated — consider MUDPILES causes." : "Low — consider hypoalbuminemia, multiple myeloma, or lab error.",
  corrAG:        v => v>=6&&v<=12?"Corrected anion gap normal.":v>12?"Elevated — HAGMA after albumin correction.":"Low corrected AG.",
  bunCr:         v => v>=10&&v<=20?"Normal BUN/Cr.":v>20?"Elevated — prerenal azotemia or GI bleed.":"Low — hepatic disease or low protein.",
  corrCa:        v => v>=8.5&&v<=10.5?"Corrected calcium normal.":v>10.5?"Hypercalcemia — evaluate PTH.":"Hypocalcemia — evaluate PTH, magnesium.",
  corrNa:        v => v>=135&&v<=145?"Sodium normal after correction.":v>145?"Corrected hypernatremia — free water deficit.":"Corrected hyponatremia persists.",
  osmolality:    v => v>=275&&v<=295?"Normal osmolality.":v>295?"Hyperosmolar — evaluate hyperglycemia or uremia.":"Hypoosmolar — evaluate hyponatremia.",
  egfr:          v => v>=60?"Normal kidney function.":v>=30?"Moderate CKD — nephrology referral.":"Severely reduced eGFR — urgent evaluation.",
  acr:           v => v<30?"Normal urine albumin excretion.":v<300?"Moderate (A2) — early CKD. Optimize BP/glycemia.":"Severely increased (A3) — glomerular damage.",
  homaIR:        v => v<2.0?"Normal insulin sensitivity.":v<3.0?"Borderline IR — lifestyle intervention.":"Significant IR — elevated T2DM risk.",
  homaBeta:      v => v > 100 ? "Normal estimated beta-cell function." : v > 50 ? "Mildly reduced beta-cell reserve." : "Significantly reduced estimated beta-cell function.",
  lpir:          v => v<45?"Low LP-IR — insulin sensitive.":v<61?"Borderline LP-IR.":"Elevated (≥61) — insulin resistance. Correlate with HOMA-IR.",
  fib4:          v => v < 1.3 ? "Low FIB-4 — low probability of advanced hepatic fibrosis." : v < 2.67 ? "Intermediate — consider fibroscan or liver biopsy referral." : "High FIB-4 — high probability of advanced fibrosis (F3–F4). Hepatology referral recommended.",
  crp:           v => v < 1.0 ? "Low cardiovascular inflammation risk (hs-CRP)." : v < 3.0 ? "Moderate inflammation — intermediate CV risk." : "High hs-CRP — evaluate infection, autoimmune disease, cardiovascular risk.",
  basicCrp:      v => v <= 5.0 ? "Normal CRP — no significant acute inflammation detected." : v <= 10.0 ? "Mildly elevated — consider subclinical inflammation, infection, or metabolic stress." : "Elevated CRP — evaluate for infection, inflammatory condition, or tissue injury.",
  a1c:           v => v < 5.7 ? "Normal — no evidence of dysglycemia." : v < 6.5 ? "Prediabetes range — intensive lifestyle intervention recommended." : "Diabetes range — pharmacotherapy evaluation warranted.",
  ascvd:         v => v<5?"Low 10-yr ASCVD risk — PCE.":v<7.5?"Borderline (5–7.5%).":v<20?"Intermediate (7.5–20%) — statin therapy discussion warranted.":"High (≥20%) — high-intensity statin recommended.",
  ascvdPrevent:  v => v<5?"Low 10-yr risk — PREVENT.":v<7.5?"Borderline (5–7.5%).":v<20?"Intermediate — statin warranted.":"High (≥20%) — high-intensity statin recommended.",
 
  eag:           v => v<100?"Normal eAG.":v<126?"eAG prediabetes range — lifestyle intervention.":"eAG diabetes range — pharmacotherapy warranted.",
  tcHdlRatio:    v => v < 3.5 ? "Optimal TC/HDL-C ratio." : v < 5.0 ? "Borderline — moderate cardiovascular risk. Raise HDL or lower LDL." : "Elevated — high cardiovascular risk.",
  hdlcTgRatio:   v => v>=0.4?"Favorable HDL-C/TG.":v>=0.25?"Borderline — early IR possible.":"Low — insulin resistance and small dense LDL.",
  vldlcTgRatio:  v => v>=0.1&&v<=0.25?"Normal VLDL-C/TG.":v>0.35?"Elevated — evaluate dysbetalipoproteinemia.":v>0.25?"Borderline.":"Low — TG-rich VLDL.",
  // New derived ratio interpretations
  tygIndex:      v => `TyG Index: ln(TG×Glucose÷2). Optimal ≤8.5; borderline 8.5–9.0; elevated >9.0.\n\n` + (v <= 8.5 ? "Low — insulin-sensitive. Strong negative predictor of T2DM and NAFLD." : v <= 9.0 ? "Borderline — early insulin resistance. Reduce refined carbohydrates and increase activity." : "Elevated (>9.0) — significant insulin resistance. Correlate with HOMA-IR and fasting insulin."),
  glucInsulinRatio: v => v >= 10 ? "Normal glucose/insulin ratio — appropriate insulin sensitivity." : v >= 6 ? "Borderline — reduced sensitivity. Cross-reference with HOMA-IR." : "Low (<6) — significant insulin resistance. Evaluate with HOMA-IR and TyG Index.",
  cortDheasRatio:v => `Cortisol/DHEA-S Ratio: HPA axis balance. Optimal <0.10.

` + (v <= 0.1 ? "Optimal — anabolic-catabolic axis well balanced." : v <= 0.3 ? "Borderline — cortisol gaining dominance. Evaluate chronic stress and adrenal function." : "Elevated — significant catabolic dominance. Associated with accelerated aging, IR, immune suppression. HPA evaluation warranted."),
  progE2Ratio:   v => `P/E2 Ratio (×1000): estrogen dominance marker. Optimal >100.

` + (v >= 100 ? "Favorable — progesterone and estradiol balanced." : v >= 50 ? "Borderline — relative estrogen dominance. Evaluate progesterone support." : "Low P/E2 (<50) — significant estrogen dominance. Associated with PMS, endometriosis, fibroid growth. Consider DUTCH testing."),
  freeTestoIndex:v => `Free Testosterone Index (FTI) = (Total T÷SHBG)×100. Optimal 1.5–3.0.

` + (v >= 1.5 && v <= 3.0 ? "Optimal FTI — bioavailable testosterone in healthy range." : v >= 0.5 ? "Low FTI — high SHBG may limit free testosterone despite normal total T." : v > 3.0 && v <= 5.0 ? "Borderline elevated — evaluate PCOS or exogenous testosterone." : v < 0.5 ? "Very low FTI — evaluate SHBG, LH, FSH." : "Elevated (>5.0) — excess free androgens. Evaluate PCOS or adrenal excess."),
  nlr:           v => v <= 2.0 ? "Optimal NLR — low systemic inflammatory burden." : v <= 3.0 ? "Borderline NLR (2–3) — mild inflammation. Evaluate lifestyle, sleep, chronic stressors." : "Elevated NLR (>3.0) — significant systemic inflammation. Independently associated with mortality, cardiovascular events, and metabolic syndrome.",
  plr:           v => v <= 150 ? "Optimal PLR (<150) — normal platelet-lymphocyte balance." : v <= 200 ? "Borderline PLR (150–200) — mild immune activation. Correlate with NLR and CRP." : "Elevated PLR (>200) — significant immune activation. Associated with cardiovascular risk and metabolic syndrome severity.",
  lmr:           v => v >= 4.0 ? "Optimal LMR (>4.0) — robust immune surveillance." : v >= 2.0 ? "Borderline LMR (2–4) — reduced lymphocyte surveillance. May reflect chronic inflammation or nutritional depletion." : "Low LMR (<2.0) — impaired immune surveillance. Associated with chronic inflammation and increased infection susceptibility.",
  astAltRatio:   v => v>=0.5&&v<=1.0?"Normal AST/ALT.":v>2.0?"Elevated (>2:1) — alcoholic hepatitis pattern.":v>1.0?"Borderline (1–2) — evaluate alcohol use.":"Low (<0.5) — early NAFLD pattern.",
  agRatio:       v => v>=1.2&&v<=2.2?"Normal A/G ratio.":v>=1.0?"Borderline low A/G.":v>2.2?"Elevated — low globulins; evaluate immunodeficiency.":"Low (<1.0) — evaluate cirrhosis or myeloma.",
  nafldScore:    v => v<=-1.455?"Low NAFLD score — low fibrosis probability.":v<=0.675?"Intermediate — consider fibroscan.":"High (>0.675) — advanced fibrosis likely. Hepatology referral.",
  uricCreatRatio:v => v<=0.6?"Normal uric acid/creatinine ratio.":v<=0.8?"Borderline — monitor in gout and IR context.":"Elevated (>0.8) — urate retention. Evaluate purines and renal function.",
 
  tsh:           v => v<1.8?"Optimal TSH.":v<=2.0?"TSH acceptable (≤2.0).":v<=4.5?"Borderline — monitor for subclinical hypothyroidism.":"Elevated (>4.5) — hypothyroidism.",
  freeT4:        v => v>=0.9&&v<=1.2?"Optimal fT4.":v>=0.7?"Low-normal fT4.":v>1.2&&v<=1.8?"High-normal fT4.":v<0.7?"Low — hypothyroidism possible.":"Elevated (>1.8) — evaluate hyperthyroidism.",
  freeT3:        v => v>=3.6&&v<=4.2?"Optimal fT3.":v>=3.0?"Low-normal — check T4→T3 conversion.":v>4.2&&v<=4.8?"High-normal fT3.":v<3.0?"Low — poor conversion.":"Elevated (>4.8) — evaluate hyperthyroidism.",
  reverseT3:     v => v>=8&&v<=15?"Optimal rT3.":v<=24?"Borderline — evaluate stress and nutrients.":v>24?"Elevated (>24) — impaired conversion.":"Low rT3.",
 
  rT3_fT3:       v => `rT3/fT3 — lower is better. Optimal ≤3.0.\n\n` + (v <= 3.0 ? "Optimal." : v <= 5.0 ? "Borderline — rT3 may be blocking T3 receptors. Evaluate stress, nutrients." : "Elevated (>5.0) — rT3 dominates. Clinical evaluation warranted."),
  fT3_rT3:       v => v>=0.20?"Optimal fT3/rT3.":v>=0.12?"Borderline — suboptimal T3 availability.":"Low (<0.12) — poor conversion. Evaluate HPA axis.",
  fT3_fT4:       v => v>=2.5&&v<=4.5?"Optimal fT3/fT4.":v>=1.8?"Borderline low — evaluate selenium, cortisol.":v<1.8?"Low conversion.":v>4.5&&v<=6?"Borderline high.":"High — evaluate T3 supplementation.",
  fT3_tsh:       v => v>=2.0&&v<=6.0?"Optimal fT3/TSH.":v>=1.0?"Borderline low.":v>6.0&&v<=10?"Borderline high.":v<1.0?"Low — evaluate thyroid reserve.":"High (>10) — evaluate hyperthyroidism.",
 
  tibc:          v => v >= 250 && v <= 350 ? "Optimal TIBC (250–350 µg/dL)." : v < 250 ? "Low TIBC — may indicate iron overload, inflammation, or liver disease." : "Elevated TIBC (>350) — suggests iron deficiency; more transferrin available to bind iron.",
  uibc:          v => v >= 150 && v <= 375 ? "Optimal UIBC (150–375 µg/dL)." : v < 150 ? "Low UIBC — may indicate iron overload or reduced transferrin." : "Elevated UIBC (>375) — iron deficiency; transferrin has excess binding capacity.",
  serumIron:     v => v>=80&&v<=120?"Optimal serum iron.":v<60?"Low (<60) — iron deficiency.":v<80?"Low-normal.":"Elevated — evaluate iron overload.",
  transferrinSat:v => v>=25&&v<=35?"Optimal iron % saturation.":v<15?"Low (<15%) — iron deficiency.":v<25?"Borderline low.":v<=45?"Borderline elevated.":"Elevated — evaluate hemochromatosis.",
  ferritin_m:    v => v>=50&&v<=100?"Optimal ferritin (men).":v<20?"Low (<20) — depleted stores.":v<50?"Below optimal.":v<=200?"Borderline elevated.":"Elevated (>200) — evaluate hemochromatosis.",
  ferritin_f:    v => v>=50&&v<=70?"Optimal ferritin (women).":v<20?"Low (<20) — iron deficiency.":v<50?"Below optimal.":v<=140?"Borderline elevated.":"Elevated (>140) — evaluate hemochromatosis.",
 
  tBili:         v => v<=1.2?"Normal total bilirubin.":v<=2.0?"Borderline — hemolysis or Gilbert's.":"Elevated (>2.0) — evaluate liver disease or hemolysis.",
  directBili:    v => v<=0.3?"Normal direct bilirubin.":v<=0.5?"Borderline — early hepatocellular dysfunction.":"Elevated (>0.5) — biliary blockage or cirrhosis.",
};

/* ═══════════════════════════════════════════════════════════
   BUILD ROW DEFINITIONS
═══════════════════════════════════════════════════════════ */
function buildRows(r) {
  const all = [
    { group: "Lipid",     key: "friedewald",    label: "Friedewald LDL-C",               val: r.friedewald,    unit: "mg/dL", dec: 1, rkey: "friedewald"    },
    { group: "Lipid",     key: "martinHopkins", label: "Martin-Hopkins LDL-C",           val: r.martinHopkins, unit: "mg/dL", dec: 1, rkey: "martinHopkins"  },
    { group: "Lipid",     key: "ldlHdl",        label: "LDL / HDL Ratio",                val: r.ldlHdl,        unit: "",      dec: 2, rkey: "ldlHdl"         },
    { group: "Lipid",     key: "tcHdl",         label: "Total Cholesterol / HDL",        val: r.tcHdl,         unit: "",      dec: 2, rkey: "tcHdl"          },
    { group: "Lipid",     key: "tgHdl",         label: "TG / HDL (Insulin Res. Proxy)",  val: r.tgHdl,         unit: "",      dec: 2, rkey: "tgHdl"          },
    { group: "Lipid",     key: "nonHdl",        label: "Non-HDL Cholesterol",            val: r.nonHdl,        unit: "mg/dL", dec: 1, rkey: "nonHdl"         },
    { group: "Lipid",     key: "remnant",       label: "Remnant Cholesterol",            val: r.remnant,       unit: "mg/dL", dec: 1, rkey: "remnant"        },
    { group: "Lipid",     key: "aip",           label: "Atherogenic Index of Plasma",    val: r.aip,           unit: "",      dec: 3, rkey: "aip"            },
    { group: "Lipid",     key: "ldlApoB",       label: "LDL-C / ApoB Ratio",            val: r.ldlApoB,       unit: "",      dec: 2, rkey: "ldlApoB"        },
    { group: "Lipid",     key: "apoBapoA",      label: "ApoB / ApoA1 Ratio",            val: r.apoBapoA,      unit: "",      dec: 2, rkey: "apoBapoA"       },
   
    { group: "Lipid",     key: "ldlP",          label: "LDL-P (Total Particles)",       val: r._ldlP,         unit: "nmol/L",dec: 0, rkey: "ldlP"          },
    { group: "Lipid",     key: "smallLdlP",     label: "Small LDL-P",                   val: r._smallLdlP,    unit: "nmol/L",dec: 0, rkey: "smallLdlP"     },
    { group: "Lipid",     key: "sdLdl",         label: "Small Dense LDL (sdLDL-C)",     val: r._sdLdl,        unit: "mg/dL", dec: 1, rkey: "sdLdl"         },
    { group: "Kidney",    key: "egfr",          label: "eGFR (2021 CKD-EPI, race-free)", val: r.egfr,          unit: "mL/min",dec: 1, rkey: "egfr"           },
    { group: "Kidney",    key: "bunCr",         label: "BUN / Creatinine Ratio",         val: r.bunCr,         unit: "",      dec: 1, rkey: "bunCr"          },
    { group: "Kidney",    key: "anionGap",      label: "Anion Gap",                      val: r.anionGap,      unit: "mEq/L", dec: 1, rkey: "anionGap"       },
    { group: "Kidney",    key: "corrAG",        label: "Albumin-Corrected Anion Gap",    val: r.corrAG,        unit: "mEq/L", dec: 1, rkey: "corrAG"         },
    { group: "Kidney",    key: "corrCa",        label: "Corrected Calcium",              val: r.corrCa,        unit: "mg/dL", dec: 1, rkey: "corrCa"         },
    { group: "Kidney",    key: "corrNa",        label: "Corrected Sodium (for glucose)", val: r.corrNa,        unit: "mEq/L", dec: 1, rkey: "corrNa"         },
    { group: "Kidney",    key: "osmolality",    label: "Calculated Serum Osmolality",    val: r.osmolality,    unit: "mOsm/kg", dec: 1, rkey: "osmolality"   },
    { group: "Kidney",    key: "acr",           label: "Urine ACR",                      val: r.acr,           unit: "mg/g",  dec: 1, rkey: "acr"            },
    { group: "Metabolic", key: "homaIR",        label: "HOMA-IR (Insulin Resistance)",   val: r.homaIR,        unit: "",      dec: 2, rkey: "homaIR"         },
    { group: "Metabolic", key: "lpir",           label: `LP-IR Score ${r._lpirIsNmr ? "(NMR)" : "(TG/HDL proxy)"}`, val: r.lpir, unit: "", dec: 0, rkey: "lpir" },
    { group: "Metabolic", key: "homaBeta",      label: "HOMA-β (Beta-Cell Function %)",  val: r.homaBeta,      unit: "%",     dec: 1, rkey: "homaBeta"       },
    { group: "Metabolic", key: "fib4",          label: "FIB-4 (Hepatic Fibrosis)",       val: r.fib4,          unit: "",      dec: 2, rkey: "fib4"           },
    { group: "Metabolic", key: "a1c",           label: "HbA1c",                          val: r._a1c,          unit: "%",     dec: 1, rkey: "a1c"            },
    { group: "Metabolic", key: "eag",           label: "eAG (Est. Avg Glucose)",         val: r.eag,           unit: "mg/dL", dec: 0, rkey: "eag"            },
    { group: "Metabolic", key: "crp",           label: "hs-CRP, Cardiac",                val: r._crp,          unit: "mg/L",  dec: 2, rkey: "crp"            },
    { group: "Metabolic", key: "basicCrp",      label: "CRP (standard)",                 val: r._basicCrp,     unit: "mg/L",  dec: 1, rkey: "basicCrp"       },
   
    { group: "Metabolic", key: "tcHdlRatio",    label: "TC / HDL-C Ratio",               val: r.tcHdlRatio,    unit: "",      dec: 2, rkey: "tcHdlRatio"     },
    { group: "Metabolic", key: "hdlcTgRatio",   label: "HDL-C / TG Ratio",               val: r.hdlcTgRatio,   unit: "",      dec: 2, rkey: "hdlcTgRatio"    },
    { group: "Metabolic", key: "vldlcTgRatio",  label: "VLDL-C / TG Ratio",              val: r.vldlcTgRatio,  unit: "",      dec: 3, rkey: "vldlcTgRatio"   },
    // New derived ratios
    { group: "Metabolic", key: "tygIndex",       label: "TyG Index (Insulin Resistance)",  val: r.tygIndex,      unit: "",      dec: 2, rkey: "tygIndex"       },
    { group: "Metabolic", key: "glucInsulinRatio",label:"Glucose / Insulin Ratio",         val: r.glucInsulinRatio, unit: "",   dec: 1, rkey: "glucInsulinRatio"},
    { group: "Hormone",   key: "cortDheasRatio", label: "Cortisol / DHEA-S Ratio",        val: r.cortDheasRatio,unit: "",      dec: 3, rkey: "cortDheasRatio"  },
    { group: "Hormone",   key: "progE2Ratio",    label: "Progesterone / E2 Ratio (×1000)",val: r.progE2Ratio,   unit: "",      dec: 1, rkey: "progE2Ratio"    },
    { group: "Hormone",   key: "freeTestoIndex", label: "Free Testosterone Index (FTI)",  val: r.freeTestoIndex,unit: "",      dec: 2, rkey: "freeTestoIndex" },
    { group: "CBC",       key: "nlr",            label: "Neutrophil / Lymphocyte Ratio",  val: r.nlr,           unit: "",      dec: 2, rkey: "nlr"            },
    { group: "CBC",       key: "plr",            label: "Platelet / Lymphocyte Ratio",    val: r.plr,           unit: "",      dec: 1, rkey: "plr"            },
    { group: "CBC",       key: "lmr",            label: "Lymphocyte / Monocyte Ratio",    val: r.lmr,           unit: "",      dec: 2, rkey: "lmr"            },
    { group: "Liver",     key: "astAltRatio",    label: "AST / ALT Ratio",                val: r.astAltRatio,   unit: "",      dec: 2, rkey: "astAltRatio"    },
    { group: "Kidney",    key: "agRatio",        label: "Albumin / Globulin Ratio (A/G)", val: r.agRatio,       unit: "",      dec: 2, rkey: "agRatio"        },
    { group: "Liver",     key: "nafldScore",     label: "NAFLD Fibrosis Score",           val: r.nafldScore,    unit: "",      dec: 3, rkey: "nafldScore"     },
    { group: "Kidney",    key: "uricCreatRatio", label: "Uric Acid / Creatinine Ratio",   val: r.uricCreatRatio,unit: "",      dec: 2, rkey: "uricCreatRatio" },
    { group: "ASCVD",     key: "ascvd",         label: "10-Year ASCVD Risk — PCE",       val: r.ascvd,         unit: "%",     dec: 1, rkey: "ascvd"          },
    { group: "ASCVD",     key: "ascvdPrevent",  label: "10-Year ASCVD Risk — PREVENT",   val: r.ascvdPrevent,  unit: "%",     dec: 1, rkey: "ascvdPrevent"   },
    { group: "ASCVD",     key: "ascvdLifetime", label: "Estimated Lifetime ASCVD Risk",  val: r.ascvdLifetime, unit: "%",     dec: 1, rkey: "ascvd"          },
   
    { group: "Thyroid",   key: "tsh",           label: "TSH",                            val: r._tsh,          unit: "mIU/L", dec: 2, rkey: "tsh"            },
    { group: "Thyroid",   key: "freeT4",        label: "Free T4",                        val: r._freeT4,       unit: "ng/dL", dec: 2, rkey: "freeT4"         },
    { group: "Thyroid",   key: "freeT3",        label: "Free T3",                        val: r._freeT3,       unit: "pg/mL", dec: 2, rkey: "freeT3"         },
    { group: "Thyroid",   key: "reverseT3",     label: "Reverse T3",                     val: r._reverseT3,    unit: "ng/dL", dec: 1, rkey: "reverseT3"      },
   
    { group: "Thyroid",   key: "rT3_fT3",       label: "rT3 / fT3 Ratio",               val: r._rT3_fT3,      unit: "",      dec: 2, rkey: "rT3_fT3"        },
    { group: "Thyroid",   key: "fT3_rT3",       label: "fT3 / rT3 Ratio",               val: r._fT3_rT3,      unit: "",      dec: 3, rkey: "fT3_rT3"        },
    { group: "Thyroid",   key: "fT3_fT4",       label: "fT3 / fT4 Ratio",               val: r._fT3_fT4,      unit: "",      dec: 2, rkey: "fT3_fT4"        },
    { group: "Thyroid",   key: "fT3_tsh",       label: "fT3 / TSH Ratio",               val: r._fT3_tsh,      unit: "",      dec: 2, rkey: "fT3_tsh"        },
    { group: "Thyroid",   key: "fT3_fT4_b",     label: "Free T3 : Free T4",             val: r._fT3_fT4,      unit: "",      dec: 2, rkey: "fT3_fT4"        },
   
    { group: "Iron",      key: "tibc",          label: "TIBC",                           val: r._tibc,         unit: "µg/dL", dec: 0, rkey: "tibc"           },
    { group: "Iron",      key: "uibc",          label: "UIBC",                           val: r._uibc,         unit: "µg/dL", dec: 0, rkey: "uibc"           },
    { group: "Iron",      key: "serumIron",     label: "Serum Iron",                     val: r._serumIron,    unit: "µg/dL", dec: 0, rkey: "serumIron"      },
    { group: "Iron",      key: "transferrinSat",label: "Iron % Saturation",              val: r._transferrinSat, unit: "%",  dec: 1, rkey: "transferrinSat" },
    // Ferritin uses sex-specific rkey so ResultRow can dispatch correctly
    ...(r._ferritin !== null && r._ferritin !== undefined && !isNaN(r._ferritin) ? [{
      group: "Iron", key: "ferritin", label: "Ferritin",
      val: r._ferritin, unit: "ng/mL", dec: 0,
      rkey: r._sex === "female" ? "ferritin_f" : "ferritin_m",
      customRisk: getRiskFerritin(r._ferritin, r._sex),
    }] : []),
   
    { group: "Liver",     key: "tBili",         label: "Total Bilirubin",                val: r._tBili,        unit: "mg/dL", dec: 2, rkey: "tBili"          },
    { group: "Liver",     key: "directBili",    label: "Direct Bilirubin",               val: r._directBili,   unit: "mg/dL", dec: 2, rkey: "directBili"     },
   
    { group: "Liver",     key: "alt",           label: "ALT",                            val: r._alt,          unit: "U/L",   dec: 0, rkey: "alt"            },
    { group: "Liver",     key: "ast",           label: "AST",                            val: r._ast,          unit: "U/L",   dec: 0, rkey: "ast"            },
    { group: "Liver",     key: "alkPhos",       label: "Alkaline Phosphatase",           val: r._alkPhos,      unit: "U/L",   dec: 0, rkey: "alkPhos"        },
    { group: "Liver",     key: "ggt",           label: "GGT",                            val: r._ggt,          unit: "U/L",   dec: 0, rkey: "ggt"            },
   
    { group: "Kidney",    key: "glucose",       label: "Fasting Glucose",                val: r._glucose,      unit: "mg/dL", dec: 0, rkey: "glucose"        },
    { group: "Kidney",    key: "bun",           label: "BUN",                            val: r._bun,          unit: "mg/dL", dec: 0, rkey: "bun"            },
    { group:"Kidney",    key:"creatinine",    label:"Creatinine",                     val:r._creatinine,    unit:"mg/dL", dec:2, rkey:"creatinine"     },
    { group: "Kidney",    key: "sodium",        label: "Sodium",                         val: r._sodium,       unit: "mEq/L", dec: 0, rkey: "sodium"         },
    { group: "Kidney",    key: "potassium",     label: "Potassium",                      val: r._potassium,    unit: "mEq/L", dec: 1, rkey: "potassium"      },
    { group: "Kidney",    key: "chloride",      label: "Chloride",                       val: r._chloride,     unit: "mEq/L", dec: 0, rkey: "chloride"       },
    { group: "Kidney",    key: "bicarb",        label: "Bicarbonate",                    val: r._bicarb,       unit: "mEq/L", dec: 0, rkey: "bicarb"         },
    { group: "Kidney",    key: "calcium",       label: "Calcium",                        val: r._calcium,      unit: "mg/dL", dec: 1, rkey: "calcium"        },
    { group: "Kidney",    key: "albumin",       label: "Albumin",                        val: r._albumin,      unit: "g/dL",  dec: 1, rkey: "albumin"        },
    { group: "Kidney",    key: "globulin",      label: "Globulin",                       val: r._globulin,     unit: "g/dL",  dec: 1, rkey: "globulin"       },
    { group: "Kidney",    key: "totalProtein",  label: "Total Protein",                  val: r._totalProtein, unit: "g/dL",  dec: 1, rkey: "totalProtein"   },
   
    { group: "Metabolic", key: "insulin",       label: "Fasting Insulin",                val: r._insulin,      unit: "µIU/mL",dec: 1, rkey: "insulin"        },
    { group: "Metabolic", key: "cortisol",      label: "Cortisol, Total",                val: r._cortisol,     unit: "µg/dL", dec: 1, rkey: "cortisol"       },
    { group: "Metabolic", key: "homocysteine",  label: "Homocysteine",                   val: r._homocysteine, unit: "µmol/L",dec: 1, rkey: "homocysteine"   },
    { group: "Metabolic", key: "ldh",           label: "LDH",                            val: r._ldh,          unit: "U/L",   dec: 0, rkey: "ldh"            },
    { group: "Metabolic", key: "uricAcid",      label: "Uric Acid",                      val: r._uricAcid,     unit: "mg/dL", dec: 1, rkey: "uricAcid"       },
    { group: "Metabolic", key: "ck",            label: "CK (Creatine Kinase)",           val: r._ck,           unit: "U/L",   dec: 0, rkey: "ck"             },
    { group: "Metabolic", key: "ckMb",          label: "CK-MB",                          val: r._ckMb,         unit: "U/L",   dec: 1, rkey: "ckMb"           },
    { group: "Metabolic", key: "mma",           label: "MMA (Methylmalonic Acid)",       val: r._mma,          unit: "µmol/L",dec: 2, rkey: "mma"            },
    { group: "Lipid",     key: "myeloperox",    label: "Myeloperoxidase (MPO)",          val: r._myeloperox,   unit: "pmol/L",dec: 0, rkey: "myeloperox"     },
   
    { group: "Nutrients", key: "vitD",          label: "Vitamin D (25-OH)",              val: r._vitD,         unit: "ng/mL", dec: 1, rkey: "vitD"           },
    { group: "Nutrients", key: "rbcMag",        label: "RBC Magnesium",                  val: r._rbcMag,       unit: "mg/dL", dec: 2, rkey: "rbcMag"         },
    { group: "Nutrients", key: "b12",           label: "Vitamin B12",                    val: r._b12,          unit: "pg/mL", dec: 0, rkey: "b12"            },
    { group: "Nutrients", key: "folate",        label: "Folate (Nutrients)",             val: r._folate,       unit: "ng/mL", dec: 1, rkey: "folate"         },
    { group: "Nutrients", key: "folateMisc",    label: "Folate (Metabolic)",             val: r._folateMisc,   unit: "ng/mL", dec: 1, rkey: "folateMisc"     },
   
    { group: "CBC",       key: "wbc",           label: "WBC",                            val: r._wbc,          unit: "×10³/µL",dec:1, rkey: "wbc"            },
    { group: "CBC",       key: "rbc",           label: "RBC",                            val: r._rbc,          unit: "×10⁶/µL",dec:2, rkey: "rbc"            },
    { group: "CBC",       key: "hemoglobin",    label: "Hemoglobin",                     val: r._hemoglobin,   unit: "g/dL",  dec: 1, rkey: "hemoglobin"     },
    { group: "CBC",       key: "hematocrit",    label: "Hematocrit",                     val: r._hematocrit,   unit: "%",     dec: 1, rkey: "hematocrit"     },
    { group: "CBC",       key: "mcv",           label: "MCV",                            val: r._mcv,          unit: "fL",    dec: 1, rkey: "mcv"            },
    { group: "CBC",       key: "mch",           label: "MCH",                            val: r._mch,          unit: "pg",    dec: 1, rkey: "mch"            },
    { group: "CBC",       key: "mchc",          label: "MCHC",                           val: r._mchc,         unit: "g/dL",  dec: 1, rkey: "mchc"           },
    { group: "CBC",       key: "rdw",           label: "RDW",                            val: r._rdw,          unit: "%",     dec: 1, rkey: "rdw"            },
    { group: "CBC",       key: "platelets",     label: "Platelets",                      val: r._platelets,    unit: "×10³/µL",dec:0, rkey: "platelets"     },
    { group: "CBC",       key: "neutrophils",   label: "Neutrophils",                    val: r._neutrophils,  unit: "×10³/µL",dec:1, rkey: "neutrophils"   },
    { group: "CBC",       key: "lymphocytes",   label: "Lymphocytes",                    val: r._lymphocytes,  unit: "×10³/µL",dec:1, rkey: "lymphocytes"   },
    { group: "CBC",       key: "monocytes",     label: "Monocytes",                      val: r._monocytes,    unit: "×10³/µL",dec:2, rkey: "monocytes"     },
    { group: "CBC",       key: "eosinophils",   label: "Eosinophils",                    val: r._eosinophils,  unit: "×10³/µL",dec:2, rkey: "eosinophils"   },
    { group: "CBC",       key: "basophils",     label: "Basophils",                      val: r._basophils,    unit: "×10³/µL",dec:2, rkey: "basophils"     },
   
    { group: "Hormone",   key: "testosterone",  label: "Testosterone",                   val: r._testosterone, unit: "ng/dL", dec: 0, rkey: "testosterone"   },
    { group: "Hormone",   key: "estradiol",     label: "Estradiol (E2)",                 val: r._estradiol,    unit: "pg/mL", dec: 0, rkey: "estradiol"      },
    { group: "Hormone",   key: "psa",           label: "PSA",                            val: r._psa,          unit: "ng/mL", dec: 2, rkey: "psa"            },
    { group: "Hormone",   key: "dheas",         label: "DHEA-S",                         val: r._dheas,        unit: "µg/dL", dec: 0, rkey: "dheas"          },
    { group: "Hormone",   key: "fsh",           label: "FSH",                            val: r._fsh,          unit: "mIU/mL",dec: 1, rkey: "fsh"            },
    { group: "Hormone",   key: "lh",            label: "LH",                             val: r._lh,           unit: "mIU/mL",dec: 1, rkey: "lh"             },
    { group: "Hormone",   key: "prolactin",     label: "Prolactin",                      val: r._prolactin,    unit: "ng/mL", dec: 1, rkey: "prolactin"      },
    { group: "Hormone",   key: "shbg",          label: "SHBG",                           val: r._shbg,         unit: "nmol/L",dec: 1, rkey: "shbg"           },
    { group: "Hormone",   key: "igf1",          label: "IGF-1",                          val: r._igf1,         unit: "ng/mL", dec: 0, rkey: "igf1"           },
   
    { group: "Thyroid",   key: "tpoAb",         label: "TPO Antibodies",                 val: r._tpoAb,        unit: "IU/mL", dec: 0, rkey: "tpoAb"          },
    { group: "Thyroid",   key: "tgAb",          label: "Thyroglobulin Antibodies",       val: r._tgAb,         unit: "IU/mL", dec: 0, rkey: "tgAb"           },
  ];
  return all.filter(row => row.val !== null && row.val !== undefined && !isNaN(row.val));
}

/* ═══════════════════════════════════════════════════════════
   RISK BADGE — original style
═══════════════════════════════════════════════════════════ */
function RiskBadge({ level }) {
  if (!level) return null;
  const configs = {
    normal:     { bg: COLORS.greenBg,  color: COLORS.green,  text: "Optimal"    },
    low:        { bg: COLORS.yellowBg, color: COLORS.yellow, text: "Low"        },
    borderline: { bg: COLORS.yellowBg, color: COLORS.yellow, text: "Borderline" },
    high:       { bg: COLORS.redBg,    color: COLORS.red,    text: "High Risk"  },
  };
  const cfg = configs[level] || configs.normal;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      padding: "2px 10px", borderRadius: 99, fontSize: 11,
      fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
      border: `1px solid ${cfg.color}33`,
    }}>{cfg.text}</span>
  );
}

/* ═══════════════════════════════════════════════════════════
   RESULT ROW — original style + expandable interpretation
═══════════════════════════════════════════════════════════ */
function ResultRow({ row, expanded, onToggle }) {
  const riskLevel = row.customRisk !== undefined ? row.customRisk : getRisk(row.rkey, row.val);
  const borderColor = riskLevel === "high" ? COLORS.red
    : riskLevel === "borderline" || riskLevel === "low" ? COLORS.yellow
    : COLORS.green;
  const interpretation = INTERP[row.rkey]?.(row.val);

  return (
    <div
      onClick={onToggle}
      style={{
        background: COLORS.card, borderRadius: 10, padding: "14px 18px",
        borderLeft: `3px solid ${borderColor}`, marginBottom: 10,
        display: "flex", flexDirection: "column", gap: 6, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ color: COLORS.label, fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
          {row.label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: COLORS.text, fontSize: 18, fontWeight: 700 }}>
            {row.val.toFixed(row.dec)}
            {row.unit && <span style={{ color: COLORS.muted, fontSize: 12, marginLeft: 4 }}>{row.unit}</span>}
          </span>
          <RiskBadge level={riskLevel} />
          <span style={{ color: COLORS.muted, fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && interpretation && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 8, marginTop: 2 }}>
          {interpretation.includes("\n\n") ? (() => {
            const [header, ...rest] = interpretation.split("\n\n");
            return (
              <>
                <p style={{ color: COLORS.label, fontSize: 12, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.4, fontFamily: "'DM Mono', monospace" }}>
                  {header}
                </p>
                <p style={{ color: COLORS.muted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  {rest.join("\n\n")}
                </p>
              </>
            );
          })() : (
            <p style={{ color: COLORS.muted, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
              {interpretation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION — original style
═══════════════════════════════════════════════════════════ */
function Section({ title, icon, children }) {
  const hasContent = Array.isArray(children) ? children.some(c => c) : !!children;
  if (!hasContent) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h2 style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: "0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
          {title}
        </h2>
        <div style={{ flex: 1, height: 1, background: COLORS.border }} />
      </div>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INPUT FIELD — original style + validation warning
═══════════════════════════════════════════════════════════ */
function InputField({ label, value, onChange, placeholder = "—", unit, optional, fieldKey }) {
  const [warn, setWarn] = useState(null);
  const handle = v => {
    onChange(v);
    if (v !== "" && fieldKey && VALID_RANGES[fieldKey]) {
      const num = parseFloat(v);
      const { min, max } = VALID_RANGES[fieldKey];
      setWarn(!isNaN(num) && (num < min || num > max) ? `Typical: ${min}–${max}` : null);
    } else setWarn(null);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        color: COLORS.label, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
        minHeight: "2.6em", display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}>
        <span>
          {label} {unit && <span style={{ color: COLORS.muted, fontWeight: 400 }}>({unit})</span>}
          {optional && <span style={{ color: COLORS.muted, marginLeft: 4 }}>(optional)</span>}
        </span>
      </label>
      <input
        type="number"
        value={value}
        onChange={e => handle(e.target.value)}
        placeholder={placeholder}
        style={{
          background: COLORS.surface, border: `1px solid ${warn ? COLORS.yellow : COLORS.border}`,
          borderRadius: 8, padding: "9px 12px", color: COLORS.text,
          fontSize: 15, fontFamily: "'DM Mono', monospace", outline: "none",
          width: "100%", boxSizing: "border-box", transition: "border-color 0.2s",
        }}
        onFocus={e => e.target.style.borderColor = COLORS.accent}
        onBlur={e => e.target.style.borderColor = warn ? COLORS.yellow : COLORS.border}
      />
      {warn && <span style={{ color: COLORS.yellow, fontSize: 11, marginTop: 1 }}>⚠ {warn}</span>}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 8, padding: "9px 12px", color: value ? COLORS.text : COLORS.muted,
          fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box",
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: COLORS.label, fontSize: 14 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: COLORS.accent }} />
      {label}
    </label>
  );
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD — radar + bar chart, original card style
═══════════════════════════════════════════════════════════ */
function Dashboard({ rows }) {
  if (rows.length < 2) return null;

  const counts = { normal: 0, borderline: 0, high: 0, low: 0 };
  rows.forEach(r => { const lvl = getRisk(r.rkey, r.val); if (lvl) counts[lvl]++; });
  const scoreColor = counts.high > 2 ? COLORS.red : counts.borderline > 2 ? COLORS.yellow : COLORS.green;
  const scoreLabel = counts.high > 2 ? "Elevated Risk" : counts.borderline > 2 ? "Mixed — Review" : "Favorable Profile";

 
  // Dynamic radar: priority-ordered candidates, pick best available up to 8
  // Organised into distinct clinical domains so the radar represents breadth, not redundancy
  const RADAR_PRIORITIES = [
    // Atherogenic particle risk — prefer particle count over calculated LDL
    { keys: ["ldlP", "apoB", "friedewald", "martinHopkins"], label: "LDL" },
    // Lipid ratio / atherogenicity
    { keys: ["apoBapoA", "tcHdl", "ldlHdl"], label: "Lipid Ratio" },
    // Insulin resistance / metabolic
    { keys: ["homaIR", "lpir", "tgHdl"], label: "Insulin Res." },
    // Glycaemic status
    { keys: ["a1c", "eag", "glucose"], label: "Glycemia" },
    // Kidney function
    { keys: ["egfr", "acr", "bunCr"], label: "Kidney" },
    // Inflammation / oxidative stress
    { keys: ["crp", "basicCrp", "homocysteine"], label: "Inflammation" },
    // Thyroid — use TSH as primary, fall back to ratios
    { keys: ["tsh", "fT3_rT3", "freeT3"], label: "Thyroid" },
    // Liver / fibrosis
    { keys: ["fib4", "ggt", "alt"], label: "Liver" },
  ];

  // For each domain, pick the first key that has a computed row in results
  const rowsByKey = {};
  rows.forEach(r => { rowsByKey[r.key] = r; });

  const radarRows = RADAR_PRIORITIES
    .map(domain => {
      for (const key of domain.keys) {
        if (rowsByKey[key]) return { ...rowsByKey[key], radarLabel: domain.label };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 8);

  const N = radarRows.length;
  const riskNum = { normal: 0, low: 0.25, borderline: 0.6, high: 1 };
  const riskBadgeColor = lvl => lvl === "high" ? COLORS.red : lvl === "borderline" || lvl === "low" ? COLORS.yellow : COLORS.green;
  // Larger radar with more label clearance
  const cx = 150, cy = 140, R = 95;
  const pts = radarRows.map((r, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    const lvl = getRisk(r.rkey, r.val);
    const frac = riskNum[lvl] ?? 0;
    const pr = 14 + frac * R;
    return {
      x: cx + pr * Math.cos(angle), y: cy + pr * Math.sin(angle),
      lx: cx + (R + 32) * Math.cos(angle), ly: cy + (R + 32) * Math.sin(angle),
      color: riskBadgeColor(lvl), label: r.radarLabel,
    };
  });
  const poly = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("") + "Z";
  const grid = fr => radarRows.map((_, i) => {
    const a = (i / N) * 2 * Math.PI - Math.PI / 2;
    return `${i ? "L" : "M"}${cx + fr * R * Math.cos(a)},${cy + fr * R * Math.sin(a)}`;
  }).join("") + "Z";

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Score strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: "Optimal",    v: counts.normal,     c: COLORS.green  },
          { label: "Borderline", v: counts.borderline, c: COLORS.yellow },
          { label: "High Risk",  v: counts.high,       c: COLORS.red    },
          { label: "Low",        v: counts.low,        c: COLORS.yellow },
        ].filter(x => x.v > 0).map(({ label, v, c }) => (
          <div key={label} style={{
            flex: 1, minWidth: 72, background: COLORS.card, borderRadius: 10,
            padding: "12px 14px", borderBottom: `3px solid ${c}`, textAlign: "center",
          }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: c, fontFamily: "'DM Mono', monospace" }}>{v}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
          </div>
        ))}
        <div style={{
          flex: 1.8, minWidth: 110, background: COLORS.card, borderRadius: 10,
          padding: "12px 14px", borderBottom: `3px solid ${scoreColor}`,
          display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor, fontFamily: "'Space Grotesk', sans-serif" }}>{scoreLabel}</div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 3 }}>{rows.length} markers computed</div>
        </div>
      </div>

      {/* Radar — full width, centered */}
      {N >= 3 && (
        <div style={{ background: COLORS.card, borderRadius: 10, padding: "16px", marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <p style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, margin: "0 0 2px" }}>Risk Domain Radar</p>
          <p style={{ color: COLORS.muted, fontSize: 10, margin: "0 0 10px", fontStyle: "italic", textAlign: "center" }}>
            {N < 8 ? `${N} of 8 domains active — enter more values to expand` : "All 8 domains: best available marker per domain"}
          </p>
          <svg width="300" height="280" viewBox="0 0 300 280" style={{ overflow: "visible", maxWidth: "100%" }}>
            {[0.33, 0.66, 1].map((fr, i) => (
              <path key={i} d={grid(fr)} fill="none" stroke={COLORS.border} strokeWidth="1"
                strokeDasharray={i < 2 ? "4,3" : "none"} />
            ))}
            {radarRows.map((_, i) => {
              const a = (i / N) * 2 * Math.PI - Math.PI / 2;
              return <line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)} stroke={COLORS.border} strokeWidth="1" />;
            })}
            <path d={poly} fill={`${COLORS.accent}20`} stroke={COLORS.accent} strokeWidth="1.5" />
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="5" fill={p.color} />
                <text x={p.lx} y={p.ly}
                  textAnchor={p.lx < cx - 10 ? "end" : p.lx > cx + 10 ? "start" : "middle"}
                  dominantBaseline="middle"
                  fill={COLORS.label} fontSize="10" fontFamily="'DM Mono', monospace" fontWeight="600"
                >{p.label}</text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Bar chart — full width below radar */}
      <div style={{ background: COLORS.card, borderRadius: 10, padding: "16px" }}>
        <p style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, margin: "0 0 12px" }}>All Markers — Risk Level</p>
        <div style={{ overflowY: "auto", maxHeight: 220 }}>
          {rows.map(row => {
            const lvl = getRisk(row.rkey, row.val);
            const barColor = lvl === "high" ? COLORS.red : lvl === "borderline" || lvl === "low" ? COLORS.yellow : COLORS.green;
            const frac = lvl === "high" ? 1 : lvl === "borderline" ? 0.62 : lvl === "low" ? 0.28 : 0.14;
            return (
              <div key={row.key} style={{ marginBottom: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, gap: 8 }}>
                  <span style={{ color: COLORS.label, fontSize: 11, fontFamily: "'DM Mono', monospace",
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.label}
                  </span>
                  <span style={{ color: barColor, fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                    {row.val.toFixed(row.dec)}{row.unit ? ` ${row.unit}` : ""}
                  </span>
                </div>
                <div style={{ height: 4, background: COLORS.border, borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ width: `${frac * 100}%`, height: "100%", background: barColor, borderRadius: 99 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PDF EXPORT
═══════════════════════════════════════════════════════════ */
function exportPDF(rows, fields) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const rColor = lvl => lvl === "high" ? "#ef4444" : lvl === "borderline" || lvl === "low" ? "#f59e0b" : "#22c55e";
  const rLabel = lvl => lvl === "high" ? "HIGH RISK" : lvl === "borderline" ? "BORDERLINE" : lvl === "low" ? "LOW" : "OPTIMAL";
  const counts = { normal: 0, borderline: 0, high: 0, low: 0 };
  rows.forEach(r => { const lvl = getRisk(r.rkey, r.val); if (lvl) counts[lvl]++; });
  const patientInfo = [
    fields.age ? `Age: ${fields.age}` : null,
    fields.sex ? `Sex: ${fields.sex.charAt(0).toUpperCase() + fields.sex.slice(1)}` : null,
    fields.race && fields.race !== "other" ? `Race: ${fields.race.charAt(0).toUpperCase() + fields.race.slice(1)}` : null,
  ].filter(Boolean).join("  ·  ");

  const tableRows = rows.map(r => {
    const lvl = getRisk(r.rkey, r.val), col = rColor(lvl), lbl = rLabel(lvl);
    const interp = (INTERP[r.rkey]?.(r.val) || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<tr>
      <td style="color:#64748b;font-size:9px;padding:5px 8px;border-bottom:1px solid #2e3350;white-space:nowrap">${r.group}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #2e3350;font-weight:600;font-size:11px;font-family:'DM Mono',monospace;color:#e2e8f0">${r.label}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #2e3350;font-family:'DM Mono',monospace;font-size:12px;font-weight:700;white-space:nowrap;color:#e2e8f0">${r.val.toFixed(r.dec)} ${r.unit}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #2e3350">
        <span style="background:${col}22;color:${col};border:1px solid ${col}44;padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700;letter-spacing:0.05em">${lbl}</span>
      </td>
      <td style="padding:5px 8px;border-bottom:1px solid #2e3350;font-size:10px;color:#94a3b8;max-width:220px">${interp}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CardiometabolicIQ Report</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',sans-serif;margin:0;padding:0;background:#0f1117;color:#e2e8f0}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}tr{page-break-inside:avoid}}
  .header{background:linear-gradient(135deg,#0f1117 0%,#1a2744 100%);border-bottom:1px solid #2e3350;padding:28px 36px 24px}
  .header h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#e2e8f0}
  .header p{margin:5px 0 0;font-size:12px;color:#64748b}
  .body{padding:26px 36px;background:#0f1117}
  .summary{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap}
  .sc{flex:1;min-width:80px;border-radius:10px;padding:12px 14px;text-align:center;border-bottom:3px solid;background:#20243a}
  .sc .n{font-size:24px;font-weight:700;font-family:'DM Mono',monospace}
  .sc .l{font-size:10px;color:#64748b;font-weight:600;margin-top:3px}
  table{width:100%;border-collapse:collapse}
  th{background:#1a1d27;padding:8px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;font-weight:600;border-bottom:1px solid #2e3350}
  .footer{padding:16px 36px;border-top:1px solid #2e3350;font-size:10px;color:#64748b;text-align:center;background:#0f1117}
  .print-btn{position:fixed;top:16px;right:20px;background:linear-gradient(135deg,#4f9cf9,#7c3aed);color:#fff;border:none;padding:10px 22px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨 Print / Save PDF</button>
<div class="header">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
    <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#4f9cf9,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:20px">🫀</div>
    <div><h1>CardiometabolicIQ</h1><p>Advanced Lab Value Report · ${date}</p></div>
  </div>
  ${patientInfo ? `<p style="margin-top:10px;color:#94a3b8;font-size:12px">${patientInfo}</p>` : ""}
</div>
<div class="body">
  <div class="summary">
    <div class="sc" style="border-color:#22c55e"><div class="n" style="color:#22c55e">${counts.normal}</div><div class="l">Optimal</div></div>
    <div class="sc" style="border-color:#f59e0b"><div class="n" style="color:#f59e0b">${counts.borderline}</div><div class="l">Borderline</div></div>
    <div class="sc" style="border-color:#ef4444"><div class="n" style="color:#ef4444">${counts.high}</div><div class="l">High Risk</div></div>
    <div class="sc" style="border-color:#4f9cf9"><div class="n" style="color:#4f9cf9">${rows.length}</div><div class="l">Total Markers</div></div>
  </div>
  <table>
    <thead><tr><th>Category</th><th>Marker</th><th>Value</th><th>Status</th><th>Clinical Notes</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>
<div class="footer">
  For clinical reference only · Not a substitute for professional medical judgment<br/>
  eGFR: 2021 race-free CKD-EPI · ASCVD: Pooled Cohort Equations (Goff et al. 2014, corrected)
</div></body></html>`;

  const win = window.open("", "_blank", "width=920,height=720");
  if (!win) { alert("Please allow pop-ups to export PDF."); return; }
  win.document.write(html);
  win.document.close();
}

/* ═══════════════════════════════════════════════════════════
   COPY SUMMARY
═══════════════════════════════════════════════════════════ */
function buildCopyText(rows) {
  const date = new Date().toLocaleDateString();
  const lines = [`CardiometabolicIQ Summary — ${date}`, "=".repeat(46), ""];
  rows.forEach(r => {
    const lvl = getRisk(r.rkey, r.val) || "";
    lines.push(`${r.label.padEnd(40)} ${r.val.toFixed(r.dec)} ${r.unit.padEnd(8)}  [${lvl.toUpperCase()}]`);
  });
  lines.push("", "─".repeat(46), "For clinical reference only. Not medical advice.");
  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════
   FILTER PILL — original accent color
═══════════════════════════════════════════════════════════ */
function Pill({ active, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
      background: active ? COLORS.accentSoft : "transparent",
      color: active ? COLORS.accent : COLORS.muted, cursor: "pointer",
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [copied, setCopied] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [filterGroup, setFilterGroup] = useState("All");
  const [filterRisk, setFilterRisk] = useState("All");
  const resultsRef = useRef(null);
  const fileInputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // {filled, skipped}
  const [scanError, setScanError] = useState(null);

  const [tc, setTc] = useState(""); const [hdl, setHdl] = useState(""); const [tg, setTg] = useState("");
  const [ldl, setLdl] = useState(""); const [vldl, setVldl] = useState("");
  const [lipoA, setLipoA] = useState(""); const [apoA, setApoA] = useState(""); const [apoB, setApoB] = useState("");
  const [oxLdl, setOxLdl] = useState("");
  const [myeloperox, setMyeloperox] = useState("");
  const [lathosterol, setLathosterol] = useState(""); const [desmosterol, setDesmosterol] = useState("");
  const [betaSitosterol, setBetaSitosterol] = useState(""); const [campesterol, setCampesterol] = useState("");
  const [glucose, setGlucose] = useState(""); const [bun, setBun] = useState(""); const [creatinine, setCreatinine] = useState("");
  const [sodium, setSodium] = useState(""); const [potassium, setPotassium] = useState(""); const [chloride, setChloride] = useState("");
  const [bicarb, setBicarb] = useState(""); const [calcium, setCalcium] = useState(""); const [albumin, setAlbumin] = useState("");
  const [totalProtein, setTotalProtein] = useState("");
  const [globulin, setGlobulin] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [a1c, setA1c] = useState(""); const [insulin, setInsulin] = useState(""); const [crp, setCrp] = useState("");
  const [alt, setAlt] = useState(""); const [ast, setAst] = useState(""); const [platelets, setPlatelets] = useState("");
  const [urineAlb, setUrineAlb] = useState(""); const [urineCr, setUrineCr] = useState("");
  const [age, setAge] = useState(""); const [sex, setSex] = useState(""); const [race, setRace] = useState("");
  const [heightFt, setHeightFt] = useState(""); const [heightIn, setHeightIn] = useState("");
  const [weightLb, setWeightLb] = useState("");
 
  const totalInches = (nv(heightFt) !== null && nv(heightIn) !== null)
    ? nv(heightFt) * 12 + nv(heightIn)
    : nv(heightFt) !== null ? nv(heightFt) * 12 : null;
  const bmi = (nv(weightLb) !== null && totalInches !== null && totalInches > 0)
    ? (nv(weightLb) / (totalInches * totalInches)) * 703
    : null;
  const bmiCategory = bmi === null ? null
    : bmi < 18.5 ? { label: "Underweight", color: COLORS.yellow }
    : bmi < 25   ? { label: "Normal",       color: COLORS.green  }
    : bmi < 30   ? { label: "Overweight",   color: COLORS.yellow }
    : bmi < 35   ? { label: "Obese I",      color: COLORS.red    }
    : bmi < 40   ? { label: "Obese II",     color: COLORS.red    }
    :              { label: "Obese III",    color: COLORS.red    };
  const [sbp, setSbp] = useState(""); const [onBpMeds, setOnBpMeds] = useState(false);
  const [smoker, setSmoker] = useState(false); const [diabetic, setDiabetic] = useState(false);
  const [onStatin, setOnStatin] = useState(false);
  const [testosterone, setTestosterone] = useState(""); const [estradiol, setEstradiol] = useState("");
  const [progesterone, setProgesterone] = useState(""); const [psa, setPsa] = useState("");
  const [dheas, setDheas] = useState(""); const [fsh, setFsh] = useState("");
  const [lh, setLh] = useState(""); const [prolactin, setProlactin] = useState("");
  const [shbg, setShbg] = useState(""); const [igf1, setIgf1] = useState("");
  const [alkPhos, setAlkPhos] = useState(""); const [tBili, setTBili] = useState("");
  const [directBili, setDirectBili] = useState("");
  const [ggt, setGgt] = useState("");
  const [cortisol, setCortisol] = useState(""); const [homocysteine, setHomocysteine] = useState("");
  const [mma, setMma] = useState(""); const [folateMisc, setFolateMisc] = useState("");
  const [ldh, setLdh] = useState(""); const [uricAcid, setUricAcid] = useState("");
  const [ck, setCk] = useState(""); const [ckMb, setCkMb] = useState("");
  const [tsh, setTsh] = useState(""); const [freeT3, setFreeT3] = useState("");
  const [freeT4, setFreeT4] = useState(""); const [reverseT3, setReverseT3] = useState("");
  const [tpoAb, setTpoAb] = useState(""); const [tgAb, setTgAb] = useState("");
  const [vitD, setVitD] = useState(""); const [rbcMag, setRbcMag] = useState("");
  const [b12, setB12] = useState(""); const [folate, setFolate] = useState("");
  const [wbc, setWbc] = useState(""); const [rbc, setRbc] = useState("");
  const [hemoglobin, setHemoglobin] = useState(""); const [hematocrit, setHematocrit] = useState("");
  const [mcv, setMcv] = useState(""); const [mch, setMch] = useState("");
  const [mchc, setMchc] = useState(""); const [rdw, setRdw] = useState("");
  const [neutrophils, setNeutrophils] = useState(""); const [lymphocytes, setLymphocytes] = useState("");
  const [monocytes, setMonocytes] = useState(""); const [eosinophils, setEosinophils] = useState("");
  const [basophils, setBasophils] = useState("");
  const [serumIron, setSerumIron] = useState(""); const [tibc, setTibc] = useState("");
  const [uibc, setUibc] = useState("");
  const [transferrinSat, setTransferrinSat] = useState(""); const [ferritin, setFerritin] = useState("");
  const [basicCrp, setBasicCrp] = useState("");
  const [ldlP, setLdlP] = useState(""); const [sdLdl, setSdLdl] = useState("");
  const [hdlP, setHdlP] = useState(""); const [smallLdlP, setSmallLdlP] = useState("");
  const [ldlSize, setLdlSize] = useState(""); const [largeVldlP, setLargeVldlP] = useState("");
  const [largeHdlP, setLargeHdlP] = useState(""); const [vldlP, setVldlP] = useState("");
  const [ldlSizeNmr, setLdlSizeNmr] = useState(""); const [hdlSizeNmr, setHdlSizeNmr] = useState("");
  const [vldlSizeNmr, setVldlSizeNmr] = useState("");

  const fields = {
    tc, hdl, tg, ldl, vldl, lipoA, apoA, apoB, oxLdl, myeloperox,
    lathosterol, desmosterol, betaSitosterol, campesterol,
    glucose, bun, creatinine,
    sodium, potassium, chloride, bicarb, calcium, totalProtein, albumin, globulin, a1c, insulin, crp,
    alt, ast, platelets, urineAlb, urineCr, age, sex, race, sbp, onBpMeds, smoker, diabetic, onStatin, zipCode,
    bmi,
    testosterone, estradiol, progesterone, psa, dheas, fsh, lh, prolactin, shbg, igf1,
    alkPhos, tBili, directBili, ggt,
    cortisol, homocysteine, mma, folateMisc, ldh, uricAcid, ck, ckMb,
    tsh, freeT3, freeT4, reverseT3, tpoAb, tgAb,
    vitD, rbcMag, b12, folate,
    wbc, rbc, hemoglobin, hematocrit, mcv, mch, mchc, rdw,
    neutrophils, lymphocytes, monocytes, eosinophils, basophils,
    serumIron, tibc, uibc, transferrinSat, ferritin,
    basicCrp,
    ldlP, sdLdl, hdlP, smallLdlP, ldlSize, largeVldlP, largeHdlP, vldlP,
    ldlSizeNmr, hdlSizeNmr, vldlSizeNmr,
  };

  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null); setScanResult(null); setScanning(true);
    try {
      const ex = await scanLabReport(file);
      const setterMap = {
        tc: setTc, hdl: setHdl, ldl: setLdl, tg: setTg, vldl: setVldl,
        lipoA: setLipoA, apoA: setApoA, apoB: setApoB,
        ldlP: setLdlP, smallLdlP: setSmallLdlP, sdLdl: setSdLdl,
        hdlP: setHdlP, largeHdlP: setLargeHdlP, largeVldlP: setLargeVldlP,
        vldlP: setVldlP, ldlSizeNmr: setLdlSizeNmr, hdlSizeNmr: setHdlSizeNmr,
        vldlSizeNmr: setVldlSizeNmr,
        glucose: setGlucose, bun: setBun, creatinine: setCreatinine,
        sodium: setSodium, potassium: setPotassium, chloride: setChloride,
        bicarb: setBicarb, calcium: setCalcium, albumin: setAlbumin,
        alt: setAlt, ast: setAst, alkPhos: setAlkPhos, ggt: setGgt,
        tBili: setTBili, directBili: setDirectBili,
        a1c: setA1c, insulin: setInsulin, crp: setCrp, basicCrp: setBasicCrp,
        cortisol: setCortisol, homocysteine: setHomocysteine,
        ldh: setLdh, uricAcid: setUricAcid, ck: setCk, ckMb: setCkMb,
        mma: setMma, myeloperox: setMyeloperox,
        tsh: setTsh, freeT3: setFreeT3, freeT4: setFreeT4, reverseT3: setReverseT3,
        tpoAb: setTpoAb, tgAb: setTgAb,
        vitD: setVitD, rbcMag: setRbcMag, b12: setB12, folate: setFolate,
        wbc: setWbc, rbc: setRbc, hemoglobin: setHemoglobin, hematocrit: setHematocrit,
        mcv: setMcv, mch: setMch, mchc: setMchc, rdw: setRdw, platelets: setPlatelets,
        neutrophils: setNeutrophils, lymphocytes: setLymphocytes, monocytes: setMonocytes,
        eosinophils: setEosinophils, basophils: setBasophils,
        serumIron: setSerumIron, tibc: setTibc, uibc: setUibc,
        transferrinSat: setTransferrinSat, ferritin: setFerritin,
        testosterone: setTestosterone, estradiol: setEstradiol, progesterone: setProgesterone,
        psa: setPsa, dheas: setDheas, fsh: setFsh, lh: setLh,
        prolactin: setProlactin, shbg: setShbg, igf1: setIgf1,
        age: setAge,
      };
      let filled = 0, skipped = 0;
      Object.entries(ex).forEach(([key, val]) => {
        if (val === null || val === undefined) { skipped++; return; }
        if (key === 'sex' && (val === 'male' || val === 'female')) { setSex(val); filled++; return; }
        if (setterMap[key]) { setterMap[key](String(val)); filled++; }
        else skipped++;
      });
      setScanResult({ filled, skipped, name: ex.patientName, date: ex.collectionDate });
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const results = calcAll(fields);
  const rows = buildRows(results);
  const groups = ["All", ...new Set(rows.map(r => r.group))];
  const visibleRows = rows.filter(r =>
    (filterGroup === "All" || r.group === filterGroup) &&
    (filterRisk === "All" || getRisk(r.rkey, r.val) === filterRisk.toLowerCase())
  );
  const hasResults = rows.length > 0;

  const reset = () => {
    [setTc, setHdl, setTg, setLdl, setVldl, setLipoA, setApoA, setApoB,
     setOxLdl, setLathosterol, setDesmosterol, setBetaSitosterol, setCampesterol,
     setMyeloperox,
     setGlucose, setBun, setCreatinine, setSodium, setPotassium, setChloride,
     setBicarb, setCalcium, setAlbumin, setTotalProtein, setGlobulin, setA1c, setInsulin, setCrp,
     setAlt, setAst, setPlatelets, setUrineAlb, setUrineCr, setAge, setSbp,
     setHeightFt, setHeightIn, setWeightLb,
     setTestosterone, setEstradiol, setProgesterone, setPsa, setDheas,
     setFsh, setLh, setProlactin, setShbg, setIgf1,
     setAlkPhos, setTBili, setDirectBili, setGgt,
     setTsh, setFreeT3, setFreeT4, setReverseT3, setTpoAb, setTgAb,
     setVitD, setRbcMag, setB12, setFolate,
     setWbc, setRbc, setHemoglobin, setHematocrit, setMcv, setMch, setMchc, setRdw,
     setNeutrophils, setLymphocytes, setMonocytes, setEosinophils, setBasophils,
     setSerumIron, setTibc, setUibc, setTransferrinSat, setFerritin,
     setBasicCrp, setCortisol, setHomocysteine, setMma, setFolateMisc, setLdh, setUricAcid, setCk, setCkMb,
     setLdlP, setSdLdl, setHdlP, setSmallLdlP, setLdlSize,
     setLargeVldlP, setLargeHdlP, setVldlP,
     setLdlSizeNmr, setHdlSizeNmr, setVldlSizeNmr,
    ].forEach(fn => fn(""));
    setSex(""); setRace(""); setOnBpMeds(false); setSmoker(false); setDiabetic(false); setOnStatin(false); setZipCode("");
    setFilterGroup("All"); setFilterRisk("All"); setExpandedKey(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildCopyText(rows));
    setCopied(true); setTimeout(() => setCopied(false), 2200);

  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Segoe UI', sans-serif", padding: "0 0 60px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header — original gradient */}
      <div style={{
        background: "linear-gradient(135deg, #0f1117 0%, #1a2744 100%)",
        borderBottom: `1px solid ${COLORS.border}`, padding: "32px 24px 28px", marginBottom: 32,
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: "linear-gradient(135deg, #4f9cf9, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>🫀</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                CardiometabolicIQ
              </h1>
              <p style={{ margin: 0, color: COLORS.muted, fontSize: 13 }}>Advanced Lab Value Interpreter</p>
            </div>
          </div>
          {/* Scan Lab Report Button */}
          <div style={{ marginTop: 16 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,image/heic,image/heif,.pdf,application/pdf"
              style={{ display: "none" }}
              onChange={handleScan}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              style={{
                background: scanning ? COLORS.surface : "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "10px 20px", fontSize: 13, fontWeight: 700,
                cursor: scanning ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 8, opacity: scanning ? 0.7 : 1,
              }}
            >
              {scanning ? (
                <><span style={{ fontSize: 16 }}>⏳</span> Scanning lab report...</>
              ) : (
                <><span style={{ fontSize: 16 }}>📷</span> Scan Lab Report</>
              )}
            </button>
            {scanResult && (
              <div style={{
                marginTop: 10, background: COLORS.greenBg,
                border: `1px solid ${COLORS.green}44`, borderRadius: 8,
                padding: "10px 14px", fontSize: 12, color: COLORS.green,
              }}>
                ✓ Scan complete — <strong>{scanResult.filled} fields</strong> filled in automatically
                {scanResult.name && <> · <strong>{scanResult.name}</strong></>}
                {scanResult.date && <> · {scanResult.date}</>}
                <span style={{ color: COLORS.muted }}> · Scroll down to review and edit values before calculating</span>
              </div>
            )}
            {scanError && (
              <div style={{
                marginTop: 10, background: COLORS.redBg,
                border: `1px solid ${COLORS.red}44`, borderRadius: 8,
                padding: "10px 14px", fontSize: 12, color: COLORS.red,
              }}>
                ⚠ Scan failed: {scanError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>

        {/* Patient Info */}
        <Section title="Patient Info" icon="👤">
          {/* Row 1: Age, Sex, Race */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end", marginBottom: 12 }}>
            <InputField label="Age" value={age} onChange={setAge} placeholder="e.g. 55" unit="yrs" fieldKey="age" />
            <SelectField label="Sex" value={sex} onChange={setSex} options={[
              { value: "", label: "Select..." },
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]} />
            <SelectField label="Race/Ethnicity" value={race} onChange={setRace} options={[
              { value: "", label: "Select..." },
              { value: "white", label: "White" },
              { value: "black", label: "Black/African American" },
              { value: "other", label: "Other" },
            ]} />
          </div>
          {/* Row 2: Height (ft + in), Weight, BMI box */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Height (ft)" value={heightFt} onChange={setHeightFt} placeholder="e.g. 5" fieldKey="heightIn" />
            <InputField label="Height (in)" value={heightIn} onChange={setHeightIn} placeholder="e.g. 10" fieldKey="heightInches" />
            <InputField label="Weight" value={weightLb} onChange={setWeightLb} unit="lbs" placeholder="e.g. 170" fieldKey="weightLb" />
            {/* Live BMI display */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{
                color: COLORS.label, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                minHeight: "2.6em", display: "flex", flexDirection: "column", justifyContent: "flex-end",
              }}>
                <span>BMI <span style={{ color: COLORS.muted, fontWeight: 400 }}>(auto)</span></span>
              </label>
              <div style={{
                background: bmi !== null ? (bmiCategory.color === COLORS.green ? COLORS.greenBg : bmiCategory.color === COLORS.red ? COLORS.redBg : COLORS.yellowBg) : COLORS.surface,
                border: `1px solid ${bmi !== null ? bmiCategory.color + "55" : COLORS.border}`,
                borderRadius: 8, padding: "9px 12px", minHeight: "40px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                {bmi !== null ? (
                  <>
                    <span style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                      {bmi.toFixed(1)}
                    </span>
                    <span style={{
                      color: bmiCategory.color, fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.05em", textTransform: "uppercase",
                      background: bmiCategory.color + "22", border: `1px solid ${bmiCategory.color}44`,
                      padding: "2px 7px", borderRadius: 99,
                    }}>
                      {bmiCategory.label}
                    </span>
                  </>
                ) : (
                  <span style={{ color: COLORS.muted, fontSize: 13 }}>—</span>
                )}
              </div>
            </div>
          </div>
          {bmi !== null && (
            <p style={{ color: COLORS.muted, fontSize: 11, margin: "8px 0 0" }}>
              BMI {bmi.toFixed(1)} kg/m² · Used in PREVENT 10-year ASCVD calculation
            </p>
          )}
        </Section>

        {/* Cardiac Markers */}
        <Section title="Cardiac Markers" icon="🧪">
          {/* Lipid Panel sub-heading */}
          <p style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, margin: "0 0 10px", letterSpacing: "0.04em", fontFamily: "'Space Grotesk', sans-serif" }}>
            Lipid Panel
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Total Cholesterol" value={tc} onChange={setTc} unit="mg/dL" fieldKey="tc" />
            <InputField label="Triglycerides" value={tg} onChange={setTg} unit="mg/dL" fieldKey="tg" />
            <InputField label="HDL" value={hdl} onChange={setHdl} unit="mg/dL" fieldKey="hdl" />
            <InputField label="VLDL" value={vldl} onChange={setVldl} unit="mg/dL" fieldKey="vldl" />
            <InputField label="LDL (direct)" value={ldl} onChange={setLdl} unit="mg/dL" fieldKey="ldl" />
            <div />
          </div>
          <div style={{ marginTop: 18 }}>
            <p style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, margin: "0 0 10px", letterSpacing: "0.04em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Advanced Cardiac Markers
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
              <InputField label="Lipoprotein(a)" value={lipoA} onChange={setLipoA} unit="mg/dL" fieldKey="lipoA" />
              <InputField label="Apolipoprotein A1" value={apoA} onChange={setApoA} unit="mg/dL" fieldKey="apoA" />
              <InputField label="Apolipoprotein B" value={apoB} onChange={setApoB} unit="mg/dL" fieldKey="apoB" />
              <InputField label="Oxidized LDL" value={oxLdl} onChange={setOxLdl} unit="U/L" fieldKey="oxLdl" />
              <InputField label="Myeloperoxidase (MPO)" value={myeloperox} onChange={setMyeloperox} unit="pmol/L" fieldKey="myeloperox" />
              <div /><div />
            </div>
            <p style={{ color: COLORS.muted, fontSize: 12, margin: "14px 0 8px" }}>
              NMR Lipoprotein Particle Numbers <span style={{ fontSize: 11 }}>(nmol/L unless noted)</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
              <InputField label="LDL-P (total)" value={ldlP} onChange={setLdlP} unit="nmol/L" fieldKey="ldlP" />
              <InputField label="Small LDL-P" value={smallLdlP} onChange={setSmallLdlP} unit="nmol/L" fieldKey="smallLdlP" />
              <InputField label="Small Dense LDL (sdLDL)" value={sdLdl} onChange={setSdLdl} unit="mg/dL" fieldKey="sdLdl" />
              <InputField label="HDL-P (total)" value={hdlP} onChange={setHdlP} unit="µmol/L" fieldKey="hdlP" />
              <InputField label="Large HDL-P" value={largeHdlP} onChange={setLargeHdlP} unit="µmol/L" fieldKey="largeHdlP" />
              <InputField label="VLDL-P" value={vldlP} onChange={setVldlP} unit="nmol/L" fieldKey="vldlP" />
              <InputField label="Large VLDL-P" value={largeVldlP} onChange={setLargeVldlP} unit="nmol/L" fieldKey="largeVldlP" />
              <InputField label="LDL Size" value={ldlSize} onChange={setLdlSize} unit="nm" fieldKey="ldlSize" />
              <div />
            </div>
            <p style={{ color: COLORS.muted, fontSize: 12, margin: "14px 0 8px" }}>
              Lipoprotein Particle Sizes <span style={{ fontSize: 11 }}>(average diameter, nm)</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
              <InputField label="LDL Size (NMR)" value={ldlSizeNmr} onChange={setLdlSizeNmr} unit="nm" fieldKey="ldlSizeNmr" />
              <InputField label="HDL Size (NMR)" value={hdlSizeNmr} onChange={setHdlSizeNmr} unit="nm" fieldKey="hdlSizeNmr" />
              <InputField label="VLDL Size (NMR)" value={vldlSizeNmr} onChange={setVldlSizeNmr} unit="nm" fieldKey="vldlSizeNmr" />
            </div>
            <p style={{ color: COLORS.muted, fontSize: 12, margin: "14px 0 8px" }}>
              Cholesterol Balance Markers <span style={{ fontSize: 11 }}>(synthesis &amp; absorption)</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
              <InputField label="Lathosterol" value={lathosterol} onChange={setLathosterol} unit="µg/mL" fieldKey="lathosterol" />
              <InputField label="Desmosterol" value={desmosterol} onChange={setDesmosterol} unit="µg/mL" fieldKey="desmosterol" />
              <InputField label="Beta-Sitosterol" value={betaSitosterol} onChange={setBetaSitosterol} unit="µg/mL" fieldKey="betaSitosterol" />
              <InputField label="Campesterol" value={campesterol} onChange={setCampesterol} unit="µg/mL" fieldKey="campesterol" />
            </div>
          </div>
        </Section>

        {/* Metabolic Markers & MISC — combined CMP + metabolic */}
        <Section title="Metabolic Markers & MISC" icon="📊">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="BUN" value={bun} onChange={setBun} unit="mg/dL" fieldKey="bun" />
            <InputField label="Creatinine" value={creatinine} onChange={setCreatinine} unit="mg/dL" fieldKey="creatinine" />
            {/* eGFR is auto-calculated — show read-only display */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", minHeight: "2.6em", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <span>eGFR <span style={{ color: COLORS.muted, fontWeight: 400 }}>(auto, mL/min)</span></span>
              </label>
              <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 12px", minHeight: "40px", display: "flex", alignItems: "center" }}>
                <span style={{ color: COLORS.muted, fontSize: 13 }}>Auto from Age + Sex + Creatinine</span>
              </div>
            </div>
            <InputField label="Sodium" value={sodium} onChange={setSodium} unit="mEq/L" fieldKey="sodium" />
            <InputField label="Potassium" value={potassium} onChange={setPotassium} unit="mEq/L" fieldKey="potassium" />
            <InputField label="Chloride" value={chloride} onChange={setChloride} unit="mEq/L" fieldKey="chloride" />
            <InputField label="Bicarbonate" value={bicarb} onChange={setBicarb} unit="mEq/L" fieldKey="bicarb" />
            <InputField label="Calcium" value={calcium} onChange={setCalcium} unit="mg/dL" fieldKey="calcium" />
            <InputField label="Total Protein" value={totalProtein} onChange={setTotalProtein} unit="g/dL" fieldKey="totalProtein" />
            <InputField label="Albumin" value={albumin} onChange={setAlbumin} unit="g/dL" fieldKey="albumin" />
            <InputField label="Globulin" value={globulin} onChange={setGlobulin} unit="g/dL" fieldKey="globulin" />
            <InputField label="Glucose" value={glucose} onChange={setGlucose} unit="mg/dL" fieldKey="glucose" />
            <InputField label="Fasting Insulin" value={insulin} onChange={setInsulin} unit="µIU/mL" fieldKey="insulin" />
            <InputField label="HbA1c" value={a1c} onChange={setA1c} unit="%" fieldKey="a1c" />
            {/* EAG auto-calculated display */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", minHeight: "2.6em", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <span>eAG <span style={{ color: COLORS.muted, fontWeight: 400 }}>(auto, mg/dL)</span></span>
              </label>
              <div style={{
                background: nv(a1c) !== null ? (28.7 * nv(a1c) - 46.7 > 126 ? COLORS.redBg : 28.7 * nv(a1c) - 46.7 > 100 ? COLORS.yellowBg : COLORS.greenBg) : COLORS.surface,
                border: `1px solid ${nv(a1c) !== null ? (28.7 * nv(a1c) - 46.7 > 126 ? COLORS.red + "55" : 28.7 * nv(a1c) - 46.7 > 100 ? COLORS.yellow + "55" : COLORS.green + "55") : COLORS.border}`,
                borderRadius: 8, padding: "9px 12px", minHeight: "40px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                {nv(a1c) !== null ? (() => {
                  const eag = 28.7 * nv(a1c) - 46.7;
                  const col = eag > 126 ? COLORS.red : eag > 100 ? COLORS.yellow : COLORS.green;
                  const lbl = eag > 126 ? "High" : eag > 100 ? "Elevated" : "Normal";
                  return (<>
                    <span style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{eag.toFixed(0)}</span>
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: col + "22", border: `1px solid ${col}44`, padding: "2px 7px", borderRadius: 99 }}>{lbl}</span>
                  </>);
                })() : <span style={{ color: COLORS.muted, fontSize: 13 }}>—</span>}
              </div>
              {nv(a1c) !== null && <span style={{ color: COLORS.muted, fontSize: 10, marginTop: 1 }}>From A1C: 28.7 × {nv(a1c).toFixed(1)} − 46.7</span>}
            </div>
            <InputField label="hs-CRP, Cardiac" value={crp} onChange={setCrp} unit="mg/L" fieldKey="crp" />
            <InputField label="CRP (standard)" value={basicCrp} onChange={setBasicCrp} unit="mg/L" fieldKey="basicCrp" />
            <InputField label="Cortisol, Total" value={cortisol} onChange={setCortisol} unit="µg/dL" fieldKey="cortisol" />
            <InputField label="Homocysteine" value={homocysteine} onChange={setHomocysteine} unit="µmol/L" fieldKey="homocysteine" />
            <InputField label="MMA (Methylmalonic Acid)" value={mma} onChange={setMma} unit="µmol/L" fieldKey="mma" />
            <InputField label="Folate" value={folateMisc} onChange={setFolateMisc} unit="ng/mL" fieldKey="folateMisc" />
            <InputField label="LDH" value={ldh} onChange={setLdh} unit="U/L" fieldKey="ldh" />
            <InputField label="Uric Acid" value={uricAcid} onChange={setUricAcid} unit="mg/dL" fieldKey="uricAcid" />
            <InputField label="CK (Creatine Kinase)" value={ck} onChange={setCk} unit="U/L" fieldKey="ck" />
            <InputField label="CK-MB" value={ckMb} onChange={setCkMb} unit="U/L" fieldKey="ckMb" />
          </div>
        </Section>

        {/* Nutrients */}
        <Section title="Nutrients" icon="🌿">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Vitamin D (25-OH)" value={vitD} onChange={setVitD} unit="ng/mL" fieldKey="vitD" />
            <InputField label="RBC Magnesium" value={rbcMag} onChange={setRbcMag} unit="mg/dL" fieldKey="rbcMag" />
            <InputField label="Vitamin B12" value={b12} onChange={setB12} unit="pg/mL" fieldKey="b12" />
            <InputField label="Folate" value={folate} onChange={setFolate} unit="ng/mL" fieldKey="folate" />
          </div>
        </Section>

        {/* Hematology */}
        <Section title="Hematology (CBC)" icon="🩸">
          <p style={{ color: COLORS.muted, fontSize: 12, margin: "0 0 10px" }}>Complete Blood Count</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="WBC" value={wbc} onChange={setWbc} unit="×10³/µL" fieldKey="wbc" />
            <InputField label="RBC" value={rbc} onChange={setRbc} unit="×10⁶/µL" fieldKey="rbc" />
            <InputField label="Hemoglobin" value={hemoglobin} onChange={setHemoglobin} unit="g/dL" fieldKey="hemoglobin" />
            <InputField label="Hematocrit" value={hematocrit} onChange={setHematocrit} unit="%" fieldKey="hematocrit" />
            <InputField label="MCV" value={mcv} onChange={setMcv} unit="fL" fieldKey="mcv" />
            <InputField label="MCH" value={mch} onChange={setMch} unit="pg" fieldKey="mch" />
            <InputField label="MCHC" value={mchc} onChange={setMchc} unit="g/dL" fieldKey="mchc" />
            <InputField label="RDW" value={rdw} onChange={setRdw} unit="%" fieldKey="rdw" />
            <InputField label="Platelets" value={platelets} onChange={setPlatelets} unit="×10³/µL" fieldKey="platelets" />
          </div>
          <p style={{ color: COLORS.muted, fontSize: 12, margin: "14px 0 8px" }}>Differential</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Neutrophils" value={neutrophils} onChange={setNeutrophils} unit="×10³/µL" fieldKey="neutrophils" />
            <InputField label="Lymphocytes" value={lymphocytes} onChange={setLymphocytes} unit="×10³/µL" fieldKey="lymphocytes" />
            <InputField label="Monocytes" value={monocytes} onChange={setMonocytes} unit="×10³/µL" fieldKey="monocytes" />
            <InputField label="Eosinophils" value={eosinophils} onChange={setEosinophils} unit="×10³/µL" fieldKey="eosinophils" />
            <InputField label="Basophils" value={basophils} onChange={setBasophils} unit="×10³/µL" fieldKey="basophils" />
            <div />
          </div>
          <p style={{ color: COLORS.muted, fontSize: 12, margin: "14px 0 8px" }}>Iron Studies</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="TIBC" value={tibc} onChange={setTibc} unit="µg/dL" fieldKey="tibc" />
            <InputField label="UIBC" value={uibc} onChange={setUibc} unit="µg/dL" fieldKey="uibc" />
            <InputField label="Serum Iron" value={serumIron} onChange={setSerumIron} unit="µg/dL" fieldKey="serumIron" />
            <InputField label="Iron % Saturation" value={transferrinSat} onChange={setTransferrinSat} unit="%" fieldKey="transferrinSat" />
            <InputField label="Ferritin" value={ferritin} onChange={setFerritin} unit="ng/mL" fieldKey="ferritin" />
            <div />
          </div>
        </Section>

        {/* Liver Markers */}
        <Section title="Liver Markers" icon="🫁">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="ALT" value={alt} onChange={setAlt} unit="U/L" fieldKey="alt" />
            <InputField label="AST" value={ast} onChange={setAst} unit="U/L" fieldKey="ast" />
            <InputField label="Alk Phosphatase" value={alkPhos} onChange={setAlkPhos} unit="U/L" fieldKey="alkPhos" />
            <InputField label="Total Bilirubin" value={tBili} onChange={setTBili} unit="mg/dL" fieldKey="tBili" />
            <InputField label="Direct Bilirubin" value={directBili} onChange={setDirectBili} unit="mg/dL" fieldKey="directBili" />
            <InputField label="GGT" value={ggt} onChange={setGgt} unit="U/L" fieldKey="ggt" />
          </div>
          <p style={{ color: COLORS.muted, fontSize: 12, margin: "10px 0 0" }}>
            ALT + AST + Platelets (from CBC) + Age → FIB-4 hepatic fibrosis score
          </p>
        </Section>

        {/* Hormone Panel */}
        <Section title="Hormone Panel" icon="⚗️">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Testosterone" value={testosterone} onChange={setTestosterone} unit="ng/dL" fieldKey="testosterone" />
            <InputField label="Estradiol (E2)" value={estradiol} onChange={setEstradiol} unit="pg/mL" fieldKey="estradiol" />
            <InputField label="Progesterone" value={progesterone} onChange={setProgesterone} unit="ng/mL" fieldKey="progesterone" />
            <InputField label="PSA" value={psa} onChange={setPsa} unit="ng/mL" fieldKey="psa" />
            <InputField label="DHEA-S" value={dheas} onChange={setDheas} unit="µg/dL" fieldKey="dheas" />
            <InputField label="FSH" value={fsh} onChange={setFsh} unit="mIU/mL" fieldKey="fsh" />
            <InputField label="LH" value={lh} onChange={setLh} unit="mIU/mL" fieldKey="lh" />
            <InputField label="Prolactin" value={prolactin} onChange={setProlactin} unit="ng/mL" fieldKey="prolactin" />
            <InputField label="SHBG" value={shbg} onChange={setShbg} unit="nmol/L" fieldKey="shbg" />
            <InputField label="IGF-1" value={igf1} onChange={setIgf1} unit="ng/mL" fieldKey="igf1" />
            <div />
          </div>
        </Section>

        {/* Thyroid Panel */}
        <Section title="Thyroid Panel" icon="🦋">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="TSH" value={tsh} onChange={setTsh} unit="mIU/L" fieldKey="tsh" />
            <InputField label="Free T3" value={freeT3} onChange={setFreeT3} unit="pg/mL" fieldKey="freeT3" />
            <InputField label="Free T4" value={freeT4} onChange={setFreeT4} unit="ng/dL" fieldKey="freeT4" />
            <InputField label="Reverse T3" value={reverseT3} onChange={setReverseT3} unit="ng/dL" fieldKey="reverseT3" />
            <InputField label="TPO Antibodies" value={tpoAb} onChange={setTpoAb} unit="IU/mL" fieldKey="tpoAb" />
            <InputField label="Thyroglobulin Ab" value={tgAb} onChange={setTgAb} unit="IU/mL" fieldKey="tgAb" />
          </div>
        </Section>

        {/* Urine ACR */}
        <Section title="Urine Albumin / ACR" icon="💧">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Urine Albumin" value={urineAlb} onChange={setUrineAlb} unit="mg/L" fieldKey="urineAlb" />
            <InputField label="Urine Creatinine" value={urineCr} onChange={setUrineCr} unit="mg/dL" fieldKey="urineCr" />
          </div>
          <p style={{ color: COLORS.muted, fontSize: 12, margin: "10px 0 0" }}>
            Both fields required to compute Albumin-to-Creatinine Ratio (ACR)
          </p>
        </Section>

        {/* ASCVD — original toggle style */}
        <div style={{ background: COLORS.surface, borderRadius: 12, padding: "16px 20px", marginBottom: 28 }}>
          <p style={{ color: COLORS.label, fontSize: 13, fontWeight: 600, margin: "0 0 12px", fontFamily: "'Space Grotesk', sans-serif" }}>
            ❤️ ASCVD 10-Year Risk Calculator (Pooled Cohort Equations)
          </p>
          {(!age || !sex || !race || race === "other" || !tc || !hdl) && (
            <p style={{ color: COLORS.muted, fontSize: 12, margin: "0 0 12px" }}>
              Requires Age, Sex, Race (White or Black), TC, HDL, and Systolic BP.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <InputField label="Systolic BP" value={sbp} onChange={setSbp} unit="mmHg" fieldKey="sbp" />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ color: COLORS.label, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", minHeight: "2.6em", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <span>Zip Code <span style={{ color: COLORS.muted, fontWeight: 400 }}>(optional)</span></span>
              </label>
              <input
                type="text"
                value={zipCode}
                onChange={e => setZipCode(e.target.value)}
                placeholder="e.g. 19001"
                maxLength={10}
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "9px 12px", color: COLORS.text, fontSize: 15, fontFamily: "'DM Mono', monospace", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = COLORS.accent}
                onBlur={e => e.target.style.borderColor = COLORS.border}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "flex-end" }}>
              <CheckField label="On BP Medications" checked={onBpMeds} onChange={setOnBpMeds} />
              <CheckField label="Current Smoker" checked={smoker} onChange={setSmoker} />
              <CheckField label="Diagnosed Diabetic" checked={diabetic} onChange={setDiabetic} />
              <CheckField label="On Statin Therapy" checked={onStatin} onChange={setOnStatin} />
            </div>
          </div>
          {onStatin && (
            <p style={{ color: COLORS.yellow, fontSize: 11, margin: "10px 0 0", lineHeight: 1.5 }}>
              ⚠ On statin therapy: TC and LDL values are lowered by medication. The calculated ASCVD risk may underestimate true baseline risk — consider pre-treatment lipid values if available for the most accurate risk estimate.
            </p>
          )}
        </div>

        {/* Buttons — original style */}
        <div style={{ display: "flex", gap: 12, marginBottom: 36 }}>
          <button
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            disabled={!hasResults}
            style={{
              flex: 1,
              background: hasResults ? "linear-gradient(135deg, #4f9cf9, #7c3aed)" : COLORS.surface,
              color: hasResults ? "#fff" : COLORS.muted,
              border: hasResults ? "none" : `1px solid ${COLORS.border}`,
              borderRadius: 10, padding: "14px 24px", fontSize: 15, fontWeight: 700,
              cursor: hasResults ? "pointer" : "not-allowed",
              letterSpacing: "0.02em", fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {hasResults ? `Calculate Results (${rows.length})` : "Enter lab values above"}
          </button>
          <button onClick={reset} style={{
            background: COLORS.surface, color: COLORS.muted,
            border: `1px solid ${COLORS.border}`, borderRadius: 10,
            padding: "14px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            Reset
          </button>
        </div>

        {/* Results — always live, scroll target */}
        {hasResults && (
          <div ref={resultsRef}>
            {/* Results header — original style */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <h2 style={{ color: COLORS.accent, fontSize: 17, fontWeight: 700, margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                Calculated Results
              </h2>
              <div style={{ flex: 1, height: 1, background: COLORS.border }} />
              {/* Export buttons */}
              <button onClick={handleCopy} style={{
                background: copied ? COLORS.greenBg : COLORS.surface,
                color: copied ? COLORS.green : COLORS.muted,
                border: `1px solid ${copied ? COLORS.green + "33" : COLORS.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s",
              }}>{copied ? "✓ Copied" : "📋 Copy"}</button>
              <button onClick={() => exportPDF(rows, fields)} style={{
                background: COLORS.surface, color: COLORS.muted,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>📄 Export PDF</button>
            </div>

            {/* Dashboard */}
            <Dashboard rows={rows} />

            {/* Filter bar */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              <span style={{ color: COLORS.muted, fontSize: 12, marginRight: 4 }}>Group:</span>
              {groups.map(g => <Pill key={g} active={filterGroup === g} label={g} onClick={() => setFilterGroup(g)} />)}
              <span style={{ color: COLORS.muted, fontSize: 12, marginLeft: 10, marginRight: 4 }}>Risk:</span>
              {["All", "Normal", "Borderline", "High"].map(rv => <Pill key={rv} active={filterRisk === rv} label={rv} onClick={() => setFilterRisk(rv)} />)}
            </div>

            {/* Flat result list grouped by section */}
            {["Lipid", "Kidney", "Metabolic", "Nutrients", "CBC", "Hormone", "Thyroid", "Iron", "Liver", "ASCVD"].map(group => {
              const groupRows = visibleRows.filter(r => r.group === group);
              if (!groupRows.length) return null;
              const icons =  { Lipid:"🧪", Kidney:"🏥", Metabolic:"📊", Nutrients:"🌿", CBC:"🩸", Hormone:"⚗️", Thyroid:"🦋", Iron:"⚙️", Liver:"🫁", ASCVD:"❤️" };
              const titles = { Lipid:"Lipid Panel & Ratios", Kidney:"Kidney & CMP", Metabolic:"Metabolic & MISC", Nutrients:"Nutrients", CBC:"CBC & Differential", Hormone:"Hormones", Thyroid:"Thyroid Panel", Iron:"Iron Studies", Liver:"Liver Panel", ASCVD:"ASCVD Risk" };
              return (
                <Section key={group} title={titles[group]} icon={icons[group]}>
                  {groupRows.map(row => (
                    <ResultRow key={row.key} row={row}
                      expanded={expandedKey === row.key}
                      onToggle={() => setExpandedKey(expandedKey === row.key ? null : row.key)} />
                  ))}
                </Section>
              );
            })}

            <p style={{ color: COLORS.muted, fontSize: 11, textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
              For clinical reference only. Not a substitute for professional medical judgment.<br />
              eGFR: 2021 race-free CKD-EPI · ASCVD: Pooled Cohort Equations (Goff et al. 2014, corrected)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
