import { GoogleGenAI, Type } from "@google/genai";
import { IndexLink } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to safely parse JSON from model response, handling Markdown code fences
const parseResponseJSON = (text: string | undefined): any => {
  if (!text) return null;
  try {
    // Remove markdown code blocks if present (e.g., ```json ... ```)
    const cleanText = text.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse JSON response:", text);
    return null;
  }
};

export const analyzePageForIndex = async (
  imageBase64: string,
  pageNumber: number
): Promise<IndexLink[]> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const model = "gemini-3-flash-preview"; // Using Flash for speed and good vision capabilities

  const prompt = `
    Analyze this image of a document page. 
    I am looking for "Table of Contents" entries, "Index" entries, or any list of items that link to specific page numbers.
    
    Identify each page number reference found on the page.
    
    Rules:
    1. If a line contains multiple page numbers (e.g., "Bananas, 5, 8, 12"), create a SEPARATE entry for each page number (one for 5, one for 8, one for 12).
    2. "targetPage": The specific integer page number for that link.
    3. "label": The text label associated with the number (e.g., "Bananas").
    4. "ymin", "xmin", "ymax", "xmax": The bounding box coordinates normalized 0-1000.
       - IMPORTANT: If a line has MULTIPLE page numbers, the bounding box for each entry must ONLY enclose the specific number digits (e.g. the box around "5", the box around "8") so they can be clicked individually.
       - If a line has a SINGLE page number (typical Table of Contents), the bounding box should enclose the ENTIRE line (label + dots + number) to make it easier to click.
    
    Return a JSON array of these entries.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        thinkingConfig: { thinkingBudget: 1024 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              targetPage: { type: Type.INTEGER },
              ymin: { type: Type.INTEGER },
              xmin: { type: Type.INTEGER },
              ymax: { type: Type.INTEGER },
              xmax: { type: Type.INTEGER },
            },
            required: ["label", "targetPage", "ymin", "xmin", "ymax", "xmax"],
          },
        },
      },
    });

    const rawLinks = parseResponseJSON(response.text);
    if (!rawLinks || !Array.isArray(rawLinks)) return [];
    
    // Map to our internal type and add IDs
    return rawLinks.map((link: any, index: number) => ({
      id: `page-${pageNumber}-link-${index}-${Date.now()}`,
      label: link.label,
      targetPage: link.targetPage,
      box: {
        ymin: link.ymin,
        xmin: link.xmin,
        ymax: link.ymax,
        xmax: link.xmax
      }
    }));

  } catch (error) {
    console.error("Gemini analysis failed:", error);
    throw error;
  }
};

export const analyzePagesBatch = async (
  pages: { pageNumber: number; imageBase64: string }[]
): Promise<Record<number, IndexLink[]>> => {
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const model = "gemini-3-flash-preview";

  // Build the multipart content
  const parts: any[] = [
    { text: "Analyze the following document pages. Identify Table of Contents or Index entries that link to specific page numbers." }
  ];

  pages.forEach(p => {
    parts.push({ text: `--- Page ${p.pageNumber} ---` });
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: p.imageBase64,
      },
    });
  });

  parts.push({ text: `
    For each page provided above, find all entries with page references.
    Return a JSON array where each object corresponds to a page and contains:
    - "pageNumber": The integer page number defined above.
    - "entries": A list of detected links on that page.
    
    Rules for entries:
    - If a line has multiple page numbers, create separate entries for each number.
    - If multiple numbers exist on one line, the bounding box for each must ONLY enclose the specific number digits (to allow individual clicking).
    - If only one number exists on the line, the bounding box can enclose the whole line.
    
    Each entry in "entries" must contain:
    - "label": text of the entry.
    - "targetPage": the referenced page number.
    - "ymin", "xmin", "ymax", "xmax": bounding box normalized 0-1000 for that page.
  `});

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        // Thinking budget set to 1024 as requested
        thinkingConfig: { thinkingBudget: 1024 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pageNumber: { type: Type.INTEGER },
              entries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    targetPage: { type: Type.INTEGER },
                    ymin: { type: Type.INTEGER },
                    xmin: { type: Type.INTEGER },
                    ymax: { type: Type.INTEGER },
                    xmax: { type: Type.INTEGER },
                  },
                  required: ["label", "targetPage", "ymin", "xmin", "ymax", "xmax"],
                },
              },
            },
            required: ["pageNumber", "entries"],
          },
        },
      },
    });

    const rawData = parseResponseJSON(response.text);
    const result: Record<number, IndexLink[]> = {};

    if (Array.isArray(rawData)) {
      rawData.forEach((pageResult: any) => {
        const pageNum = pageResult.pageNumber;
        if (pageNum && pageResult.entries && Array.isArray(pageResult.entries)) {
             result[pageNum] = pageResult.entries.map((link: any, idx: number) => ({
                id: `page-${pageNum}-link-${idx}-${Date.now()}`,
                label: link.label,
                targetPage: link.targetPage,
                box: {
                    ymin: link.ymin,
                    xmin: link.xmin,
                    ymax: link.ymax,
                    xmax: link.xmax
                }
             }));
        }
      });
    }

    return result;

  } catch (error) {
    console.error("Gemini batch analysis failed:", error);
    throw error;
  }
};