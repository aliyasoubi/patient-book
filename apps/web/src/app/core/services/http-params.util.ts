import { HttpParams } from '@angular/common/http';

/**
 * Build query params, dropping anything empty. An `undefined` filter must not
 * reach the API as the string "undefined", which its validators would reject.
 *
 * Accepts any object of scalars/arrays — interface types have no index
 * signature, so a bare `Record<string, unknown>` parameter would reject them.
 */
export function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params = params.set(key, value.join(','));
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}
