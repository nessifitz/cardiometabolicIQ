export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { imageBase64, mediaType: rawMediaType } = req.body;
  if (!imageBase64 || !rawMediaType) {
    return res.status(400).json({ error: 'Missing image data.' });
  }

  // Sanitize media type — Anthropic only accepts these values
  const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  let mediaType = rawMediaType.toLowerCase().split(';')[0].trim();

  // Map common Safari/iOS variants
  if (mediaType === 'image/jpg') mediaType = 'image/jpeg';
  if (mediaType === 'image/heic' || mediaType === 'image/heif') mediaType = 'image/jpeg';
  if (mediaType === 'application/octet-stream') mediaType = 'image/jpeg';
  if (!ALLOWED.includes(mediaType)) mediaType = 'image/jpeg'; // safe fallback

  const isPdf = mediaType === 'application/pdf';

  const prompt = `You are a medical lab data extractor. Analyze this lab report and extract ALL numeric lab values you can find.

Return ONLY a valid JSON object with these exact keys (use null if not found). No explanation, markdown, or text outside the JSON.

{
  "tc": null, "hdl": null, "ldl": null, "tg": null, "vldl": null,
  "lipoA": null, "apoA": null, "apoB": null,
  "ldlP": null, "smallLdlP": null, "sdLdl": null,
  "hdlP": null, "largeHdlP": null, "largeVldlP": null, "vldlP": null,
  "ldlSizeNmr": null, "hdlSizeNmr": null, "vldlSizeNmr": null,
  "glucose": null, "bun": null, "creatinine": null,
  "sodium": null, "potassium": null, "chloride": null, "bicarb": null,
  "calcium": null, "albumin": null, "totalProtein": null, "globulin": null,
  "alt": null, "ast": null, "alkPhos": null, "ggt": null,
  "tBili": null, "directBili": null,
  "a1c": null, "insulin": null, "crp": null, "basicCrp": null,
  "cortisol": null, "homocysteine": null, "mma": null,
  "ldh": null, "uricAcid": null, "ck": null, "ckMb": null,
  "tsh": null, "freeT3": null, "freeT4": null, "reverseT3": null,
  "tpoAb": null, "tgAb": null,
  "vitD": null, "rbcMag": null, "b12": null, "folate": null,
  "wbc": null, "rbc": null, "hemoglobin": null, "hematocrit": null,
  "mcv": null, "mch": null, "mchc": null, "rdw": null, "platelets": null,
  "neutrophils": null, "lymphocytes": null, "monocytes": null,
  "eosinophils": null, "basophils": null,
  "serumIron": null, "tibc": null, "uibc": null,
  "transferrinSat": null, "ferritin": null,
  "testosterone": null, "estradiol": null, "progesterone": null,
  "psa": null, "dheas": null, "fsh": null, "lh": null,
  "prolactin": null, "shbg": null, "igf1": null,
  "myeloperox": null,
  "age": null, "sex": null, "patientName": null, "collectionDate": null
}

Rules:
- Numeric values only (no units or ranges)
- sex: "male" or "female" (lowercase)
- sodium/potassium/chloride/bicarb: mmol/L = mEq/L (equivalent)
- hemoglobin in g/dL (divide g/L by 10 if needed)
- WBC/platelets in ×10³/µL, RBC in ×10⁶/µL
- neutrophils/lymphocytes/monocytes/eosinophils/basophils: absolute counts not percentages
- eGFR and BUN/Cr ratio are calculated — do not extract
- Return null for anything not clearly present`;

  // Build content array — PDF uses document type, images use image type
  const contentItem = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [contentItem, { type: 'text', text: prompt }] }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic API error: ${err}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);

    return res.status(200).json({ extracted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
