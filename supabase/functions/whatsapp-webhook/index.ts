import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.42.0';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0';

// In Edge Functions we get Supabase envs automatically
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(Deno.env.get('GOOGLE_API_KEY') || '');

/**
 * Obtiene catalogos para inyectarlos al prompt
 */
async function getCatalogLists() {
  const { data, error } = await supabase.from('config_v4').select('*').eq('id', 'main').single();
  if (error || !data) return { workers: [], places: [], species: [] };

  const workersList = (data.workers || []).map((w: any) => w.name);
  return { 
    workers: workersList, 
    places: data.lugares || [], 
    species: data.especies || [] 
  };
}

/**
 * Construye el prompt
 */
function getExtractionPrompt(catalogs: any) {
  const currentDate = new Date().toISOString().split('T')[0];
  const workers = catalogs.workers.length ? catalogs.workers.join(', ') : 'Ninguno';
  const places = catalogs.places.length ? catalogs.places.join(', ') : 'Ninguno';
  const species = catalogs.species.length ? catalogs.species.join(', ') : 'Ninguno';

  return `Sos un asistente que extrae datos de registros de trabajo agricola.
El usuario te envia un mensaje transcrito. Extrae los datos y devolvelos SOLO como JSON valido, sin texto adicional.

Campos a extraer:
- fecha: (si dice 'hoy' usa ${currentDate})
- nombre: (matchear contra lista conocida)
- tipo: 'Trabajos al día' | 'Trabajos al tanto' | 'Injertación' | 'Adelanto' | 'Descuento'
- cantidad: horas o unidades
- lugar:
- cuadro:
- especie:
- actividad_principal:
- trabajo:
- descripcion:

Lista de trabajadores: [${workers}]
Lugares: [${places}]
Especies: [${species}]

Si menciona multiples trabajadores o dias, devolver un array de registros. Si falta algo, usa null.
No agregues backticks ni explicaciones. Solo JSON puro.
Ejemplo salida: {"fecha": "2026-06-01", "nombre": "Juan", "tipo": "Trabajos al día", "cantidad": 8}`;
}

/**
 * Convierte un Blob a base64 para Gemini
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Envia mensaje via Meta API
 */
async function sendWhatsAppMessage(recipientNumber: string, text: string, phoneNumberId: string) {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: 'text',
      text: { body: text }
    })
  });
}

/**
 * Handler HTTP Principal
 */
serve(async (req) => {
  // 1. Validacion Webhook (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === Deno.env.get('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // 2. Recepcion Mensajes (POST)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            const value = change.value;
            if (value.messages?.length > 0) {
              const message = value.messages[0];
              const phoneNumberId = value.metadata.phone_number_id;
              const senderNumber = message.from;
              
              let textToAnalyze = '';
              const messageId = message.id;

              // Setup db record
              await supabase.from('whatsapp_messages').insert({
                id: messageId,
                telefono_origen: senderNumber,
                status: 'procesando',
                raw_message: message
              });

              try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

                // Process Audio or Text
                if (message.type === 'text') {
                  textToAnalyze = message.text.body;
                } else if (message.type === 'audio' || message.type === 'voice') {
                  const mediaId = message.audio?.id || message.voice?.id;
                  
                  // Get URL
                  const mediaMetaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
                    headers: { Authorization: `Bearer ${Deno.env.get('WHATSAPP_TOKEN')}` }
                  });
                  const mediaMeta = await mediaMetaRes.json();
                  
                  if (!mediaMeta.url) {
                    console.error("WhatsApp API Error for Media", mediaId, mediaMeta);
                    throw new Error(`Fallo obteniendo archivo de WhatsApp: ${mediaMeta.error?.message || JSON.stringify(mediaMeta)}`);
                  }
                  
                  // Download Bin
                  const mediaRes = await fetch(mediaMeta.url, {
                    headers: { Authorization: `Bearer ${Deno.env.get('WHATSAPP_TOKEN')}` }
                  });
                  const blob = await mediaRes.blob();
                  const base64Audio = await blobToBase64(blob);

                  // Gemini 1: Audio Transcription
                  const rawMimeType = blob.type || "audio/ogg";
                  const cleanMimeType = rawMimeType.split(';')[0];
                  const audioResult = await model.generateContent([
                    { inlineData: { data: base64Audio, mimeType: cleanMimeType } },
                    { text: "Transcribe literalmente todo lo que dice la persona en este audio." }
                  ]);
                  textToAnalyze = audioResult.response.text();

                } else {
                  await supabase.from('whatsapp_messages').update({ status: 'ignorado' }).eq('id', messageId);
                  return new Response('EVENT_RECEIVED', { status: 200 });
                }

                // Gemini 2: JSON Extraction
                const catalogs = await getCatalogLists();
                const systemPrompt = getExtractionPrompt(catalogs);

                const extractionResult = await model.generateContent({
                  contents: [{ role: 'user', parts: [{ text: textToAnalyze }] }],
                  systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
                  generationConfig: { temperature: 0.1 }
                });

                const responseText = extractionResult.response.text();
                const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                if (!jsonMatch) throw new Error('No JSON found in Gemini response');
                
                const parsedJson = JSON.parse(jsonMatch[0]);

                // Update DB
                await supabase.from('whatsapp_messages').update({
                  status: 'pendiente',
                  payload_extraido: parsedJson,
                  transcription: textToAnalyze
                }).eq('id', messageId);

                // Notify User
                let summary = Array.isArray(parsedJson) ? `${parsedJson.length} registros.` : '1 registro.';
                await sendWhatsAppMessage(
                  senderNumber, 
                  `✅ Registro procesado: ${summary}\nEstado: Pendiente de confirmación.`, 
                  phoneNumberId
                );
              } catch (innerErr: any) {
                console.error('Error in message processing:', innerErr);
                await supabase.from('whatsapp_messages').update({
                  status: 'error',
                  transcription: `Error interno: ${innerErr.message || 'Desconocido'}`
                }).eq('id', messageId);
                
                await sendWhatsAppMessage(
                  senderNumber, 
                  `❌ Hubo un error procesando tu mensaje: ${innerErr.message || 'Error desconocido'}. Intenta enviarlo de nuevo o en texto.`, 
                  phoneNumberId
                );
              }
            }
          }
        }
        return new Response('EVENT_RECEIVED', { status: 200 });
      }
    } catch (err) {
      console.error('Critical Webhook Error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  return new Response('Not Found', { status: 404 });
});
