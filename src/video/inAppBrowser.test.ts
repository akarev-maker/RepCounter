import { describe, expect, it } from 'vitest';
import { inAppBrowserName } from './inAppBrowser';

// Real user agents, shortened where the middle doesn't matter.
const UA = {
  tiktokAndroid:
    'Mozilla/5.0 (Linux; Android 8.1.0; 5033X_EEA Build/O11019; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.105 Mobile Safari/537.36 trill_2021808050 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/18.8.5 ByteLocale/en',
  tiktokIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US WKWebView/1 BytedanceWebview/d8a21c6',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 323.0.3.25.106 (iPhone15,2; iOS 17_4; en_US; en; scale=3.00; 1179x2556; 573224383)',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/455.0.0.36.111;FBBV/577153574;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4]',
  linkedin:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6',
  safari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
};

describe('inAppBrowserName', () => {
  it('recognises the built-in browsers of social apps', () => {
    expect(inAppBrowserName(UA.tiktokAndroid)).toBe('TikTok');
    expect(inAppBrowserName(UA.tiktokIos)).toBe('TikTok');
    expect(inAppBrowserName(UA.instagram)).toBe('Instagram');
    expect(inAppBrowserName(UA.facebook)).toBe('Facebook');
    expect(inAppBrowserName(UA.linkedin)).toBe('LinkedIn');
  });

  it('leaves normal browsers alone', () => {
    expect(inAppBrowserName(UA.safari)).toBeNull();
    expect(inAppBrowserName(UA.chromeAndroid)).toBeNull();
    expect(inAppBrowserName(UA.chromeMac)).toBeNull();
  });
});
