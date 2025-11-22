import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Build dynamic prompt
function buildPrompt({ tipoAccion, ideaCliente, productTitle, productCategory, productStyle }) {
  return `
Eres un director de arte y diseñador de interiores experto en visualizaciones fotorrealistas.

Tu tarea:
Analizar la imagen del usuario y devolver un JSON con instrucciones detalladas sobre cómo integrar el producto.

Responde estrictamente en JSON con esta estructura:

{
  "valid_image": true/false,
  "reason": "",
  "scene_type": "",
  "edit_summary": "",
  "placement_instructions": "",
  "lighting_instructions": "",
  "extra_improvements": "",
  "image_prompt": ""
}

Datos del usuario:
- tipoAccion: ${tipoAccion}
- ideaCliente: ${ideaCliente}
- productTitle: ${productTitle}
- productCategory: ${productCategory}
- productStyle: ${productStyle}
`;
}

// MAIN ROUTE
app.post('/generate', async (req, res) => {
  try {
    const {
      imageUrl,
      tipoAccion = 'auto',
      ideaCliente = '',
      product_title = '',
      product_category = '',
      product_style = '',
      product_id = '',
      product_price = ''
    } = req.body || {};

    if (!imageUrl) {
      return res.status(400).json({ error: 'Falta imageUrl en el body.' });
    }

    const prompt = buildPrompt({
      tipoAccion,
      ideaCliente,
      productTitle: product_title,
      productCategory: product_category,
      productStyle: product_style
    });

    // 1) Vision + JSON Plan
    const visionResponse = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analiza esta imagen y devuelve el JSON solicitado." },
            { type: "image_url", image_url: imageUrl }
          ]
        }
      ]
    });

    const raw = visionResponse.choices?.[0]?.message?.content || "{}";
    let plan;

    try {
      plan = JSON.parse(raw);
    } catch (e) {
      plan = { valid_image: false, reason: "JSON inválido", image_prompt: "" };
    }

    if (!plan.valid_image) {
      return res.status(400).json({
        error: "Imagen no válida",
        detail: plan.reason || "Rechazada por análisis"
      });
    }

    // 2) Image generation
    let afterUrl = null;
    try {
      const imgResp = await client.images.generate({
        model: "gpt-image-1",
        prompt: plan.image_prompt || "Mejora la imagen.",
        size: "1024x1024"
      });

      const b64 = imgResp.data?.[0]?.b64_json;
      if (b64) {
        afterUrl = `data:image/png;base64,${b64}`;
      }
    } catch (e) {
      console.log("Error generando imagen:", e);
    }

    return res.json({
      before_img: imageUrl,
      after_img: afterUrl || imageUrl,
      product_title,
      product_price,
      product_id,
      scene_type: plan.scene_type || "",
      edit_summary: plan.edit_summary || "",
      placement_instructions: plan.placement_instructions || "",
      lighting_instructions: plan.lighting_instructions || "",
      extra_improvements: plan.extra_improvements || ""
    });

  } catch (err) {
    console.error("Error en /generate:", err);
    return res.status(500).json({ error: "Error interno del servidor IA." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Backend IA escuchando en puerto " + PORT));

