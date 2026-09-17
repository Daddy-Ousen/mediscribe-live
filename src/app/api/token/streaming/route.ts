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
    // AssemblyAI maximum token lifetime is 600 seconds (10 minutes)
    const response = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600&max_session_duration_seconds=3600', {
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
        {
          status: response.status,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    const data = await response.json();
    return NextResponse.json(
      {
        token: data.token,
        expires_in: 600,
        ws_url: `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=universal-3-5-pro&token=${data.token}`
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Streaming STT token minting error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }
}
