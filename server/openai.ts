import OpenAI from "openai";

// Initialize the OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates a response from OpenAI's GPT model based on the conversation history
 * @param messages Array of conversation messages in OpenAI format
 * @returns The AI response text
 */
export async function generateAIResponse(prompt: string): Promise<string> {
  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key not found. Using fallback response.");
      return getFallbackResponse(prompt);
    }

    // Make API call to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Latest model
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant named NOVA. You help the user organize their life, manage tasks, and provide insights. Keep responses helpful, concise, and positive. Your answers should be between 2-4 sentences unless the user needs a more detailed response."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "I'm sorry, I couldn't process that request.";
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    return getFallbackResponse(prompt);
  }
}

/**
 * Provides a fallback response when the OpenAI API is unavailable
 * @param prompt The user's message
 * @returns A contextual fallback response
 */
function getFallbackResponse(prompt: string): string {
  // Simple keyword matching for fallback responses
  const promptLower = prompt.toLowerCase();
  
  if (promptLower.includes("help") || promptLower.includes("what can you do")) {
    return "I can help you organize tasks, manage your calendar, and provide insights on your daily activities. Once OpenAI integration is enabled, I'll be even more helpful!";
  }
  
  if (promptLower.includes("task") || promptLower.includes("mission") || promptLower.includes("todo")) {
    return "I recommend breaking down your tasks into smaller, manageable steps. Consider prioritizing them based on urgency and importance.";
  }
  
  if (promptLower.includes("calendar") || promptLower.includes("schedule") || promptLower.includes("event")) {
    return "Managing your calendar effectively is key to productivity. Try time-blocking for focused work and adding buffer time between meetings.";
  }
  
  if (promptLower.includes("focus") || promptLower.includes("productivity") || promptLower.includes("distraction")) {
    return "To improve focus, consider the Pomodoro technique: 25 minutes of focused work followed by a 5-minute break. Also, minimize digital distractions during deep work sessions.";
  }
  
  // Default fallback response
  return "I understand. Based on your current priorities and energy levels, I'd recommend focusing on completing your most important tasks first. Would you like more specific advice?";
}