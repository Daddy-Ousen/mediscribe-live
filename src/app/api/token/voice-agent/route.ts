import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function mintVoiceAgentToken() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ASSEMBLYAI_API_KEY is not configured in server environment.' },
      { status: 500 }
    );
  }

  // AssemblyAI Voice Agent Token Minting endpoint uses GET with "Bearer <KEY>"
  const response = await fetch(
    'https://agents.assemblyai.com/v1/token?expires_in_seconds=300&max_session_duration_seconds=3600',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error('Failed to mint Voice Agent token:', response.status, errText);
    return NextResponse.json(
      { error: `AssemblyAI error (${response.status}): ${errText}` },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json({
    token: data.token,
    expires_in: data.expires_in_seconds || 300,
    ws_url: `wss://agents.assemblyai.com/v1/ws?token=${data.token}`,
  });
}

export async function GET() {
  try {
    return await mintVoiceAgentToken();
  } catch (error: any) {
    console.error('Voice Agent token minting error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await mintVoiceAgentToken();
  } catch (error: any) {
    console.error('Voice Agent token minting error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
