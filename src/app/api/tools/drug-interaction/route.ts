import { NextResponse } from 'next/server';
import { checkDrugInteractions } from '@/lib/clinical/drug-database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const medications: string[] = body.medications || [];

    if (body.medication_a && body.medication_b) {
      medications.push(body.medication_a, body.medication_b);
    }

    if (medications.length < 2) {
      return NextResponse.json({
        found: false,
        message: 'At least two medications are required to check for interactions.',
        interactions: []
      });
    }

    const interactions = checkDrugInteractions(medications);

    return NextResponse.json({
      found: interactions.length > 0,
      totalInteractions: interactions.length,
      hasCriticalContraindication: interactions.some(i => i.severity.includes('Contraindicated')),
      interactions
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to check drug interactions' }, { status: 500 });
  }
}
