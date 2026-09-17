import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ASSEMBLYAI_API_KEY is not configured in server environment.' },
        { status: 500 }
      );
    }

    // Call AssemblyAI Realtime STT Token Minting endpoint
    // Note: STT endpoint requires RAW API KEY (NO Bearer prefix)
    const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=60&max_session_duration_seconds=3600', {
      method: 'GET',
      headers: {
        'Authorization': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Failed to mint Streaming STT token:', response.status, errText);
      return NextResponse.json(
        { error: `AssemblyAI error (${response.status}): ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      token: data.token,
      expires_in: 60,
      ws_url: `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&mode=balanced&domain=medical-v1&speaker_labels=true&token=${data.token}`
    });
  } catch (error: any) {
    console.error('Streaming STT token minting error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
