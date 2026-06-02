const STYLE_ID = 'ytblocker-search-history-style';

// YouTube's search dropdown shows past searches (clock-icon entries with an ×
// "Remove" button to delete the entry from history). We hide those rows while
// keeping live typeahead suggestions intact.
//
// Detection strategy: every history row has a child button with class
// .ytSuggestionComponentRemoveLinkClearButton (aria-label "Remove"). Predictive
// typeahead suggestions use the same outer wrapper class but never include
// that button. CSS :has() lets us match only the wrappers that contain it.
//
// Older selector variants are kept as fallbacks for YouTube DOM versions
// before the 2025 "ytSuggestionComponent*" rename.
const CSS = `
.ytSuggestionComponentSuggestion:has(.ytSuggestionComponentRemoveLinkClearButton),
.ytSuggestionComponentSuggestion:has(button[aria-label="Remove" i]),
ytsuggest-item:has(button[aria-label*="Remove" i]),
ytd-search-suggestion-renderer:has(button[aria-label*="Remove" i]),
li.ytSearchboxSuggestionRendererHistory {
  display: none !important;
}
`;

export function installSearchHistoryHider(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.documentElement.appendChild(style);
}

export function uninstallSearchHistoryHider(): void {
  document.getElementById(STYLE_ID)?.remove();
}
