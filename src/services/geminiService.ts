/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Tesseract from "tesseract.js";

// Note: pdf-parse is Node-specific. For browser, we use pdfjs-dist.
// We'll dynamically import it to avoid build issues if not needed.
// However, since we're in a browser env, we'll implement a robust OCR and text processor.

let lastCall = 0;

/**
 * Splits text into manageable chunks for AI analysis
 */
export function splitText(text: string, chunkSize = 4000): string[] {
  const cleaned = text.replace(/\s+/g, " ").slice(0, 15000); // Clean and limit size to 15k chars as requested
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += chunkSize) {
    chunks.push(cleaned.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Safe Business Analysis Wrapper (Prevents crashing)
 */
async function safeAnalyzeBusinessData(input: string, language: string): Promise<string> {
  try {
    return await analyzeBusinessData(input, [], language);
  } catch (e) {
    console.error("Analysis Failed:", e);
    // Return empty financial JSON if it fails
    return JSON.stringify({
      revenue: 0,
      expenses: 0,
      profit_after_tax: 0,
      assets: 0,
      liabilities: 0
    });
  }
}

/**
 * Safe JSON Parser for AI responses
 */
function safeParse(jsonString: string) {
  try {
    const cleaned = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

/**
 * Merges financial data from multiple chunks
 */
function mergeFinancialData(results: any[]) {
  const final = {
    revenue: 0,
    expenses: 0,
    profit_after_tax: 0,
    assets: 0,
    liabilities: 0,
    ROE: 0,
    ROA: 0,
    NPL: 0
  };

  results.forEach(r => {
    if (!r) return;
    final.revenue += Number(r.revenue || r.mauzo || 0);
    final.expenses += Number(r.expenses || r.gharama || 0);
    final.profit_after_tax += Number(r.profit_after_tax || r.faida || 0);

    // Latest non-cumulative values
    if (r.assets !== undefined) final.assets = Number(r.assets);
    if (r.liabilities !== undefined) final.liabilities = Number(r.liabilities);
    if (r.ROE !== undefined) final.ROE = Number(r.ROE);
    if (r.ROA !== undefined) final.ROA = Number(r.ROA);
    if (r.NPL !== undefined) final.NPL = Number(r.NPL);
  });

  return final;
}

/**
 * Calculates financial ratios and performance
 */
function analyzeBusinessMetrics(data: any) {
  return {
    profitMargin: data.revenue > 0 ? (data.profit_after_tax / data.revenue) * 100 : 0,
    debtRatio: data.assets > 0 ? (data.liabilities / data.assets) * 100 : 0,
    performance: data.ROE > 20 ? "Strong" : (data.ROE > 5 ? "Moderate" : "Weak"),
    riskLevel: data.NPL > 5 ? "High Risk" : (data.NPL > 2 ? "Medium Risk" : "Low Risk")
  };
}

/**
 * AI-driven recommendations
 */
function generateRecommendations(data: any, analysis: any, language: string) {
  const advice = [];
  const isSwahili = language === 'Kiswahili';

  if (analysis.profitMargin < 15) {
    advice.push({ 
      hatua: isSwahili ? "Punguza gharama za uendeshaji" : "Reduce operating costs",
      gharama: "TSh 0", 
      faida: isSwahili ? "Ongeza 10% faida" : "Increase 10% profit" 
    });
  }

  if (analysis.debtRatio > 60) {
    advice.push({ 
      hatua: isSwahili ? "Dhibiti madeni ili kupunguza hatari" : "Manage debts to reduce risk",
      gharama: "TSh 0", 
      faida: isSwahili ? "Usalama wa biashara" : "Business safety" 
    });
  }

  if (analysis.performance === "Strong") {
    advice.push({ 
      hatua: isSwahili ? "Panua biashara (expansion opportunity)" : "Business expansion opportunity",
      gharama: isSwahili ? "Kulingana na mradi" : "Project dependent", 
      faida: isSwahili ? "Ukuaji wa mtaji" : "Capital growth" 
    });
  }

  if (advice.length === 0) {
    advice.push({ 
      hatua: isSwahili ? "Endelea na mienendo mizuri ya sasa" : "Maintain current positive trends",
      gharama: "TSh 0", 
      faida: isSwahili ? "Utulivu wa kifedha" : "Financial stability" 
    });
  }

  return advice;
}

/**
 * Simple Linear Regression for forecasting
 */
export function forecastNextMonths(history: number[], months = 3) {
  if (history.length < 2) {
    // If only one point exists, project it forward with slight growth
    const val = history[0] || 0;
    return Array(months).fill(0).map((_, i) => val * (1 + (i + 1) * 0.05));
  }

  const n = history.length;
  const x = Array.from({ length: n }, (_, i) => i);
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = history.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * history[i], 0);
  const sumXX = x.reduce((a, b) => a + b * b, 0);

  const denominator = (n * sumXX - sumX * sumX);
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: months }, (_, i) => Math.max(0, slope * (n + i) + intercept));
}

/**
 * Performs OCR on an image buffer or URL
 */
export async function ocrImage(image: string | Buffer | Blob | File): Promise<string> {
  try {
    const result = await Tesseract.recognize(image, "eng+swa", {
      logger: m => console.log(m)
    });
    return result.data.text;
  } catch (error) {
    console.error("OCR Error:", error);
    return "";
  }
}

/**
 * Unified file processor (No storage - stays in memory)
 */
export async function processBusinessFile(file: File): Promise<string> {
  const type = file.type;
  
  if (type.includes("image")) {
    return await ocrImage(file);
  }
  
  if (type === "application/pdf") {
    // For PDF in browser, we'd ideally use pdfjs-dist. 
    // Since we want to stick to the user's "text extraction" vibe, 
    // and Gemini can actually process PDF directly if passed as prompt factor,
    // we will return a placeholder or use a simple FileReader for text-based PDFs.
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        resolve(text || "PDF content could not be read as text.");
      };
      reader.readAsText(file);
    });
  }
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string || "");
    reader.readAsText(file);
  });
}

/**
 * Analyzes multiple chunks of data and generates a combined analysis
 */
export async function analyzeChunks(chunks: string[], history: any[] = [], language: string = "English"): Promise<string[]> {
  const results: string[] = [];
  for (const chunk of chunks) {
    const res = await analyzeBusinessData(
      `Hapa ni sehemu ya data ya biashara: \n\n${chunk}\n\nToa muhtasari wa kifedha pekee wa sehemu hii.`, 
      history, 
      language
    );
    results.push(res);
  }
  return results;
}

/**
 * Combines partial results into a final report
 */
export async function generateFinalReport(partialResults: string[], language: string = "English"): Promise<string> {
  const combinedText = partialResults.join("\n\n---\n\n");
  return await analyzeBusinessData(
    `Hapa ni muhtasari wa sehemu mbalimbali za data ya biashara iliyochambuliwa: \n\n${combinedText}\n\nSasa toa ripoti KAMILI ya biashara (Business Report) yenye JSON block mwishoni kulingana na muundo uliopita. Lugha: ${language}.`,
    [],
    language
  );
}

/**
 * Simple Offline Analysis (Heuristic-based extraction)
 */
function simpleOfflineAnalysis(text: string, language: string = "English"): string {
  const isSwahili = language === 'Kiswahili';
  const clean = text.toLowerCase();
  
  // Extract numbers from text
  const numbers = (text.match(/\d[\d,\.]*/g) || [])
    .map(n => Number(n.replace(/,/g, '')))
    .filter(n => !isNaN(n) && n > 0);

  let Mauzo = 0;
  let Gharama = 0;
  let Faida = 0;

  if (numbers.length > 0) {
    // Heuristic: Largest number is usually sales/revenue
    Mauzo = Math.max(...numbers);
    
    // Check if specifically mentioning "faida"
    const faidaMatches = text.match(/(faida|profit)\s*(\d[\d,\.]*)/i);
    if (faidaMatches && faidaMatches[2]) {
      Faida = Number(faidaMatches[2].replace(/,/g, ''));
      // If faida is mentioned, and we only have one other significant number, that's gharama
      if (numbers.length >= 2) {
        Gharama = Mauzo - Faida;
      } else {
        // Estimate gharama based on faida and mauzo
        Gharama = Mauzo - Faida;
      }
    } else {
      // Sum of all other numbers is usually expenses
      Gharama = numbers.reduce((a, b) => a + b, 0) - Mauzo;
      Faida = Mauzo - Gharama;
    }
  }

  // Fallback to defaults if no numbers found
  if (Mauzo === 0) {
    return isSwahili 
      ? "Nitajie angalau mauzo yako kwa siku moja (mf. 'mauzo 200k') nikuundie ripoti mara moja."
      : "Please mention at least your sales for a day (e.g., 'sales 200k') to generate a report immediately.";
  }

  const msg = isSwahili 
    ? "⚠️ AI iko busy kidogo, lakini nimekufanyia uchambuzi wa haraka wa data uliyoitaja hapa chini (Offline Mode)."
    : "⚠️ AI is currently busy, but I've performed a quick offline analysis of the data you mentioned (Offline Mode).";

  return `
${msg}

### Muhtasari wa Haraka (Offline):
- Mauzo Yaliyokadiriwa: TSh ${Mauzo.toLocaleString()}
- Gharama Zilizokadiriwa: TSh ${Gharama.toLocaleString()}
- Faida: TSh ${Faida.toLocaleString()}

\`\`\`json
{
  "picha_kubwa": "${isSwahili ? 'Uchambuzi wa Haraka (Offline)' : 'Quick Offline Analysis'}",
  "namba_muhimu": {
    "mauzo": ${Mauzo},
    "gharama": ${Gharama},
    "faida": ${Faida},
    "faida_asilimia": ${Mauzo > 0 ? Math.round((Faida / Mauzo) * 100) : 0},
    "bidhaa_bora": "Data limited",
    "tatizo_kuu": "${isSwahili ? 'Uchambuzi wa namba tupu' : 'Raw number extraction'}"
  },
  "insights": [
    "${isSwahili ? 'Nimepata namba zako na kuziweka kwenye mfumo wa ripoti.' : 'Extracted numbers from your text/image.'}",
    "${isSwahili ? 'Namba kubwa zaidi nimeichukulia kama Mauzo.' : 'Assumed the largest number is Sales.'}"
  ],
  "mapendekezo": [
    {"hatua": "${isSwahili ? 'Hakikisha namba hizi ni sahihi' : 'Verify these numbers are correct'}", "gharama": "0", "faida": "Ripoti kamilifu"}
  ],
  "onyo": "${isSwahili ? 'Hii ni ripoti ya mfumo (offline) kwa sababu AI call imefeli au ipo busy.' : 'This is a rule-based offline report because AI is busy.'}",
  "data_graph": [],
  "data_pie": [
    {"name": "${isSwahili ? 'Mapato' : 'Sales'}", "thamani": ${Mauzo}, "fill": "#1D4ED8"},
    {"name": "${isSwahili ? 'Gharama' : 'Costs'}", "thamani": ${Gharama}, "fill": "#B91C1C"}
  ],
  "data_profit_trend": [
    {"siku": "Leo", "faida": ${Faida}}
  ],
  "forecast": [${Faida}, ${Faida * 1.05}, ${Faida * 1.1}],
  "risk_score": "${Faida > 0 ? 'Low Risk' : 'High Risk'}",
  "metrics": {
    "profitMargin": ${Mauzo > 0 ? (Faida / Mauzo) * 100 : 0},
    "debtRatio": 0,
    "performance": "${Faida > 0 ? 'Positive' : 'Review Required'}",
    "riskLevel": "${Faida > 0 ? 'Low' : 'High'}"
  },
  "ledger": []
}
\`\`\`
`;
}

/**
 * Performs ultimate business analysis as requested - Optimized for single call and performance
 */
export async function ultimateBusinessAnalysis(file: File, history: any[] = [], language: string = "English", planRules?: any): Promise<string> {
  const isSwahili = language === 'Kiswahili';
  
  // Extract text early so we have it for fallback
  const text = await processBusinessFile(file);

  // Cooldown check (5 seconds) -> Fallback to Offline instead of blocking
  const now = Date.now();
  if (now - lastCall < 5000) {
    return simpleOfflineAnalysis(text, language);
  }
  lastCall = now;

  try {
    const shortText = text.slice(0, 15000);

    // 2. Single powerful prompt to handle everything in one call
    const singleCallPrompt = `
      Wewe ni Mchambuzi wa Biashara. Kazi yako ni kuchimba namba kutoka kwenye maandishi au risiti.
      
      MAAGIZO YA KUCHAMBUA (MASHARTI MAKALI):
      1. MTU AKIPAKIA RISITI: Soma kila kitu. Toa Mauzo (Jumla kuu/Total) na Gharama zilizosalia.
      2. MTU AKIANDIKA MAELEZO (Narrative):
         - Tafuta namba zote.
         - Namba kubwa zaidi = Mauzo (Revenue/Sales).
         - Jumlisha namba zingine zote = Gharama (Expenses).
         - Akisema "faida X", basi tumia hiyo moja kwa moja kama Faida.
      
      KAMA HAKUNA NAMBA KABISA: Jibu kwa herufi kubwa "Nitajie angalau mauzo yako kwa siku moja nikuundie ripoti".
      
      DATA YA BIASHARA:
      ${shortText}
      
      MAHITAJI:
      1. Toa muhtasari (Executive Summary) wa hali ya biashara.
      2. Toa mapendekezo 3 ya kuboresha faida.
      3. LAZIMA ujumuishe JSON block kamili mwishoni kulingana na muundo wa ripoti. Mara baada ya kupata Mauzo na Gharama, tengeneza ripoti mara moja.
    `;

    return await analyzeBusinessData(singleCallPrompt, history, language, planRules);
  } catch (e) {
    console.error("Critical Analysis Error:", e);
    // Fallback to offline analysis on any error
    return simpleOfflineAnalysis(text, language);
  }
}

export const analyzeBusinessData = async (input: string | any[] | any, history: any[] = [], language: string = "English", planRules?: any): Promise<string> => {
  try {
    const response = await fetch("/api/gemini/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        history,
        language,
        planRules,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || "Mawasiliano na server yamefeli");
    }

    const data = await response.json();
    return data.text || "Samahani, sijapata jibu.";
  } catch (error: any) {
    console.error("Analysis client error:", error);
    if (error && error.message && !error.message.includes("fetch") && !error.message.includes("Network") && !error.message.includes("Failed")) {
      return error.message;
    }
    return "Mawasiliano na msaidizi wa AI yameshindikana kwa sasa. Tafadhali jaribu tena baada ya sekunde chache au angalia mtandao wako.";
  }
};
