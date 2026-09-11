export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { imageBase64, mediaType } = req.body;
  if (!imageBase64 || !mediaType) {
    return res.status(400).json({ error: 'Missing image data.' });
  }

  const prompt = `You are a medical lab data extractor. Analyze this lab report image or PDF and extract ALL numeric lab values you can find.

Return ONLY a valid JSON object with these exact keys (use null if not found). Do not include any explanation, markdown, or text outside the JSON.

{
  "tc": null,
  "hdl": null,
  "ldl": null,
  "tg": null,
  "vldl": null,
  "lipoA": null,
  "apoA": null,
  "apoB": null,
  "ldlP": null,
  "smallLdlP": null,
  "sdLdl": null,
  "hdlP": null,
  "largeHdlP": null,
  "largeVldlP": null,
  "vldlP": null,
  "ldlSizeNmr": null,
  "hdlSizeNmr": null,
  "vldlSizeNmr": null,
  "glucose": null,
  "bun": null,
  "creatinine": null,
  "sodium": null,
  "potassium": null,
  "chloride": null,
  "bicarb": null,
  "calcium": null,
  "albumin": null,
  "alt": null,
  "ast": null,
  "alkPhos": null,
  "ggt": null,
  "tBili": null,
  "directBili": null,
  "a1c": null,
  "insulin": null,
  "crp": null,
  "basicCrp": null,
  "cortisol": null,
  "homocysteine": null,
  "ldh": null,
  "uricAcid": null,
  "ck": null,
  "ckMb": null,
  "tsh": null,
  "freeT3": null,
  "freeT4": null,
  "reverseT3": null,
  "tpoAb": null,
  "tgAb": null,
  "vitD": null,
  "rbcMag": null,
  "b12": null,
  "folate": null,
  "wbc": null,
  "rbc": null,
  "hemoglobin": null,
  "hematocrit": null,
  "mcv": null,
  "mch": null,
  "mchc": null,
  "rdw": null,
  "platelets": null,
  "neutrophils": null,
  "lymphocytes": null,
  "monocytes": null,
  "eosinophils": null,
  "basophils": null,
  "serumIron": null,
  "tibc": null,
  "uibc": null,
  "transferrinSat": null,
  "ferritin": null,
  "testosterone": null,
  "estradiol": null,
  "progesterone": null,
  "psa": null,
  "dheas": null,
  "fsh": null,
  "lh": null,
  "prolactin": null,
  "shbg": null,
  "igf1": null,
  "age": null,
  "sex": null,
  "patientName": null,
  "collectionDate": null
}

Important extraction rules:
- Extract numeric values only (no units, no reference ranges)
- For sex: use "male" or "female" (lowercase)
- For sodium/potassium/chloride/bicarb: convert mmol/L to mEq/L (they are equivalent for these electrolytes)
- For hemoglobin: if reported in g/L divide by 10 to get g/dL
- For WBC/RBC/platelets: convert to standard US units if needed (WBC ×10³/µL, RBC ×10⁶/µL, platelets ×10³/µL)
- For neutrophils/lymphocytes/monocytes/eosinophils/basophils: extract absolute counts (×10³/µL), not percentages
- eGFR is calculated — do not extract it
- BUN/Creatinine ratio is calculated — do not extract it
- Look for: TSH, Free T3, Free T4 (T4 Free Direct), Reverse T3
- Testosterone in ng/dL, Estradiol in pg/mL
- FSH and LH in mIU/mL
- Return null for any value not clearly present in the report`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic API error: ${err}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    // Strip any markdown code blocks if present
    const clean = text.replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(clean);

    return res.status(200).json({ extracted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
