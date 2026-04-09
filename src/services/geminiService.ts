import { GoogleGenAI } from "@google/genai";
import { DailyLog, UserProfile, CyclePhase } from "../types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

const ai = new GoogleGenAI({ 
  apiKey: GEMINI_API_KEY 
});

function cleanJSON(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function parseGeminiJSON(text: string) {
  const cleaned = cleanJSON(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw e;
  }
}

export async function getDailyBundle(
  profile: UserProfile,
  logs: DailyLog[],
  currentPhase: CyclePhase,
  moonPhaseName: string
) {
  if (!GEMINI_API_KEY) return null;
  
  try {
    const prompt = `
      You are a specialized health and wellness assistant for CycleBloom.
      User Profile: ${JSON.stringify(profile)}
      Current Cycle Phase: ${currentPhase}
      Moon Phase: ${moonPhaseName}
      Recent Logs: ${JSON.stringify(logs.slice(0, 5))}
      Language: Spanish

      Provide a complete daily bundle including:
      1. Cycle Insights: 2-3 sentences about their body in this phase + 3 actionable tips.
      2. Nutritional Guide: Specific foods to eat, avoid, and a general tip.
      3. Daily Diet Plan: Breakfast, lunch, dinner, and 2 snacks (considering restrictions: ${profile.dietaryRestrictions || 'None'}).
      4. Lunar Recommendations: 4 activities based on the moon phase with explanations.

      Format the response as a single JSON object:
      {
        "insights": {
          "insight": "...",
          "tips": ["...", "...", "..."],
          "nutrition": {
            "eat": ["...", "..."],
            "avoid": ["...", "..."],
            "tip": "..."
          }
        },
        "dietPlan": {
          "breakfast": "...",
          "lunch": "...",
          "dinner": "...",
          "snacks": ["...", "..."]
        },
        "lunarRecs": {
          "recommendations": [
            { "activity": "...", "explanation": "..." },
            { "activity": "...", "explanation": "..." },
            { "activity": "...", "explanation": "..." },
            { "activity": "...", "explanation": "..." }
          ]
        }
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });

    return parseGeminiJSON(response.text || "");
  } catch (error) {
    console.error("Error getting daily bundle:", error);
    throw error; // Re-throw to handle in UI
  }
}

export async function getCycleInsights(
  profile: UserProfile, 
  logs: DailyLog[], 
  currentPhase: CyclePhase
) {
  if (!GEMINI_API_KEY) {
    console.error("Gemini API Key is missing!");
    return null;
  }
  try {
    const prompt = `
      You are a specialized health assistant for a menstrual cycle tracking app called CycleBloom.
      User Profile: ${JSON.stringify(profile)}
      Current Phase: ${currentPhase}
      Recent Logs: ${JSON.stringify(logs.slice(0, 5))}
      Language: Spanish

      Based on the current phase and recent symptoms/moods, provide:
      1. A brief insight (2-3 sentences) about what's happening in their body.
      2. 3 actionable tips (e.g., rest, specific exercise, self-care).
      3. Nutritional recommendations (specific foods to eat or avoid).

      IMPORTANT: Provide all text in Spanish.

      Format the response as JSON:
      {
        "insight": "...",
        "tips": ["...", "...", "..."],
        "nutrition": {
          "eat": ["...", "..."],
          "avoid": ["...", "..."],
          "tip": "..."
        }
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return parseGeminiJSON(response.text || "");
  } catch (error) {
    console.error("Error getting Gemini insights:", error);
    return null;
  }
}

export async function getDailyDietPlan(profile: UserProfile, currentPhase: CyclePhase) {
  try {
    const prompt = `
      As a nutritionist for CycleBloom, provide a daily meal plan for a user in the ${currentPhase} phase.
      User Profile: ${JSON.stringify(profile)}
      Language: Spanish

      Provide:
      1. Breakfast
      2. Lunch
      3. Dinner
      4. 2 Snacks
      
      Consider dietary restrictions: ${profile.dietaryRestrictions || 'None'}

      Format as JSON:
      {
        "breakfast": "...",
        "lunch": "...",
        "dinner": "...",
        "snacks": ["...", "..."]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return parseGeminiJSON(response.text || "");
  } catch (error) {
    console.error("Error getting diet plan:", error);
    return null;
  }
}

export async function checkCalories(mealDescription: string, profile: UserProfile, currentPhase: CyclePhase) {
  try {
    const prompt = `
      User wants to eat: ${mealDescription}
      Current Cycle Phase: ${currentPhase}
      User Profile: ${JSON.stringify(profile)}
      Language: Spanish

      The user might provide ingredients and quantities (e.g., "2 spoons of rice, 1 plate of salad").
      Estimate the calories and determine if this is a good choice for their current phase.
      Provide a brief recommendation.
      
      Format as JSON:
      {
        "estimatedCalories": number,
        "isRecommended": boolean,
        "reason": "...",
        "alternative": "..."
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return parseGeminiJSON(response.text || "");
  } catch (error) {
    console.error("Error checking calories:", error);
    return null;
  }
}

export async function generateRecipes(ingredients: string, profile: UserProfile, currentPhase: CyclePhase) {
  try {
    const prompt = `
      User has these ingredients: ${ingredients}
      Current Cycle Phase: ${currentPhase}
      User Profile: ${JSON.stringify(profile)}
      Language: Spanish

      Suggest 2 recipes they can make that are beneficial for their current phase.
      
      Format as JSON:
      {
        "recipes": [
          { "name": "...", "ingredients": ["...", "..."], "instructions": "..." },
          { "name": "...", "ingredients": ["...", "..."], "instructions": "..." }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return parseGeminiJSON(response.text || "");
  } catch (error) {
    console.error("Error generating recipes:", error);
    return null;
  }
}

export async function getLunarRecommendations(moonPhase: string, language: 'en' | 'es') {
  try {
    const prompt = `
      You are an expert in lunar cycles and wellness for CycleBloom.
      Moon Phase: ${moonPhase}
      Language: Spanish

      Based on this moon phase, provide 4 specific activity recommendations.
      Examples: hair care (cutting, treatments), skin care, physical activities, emotional focus, or social activities.
      Provide a brief explanation for each.

      Format as JSON:
      {
        "recommendations": [
          { "activity": "...", "explanation": "..." },
          { "activity": "...", "explanation": "..." },
          { "activity": "...", "explanation": "..." },
          { "activity": "...", "explanation": "..." }
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    
    return parseGeminiJSON(response.text || "");
  } catch (error) {
    console.error("Error getting lunar recommendations:", error);
    return null;
  }
}
