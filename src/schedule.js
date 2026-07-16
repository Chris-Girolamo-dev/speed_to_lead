// Time-aware follow-up planning.
//
// Rules (all times in the client's configured timezone):
//   - Workday, between startHour and cutoffHour  -> "inHours" copy, send after normal delay
//   - After cutoff but before smsQuietEndHour    -> "afterHours" copy, send after normal delay
//   - Quiet window (smsQuietEndHour..smsQuietResumeHour) -> "afterHours" copy,
//     SMS held until the next resume hour (TCPA quiet window), email still sends after normal delay
//   - Non-workdays use "afterHours" copy all day
//
// Returns DELAYS (ms from real now), not absolute times, so the test hook
// TEST_FIXED_NOW can fake the clock for variant logic without breaking timers.

function getLocalParts(epochMs, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric'
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(epochMs))) {
    parts[p.type] = p.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[parts.weekday],
    hour: parseInt(parts.hour, 10) % 24, // Intl can return "24" for midnight
    minute: parseInt(parts.minute, 10)
  };
}

/**
 * @param {number} nowMs           epoch ms to evaluate business-hours logic at
 * @param {object} businessHours   config.businessHours
 * @param {string} timezone        IANA timezone
 * @param {number} followUpDelayMs normal follow-up delay
 * @returns {{ variant: 'inHours'|'afterHours', smsDelayMs: number, emailDelayMs: number, smsHeld: boolean }}
 */
function plan(nowMs, businessHours, timezone, followUpDelayMs) {
  const { startHour, cutoffHour, smsQuietEndHour, smsQuietResumeHour, workDays } = businessHours;
  const local = getLocalParts(nowMs, timezone);

  const isWorkday = (workDays || [1, 2, 3, 4, 5]).includes(local.weekday);
  const inBusinessHours = isWorkday && local.hour >= startHour && local.hour < cutoffHour;
  const variant = inBusinessHours ? 'inHours' : 'afterHours';

  // Quiet window check for SMS
  const inQuiet = local.hour >= smsQuietEndHour || local.hour < smsQuietResumeHour;
  let smsDelayMs = followUpDelayMs;
  let smsHeld = false;

  if (inQuiet) {
    smsHeld = true;
    const minutesNow = local.hour * 60 + local.minute;
    const resumeMinutes = smsQuietResumeHour * 60;
    let minutesUntilResume;
    if (local.hour >= smsQuietEndHour) {
      // Late evening: wait through midnight to the resume hour
      minutesUntilResume = (24 * 60 - minutesNow) + resumeMinutes;
    } else {
      // Early morning before resume hour
      minutesUntilResume = resumeMinutes - minutesNow;
    }
    smsDelayMs = Math.max(minutesUntilResume * 60000, followUpDelayMs);
  }

  return { variant, smsDelayMs, emailDelayMs: followUpDelayMs, smsHeld };
}

module.exports = { plan, getLocalParts };
