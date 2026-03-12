/**
 * Timezone utility — ALL date operations go through here.
 * Supabase stores timestamps in UTC; Brazil operates in America/Sao_Paulo (UTC-3).
 */
const BRAZIL_TZ = 'America/Sao_Paulo'

/**
 * Convert a UTC Date to a Brazil-localized Date object.
 * The returned Date has year/month/day/hour/minute set to Brazil local time,
 * useful for grouping by calendar day and displaying correct times.
 */
export function toBrazilDate(utcDateStr: string): Date {
    const utcDate = new Date(utcDateStr)
    // Format each component in Brazil timezone
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: BRAZIL_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(utcDate)

    const get = (type: string) => parts.find(p => p.type === type)?.value || '0'
    return new Date(
        Number(get('year')),
        Number(get('month')) - 1,
        Number(get('day')),
        Number(get('hour')),
        Number(get('minute')),
        Number(get('second'))
    )
}

/**
 * Get the date string in YYYY-MM-DD format in Brazil timezone.
 */
export function toBrazilDateStr(utcDateStr: string): string {
    const d = toBrazilDate(utcDateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Get the time string in HH:MM format in Brazil timezone.
 */
export function toBrazilTimeStr(utcDateStr: string): string {
    const d = toBrazilDate(utcDateStr)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Convert a local Brazil date+time string to a UTC ISO string for Supabase storage.
 * Input: "2026-03-13" + "09:00" → Output: ISO string representing 09:00 BRT = 12:00 UTC
 */
export function brazilToUTC(dateStr: string, timeStr: string): string {
    // Append Brazil offset explicitly
    return `${dateStr}T${timeStr}:00-03:00`
}

/**
 * Get current hour in Brazil timezone (0-23)
 */
export function currentBrazilHour(): number {
    return Number(
        new Intl.DateTimeFormat('pt-BR', {
            timeZone: BRAZIL_TZ,
            hour: 'numeric',
            hour12: false,
        }).format(new Date())
    )
}

/**
 * Check if current time is in quiet hours (22:00 - 08:00 Brazil)
 */
export function isQuietHour(): boolean {
    const h = currentBrazilHour()
    return h >= 22 || h < 8
}

export { BRAZIL_TZ }
