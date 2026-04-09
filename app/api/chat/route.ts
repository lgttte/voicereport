import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userMessage = typeof body?.message === "string" ? body.message.trim() : "";

    if (!userMessage) {
      return NextResponse.json(
        { error: "Le message est requis." },
        { status: 400 }
      );
    }

    // TODO: Insérer l'appel API OpenAI/Claude ici
    // Exemple :
    // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // const response = await anthropic.messages.create({
    //   model: "claude-sonnet-4-6",
    //   system: "Tu es l'assistant VoiceReport, expert BTP...",
    //   messages: [{ role: "user", content: userMessage }],
    //   max_tokens: 500,
    // });
    // const reply = response.content[0].text;

    // Simulation : délai 1s + réponse mock
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const reply = `Bien reçu ! Vous avez dit : "${userMessage}". Je suis l'assistant VoiceReport, je serai bientôt connecté à une IA pour vous aider.`;

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[CHAT API]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 }
    );
  }
}
