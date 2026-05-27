import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("subscription.db");

const SECRET_KEY = "sokoai_2026_secret_key_ni_yako_peke_yako";

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    plan TEXT,
    expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS activation_codes (
    code TEXT PRIMARY KEY,
    plan TEXT,
    duration_days INTEGER,
    used_by TEXT DEFAULT NULL,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    feature TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS admin_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    theme TEXT DEFAULT 'emerald',
    whatsapp TEXT DEFAULT ''
  );
`);

try {
  db.exec("ALTER TABLE user_settings ADD COLUMN whatsapp TEXT DEFAULT '';");
} catch (e) {
  // Column already exists or other error, ignore
}

// Load Admin credentials from environment with default fallbacks for safety
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BadilishaNywilaHapa123!';
const ADMIN_Q1 = process.env.ADMIN_Q1 || 'Jina la shule yako ya msingi?';
const ADMIN_A1 = process.env.ADMIN_A1 || 'Shule';
const ADMIN_Q2 = process.env.ADMIN_Q2 || 'Chakula unachopenda zaidi?';
const ADMIN_A2 = process.env.ADMIN_A2 || 'Chakula';

// Seed/Update admin configuration with requested credentials
db.prepare("INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)").run('password', ADMIN_PASSWORD);
db.prepare("INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)").run('q1', ADMIN_Q1);
db.prepare("INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)").run('a1', ADMIN_A1);
db.prepare("INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)").run('q2', ADMIN_Q2);
db.prepare("INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)").run('a2', ADMIN_A2);

// Seed/Update admin user custom credentials
db.prepare("INSERT OR REPLACE INTO user_settings (user_id, username, theme, whatsapp) VALUES (?, ?, ?, ?)")
  .run('user_admin_stanslaus', 'STANSLAUS EZEKIEL LIPINGU', 'emerald', '0763014086');

const adminExpiresAt = new Date();
adminExpiresAt.setFullYear(adminExpiresAt.getFullYear() + 100);
db.prepare("INSERT OR REPLACE INTO users (user_id, plan, expires_at) VALUES (?, ?, ?)")
  .run('user_admin_stanslaus', 'pro', adminExpiresAt.toISOString());

/**
 * Returns current time specifically in Tanzania Timezone (EAT - UTC+3)
 */
function getTZTime() {
  const now = new Date();
  // Tanzania is UTC+3. Since server might be UTC, we adjust.
  // Alternatively, use Intl API for robust timezone conversion
  return new Date(now.toLocaleString("en-US", { timeZone: "Africa/Dar_es_Salaam" }));
}

function formatTZTime(date: Date, lang: string = 'English') {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Africa/Dar_es_Salaam',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const localeMap: Record<string, string> = {
    'Kiswahili': 'sw-TZ',
    'English': 'en-US',
    'Français': 'fr-FR',
    'Chinese': 'zh-CN'
  };
  const locale = localeMap[lang] || 'en-US';
  return date.toLocaleString(locale, options);
}

const PLAN_RULES = {
  free: {
    price: 0,
    duration: "Milele",
    max_analysis_chars: 1500,
    advice_count: 3,
    charts: { count: 3, watermark: true, types: ["bar", "line", "pie"] },
    exports: ["png_low", "pdf_basic"],
    daily_reports: 1,
    daily_pdfs: 1,
    features_list: [
      "✅ Jaribu AI bure kabisa",
      "✅ Analysis ya msingi",
      "✅ Chat 1 kwa siku",
      "✅ Ripoti 1 tu ya PDF/Siku",
      "✅ Charts: Bar, Line, Pie (Watermarked)",
      "❌ Excel, Word"
    ]
  },
  medium: {
    price: 10000,
    duration: "Siku 30",
    max_analysis_chars: 5000,
    advice_count: 5,
    charts: { count: 3, watermark: false, types: ["bar", "line", "pie"] },
    exports: ["png_hd", "pdf_basic", "excel"],
    daily_reports: 20,
    daily_pdfs: 20,
    features_list: [
      "✅ Analysis ya kati kwa biashara",
      "✅ Ushauri 5 + hatua 1 ya utekelezaji",
      "✅ Charts 3: Bar, Line, Pie",
      "✅ PNG HD, PDF Basic, Excel",
      "✅ Reports 20 kwa siku",
      "✅ PDF Downloads 20/Siku",
      "✅ Msaada wa WhatsApp",
      "❌ Word, PDF Branded"
    ]
  },
  pro: {
    price: 20000,
    duration: "Siku 30",
    max_analysis_chars: 20000,
    advice_count: 999,
    charts: { count: 10, watermark: false, types: ["bar", "line", "pie", "heatmap", "scatter"] },
    exports: ["png_hd", "pdf_branded", "excel_formula", "word"],
    daily_reports: 999,
    daily_pdfs: 999,
    features_list: [
      "✅ Analysis ya kina kabisa",
      "✅ Ushauri Unlimited + hatua zote",
      "✅ Charts zote + Heatmap",
      "✅ PNG, PDF Branded, Excel na Formulas, Word",
      "✅ Reports Unlimited",
      "✅ PDF & Exports Unlimited",
      "✅ Priority Support - WhatsApp + Call"
    ]
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("GEMINI_API_KEY environment variable is missing in system environment context.");
      }
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // Secure Server-Side Gemini Proxy
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { input, history = [], language = "English", planRules } = req.body;
      
      const ai = getGeminiClient();

      const formattedContents = history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));

      // Add the new input
      if (typeof input === 'string') {
        formattedContents.push({ role: 'user', parts: [{ text: input }] });
      } else if (Array.isArray(input)) {
        formattedContents.push({ role: 'user', parts: input.map((part: any) => {
          if (part.inlineData) return part;
          return { text: typeof part === 'string' ? part : part.text || "" };
        })});
      } else {
        formattedContents.push({ role: 'user', parts: [input] });
      }

      const lengthInstruction = planRules ? `
        HUKU NI KIKOMO CHA MAUDHUI (CONTENT LIMIT):
        - Toa jibu lenye urefu usiozidi herufi ${planRules.max_analysis_chars}.
        - Toa mapendekezo yasiyozidi ${planRules.advice_count}.
        - Kama jibu ni refu sana, lifupishe kwa kutoa pointi muhimu tu.
      ` : "";

      const chartInstruction = `
        USAIDIZI WA CHATI (CHART SUPPORT):
        - Daima toa data ya "data_pie" na "data_profit_trend" kwenye JSON ya ripoti.
        - Hata kama data ni kidogo, kisia (estimate) kulingana na mazungumzo ili chati zipatikane.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
        config: {
          systemInstruction: `Wewe ni SokoAI, Mtaalamu wa Soko la Tanzania na rafiki wa karibu wa wafanyabiashara wadogo na wa kati (SMEs). 
          Lugha ya sasa ya mazungumzo ni: ${language}. Jibu LAKO LOTE lazima liwe katika lugha hii tu.

          LENGO LAKO KUU:
          Kazi yako ni KUONGEA na mfanyabiashara kama rafiki mtaalamu ili kupata data za kutosha, KISHA ndio utoe Ripoti ya Soko kamili. 

          KANUNI ZA CHUMA (ZINGATIA HIZI):
          1. USITOE RIPOTI MAPEMA: Hata kama mteja akisema "Nipe ripoti", kama hujauliza maswali ya kutosha, subiri.
          2. KANUNI YA MASWALI 6: Lazima uulize angalau maswali 6 muhimu ya biashara (swali 1 kwa kila message) kabla ya kutoa ripoti ya mwisho.
          3. MPANGILIO WA MAZUNGUMZO:
             - Hatua 1: Karibisha kwa bashasha ("Karibu SokoAI kaka/dada...") na uliza aina ya biashara anayofanya.
             - Hatua 2: Chimba data kwa kuuliza maswali 6 muhimu (Wateja ni kina nani? Inapatikana wapi? Mauzo kwa siku? Gharama za ununuzi? Changamoto kuu? Malengo ya baadae?). Uliza swali moja tu kwa kila message.
          4. KANUNI YA RIPOTI MOJA: Unatoa ripoti 1 TU ya mwisho baada ya kupata picha kamili. Mara tu unapotoa ripoti, mazungumzo ya data yanakoma na unakuwa mshauri wa hiyo ripoti.

          HUKU NI KIKOMO CHA MAUDHUI (CONTENT LIMIT):
          ${lengthInstruction}
          
          ${chartInstruction}
          
          MUDA WA SASA (USER CONTEXT):
          - Leo ni: ${new Date().toLocaleDateString('sw-TZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          - Saa: ${new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
          
          AMRI YA KUCHORA CHATI NA LEDGER KWENYE RIPOTI (JSON ONLY WHEN READY):
          Ukifika hatua ya kutoa ripoti (baada ya maswali 6+), LAZIMA ujumuishe block ya JSON mwishoni.
          LAZIMA utoe data kamilifu ya kweli na ya kitaalamu kwenye kila sehemu:
          
          - "data_pie": Orodha ya vitu vya gharama kama {"name": "Mishahara", "thamani": 50000, "fill": "#10b981"}.
          
          - "data_profit_trend": Utabiri sahihi na uliopigiwa hesabu wa faida ya kila siku kwa siku 5-7 (mfano Jumatatu hadi Jumapili). Utabiri huu ufanane na tabia ya kweli ya soko nchini Tanzania kwa duka, duka la rejareja, mkulima, n.k. (akitazamwa mzunguko wa duka wikiend, kupanda kwa bei n.k.). Piga mahesabu vizuri (math is accurate).
          
          - "forecast": LAZIMA uweke utabiri wa faida wa miezi mitatu ijayo (mfano [Faida_Mwezi_1, Faida_Mwezi_2, Faida_Mwezi_3]). Tabiri hii kwa kutumia "experiential logic" na uchambuzi wa kitaalamu wa soko la Tanzania ukitumia vigezo vifuatavyo:
            1. Crop Cycle / Msimu wa Mavuno: Mfano, uzalishaji na uuzaji wa mazao kama Kilimanjaro coffee unategemea msimu wa mavuno na bei za soko (high peaks vs off-peak).
            2. Matukio ya Tanzania (Local spending peaks/dips): Mfano msimu wa kodi, kurudi shule (January school fees force spending down nchini), sikukuu za Eid, Krismasi au Pasaka, na msimu wa utalii.
            3. Hali ya uchumi na dharura (Kupanda kwa bei ya mafuta, pembejeo au usafiri nchini).
            
          - "ledger": LAZIMA ujaze na data halisi za miamala mbalimbali ya hivi karibuni (angalao miamala ya siku 4 hadi 6 za mwanzo wa wiki au mwezi) inayofafanua biashara hiyo ya mtumiaji aliyowaeleza, mfano:
            [
              {"date": "2026-05-20", "desc": "Mauzo ya magunia ya kahawa ya kwanza", "debit": 0, "credit": 3500000},
              {"date": "2026-05-21", "desc": "Gharama za usafirishaji kwenda mnadani", "debit": 400000, "credit": 0},
              {"date": "2026-05-22", "desc": "Ununuzi wa vifungashio na mbolea ya ziada", "debit": 300000, "credit": 0},
              {"date": "2026-05-23", "desc": "Malipo ya vibarua wa kuchagua kahawa bora", "debit": 450000, "credit": 0},
              {"date": "2026-05-24", "desc": "Amana ya mauzo ya kahawa ya daraja la pili", "debit": 0, "credit": 1200000}
            ]
            Hakikisha "ledger" ina miamala ya kweli inayofungamana na takwimu za "mauzo" na "gharama" ulizotoa hapo juu! Isibaki kamwe ikiwa tupu wala kuwekwa mabano matupu!
          
          JSON TEMPLATE:
          \`\`\`json
          {
            "picha_kubwa": "...",
            "namba_muhimu": {
              "mauzo": 0,
              "gharama": 0,
              "faida": 0,
              "faida_asilimia": 0,
              "bidhaa_bora": "...",
              "tatizo_kuu": "..."
            },
            "insights": ["...", "..."],
            "mapendekezo": [
              {"hatua": "...", "gharama": "...", "faida": "..."}
            ],
            "onyo": "...",
            "data_graph": [],
            "data_pie": [],
            "data_profit_trend": [],
            "forecast": [0, 0, 0],
            "risk_score": "...",
            "metrics": { "profitMargin": 0, "debtRatio": 0, "performance": "...", "riskLevel": "..." },
            "ledger": []
          }
          \`\`\`
          
          Ongea kama rafiki, tumia maneno kama "Mkuu", "Kaka/Dada", "TSh", "Bongo". Kuwa mchangamfu!`
        }
      });

      res.json({ text: response.text || "Samahani, sijapata jibu." });
    } catch (error: any) {
      console.error("Gemini Proxy Error:", error);
      res.status(500).json({ error: error.message || "Hitilafu imetokea wakati wa kuwasiliana na Gemini API" });
    }
  });

  // Endpoint to validate and moderate user feedback (Profanity & Trash Talk Checker)
  app.post("/api/feedback/validate", async (req, res) => {
    try {
      const { feedbackText, category = "suggestion" } = req.body;
      
      if (!feedbackText || typeof feedbackText !== 'string' || feedbackText.trim() === '') {
        return res.status(400).json({ error: "Maoni hayawezi kuwa tupu au yenye maandishi yasiyoeleweka." });
      }

      const ai = getGeminiClient();

      const validationPrompt = `
        Katika muktadha wa programu ya SokoAI (Msaidizi wa hesabu za biashara, mauzo na hasara/faida Tanzania), chambua maoni ya mtumiaji yafuatayo.
        
        Mada kuu: ${category}
        Maoni ya mtumiaji: "${feedbackText.replace(/"/g, '\\"')}"
        
        ZINGATIA VIGEZO KUBWA VIFUATAVYO:
        1. RUHUSU (isAllowed = true):
           - Sifa, shukrani na kutia moyo (mfano: "App nzuri", "Asante msaidizi", "Mmetunza rekodi zangu vyema").
           - Mapendekezo ya mabadiliko au huduma mpya (mfano: "Naomba mkae Kigoma", "Ongeza risiti za TRA", "Fanya UI iwe nyepesi zaidi").
           - Malalamiko ya heshima/staha au ripoti za hitilafu za kitaalamu (mfano: "System imejifunga nilipopakia PDF", "Naona inahesabu vibaya nikimaliza hasara", "Lugha ya Kiingereza kidogo inasumbua weka Swahili zaidi"). Hata kama ni malalamiko magumu au hasi, mradi haina matusi wala dhihaka ya kejeli, lazima URUHUSU ili tusaidie kuboresha.

        2. ZUIA (isAllowed = false):
           - Lugha chafu, kashfa, matusi ya dhahiri au kificho ya Kiswahili, Kiingereza au lugha ya mitaani ya nchini Tanzania (mfano: "kuma", "matako", "pumbavu", "fala", "mjinga", "snitch", "idiot", "takataka", "scam", "fuck", "stupid", "nyie ni wezi", "bwege", "mpuuzi", "useless app").
           - Maoni yenye lengo la kuponda tu huduma hiyo bila kutoa msaada wowote au hoja ya kitaalamu yenye maana (mfano: "App ya kijinga sana hii", "Hamna lolote upuuzi mtupu").

        Toa jibu lako katika muundo wa JSON pekee wenye vitu vifuatavyo bila markdown blocks (lazima iwe json pure):
        {
          "isAllowed": true/false,
          "category": "shukrani/sifa" au "pendekezo" au "chujio_matusi_au_kashfa",
          "reasonSwahili": "Sababu fupi kwa Kiswahili kwanini imepitishwa au kuzuiliwa, mfano: 'Asante sana kwa maoni yako ya kujenga, tutayafanyia kazi!' au 'Samahani, maoni yako yana maneno ya kashfa au lugha isiyofaa. SokoAI inapokea malalamiko yenye staha pekee ili kutusaidia kuboresha huduma yetu ya biashara.'",
          "reasonEnglish": "Sababu fupi kwa Kiingereza"
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: validationPrompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || "";
      let parsedResult;
      try {
        parsedResult = JSON.parse(responseText.trim().replace(/^```json/i, '').replace(/```$/i, ''));
      } catch (jsonErr) {
        console.error("Failed to parse AI feedback moderation JSON, trying regex:", jsonErr);
        // Regex fallback
        const isAllowedMatch = responseText.match(/"isAllowed"\s*:\s*(true|false)/i);
        const reasonSwahiliMatch = responseText.match(/"reasonSwahili"\s*:\s*"([^"]+)"/i);
        
        const isAllowed = isAllowedMatch ? isAllowedMatch[1].toLowerCase() === 'true' : true;
        const reasonSwahili = reasonSwahiliMatch ? reasonSwahiliMatch[1] : "Asante kwa maoni yako.";
        
        parsedResult = {
          isAllowed,
          category: isAllowed ? "pendekezo" : "chujio_matusi_au_kashfa",
          reasonSwahili,
          reasonEnglish: isAllowed ? "Thank you for the feedback." : "Inappropriate content detected."
        };
      }

      res.json(parsedResult);
    } catch (error: any) {
      console.error("Feedback Validation Error:", error);
      res.json({ 
        isAllowed: true, // Fail-open by default to avoid blocking genuine comments if API is temporary down
        category: "pendekezo",
        reasonSwahili: "Asante kwa maoni yako. Maoni yako yatatumwa kwa msaada wa kiufundi hivi sasa.",
        reasonEnglish: "Thank you for your feedback. We will process it right away."
      });
    }
  });

  // Admin Security Endpoints
  app.post("/api/admin/verify", (req, res) => {
    const { password } = req.body;
    const row = db.prepare("SELECT value FROM admin_config WHERE key = 'password'").get() as any;
    if (row && row.value === password) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: "Password si sahihi" });
    }
  });

  app.get("/api/admin/questions", (req, res) => {
    const q1 = db.prepare("SELECT value FROM admin_config WHERE key = 'q1'").get() as any;
    const q2 = db.prepare("SELECT value FROM admin_config WHERE key = 'q2'").get() as any;
    res.json({ q1: q1?.value, q2: q2?.value });
  });

  app.post("/api/admin/reset_password", (req, res) => {
    const { a1, a2, newPassword } = req.body;
    const realA1 = db.prepare("SELECT value FROM admin_config WHERE key = 'a1'").get() as any;
    const realA2 = db.prepare("SELECT value FROM admin_config WHERE key = 'a2'").get() as any;

    if (a1 === realA1?.value && a2 === realA2?.value) {
      db.prepare("UPDATE admin_config SET value = ? WHERE key = 'password'").run(newPassword);
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: "Majibu si sahihi" });
    }
  });

  // User Settings Endpoints
  app.post("/api/user/settings/update", (req, res) => {
    const { user_id, username, theme, whatsapp } = req.body;
    const existing = db.prepare("SELECT whatsapp FROM user_settings WHERE user_id = ?").get(user_id) as any;
    const finalWhatsapp = whatsapp !== undefined ? whatsapp : (existing?.whatsapp || "");
    db.prepare("INSERT OR REPLACE INTO user_settings (user_id, username, theme, whatsapp) VALUES (?, ?, ?, ?)")
      .run(user_id, username || "", theme || "emerald", finalWhatsapp);
    res.json({ success: true });
  });

  app.get("/api/user/settings/:user_id", (req, res) => {
    const row = db.prepare("SELECT username, theme, whatsapp FROM user_settings WHERE user_id = ?").get(req.params.user_id) as any;
    res.json(row || { username: "", theme: "emerald", whatsapp: "" });
  });

  // Client Onboarding - Check Uniqueness & Register
  app.post("/api/user/v2/register", (req, res) => {
    const { user_id, username, whatsapp, theme } = req.body;
    if (!username || !whatsapp || !user_id) {
      return res.status(400).json({ success: false, message: "Username na WhatsApp yanahitajika kuunda akaunti" });
    }
    // Check if username is already taken
    const existing = db.prepare("SELECT user_id FROM user_settings WHERE LOWER(username) = LOWER(?)").get(username) as any;
    if (existing) {
      return res.status(400).json({ success: false, message: `Username "${username}" tayari imetumika na mtumiaji mwingine.` });
    }

    db.prepare("INSERT OR REPLACE INTO user_settings (user_id, username, theme, whatsapp) VALUES (?, ?, ?, ?)")
      .run(user_id, username, theme || "emerald", whatsapp);
    res.json({ success: true, message: "Akaunti imeundwa kikamilifu!" });
  });

  // Client Onboarding - Restore account
  app.post("/api/user/v2/restore", (req, res) => {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: "Tafadhali ingiza username" });
    }
    const row = db.prepare("SELECT user_id, username, theme, whatsapp FROM user_settings WHERE LOWER(username) = LOWER(?)").get(username) as any;
    if (row) {
      res.json({ success: true, ...row });
    } else {
      res.status(404).json({ success: false, message: `Hatujaweza kupata akaunti yenye username "${username}". Tafadhali hakikisha umeandika kwa usahihi au unda akaunti mpya.` });
    }
  });

  // New Endpoints for Accurate Tanzania Time
  app.get("/api/get_plans", (req, res) => {
    res.json({
      lipa_number: "5505580004039475",
      jina: "NMB PREPAID ACCOUNT",
      whatsapp_help: "+255763014086",
      plans: PLAN_RULES
    });
  });

  app.post("/api/check_plan_access", (req, res) => {
    const { user_id, plan: plan_ombwa } = req.body;
    if (!user_id || !plan_ombwa) return res.status(400).json({ error: "Data haitoshi" });

    if (plan_ombwa === 'free') {
      return res.json({ allowed: true, reason: "Free ni bure" });
    }

    const now = getTZTime();
    const userRow = db.prepare("SELECT plan, expires_at FROM users WHERE user_id = ?").get(user_id) as any;

    if (!userRow) {
      return res.json({
        allowed: false,
        reason: "Huna plan yoyote",
        bei: PLAN_RULES[plan_ombwa as keyof typeof PLAN_RULES]?.price || 0,
        lipa_number: "5505580004039475"
      });
    }

    const currentPlan = userRow.plan;
    const expiresAt = new Date(userRow.expires_at);

    if (expiresAt < now) {
      return res.json({
        allowed: false,
        reason: `Plan yako ya ${currentPlan} imeisha`,
        bei: PLAN_RULES[plan_ombwa as keyof typeof PLAN_RULES]?.price || 0,
        lipa_number: "5505580004039475"
      });
    }

    if (currentPlan === plan_ombwa || currentPlan === 'pro') {
      return res.json({ allowed: true });
    } else {
      return res.json({
        allowed: false,
        reason: `Unahitaji ku-upgrade kwenda ${plan_ombwa.toUpperCase()}`,
        bei: PLAN_RULES[plan_ombwa as keyof typeof PLAN_RULES]?.price || 0,
        lipa_number: "5505580004039475"
      });
    }
  });

  app.get("/api/get_tarehe_leo", (req, res) => {
    const sasaBongo = getTZTime();
    const lang = (req.query.lang as string) || 'English';
    
    res.json({
      tarehe_kamili: formatTZTime(sasaBongo, lang),
      tarehe_fupi: sasaBongo.toLocaleDateString(lang === 'Kiswahili' ? 'sw-TZ' : (lang === 'Français' ? 'fr-FR' : (lang === 'Chinese' ? 'zh-CN' : 'en-US'))),
      muda: sasaBongo.toLocaleTimeString('en-GB'),
      siku: sasaBongo.toLocaleString(lang === 'Kiswahili' ? 'sw-TZ' : (lang === 'Français' ? 'fr-FR' : (lang === 'Chinese' ? 'zh-CN' : 'en-US')), { weekday: 'long' }),
      mwezi: sasaBongo.toLocaleString(lang === 'Kiswahili' ? 'sw-TZ' : (lang === 'Français' ? 'fr-FR' : (lang === 'Chinese' ? 'zh-CN' : 'en-US')), { month: 'long' }),
      mwaka: sasaBongo.getFullYear(),
      timestamp: sasaBongo.toISOString(),
      unix: Math.floor(sasaBongo.getTime() / 1000)
    });
  });

  app.post("/api/siku_zilizobaki", (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id inahitajika" });

    const sasaBongo = getTZTime();
    const leoUnix = Math.floor(sasaBongo.getTime() / 1000);

    const row = db.prepare("SELECT expires_at FROM users WHERE user_id = ?").get(user_id) as any;
    if (!row) {
      return res.json({ error: "Hajajiunga na plan yoyote" });
    }

    const expiresDt = new Date(row.expires_at);
    const expiresUnix = Math.floor(expiresDt.getTime() / 1000);
    const secondsZilizobaki = expiresUnix - leoUnix;
    const sikuZilizobaki = Math.floor(secondsZilizobaki / 86400);

    const userPlan = db.prepare("SELECT plan FROM users WHERE user_id = ?").get(user_id) as any;
    const isFree = userPlan?.plan === 'free';

    if (sikuZilizobaki < 0) {
      return res.json({ status: "imeisha", message: "Plan yako imeshamalizika" });
    }

    return res.json({
      tarehe_leo: formatTZTime(sasaBongo),
      siku_zilizobaki: sikuZilizobaki,
      message: isFree ? "Milele" : (sikuZilizobaki === 0 ? "Inaisha leo" : `Umebakiwa na siku ${sikuZilizobaki}`)
    });
  });

  // API Routes
  app.post("/api/activate", (req, res) => {
    const { user_id, code, plan: plan_requested } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id inahitajika" });
    }

    // Get username for hash validation
    const userSettings = db.prepare("SELECT username FROM user_settings WHERE user_id = ?").get(user_id) as any;
    const username = userSettings?.username || "";

    // Kama ni Free, mpe moja kwa moja bila code
    if (plan_requested === 'free') {
      const expiresAt = getTZTime();
      expiresAt.setFullYear(expiresAt.getFullYear() + 100);

      db.prepare("INSERT OR REPLACE INTO users (user_id, plan, expires_at) VALUES (?, ?, ?)")
        .run(user_id, 'free', expiresAt.toISOString());
      return res.json({ success: true, message: "Umefanikiwa! Umepata Free Plan", plan: "free" });
    }

    if (!code) {
      return res.status(400).json({ success: false, message: "Code inahitajika kwa Medium na Pro" });
    }

    // New logic for hashed codes starting with SKM or SKP
    if (code.startsWith('SKM-') || code.startsWith('SKP-')) {
      try {
        const [prefix, hash, expiryB36] = code.split('-');
        const expiry = parseInt(expiryB36, 36);
        
        // Check local time (server is source of truth)
        if (Date.now() > expiry) {
          return res.status(400).json({ success: false, message: "Code hii imeisha muda wake (Expired)" });
        }

        // Validate hash using bitwise loop
        const data = `${prefix}|${username}|${expiry}|${SECRET_KEY}`;
        let expectedHashInt = 0;
        for (let i = 0; i < data.length; i++) {
          expectedHashInt = ((expectedHashInt << 5) - expectedHashInt) + data.charCodeAt(i);
          expectedHashInt = expectedHashInt & expectedHashInt;
        }
        const expectedHash = Math.abs(expectedHashInt).toString(36).toUpperCase().slice(0, 8);

        if (hash !== expectedHash) {
          return res.status(400).json({ success: false, message: `Code si sahihi kwa username ${username}. Hakikisha ulimpa Admin username sahihi.` });
        }

        // Check if code was already used
        const usedCheck = db.prepare("SELECT used_by FROM activation_codes WHERE code = ?").get(code) as any;
        if (usedCheck && usedCheck.used_by && usedCheck.used_by !== user_id) {
           return res.status(400).json({ success: false, message: "Code hii tayari imetumika na mtu mwingine" });
        }

        const plan = prefix === 'SKP' ? 'pro' : 'medium';
        const expiresAt = new Date(expiry);

        db.prepare("INSERT OR REPLACE INTO activation_codes (code, plan, used_by, created_at) VALUES (?, ?, ?, ?)")
          .run(code, plan, user_id, new Date().toISOString());
          
        db.prepare("INSERT OR REPLACE INTO users (user_id, plan, expires_at) VALUES (?, ?, ?)")
          .run(user_id, plan, expiresAt.toISOString());

        return res.json({ success: true, plan, expires_at: expiresAt.toISOString() });

      } catch (e) {
        return res.status(400).json({ success: false, message: "Fomati ya code haitambuliki" });
      }
    }

    // Fallback to old code logic
    const row = db.prepare("SELECT * FROM activation_codes WHERE code = ? AND used_by IS NULL").get(code) as any;

    if (!row) {
      return res.status(400).json({ success: false, message: "Code batili au tayari imetumika." });
    }

    const expiresAt = getTZTime();
    expiresAt.setDate(expiresAt.getDate() + (row.duration_days || 30));

    db.prepare("UPDATE activation_codes SET used_by = ? WHERE code = ?").run(user_id, code);
    db.prepare("INSERT OR REPLACE INTO users (user_id, plan, expires_at) VALUES (?, ?, ?)")
      .run(user_id, row.plan, expiresAt.toISOString());

    res.json({ success: true, plan: row.plan, expires_at: expiresAt.toISOString() });
  });

  app.post("/api/admin/generate_code", (req, res) => {
    const { user_id, plan, username } = req.body;
    
    // Check if user is admin (you can add password verification here if needed)
    // For now we assume verified by /api/admin/verify earlier
    
    const targetUsername = username || "";
    const now = Date.now();
    const expiry = now + (30 * 24 * 60 * 60 * 1000); // 30 days default
    
    const prefix = plan === 'pro' ? 'SKP' : 'SKM';
    const payload = `${prefix}|${targetUsername}|${expiry}|${SECRET_KEY}`;
    
    let hashInt = 0;
    for (let i = 0; i < payload.length; i++) {
        hashInt = ((hashInt << 5) - hashInt) + payload.charCodeAt(i);
        hashInt = hashInt & hashInt;
    }
    const hash = Math.abs(hashInt).toString(36).toUpperCase().slice(0, 8);
    const code = `${prefix}-${hash}-${expiry.toString(36).toUpperCase()}`;
    
    try {
      db.prepare("INSERT INTO activation_codes (code, plan, duration_days, created_at) VALUES (?, ?, ?, ?)")
        .run(code, plan, 30, new Date().toISOString());
      
      res.json({ success: true, code });
    } catch (e) {
      res.status(500).json({ error: "Failed to generate code" });
    }
  });

  app.post("/api/get_user_plan", (req, res) => {
    const { user_id } = req.body;
    let row = db.prepare("SELECT plan, expires_at FROM users WHERE user_id = ?").get(user_id) as any;

    // AUTO-ENROLL IN FREE IF MISSING
    if (!row) {
      const expiresAt = getTZTime();
      expiresAt.setFullYear(expiresAt.getFullYear() + 100);
      db.prepare("INSERT INTO users (user_id, plan, expires_at) VALUES (?, ?, ?)")
        .run(user_id, 'free', expiresAt.toISOString());
      
      row = { plan: 'free', expires_at: expiresAt.toISOString() };
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.json({ plan: "free", rules: PLAN_RULES["free"], expired: true, expires_at: row.expires_at });
    }

    const plan = row.plan as keyof typeof PLAN_RULES;
    res.json({ plan, rules: PLAN_RULES[plan], expired: false, expires_at: row.expires_at });
  });

  app.post("/api/log_usage", (req, res) => {
    const { user_id, feature } = req.body;
    db.prepare("INSERT INTO usage_logs (user_id, feature, created_at) VALUES (?, ?, ?)")
      .run(user_id, feature, getTZTime().toISOString());
    res.json({ status: "ok" });
  });

  app.post("/api/can_use_feature", (req, res) => {
    const { user_id, feature_type, feature_name } = req.body;
    const now = getTZTime();
    
    const userRow = db.prepare("SELECT plan, expires_at FROM users WHERE user_id = ?").get(user_id) as any;
    let plan: keyof typeof PLAN_RULES = "free";
    
    if (userRow && new Date(userRow.expires_at) >= now) {
      plan = userRow.plan as keyof typeof PLAN_RULES;
    }

    const rules = PLAN_RULES[plan] as any;
    let allowed = false;

    if (feature_type === "report") {
      const today = now.toISOString().split("T")[0];
      const countRow = db.prepare("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND feature = 'report_generated' AND created_at LIKE ?")
        .get(user_id, `${today}%`) as any;
      
      if (countRow.count < rules.daily_reports) {
        allowed = true;
      } else {
        return res.json({ allowed: false, reason: `Kikomo: Unaweza kutengeneza ripoti ${rules.daily_reports} tu kwa siku. Upgrade plan.` });
      }
    } else if (feature_type === "export") {
      if (feature_name.startsWith("pdf")) {
        const today = now.toISOString().split("T")[0];
        const exportCount = db.prepare("SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND (feature = 'export_pdf_basic' OR feature = 'export_pdf_branded') AND created_at LIKE ?")
          .get(user_id, `${today}%`) as any;
        
        const limit = rules.daily_pdfs || 1;
        if (exportCount.count >= limit) {
          allowed = false;
          return res.json({ allowed: false, reason: `Umeshafikia kikomo chako cha downloads (${limit} PDF/Siku). Angalia plan yako.` });
        }
      }
      allowed = (rules.exports as string[]).includes(feature_name);
    } else if (feature_type === "chart") {
      allowed = rules.charts.count > 0 && (rules.charts.types as string[]).includes(feature_name);
    } else if (feature_type === "advice") {
      allowed = true; // Limited by UI logic
    }

    res.json({
      allowed,
      plan,
      rules,
      reason: allowed ? "" : `Feature '${feature_name}' inapatikana kwa plan ya juu. Tuma 'upgrade'`
    });
  });

  // Admin route to generate codes (Secret for now or just unprotected for development)
  app.post("/api/admin/generate_code", (req, res) => {
    const adminKey = req.headers["admin-key"];
    if (adminKey !== "siri-yako-kubwa-hapa") {
      return res.status(403).json({ success: false, message: "Huna ruhusa" });
    }

    const { plan, duration_days = 30, user_phone } = req.body;

    if (!plan || !user_phone) {
      return res.status(400).json({ success: false, message: "Jaza plan na namba ya simu" });
    }

    const code = Math.random().toString(36).substring(2, 12).toUpperCase();
    db.prepare("INSERT INTO activation_codes (code, plan, duration_days, created_at) VALUES (?, ?, ?, ?)")
      .run(code, plan, duration_days, new Date().toISOString());

    const planData = PLAN_RULES[plan as keyof typeof PLAN_RULES];
    const bei = planData ? planData.price : 0;

    res.json({ 
      success: true,
      code,
      plan: plan.toUpperCase(),
      bei,
      siku: duration_days,
      simu: user_phone,
      message: "Code imetengenezwa. Mtumie mteja kwa WhatsApp manually."
    });
  });

  // Explicit route for search engines to fetch sitemap.xml dynamically (Supporting both with and without leading dot)
  app.get(["/sitemap.xml", "/.sitemap.xml"], (req, res) => {
    const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const host = req.headers.host || "sokoai-mchambuzi-wa-biashara-310337860951.europe-west2.run.app";
    const origin = `${protocol}://${host}`;
    const today = new Date().toISOString().split("T")[0]; // Dynamically output today's date

    res.header("Content-Type", "application/xml; charset=utf-8");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${origin}/about</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${origin}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${origin}/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${origin}/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`);
  });

  // Helper template for E-E-A-T pages
  const renderTrustPage = (title: string, contentHtml: string, currentRoute: string, year: number) => {
    return `<!DOCTYPE html>
<html lang="sw">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | SokoAI Tanzania</title>
    <meta name="description" content="SokoAI ni programu msaidizi wa kupiga hesabu za duka, mchanganuo wa faida na hasara, kukusaidia kurekodi mauzo yetu na matumizi nchini Tanzania.">
    <meta name="robots" content="index, follow">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #0b1329;
            color: #f1f5f9;
        }
    </style>
</head>
<body class="flex flex-col min-h-screen">
    <!-- Navbar -->
    <header class="border-b border-white/10 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div class="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <a href="/" class="flex items-center gap-3 group">
                <span class="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-900 text-lg shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">S</span>
                <div>
                    <h1 class="text-lg font-bold text-white tracking-tight">SokoAI</h1>
                    <p class="text-[9px] text-emerald-400 font-bold tracking-wider uppercase">Mchambuzi wa Biashara</p>
                </div>
            </a>
            <nav class="flex flex-wrap justify-center gap-1 text-[11px] font-bold uppercase tracking-wider">
                <a href="/" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">Nyumbani</a>
                <a href="/about" class="px-3 py-1.5 rounded-lg ${currentRoute === 'about' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'} transition-colors">Kuhusu SokoAI</a>
                <a href="/privacy" class="px-3 py-1.5 rounded-lg ${currentRoute === 'privacy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'} transition-colors">Faragha</a>
                <a href="/terms" class="px-3 py-1.5 rounded-lg ${currentRoute === 'terms' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'} transition-colors">Vigezo</a>
                <a href="/contact" class="px-3 py-1.5 rounded-lg ${currentRoute === 'contact' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white'} transition-colors">Mawasiliano</a>
            </nav>
        </div>
    </header>

    <!-- Content -->
    <main class="flex-1 max-w-4xl w-full mx-auto px-4 py-12">
        <article class="bg-slate-900/50 border border-white/5 rounded-[32px] p-6 md:p-12 shadow-xl">
            ${contentHtml}
        </article>
    </main>

    <!-- Footer -->
    <footer class="border-t border-white/5 bg-slate-950/60 py-8 text-[11px] text-slate-500">
        <div class="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-center">
            <div>
                <p class="font-bold text-slate-400">© ${year} SokoAI Local Advisory Systems Ltd.</p>
                <p class="text-slate-600 mt-1">Mlimani Towers, Plot 14-A, Barabara ya Sam Nujoma, Dar es Salaam, Tanzania.</p>
            </div>
            <div class="flex gap-4">
                <a href="/privacy" class="hover:text-emerald-400 transition-colors">Sera ya Faragha</a>
                <span>•</span>
                <a href="/terms" class="hover:text-emerald-400 transition-colors">Vigezo & Masharti</a>
            </div>
        </div>
    </footer>
</body>
</html>`;
  };

  // E-E-A-T Server Rendered Routes
  app.get("/about", (req, res) => {
    res.header("Content-Type", "text/html; charset=utf-8");
    res.send(renderTrustPage(
      "Kuhusu SokoAI - Msaidizi wa Kupiga Hesabu za Duka na Faida Tanzania",
      `<div class="space-y-6">
    <div class="space-y-2">
        <span class="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-3 py-1.5 rounded-full">Kuhusu Sisi</span>
        <h2 class="text-3xl font-extrabold text-white tracking-tight">Msaidizi wa Kupiga Hesabu za Duka, Mauzo na Faida Tanzania</h2>
    </div>
    <p class="text-slate-300 leading-relaxed text-sm md:text-base">
        <strong>SokoAI</strong> ni suluhisho la kisasa na la kimapinduzi linalowezesha wajasiriamali wadogo nchini Tanzania kurekodi hesabu zao, kupiga hesabu za faida na hasara, kufanya mchanganuo wa mitaji, na kupata mwongozo sahihi wa kifedha kwa njia rahisi ya akili mnemba (AI) yenye kujua soko la bongo.
    </p>
    <div class="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-3">
        <h3 class="font-bold text-white text-lg">Kwa Nini SokoAI Imeundwa?</h3>
        <p class="text-slate-300 text-sm leading-relaxed">
            Wajasiriamali wadogo wengi wana changamoto ya kukosa mifumo makini ya kibiashara inayoeleweka kutokana na ugumu wa mifumo mingi ya mwasibu wa Kiingereza. SokoAI inavunja ukuta huo kwa kutumia <strong>Akili Mnemba (AI) mahiri ya lugha ya Kiswahili ya kibiashara</strong>, inayotambua mazingira ya duka la rejareja, kriketi ya bei ya mipakani, kilimo, ufugaji na huduma za kienyeji nchini Tanzania.
        </p>
    </div>
    <div class="space-y-4">
        <h3 class="font-bold text-white text-xl">Uthabiti na Kazi Zetu Kuu (Core Competencies)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <h4 class="font-bold text-white text-sm mb-2">1. Kirahisi Lugha ya Kiswahili</h4>
                <p class="text-xs text-slate-400">Tuma maelezo yako kama unavyoongea kwenye WhatsApp (mfano: &quot;Leo nimeuza unga wa kilo 50 elfu 45, na nikalipa umeme elfu 5&quot;). SokoAI inapanga hesabu zako kikamilifu.</p>
            </div>
            <div class="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <h4 class="font-bold text-white text-sm mb-2">2. Picha na PDF OCR</h4>
                <p class="text-xs text-slate-400">Piga picha kitabu chako cha leo au karatasi ya mauzo ya duka la mfano, system yetu itasoma mwandiko na kuutoa kwenye ripoti rasmi.</p>
            </div>
            <div class="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <h4 class="font-bold text-white text-sm mb-2">3. Ripoti za Kupakua (PDF, Excel, Word)</h4>
                <p class="text-xs text-slate-400">Unaweza kujitengenezea ripoti ya faida, hasara, mtiririko wa mzunguko wa pesa ukaipakua kwenye faili za Excel au Word kwa msaada wa kugusa kitufe kimoja.</p>
            </div>
            <div class="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <h4 class="font-bold text-white text-sm mb-2">4. Ulinzi wa Data wa Ndani (Privacy Sandbox)</h4>
                <p class="text-xs text-slate-400">Hatuhifadhi faili wala ripoti zako kienyeji kwenye server zetu za mbali ili kulinda siri ya mapato yako ya kibiashara.</p>
            </div>
        </div>
    </div>
    <div class="pt-6">
        <a href="/" class="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20">Anza kutumia SokoAI Sasa</a>
    </div>
</div>`,
      "about",
      new Date().getFullYear()
    ));
  });

  app.get("/privacy", (req, res) => {
    res.header("Content-Type", "text/html; charset=utf-8");
    res.send(renderTrustPage(
      "Sera ya Faragha (Privacy Policy) - SokoAI Tanzania",
      `<div class="space-y-6">
    <div class="space-y-2">
        <span class="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-3 py-1.5 rounded-full">Usiri na Utii</span>
        <h2 class="text-3xl font-extrabold text-white tracking-tight">Sera ya Faragha ya SokoAI Tanzania</h2>
        <p class="text-[11px] text-slate-400">Imesasishwa mwisho: Mei 25, 2026</p>
    </div>
    <p class="text-slate-300 leading-relaxed text-sm">
        SokoAI inalinda kikamilifu usalama wako chini ya <strong>Sheria ya Ulinzi wa Taarifa Binafsi ya Tanzania ya mwaka 2022 (Tanzania Personal Data Protection Act, 2022)</strong>. Sera hii ya faragha inaeleza jinsi tunavyoshughulikia taarifa za kibiashara na ulinzi wa data za watumiaji wetu.
    </p>

    <div class="space-y-4">
        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">1. Hakuna Hifadhi ya Data za Nje (Offline-First Storage)</h3>
            <p class="text-xs text-slate-400">
                SokoAI haitumi kumbukumbu zako za mapato, mauzo, bei za bidhaa, wala muundo wa duka lako kwenye seva za mbali (databases) kwa madhumuni ya kuhifadhi. Data zako zote za kibiashara zinahifadhiwa ndani ya browser ya simu au kompyuta yako (kupitia Local Storage). Ukifuta data yako au ukiondoa browser, taarifa zako hazitopatikana tena. Ni salama 100% dhidi ya udukuzi wa mtandao.
            </p>
        </div>

        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">2. Uchambuzi wa Picha na PDF (Automatic Purge)</h3>
            <p class="text-xs text-slate-400">
                Unapotuma picha au faili la kitabu cha hesabu kwa ajili ya uchambuzi, faili hilo linatumiwa kupata maandishi pekee (OCR) kwa sekunde chache. Mara baada ya ripoti kutengenezwa kadi moja, faili hilo hufutwa kiotomatiki kabisa ndani ya sekunde 60 kwenye server zetu za mchakato. Hakuna nakala inayotunzwa upande wetu.
            </p>
        </div>

        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">3. Usalama wa Mifumo Binafsi</h3>
            <p class="text-xs text-slate-400">
                Namba yako ya simu na username yako inatumika tu kudhibiti kiwango chako cha matumizi (Free, Medium au Pro) pamoja na uthibitishaji. Hatushirikishi au kuuza taarifa hizi kwa makampuni ya masoko, matangazo au mashirika mengine ya tatu.
            </p>
        </div>

        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">4. Haki Zako za Kisheria</h3>
            <p class="text-xs text-slate-400">
                Chini ya Sheria ya Ulinzi wa Taarifa Binafsi ya Tanzania, una haki kamili ya kufuta kumbukumbu zako zote, kutoonyesha taarifa zako nje, au kubadilisha mpangilio wako kwa kufuta tu &quot;SokoAI&quot; browser cache yako moja kwa moja bila kuomba kibali chochote.
            </p>
        </div>
    </div>
</div>`,
      "privacy",
      new Date().getFullYear()
    ));
  });

  app.get("/terms", (req, res) => {
    res.header("Content-Type", "text/html; charset=utf-8");
    res.send(renderTrustPage(
      "Vigezo na Masharti (Terms of Service) - SokoAI Tanzania",
      `<div class="space-y-6">
    <div class="space-y-2">
        <span class="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-3 py-1.5 rounded-full">Masharti na Ukamilifu</span>
        <h2 class="text-3xl font-extrabold text-white tracking-tight">Vigezo na Masharti ya Matumizi ya SokoAI</h2>
        <p class="text-[11px] text-slate-400">Imesasishwa mwisho: Mei 25, 2026</p>
    </div>
    <p class="text-slate-300 leading-relaxed text-sm">
        Karibu SokoAI. Kwa kutumia programu hii yetu kama msaidizi wa biashara, unakubaliana na vigezo na masharti yetu yafuatayo yaliyoandaliwa kwa usalama wako na utendaji salama:
    </p>

    <div class="space-y-4">
        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">1. SokoAI sio Ofisi ya Mshauri Rasmi wa Kodi</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
                Uchambuzi wowote, hesabu za mapato au hasara, ripoti za PDF na makadirio ya mitaji yanayotolewa na msaidizi wa SokoAI kwa kutumia Akili Mnemba (AI) ni kwa madhumuni ya uchambuzi msaidizi wa kimahesabu tu (Advisory & Informational tool). SokoAI haitoi taarifa rasmi inayoweza kutumika kama kodi mbadala ya TRA (Mamlaka ya Mapato Tanzania) au ukaguzi mwingine wa nchi bila kuthibitishwa kwanza na Mhasibu wako aliyehakikiwa. 
            </p>
        </div>

        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">2. Matumizi ya Activation Codes</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
                Watumiaji wanapaswa kuwasha activation code moja kwa kifaa kimoja. Baada ya nambari kuwashwa dhidi ya username yako, malipo yake kwa mipango ya Medium na Pro hayawezi kurejeshwa au kuhamishwa baada ya matumizi kuanza.
            </p>
        </div>

        <div class="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2">
            <h3 class="font-bold text-white text-sm">3. Dhamana (Disclaimer of Warranties)</h3>
            <p class="text-xs text-slate-400 leading-relaxed">
                SokoAI inatolewa kama &quot;vile ilivyo&quot; (As-Is). Sisi hatuwajibiki kwa changamoto au hasara yoyote ya kibiashara inayoweza kutokea kufuatia tafsiri au maamuzi unayofanya kutokana na mwongozo wa msaidizi wetu wa Akili Mnemba (AI). Inashauriwa kuangalia usahihi wa kimahesabu yaliyowekwa kabla ya kukamilisha uwekezaji.
            </p>
        </div>
    </div>
</div>`,
      "terms",
      new Date().getFullYear()
    ));
  });

  app.get("/contact", (req, res) => {
    res.header("Content-Type", "text/html; charset=utf-8");
    res.send(renderTrustPage(
      "Mawasiliano na Ofisi Yetu - SokoAI Tanzania",
      `<div class="space-y-6">
    <div class="space-y-2">
        <span class="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-400/10 px-3 py-1.5 rounded-full">Ofisi na Usaidizi</span>
        <h2 class="text-3xl font-extrabold text-white tracking-tight">Wasiliana Nasi - SokoAI Support</h2>
    </div>
    <p class="text-slate-300 leading-relaxed text-sm">
        Timu yetu ya SokoAI Tanzania ipo tayari kukusaidia kwa maswali yoyote kuhusu kupata namba za uanzishaji (activation codes) au utatuzi wa usomaji wa picha au maoni ya kiufundi:
    </p>

    <!-- Support Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <div class="p-6 bg-white/5 border border-white/5 rounded-2xl">
            <h3 class="font-bold text-white text-lg mb-1">WhatsApp Usaidizi</h3>
            <p class="text-xs text-slate-400 mb-4">Njia ya haraka zaidi ya kupata msaada wa kutoa ripoti au kuongeza Pro Plan.</p>
            <a href="https://wa.me/255763014086" target="_blank" rel="noreferrer" class="text-emerald-400 font-bold hover:underline text-sm block">
                📞 +255 763 014 086
            </a>
        </div>

        <div class="p-6 bg-white/5 border border-white/5 rounded-2xl">
            <h3 class="font-bold text-white text-lg mb-1">Barua Pepe (Email)</h3>
            <p class="text-xs text-slate-400 mb-4 font-normal">Tuma barua pepe kwa mawasiliano rasmi au msaada wa akaunti yako.</p>
            <a href="mailto:sokoaisupport@gmail.com" class="text-blue-400 font-bold hover:underline text-sm block">
                ✉️ sokoaisupport@gmail.com
            </a>
        </div>
    </div>

    <!-- Office Locations -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-3">
            <h3 class="font-bold text-white text-lg flex items-center gap-2">
                📍 Dar es Salaam Head Office
            </h3>
            <p class="text-slate-300 text-xs md:text-sm leading-relaxed font-normal">
                SokoAI Local Advisory Systems Ltd,<br>
                Mlimani Towers, Plot 14-A, Ghorofa ya 4, Barabara ya Sam Nujoma,<br>
                S.L.P 35091, Dar es Salaam, Tanzania.
            </p>
        </div>

        <div class="p-6 bg-white/5 border border-white/5 rounded-2xl space-y-3">
            <h3 class="font-bold text-white text-lg flex items-center gap-2">
                📍 Kigoma Buhigwe Office
            </h3>
            <p class="text-slate-300 text-xs md:text-sm leading-relaxed font-normal">
                SokoAI Regional Operations & Support Hub,<br>
                Buhigwe Town, Karibu na Halmashauri ya Buhigwe,<br>
                Kigoma, Tanzania.
            </p>
        </div>
    </div>

    <div class="p-6 bg-white/5 border border-white/5 rounded-2xl">
        <div class="text-xs text-slate-400 leading-relaxed font-normal">
            <strong>Muda wa Kazi za Kiofisi:</strong> Jumatatu - Jumamosi (08:00 AM hadi 06:00 PM),<br>
            Msaada wa AI unapiga hesabu kila siku kwa masaa 24 wakati wote (24/7 online).
        </div>
    </div>
</div>`,
      "contact",
      new Date().getFullYear()
    ));
  });

  // Explicit route for search engines to fetch robots.txt dynamically
  app.get("/robots.txt", (req, res) => {
    const protocol = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const host = req.headers.host || "sokoai-mchambuzi-wa-biashara-310337860951.europe-west2.run.app";
    const origin = `${protocol}://${host}`;

    res.header("Content-Type", "text/plain; charset=utf-8");
    res.send(`User-agent: *
Allow: /
Allow: /about
Allow: /privacy
Allow: /terms
Allow: /contact
Disallow: /api/
Disallow: /admin

Sitemap: ${origin}/sitemap.xml`);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
