/**
 * Builds the link that opens the "Wrong trailer" GitHub issue form with the
 * game already filled in. The form's field ids (package_name, game_name,
 * current_trailer) are what GitHub pre-fills from the query string.
 */
export const TRAILER_REPORT_ISSUE_URL = 'https://github.com/DeliciousMeatPop/VRCD/issues/new'
export const TRAILER_REPORT_TEMPLATE = 'trailer_report.yml'
export const TRAILER_REPORT_LABEL = 'trailer-report'

export interface TrailerReportContext {
  gameName: string
  packageName?: string
  currentTrailerUrl?: string | null
}

export function buildTrailerReportUrl({
  gameName,
  packageName,
  currentTrailerUrl
}: TrailerReportContext): string {
  const params = new URLSearchParams({
    template: TRAILER_REPORT_TEMPLATE,
    title: `[Trailer] ${gameName}`,
    game_name: gameName,
    package_name: packageName ?? '',
    current_trailer: currentTrailerUrl ?? 'none'
  })
  return `${TRAILER_REPORT_ISSUE_URL}?${params.toString()}`
}
