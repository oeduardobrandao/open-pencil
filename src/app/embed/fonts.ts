// MESAAS: the Estúdio embed only offers families the render service can resolve —
// bundled (Inter) and Google Fonts (the doc service fetches them server-side). Local
// system fonts are excluded on BOTH grounds: in the browser they need a permission-gated
// Local Font Access grant (silently failing otherwise, so picking one changes nothing),
// and the server-side export could never load them anyway (editor ≠ render mismatch).
import type { FontFamilyOption } from '@open-pencil/core/text'

export function filterEmbedFontOptions(options: FontFamilyOption[]): FontFamilyOption[] {
  return options.filter((option) => option.source !== 'local')
}
