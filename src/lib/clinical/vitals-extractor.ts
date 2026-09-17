/**
 * Realtime Clinical Vitals & Demographic Parser
 * Extracts physiological telemetry from natural doctor-patient spoken dialogue.
 */

export interface ExtractedVitalsResult {
  vitals: Record<string, string>;
  painScale?: number;
  hasUpdates: boolean;
  detectedSummary?: string;
}

export function extractVitalsFromText(
  text: string,
  existingVitals: Record<string, string> = {
    'Blood Pressure': '--/--',
    'Heart Rate': '-- bpm',
    'SpO2': '--%',
    'Temperature': '--°F',
    'Respiratory Rate': '--/min'
  }
): ExtractedVitalsResult {
  const updated = { ...existingVitals };
  let hasUpdates = false;
  const detectedKeys: string[] = [];
  let detectedPain: number | undefined;

  // 1. Blood Pressure: e.g. "blood pressure is 128 over 82", "BP 130/85", "pressure 140 over 90"
  const bpMatch =
    text.match(/(?:blood\s*pressure|bp|pressure)\s*(?:is|of|at|was|running|around|:)?\s*(\d{2,3})\s*(?:\/|over|\s+over\s+)\s*(\d{2,3})/i) ||
    text.match(/\b(\d{2,3})\s*(?:\/|over|\s+over\s+)\s*(\d{2,3})\s*(?:mmhg|millimeters)?\b/i);

  if (bpMatch) {
    const sys = Number(bpMatch[1]);
    const dia = Number(bpMatch[2]);
    if (sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160) {
      const formattedBp = `${sys}/${dia} mmHg`;
      if (updated['Blood Pressure'] !== formattedBp) {
        updated['Blood Pressure'] = formattedBp;
        hasUpdates = true;
        detectedKeys.push(`BP ${sys}/${dia}`);
      }
    }
  } else {
    // Secondary check for standard slash format e.g. "120/80"
    const slashMatch = text.match(/\b(\d{2,3})\/(\d{2,3})\b/);
    if (slashMatch) {
      const sys = Number(slashMatch[1]);
      const dia = Number(slashMatch[2]);
      if (sys >= 70 && sys <= 240 && dia >= 40 && dia <= 140) {
        const formattedBp = `${sys}/${dia} mmHg`;
        if (updated['Blood Pressure'] !== formattedBp) {
          updated['Blood Pressure'] = formattedBp;
          hasUpdates = true;
          detectedKeys.push(`BP ${sys}/${dia}`);
        }
      }
    }
  }

  // 2. Heart Rate / Pulse: e.g. "heart rate is 78", "pulse 85", "hr 90 bpm", "pulse rate 72"
  const hrMatch =
    text.match(/(?:heart\s*rate|pulse(?:\s*rate)?|hr)\s*(?:is|of|at|was|running|:)?\s*(\d{2,3})(?:\s*bpm|\s*beats)?/i) ||
    text.match(/(?:tachycardic|bradycardic)\s*(?:at|of|around)?\s*(\d{2,3})/i) ||
    text.match(/\b(\d{2,3})\s*(?:bpm|beats\s*per\s*minute)\b/i);

  if (hrMatch) {
    const hr = Number(hrMatch[1]);
    if (hr >= 30 && hr <= 250) {
      const formattedHr = `${hr} bpm`;
      if (updated['Heart Rate'] !== formattedHr) {
        updated['Heart Rate'] = formattedHr;
        hasUpdates = true;
        detectedKeys.push(`HR ${hr} bpm`);
      }
    }
  }

  // 3. SpO2 / Oxygen Saturation: e.g. "o2 sat 98%", "spo2 is 97", "oxygen saturation is 99 percent", "sats 96%"
  const spo2Match =
    text.match(/(?:spo2|o2\s*sat(?:uration)?|oxygen\s*sat(?:uration)?|saturation|oximetry|sats?|satting(?:\s*at)?)\s*(?:is|of|at|was|running|:)?\s*(\d{2,3})(?:\s*%)?/i) ||
    text.match(/\b(\d{2,3})\s*%(?:\s*(?:on\s*)?(?:room\s*air|ra|ambient))?\b/i) ||
    text.match(/\b(\d{2,3})\s*percent\s*(?:on\s*room\s*air|oxygen\s*saturation)?\b/i);

  if (spo2Match) {
    const spo2 = Number(spo2Match[1]);
    if (spo2 >= 50 && spo2 <= 100) {
      const formattedSpo2 = `${spo2}%`;
      if (updated['SpO2'] !== formattedSpo2) {
        updated['SpO2'] = formattedSpo2;
        hasUpdates = true;
        detectedKeys.push(`SpO2 ${spo2}%`);
      }
    }
  }

  // 4. Respiratory Rate: e.g. "respiratory rate is 18", "respirations 16", "breathing 20 times a minute", "rr 16"
  const rrMatch =
    text.match(/(?:respiratory\s*rate|respirations?|breathing\s*rate|breathing|rr)\s*(?:is|of|at|was|:)?\s*(\d{1,2})(?:\s*\/min|\s*breaths?(?:\s*per\s*minute)?)?/i) ||
    text.match(/\b(\d{1,2})\s*(?:breaths?(?:\s*per\s*minute|\s*a\s*minute)?|\/min)\b/i);

  if (rrMatch) {
    const rr = Number(rrMatch[1]);
    if (rr >= 6 && rr <= 60) {
      const formattedRr = `${rr}/min`;
      if (updated['Respiratory Rate'] !== formattedRr) {
        updated['Respiratory Rate'] = formattedRr;
        hasUpdates = true;
        detectedKeys.push(`RR ${rr}/min`);
      }
    }
  }

  // 5. Temperature: e.g. "temperature is 98.6", "temp was 101.4", "fever of 100.8 degrees"
  const tempMatch =
    text.match(/(?:temperature|temp|febrile(?:\s*at)?|fever(?:\s*of)?)\s*(?:is|of|at|was|running|:)?\s*(\d{2,3}(?:\.\d)?)\s*(?:degrees?|deg|°)?(?:\s*(?:fahrenheit|f|celsius|c))?/i) ||
    text.match(/\b(\d{2,3}\.\d)\s*(?:degrees?|deg|°)?\s*(?:fahrenheit|f)\b/i);

  if (tempMatch) {
    const rawVal = Number(tempMatch[1]);
    let fahrenheitVal: number | null = null;

    if (rawVal >= 90 && rawVal <= 110) {
      fahrenheitVal = rawVal;
    } else if (rawVal >= 34 && rawVal <= 43) {
      // Celsius to Fahrenheit conversion
      fahrenheitVal = (rawVal * 9) / 5 + 32;
    }

    if (fahrenheitVal !== null) {
      const formattedTemp = `${fahrenheitVal.toFixed(1)}°F`;
      if (updated['Temperature'] !== formattedTemp) {
        updated['Temperature'] = formattedTemp;
        hasUpdates = true;
        detectedKeys.push(`Temp ${formattedTemp}`);
      }
    }
  }

  // 6. Pain Scale: e.g. "pain is 7 out of 10", "pain scale is 8", "pain rated at 6"
  const painMatch =
    text.match(/(?:pain\s*(?:scale|score|level)?|hurts?)\s*(?:is|at|a|about|rated(?:\s*at)?)?\s*(\d{1,2})\s*(?:out\s*of\s*10|\/10)?/i) ||
    text.match(/\b(\d{1,2})\s*(?:out\s*of\s*10|\/10)\s*pain\b/i);

  if (painMatch) {
    const p = Number(painMatch[1]);
    if (p >= 0 && p <= 10) {
      detectedPain = p;
      hasUpdates = true;
      detectedKeys.push(`Pain ${p}/10`);
    }
  }

  return {
    vitals: updated,
    painScale: detectedPain,
    hasUpdates,
    detectedSummary: detectedKeys.length > 0 ? detectedKeys.join(' • ') : undefined
  };
}
