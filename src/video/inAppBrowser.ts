/**
 * Social apps open links in their own built-in browser (a WebView). Those
 * often block the camera and sometimes file uploads, so the app suggests
 * opening the page in Safari or Chrome. Detection is by the marker each app
 * adds to the user agent; a browser that isn't matched just sees no notice.
 */
const APPS: [name: string, pattern: RegExp][] = [
  ['TikTok', /musical_ly|BytedanceWebview|trill_\d/i],
  ['Instagram', /\bInstagram\b/],
  ['Facebook', /\bFBAN\/|\bFBAV\/|\bFB_IAB\b/],
  ['LinkedIn', /LinkedInApp/],
  ['Snapchat', /Snapchat/],
];

/** Name of the app whose built-in browser this is, or null for a normal browser. */
export function inAppBrowserName(userAgent: string): string | null {
  for (const [name, pattern] of APPS) if (pattern.test(userAgent)) return name;
  return null;
}
